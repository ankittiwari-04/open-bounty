use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{clock::Clock, instruction::Instruction, program_pack::Pack, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    anchor_spl::token::spl_token,
    litesvm::LiteSVM,
    litesvm_token::{CreateAssociatedTokenAccount, CreateMint, MintTo},
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
    grace_period_seconds: i64,
) {
    let instruction = Instruction::new_with_bytes(
        *program_id,
        &open_bounty::instruction::InitializeConfig {
            attestor_pubkey,
            usdc_mint,
            max_bounty_amount_base_units: 50_000_000,
            default_refund_grace_period_seconds: grace_period_seconds,
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
fn test_refund_expired_after_grace_period() {
    let program_id = open_bounty::id();
    let authority = Keypair::new();
    let maintainer = Keypair::new();

    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/open_bounty.so"
    ));
    svm.add_program(program_id, bytes).unwrap();
    svm.airdrop(&authority.pubkey(), 1_000_000_000).unwrap();
    svm.airdrop(&maintainer.pubkey(), 1_000_000_000).unwrap();

    let usdc_mint = CreateMint::new(&mut svm, &authority).decimals(6).send().unwrap();

    let config = Pubkey::find_program_address(
        &[open_bounty::constants::CONFIG_SEED],
        &program_id,
    )
    .0;
    let grace_period_seconds: i64 = 60;
    init_config(
        &mut svm,
        &program_id,
        &authority,
        config,
        Pubkey::new_unique(),
        usdc_mint,
        grace_period_seconds,
    );

    let maintainer_token_account =
        CreateAssociatedTokenAccount::new(&mut svm, &maintainer, &usdc_mint)
            .owner(&maintainer.pubkey())
            .send()
            .unwrap();
    MintTo::new(&mut svm, &authority, &usdc_mint, &maintainer_token_account, 100_000_000)
        .send()
        .unwrap();

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
    let escrow_token_account =
        anchor_spl::associated_token::get_associated_token_address(&bounty, &usdc_mint);

    let amount_base_units: u64 = 10_000_000;
    let repo_hash = [7u8; 32];
    let issue_number: u64 = 42;
    let now = svm.get_sysvar::<Clock>().unix_timestamp;
    let deadline_unix_timestamp = now + 30; // short deadline for the test

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

    // --- Attempt 1: refund BEFORE deadline + grace period should FAIL ---
    let refund_ix = Instruction::new_with_bytes(
        program_id,
        &open_bounty::instruction::RefundExpired {}.data(),
        open_bounty::accounts::RefundExpired {
            maintainer: maintainer.pubkey(),
            bounty,
            escrow_token_account,
            maintainer_token_account,
            token_program: spl_token::id(),
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[refund_ix.clone()], Some(&maintainer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&maintainer]).unwrap();
    let res = svm.send_transaction(tx);
    assert!(res.is_err(), "refund should fail before deadline + grace period");

    // --- Warp time forward past deadline + grace period ---
    // Advance the slot first so the next latest_blockhash() differs from
    // the failed attempt above; otherwise the runtime treats the second
    // transaction as an exact replay and rejects it as AlreadyProcessed,
    // before our program logic even runs.
    let current_slot = svm.get_sysvar::<Clock>().slot;
    svm.warp_to_slot(current_slot + 1);
    svm.expire_blockhash();
    let mut clock = svm.get_sysvar::<Clock>();
    clock.unix_timestamp = deadline_unix_timestamp + grace_period_seconds + 1;
    svm.set_sysvar::<Clock>(&clock);

    // --- Attempt 2: refund AFTER deadline + grace period should SUCCEED ---
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[refund_ix], Some(&maintainer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&maintainer]).unwrap();
    let res = svm.send_transaction(tx);
    assert!(res.is_ok(), "refund_expired failed: {:?}", res.err());

    // --- Verify outcomes ---
    let bounty_account = svm.get_account(&bounty).unwrap();
    let mut data: &[u8] = &bounty_account.data;
    let bounty_state = open_bounty::state::Bounty::try_deserialize(&mut data).unwrap();
    assert_eq!(bounty_state.status, open_bounty::state::BountyStatus::Refunded);

    let maintainer_account = svm.get_account(&maintainer_token_account).unwrap();
    let maintainer_data = spl_token::state::Account::unpack(&maintainer_account.data).unwrap();
    assert_eq!(maintainer_data.amount, 100_000_000); // full balance restored

    assert!(
        svm.get_account(&escrow_token_account).is_none(),
        "escrow token account should be closed after refund"
    );
}
