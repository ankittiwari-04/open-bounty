use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    litesvm::LiteSVM,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

#[test]
fn test_initialize_config() {
    let program_id = open_bounty::id();
    let authority = Keypair::new();

    let config = Pubkey::find_program_address(
        &[open_bounty::constants::CONFIG_SEED],
        &program_id,
    )
    .0;

    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/open_bounty.so"
    ));
    svm.add_program(program_id, bytes).unwrap();
    svm.airdrop(&authority.pubkey(), 1_000_000_000).unwrap();

    let attestor_pubkey = Pubkey::new_unique();
    let usdc_mint = Pubkey::new_unique();
    let max_bounty_amount_base_units: u64 = 50_000_000; // 50 mock USDC at 6 decimals
    let default_refund_grace_period_seconds: i64 = 24 * 60 * 60; // 24 hours

    let instruction = Instruction::new_with_bytes(
        program_id,
        &open_bounty::instruction::InitializeConfig {
            attestor_pubkey,
            usdc_mint,
            max_bounty_amount_base_units,
            default_refund_grace_period_seconds,
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
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&authority]).unwrap();

    let res = svm.send_transaction(tx);
    assert!(res.is_ok(), "initialize_config failed: {:?}", res.err());

    let config_account = svm.get_account(&config).unwrap();
    let mut data: &[u8] = &config_account.data;
    let config_state =
        open_bounty::state::OpenBountyConfig::try_deserialize(&mut data).unwrap();

    assert_eq!(config_state.authority, authority.pubkey());
    assert_eq!(config_state.attestor_pubkey, attestor_pubkey);
    assert_eq!(config_state.usdc_mint, usdc_mint);
    assert_eq!(
        config_state.max_bounty_amount_base_units,
        max_bounty_amount_base_units
    );
    assert_eq!(
        config_state.default_refund_grace_period_seconds,
        default_refund_grace_period_seconds
    );
    assert_eq!(config_state.paused, false);
}
