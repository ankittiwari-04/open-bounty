use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{instruction::Instruction, program_pack::Pack, system_program},
        AccountDeserialize, AnchorSerialize, InstructionData, ToAccountMetas,
    },
    anchor_spl::{associated_token::get_associated_token_address, token::spl_token},
    litesvm::LiteSVM,
    litesvm_token::{CreateAssociatedTokenAccount, CreateMint, MintTo},
    open_bounty::attestation::{expected_domain, MergeAttestationV1},
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

fn init_config(
    svm: &mut LiteSVM,
    program_id: &Pubkey,
    authority: &Keypair,
    config: Pubkey,
    attestor_pubkey: Pubkey,
    usdc_mint: Pubkey,
) {
    let instruction = Instruction::new_with_bytes(
        *program_id,
        &open_bounty::instruction::InitializeConfig {
            attestor_pubkey,
            usdc_mint,
            max_bounty_amount_base_units: 50_000_000,
            default_refund_grace_period_seconds: 24 * 60 * 60,
        }
        .data(),
        open_bounty::accounts::InitializeConfig {
            authority: authority.pubkey(),
            config,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&authority.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[authority]).unwrap();
    let res = svm.send_transaction(tx);
    assert!(res.is_ok(), "initialize_config failed: {:?}", res.err());
}

#[test]
fn test_release_with_attestation_valid() {
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
    svm.airdrop(&authority.pubkey(), 1_000_000_000).unwrap();
    svm.airdrop(&maintainer.pubkey(), 1_000_000_000).unwrap();
    svm.airdrop(&relayer.pubkey(), 1_000_000_000).unwrap();

    let usdc_mint = CreateMint::new(&mut svm, &authority).decimals(6).send().unwrap();

    let config = Pubkey::find_program_address(
        &[open_bounty::constants::CONFIG_SEED],
        &program_id,
    )
    .0;
    init_config(&mut svm, &program_id, &authority, config, attestor.pubkey(), usdc_mint);

    let maintainer_token_account =
        CreateAssociatedTokenAccount::new(&mut svm, &maintainer, &usdc_mint)
            .owner(&maintainer.pubkey())
            .send()
            .unwrap();
    MintTo::new(&mut svm, &authority, &usdc_mint, &maintainer_token_account, 100_000_000)
        .send()
        .unwrap();

    // --- Create and fund the bounty ---
    let nonce: u64 = 1;
    let bounty = Pubkey::find_program_address(
        &[
            open_bounty::constants::BOUNTY_SEED,
            maintainer.pubkey().as_ref(),
            &nonce.to_le_bytes(),
        ],
        &program_id,
    )
    .0;
    let escrow_token_account = get_associated_token_address(&bounty, &usdc_mint);

    let amount_base_units: u64 = 10_000_000;
    let repo_hash = [7u8; 32];
    let issue_number: u64 = 42;
    let now = svm.get_sysvar::<anchor_lang::solana_program::clock::Clock>().unix_timestamp;
    let deadline_unix_timestamp = now + 7 * 24 * 60 * 60;

    let create_bounty_ix = Instruction::new_with_bytes(
        program_id,
        &open_bounty::instruction::CreateBounty {
            nonce,
            amount_base_units,
            repo_hash,
            issue_number,
            deadline_unix_timestamp,
        }
        .data(),
        open_bounty::accounts::CreateBounty {
            maintainer: maintainer.pubkey(),
            config,
            usdc_mint,
            bounty,
            maintainer_token_account,
            escrow_token_account,
            token_program: spl_token::id(),
            associated_token_program: anchor_spl::associated_token::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[create_bounty_ix], Some(&maintainer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&maintainer]).unwrap();
    let res = svm.send_transaction(tx);
    assert!(res.is_ok(), "create_bounty failed: {:?}", res.err());

    // --- Set up the payout destination ---
    let payout_wallet = Pubkey::new_unique();
    let destination_token_account =
        CreateAssociatedTokenAccount::new(&mut svm, &relayer, &usdc_mint)
            .owner(&payout_wallet)
            .send()
            .unwrap();

    // --- Build and sign the real attestation ---
    let pr_number: u64 = 99;
    let commit_sha = [3u8; 20];
    let github_user_id: u64 = 555;
    let merge_timestamp = deadline_unix_timestamp - 1000; // before the deadline

    let attestation = MergeAttestationV1 {
        domain: expected_domain(),
        bounty,
        repo_hash,
        issue_number,
        pr_number,
        commit_sha,
        github_user_id,
        payout_wallet,
        amount_base_units,
        merge_timestamp,
    };
    let mut message_bytes = Vec::new();
    attestation.serialize(&mut message_bytes).unwrap();

    let signature = attestor.sign_message(&message_bytes);
    let signature_bytes: [u8; 64] = signature.into();
    let pubkey_bytes: [u8; 32] = attestor.pubkey().to_bytes();

    let ed25519_ix = solana_ed25519_program::new_ed25519_instruction_with_signature(
        &message_bytes,
        &signature_bytes,
        &pubkey_bytes,
    );

    let receipt = Pubkey::find_program_address(
        &[open_bounty::constants::RECEIPT_SEED, bounty.as_ref()],
        &program_id,
    )
    .0;

    let release_ix = Instruction::new_with_bytes(
        program_id,
        &open_bounty::instruction::ReleaseWithAttestation {
            pr_number,
            commit_sha,
            github_user_id,
            amount_base_units,
            merge_timestamp,
        }
        .data(),
        open_bounty::accounts::ReleaseWithAttestation {
            payer: relayer.pubkey(),
            config,
            bounty,
            receipt,
            escrow_token_account,
            destination_token_account,
            destination_owner: payout_wallet,
            instructions_sysvar: solana_sdk_ids::sysvar::instructions::ID,
            maintainer: maintainer.pubkey(),
            token_program: spl_token::id(),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );

    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(
        &[ed25519_ix, release_ix],
        Some(&relayer.pubkey()),
        &blockhash,
    );
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&relayer]).unwrap();
    let res = svm.send_transaction(tx);
    assert!(res.is_ok(), "release_with_attestation failed: {:?}", res.err());

    // --- Verify outcomes ---
    let bounty_account = svm.get_account(&bounty).unwrap();
    let mut data: &[u8] = &bounty_account.data;
    let bounty_state = open_bounty::state::Bounty::try_deserialize(&mut data).unwrap();
    assert_eq!(bounty_state.status, open_bounty::state::BountyStatus::Paid);

    let receipt_account = svm.get_account(&receipt).unwrap();
    let mut receipt_data: &[u8] = &receipt_account.data;
    let receipt_state = open_bounty::state::Receipt::try_deserialize(&mut receipt_data).unwrap();
    assert_eq!(receipt_state.bounty, bounty);
    assert_eq!(receipt_state.pr_number, pr_number);
    assert_eq!(receipt_state.payout_wallet, payout_wallet);
    assert_eq!(receipt_state.amount_base_units, amount_base_units);

    let destination_account = svm.get_account(&destination_token_account).unwrap();
    let destination_data = spl_token::state::Account::unpack(&destination_account.data).unwrap();
    assert_eq!(destination_data.amount, amount_base_units);

    assert!(
        svm.get_account(&escrow_token_account).is_none(),
        "escrow token account should be closed after payout"
    );
}
