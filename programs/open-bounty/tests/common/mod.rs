#![allow(dead_code)]

use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{
            clock::Clock,
            instruction::{AccountMeta, Instruction},
            program_pack::Pack,
            system_program,
        },
        AccountDeserialize, AccountSerialize, AnchorSerialize, InstructionData, ToAccountMetas,
    },
    anchor_spl::{associated_token::get_associated_token_address, token::spl_token},
    litesvm::LiteSVM,
    litesvm_token::{CreateAssociatedTokenAccount, CreateMint, MintTo},
    open_bounty::{
        attestation::{expected_domain, MergeAttestationV1},
        error::OpenBountyError,
        state::BountyStatus,
    },
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

pub const AMOUNT: u64 = 10_000_000; // 10 mock USDC (6 decimals)
pub const REPO_HASH: [u8; 32] = [7u8; 32];
pub const ISSUE_NUMBER: u64 = 42;
pub const GRACE_PERIOD: i64 = 60;

/// Sends a transaction with a fresh blockhash every time, so two
/// otherwise-identical transactions are never rejected as AlreadyProcessed.
pub fn send(svm: &mut LiteSVM, ixs: &[Instruction], payer: &Keypair) -> Result<(), String> {
    svm.expire_blockhash();
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(ixs, Some(&payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[payer]).unwrap();
    svm.send_transaction(tx)
        .map(|_| ())
        .map_err(|e| format!("{:?}", e))
}

/// Asserts the transaction failed with exactly this program error.
/// Anchor custom errors are reported as Custom(6000 + variant index).
pub fn assert_program_error(res: Result<(), String>, err: OpenBountyError) {
    let name = format!("{:?}", err);
    let code = 6000 + err as u32;
    let msg = res.expect_err("expected the transaction to fail");
    assert!(
        msg.contains(&format!("Custom({})", code)),
        "expected {} (Custom({})), got: {}",
        name,
        code,
        msg
    );
}

/// For failures raised by Anchor account constraints or other programs
/// rather than by our own error enum.
pub fn assert_fails(res: Result<(), String>) {
    assert!(res.is_err(), "expected the transaction to fail");
}

pub fn ata(wallet: &Pubkey, mint: &Pubkey) -> Pubkey {
    get_associated_token_address(wallet, mint)
}

pub fn serialize(att: &MergeAttestationV1) -> Vec<u8> {
    let mut v = Vec::new();
    att.serialize(&mut v).unwrap();
    v
}

/// Builds a genuine native Ed25519 verify instruction over `message`.
pub fn ed25519_ix(signer: &Keypair, message: &[u8]) -> Instruction {
    let sig: [u8; 64] = signer.sign_message(message).into();
    let pk: [u8; 32] = signer.pubkey().to_bytes();
    solana_ed25519_program::new_ed25519_instruction_with_signature(message, &sig, &pk)
}

pub fn create_ata_idempotent_ix(payer: Pubkey, wallet: Pubkey, mint: Pubkey) -> Instruction {
    Instruction {
        program_id: anchor_spl::associated_token::ID,
        accounts: vec![
            AccountMeta::new(payer, true),
            AccountMeta::new(ata(&wallet, &mint), false),
            AccountMeta::new_readonly(wallet, false),
            AccountMeta::new_readonly(mint, false),
            AccountMeta::new_readonly(system_program::ID, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
        data: vec![1], // CreateIdempotent
    }
}

/// A harmless instruction (1 lamport transfer) used as a spacer.
pub fn dummy_ix(from: Pubkey, to: Pubkey) -> Instruction {
    let mut data = vec![2, 0, 0, 0];
    data.extend_from_slice(&1u64.to_le_bytes());
    Instruction {
        program_id: system_program::ID,
        accounts: vec![AccountMeta::new(from, true), AccountMeta::new(to, false)],
        data,
    }
}

#[derive(Clone)]
pub struct Fields {
    pub pr_number: u64,
    pub commit_sha: [u8; 20],
    pub github_user_id: u64,
    pub amount: u64,
    pub merge_timestamp: i64,
}

pub fn default_fields(deadline: i64) -> Fields {
    Fields {
        pr_number: 99,
        commit_sha: [3u8; 20],
        github_user_id: 555,
        amount: AMOUNT,
        merge_timestamp: deadline - 1000,
    }
}

pub struct BountyInfo {
    pub bounty: Pubkey,
    pub escrow: Pubkey,
    pub nonce: u64,
    pub deadline: i64,
}

pub struct Env {
    pub svm: LiteSVM,
    pub program_id: Pubkey,
    pub authority: Keypair,
    pub attestor: Keypair,
    pub maintainer: Keypair,
    pub relayer: Keypair,
    pub usdc_mint: Pubkey,
    pub config: Pubkey,
    pub maintainer_token_account: Pubkey,
}

impl Env {
    pub fn new() -> Self {
        let program_id = open_bounty::id();
        let authority = Keypair::new();
        let attestor = Keypair::new();
        let maintainer = Keypair::new();
        let relayer = Keypair::new();

        let mut svm = LiteSVM::new();
        let bytes = include_bytes!(concat!(
            env!("CARGO_TARGET_TMPDIR"),
            "/../deploy/open_bounty.so"
        ));
        svm.add_program(program_id, bytes).unwrap();
        for k in [&authority, &maintainer, &relayer] {
            svm.airdrop(&k.pubkey(), 10_000_000_000).unwrap();
        }

        let usdc_mint = CreateMint::new(&mut svm, &authority)
            .decimals(6)
            .send()
            .unwrap();
        let config =
            Pubkey::find_program_address(&[open_bounty::constants::CONFIG_SEED], &program_id).0;

        let init_ix = Instruction::new_with_bytes(
            program_id,
            &open_bounty::instruction::InitializeConfig {
                attestor_pubkey: attestor.pubkey(),
                usdc_mint,
                max_bounty_amount_base_units: 50_000_000,
                default_refund_grace_period_seconds: GRACE_PERIOD,
            }
            .data(),
            open_bounty::accounts::InitializeConfig {
                authority: authority.pubkey(),
                config,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        );
        send(&mut svm, &[init_ix], &authority).expect("initialize_config failed");

        let maintainer_token_account =
            CreateAssociatedTokenAccount::new(&mut svm, &maintainer, &usdc_mint)
                .owner(&maintainer.pubkey())
                .send()
                .unwrap();
        MintTo::new(&mut svm, &authority, &usdc_mint, &maintainer_token_account, 100_000_000)
            .send()
            .unwrap();

        Env {
            svm,
            program_id,
            authority,
            attestor,
            maintainer,
            relayer,
            usdc_mint,
            config,
            maintainer_token_account,
        }
    }

    pub fn now(&self) -> i64 {
        self.svm.get_sysvar::<Clock>().unix_timestamp
    }

    pub fn set_time(&mut self, ts: i64) {
        let mut clock = self.svm.get_sysvar::<Clock>();
        clock.unix_timestamp = ts;
        self.svm.set_sysvar::<Clock>(&clock);
    }

    /// Flips the `paused` flag directly in the config account's data.
    /// (The MVP has no set_paused instruction, by design; see ROADMAP.)
    pub fn set_paused(&mut self, paused: bool) {
        let mut acct = self.svm.get_account(&self.config).unwrap();
        let mut cfg =
            open_bounty::state::OpenBountyConfig::try_deserialize(&mut &acct.data[..]).unwrap();
        cfg.paused = paused;
        let mut data = Vec::new();
        cfg.try_serialize(&mut data).unwrap();
        acct.data[..data.len()].copy_from_slice(&data);
        self.svm.set_account(self.config, acct).unwrap();
    }

    pub fn create_bounty_ix(&self, nonce: u64, amount: u64, deadline: i64) -> (Instruction, BountyInfo) {
        let bounty = Pubkey::find_program_address(
            &[
                open_bounty::constants::BOUNTY_SEED,
                self.maintainer.pubkey().as_ref(),
                &nonce.to_le_bytes(),
            ],
            &self.program_id,
        )
        .0;
        let escrow = ata(&bounty, &self.usdc_mint);
        let ix = Instruction::new_with_bytes(
            self.program_id,
            &open_bounty::instruction::CreateBounty {
                nonce,
                amount_base_units: amount,
                repo_hash: REPO_HASH,
                issue_number: ISSUE_NUMBER,
                deadline_unix_timestamp: deadline,
            }
            .data(),
            open_bounty::accounts::CreateBounty {
                maintainer: self.maintainer.pubkey(),
                config: self.config,
                usdc_mint: self.usdc_mint,
                bounty,
                maintainer_token_account: self.maintainer_token_account,
                escrow_token_account: escrow,
                token_program: spl_token::id(),
                associated_token_program: anchor_spl::associated_token::ID,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        );
        (ix, BountyInfo { bounty, escrow, nonce, deadline })
    }

    pub fn create_bounty(&mut self, nonce: u64, deadline: i64) -> BountyInfo {
        let (ix, info) = self.create_bounty_ix(nonce, AMOUNT, deadline);
        send(&mut self.svm, &[ix], &self.maintainer).expect("create_bounty failed");
        info
    }

    /// Creates a recipient's canonical USDC ATA (paid by the relayer).
    pub fn new_recipient(&mut self) -> (Pubkey, Pubkey) {
        let wallet = Pubkey::new_unique();
        let token_account =
            CreateAssociatedTokenAccount::new(&mut self.svm, &self.relayer, &self.usdc_mint)
                .owner(&wallet)
                .send()
                .unwrap();
        (wallet, token_account)
    }

    pub fn attestation(&self, info: &BountyInfo, payout_wallet: Pubkey, f: &Fields) -> MergeAttestationV1 {
        MergeAttestationV1 {
            domain: expected_domain(),
            bounty: info.bounty,
            repo_hash: REPO_HASH,
            issue_number: ISSUE_NUMBER,
            pr_number: f.pr_number,
            commit_sha: f.commit_sha,
            github_user_id: f.github_user_id,
            payout_wallet,
            amount_base_units: f.amount,
            merge_timestamp: f.merge_timestamp,
        }
    }

    pub fn release_ix(
        &self,
        info: &BountyInfo,
        destination_owner: Pubkey,
        destination_token_account: Pubkey,
        f: &Fields,
    ) -> Instruction {
        let receipt = Pubkey::find_program_address(
            &[open_bounty::constants::RECEIPT_SEED, info.bounty.as_ref()],
            &self.program_id,
        )
        .0;
        Instruction::new_with_bytes(
            self.program_id,
            &open_bounty::instruction::ReleaseWithAttestation {
                pr_number: f.pr_number,
                commit_sha: f.commit_sha,
                github_user_id: f.github_user_id,
                amount_base_units: f.amount,
                merge_timestamp: f.merge_timestamp,
            }
            .data(),
            open_bounty::accounts::ReleaseWithAttestation {
                payer: self.relayer.pubkey(),
                config: self.config,
                bounty: info.bounty,
                receipt,
                escrow_token_account: info.escrow,
                destination_token_account,
                destination_owner,
                instructions_sysvar: solana_sdk_ids::sysvar::instructions::ID,
                maintainer: self.maintainer.pubkey(),
                token_program: spl_token::id(),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )
    }

    /// Ed25519 verify instruction (signed by `signer` over `message`)
    /// immediately followed by release_with_attestation.
    pub fn release_signed(
        &mut self,
        info: &BountyInfo,
        owner: Pubkey,
        dest: Pubkey,
        f: &Fields,
        signer: &Keypair,
        message: &[u8],
    ) -> Result<(), String> {
        let ed = ed25519_ix(signer, message);
        let rel = self.release_ix(info, owner, dest, f);
        send(&mut self.svm, &[ed, rel], &self.relayer)
    }

    pub fn refund_ix(&self, info: &BountyInfo) -> Instruction {
        Instruction::new_with_bytes(
            self.program_id,
            &open_bounty::instruction::RefundExpired {}.data(),
            open_bounty::accounts::RefundExpired {
                maintainer: self.maintainer.pubkey(),
                bounty: info.bounty,
                escrow_token_account: info.escrow,
                maintainer_token_account: self.maintainer_token_account,
                token_program: spl_token::id(),
            }
            .to_account_metas(None),
        )
    }

    pub fn refund(&mut self, info: &BountyInfo) -> Result<(), String> {
        let ix = self.refund_ix(info);
        send(&mut self.svm, &[ix], &self.maintainer)
    }

    pub fn bounty_status(&self, info: &BountyInfo) -> BountyStatus {
        let acct = self.svm.get_account(&info.bounty).unwrap();
        open_bounty::state::Bounty::try_deserialize(&mut &acct.data[..])
            .unwrap()
            .status
    }

    /// None if the account doesn't exist (e.g. it was closed).
    pub fn token_balance(&self, token_account: &Pubkey) -> Option<u64> {
        self.svm
            .get_account(token_account)
            .map(|a| spl_token::state::Account::unpack(&a.data).unwrap().amount)
    }
}

/// After a rejected release: nothing moved and the bounty is still Funded.
pub fn assert_untouched(env: &Env, info: &BountyInfo, dest: &Pubkey) {
    assert_eq!(env.bounty_status(info), BountyStatus::Funded);
    assert_eq!(env.token_balance(&info.escrow), Some(AMOUNT));
    assert_eq!(env.token_balance(dest), Some(0));
}
