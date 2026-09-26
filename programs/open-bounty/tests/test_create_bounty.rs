use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    anchor_spl::{associated_token::get_associated_token_address, token::spl_token},
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
fn test_create_bounty() {
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

    // Create a mock USDC mint (6 decimals) with `authority` as mint authority.
    let usdc_mint = CreateMint::new(&mut svm, &authority)
        .decimals(6)
        .send()
        .unwrap();

    let config = Pubkey::find_program_address(
        &[open_bounty::constants::CONFIG_SEED],
        &program_id,
    )
    .0;

    init_config(
        &mut svm,
        &program_id,
        &authority,
        config,
        Pubkey::new_unique(), // attestor_pubkey — irrelevant to this test
        usdc_mint,
    );

    // Fund the maintainer with mock USDC.
    let maintainer_token_account = CreateAssociatedTokenAccount::new(&mut svm, &maintainer, &usdc_mint)
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
    let escrow_token_account = get_associated_token_address(&bounty, &usdc_mint);

    let amount_base_units: u64 = 10_000_000; // 10 mock USDC
    let repo_hash = [7u8; 32];
    let issue_number: u64 = 42;
    let now = svm.get_sysvar::<anchor_lang::solana_program::clock::Clock>().unix_timestamp;
    let deadline_unix_timestamp = now + 7 * 24 * 60 * 60;

    let instruction = Instruction::new_with_bytes(
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
            associated_token_program: spl_associated_token_account::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );

    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&maintainer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&maintainer]).unwrap();
    let res = svm.send_transaction(tx);
    assert!(res.is_ok(), "create_bounty failed: {:?}", res.err());

    let bounty_account = svm.get_account(&bounty).unwrap();
    let mut data: &[u8] = &bounty_account.data;
    let bounty_state = open_bounty::state::Bounty::try_deserialize(&mut data).unwrap();

    assert_eq!(bounty_state.maintainer, maintainer.pubkey());
    assert_eq!(bounty_state.nonce, nonce);
    assert_eq!(bounty_state.usdc_mint, usdc_mint);
    assert_eq!(bounty_state.amount_base_units, amount_base_units);
    assert_eq!(bounty_state.repo_hash, repo_hash);
    assert_eq!(bounty_state.issue_number, issue_number);
    assert_eq!(bounty_state.deadline_unix_timestamp, deadline_unix_timestamp);

    let escrow_account = svm.get_account(&escrow_token_account).unwrap();
    let escrow_data = spl_token::state::Account::unpack(&escrow_account.data).unwrap();
    assert_eq!(escrow_data.amount, amount_base_units);
}
