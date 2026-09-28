mod common;

use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    common::*,
    open_bounty::{error::OpenBountyError, state::BountyStatus},
    solana_keypair::Keypair,
    solana_signer::Signer,
};

const WEEK: i64 = 7 * 24 * 3600;

fn attestor_clone(env: &Env) -> Keypair {
    Keypair::try_from(env.attestor.to_bytes().as_slice()).unwrap()
}

// ---------------------------------------------------------------- refund

#[test]
fn refund_timing_boundaries() {
    let mut env = Env::new();
    let deadline = env.now() + 30;
    let info = env.create_bounty(1, deadline);

    env.set_time(deadline - 1); // before the deadline
    assert_program_error(env.refund(&info), OpenBountyError::RefundNotYetAvailable);

    env.set_time(deadline + GRACE_PERIOD); // exactly at the boundary: still no
    assert_program_error(env.refund(&info), OpenBountyError::RefundNotYetAvailable);
    assert_eq!(env.bounty_status(&info), BountyStatus::Funded);
    assert_eq!(env.token_balance(&info.escrow), Some(AMOUNT));

    env.set_time(deadline + GRACE_PERIOD + 1); // one second later: yes
    env.refund(&info).expect("refund after grace failed");
    assert_eq!(env.bounty_status(&info), BountyStatus::Refunded);
    assert_eq!(env.token_balance(&env.maintainer_token_account), Some(100_000_000));
    assert_eq!(env.token_balance(&info.escrow), None); // escrow closed
}

#[test]
fn double_refund_fails() {
    let mut env = Env::new();
    let deadline = env.now() + 30;
    let info = env.create_bounty(1, deadline);
    env.set_time(deadline + GRACE_PERIOD + 1);
    env.refund(&info).expect("first refund failed");
    assert_fails(env.refund(&info));
    assert_eq!(env.bounty_status(&info), BountyStatus::Refunded);
    assert_eq!(env.token_balance(&env.maintainer_token_account), Some(100_000_000));
}

#[test]
fn refund_by_non_maintainer_fails() {
    let mut env = Env::new();
    let deadline = env.now() + 30;
    let info = env.create_bounty(1, deadline);
    env.set_time(deadline + GRACE_PERIOD + 1);

    let attacker = Keypair::new();
    env.svm.airdrop(&attacker.pubkey(), 1_000_000_000).unwrap();
    let ix = Instruction::new_with_bytes(
        env.program_id,
        &open_bounty::instruction::RefundExpired {}.data(),
        open_bounty::accounts::RefundExpired {
            maintainer: attacker.pubkey(),
            bounty: info.bounty,
            escrow_token_account: info.escrow,
            maintainer_token_account: ata(&attacker.pubkey(), &env.usdc_mint),
            token_program: anchor_spl::token::spl_token::id(),
        }
        .to_account_metas(None),
    );
    assert_fails(send(&mut env.svm, &[ix], &attacker));
    assert_eq!(env.bounty_status(&info), BountyStatus::Funded);
    assert_eq!(env.token_balance(&info.escrow), Some(AMOUNT));
}

#[test]
fn refund_after_payout_fails() {
    let mut env = Env::new();
    let deadline = env.now() + WEEK;
    let info = env.create_bounty(1, deadline);
    let (wallet, dest) = env.new_recipient();
    let f = default_fields(deadline);
    let msg = serialize(&env.attestation(&info, wallet, &f));
    let signer = attestor_clone(&env);
    env.release_signed(&info, wallet, dest, &f, &signer, &msg)
        .expect("release failed");

    env.set_time(deadline + GRACE_PERIOD + 1);
    assert_fails(env.refund(&info));
    assert_eq!(env.bounty_status(&info), BountyStatus::Paid);
    assert_eq!(env.token_balance(&dest), Some(AMOUNT));
    assert_eq!(env.token_balance(&env.maintainer_token_account), Some(90_000_000));
}

#[test]
fn release_after_refund_fails() {
    let mut env = Env::new();
    let deadline = env.now() + WEEK;
    let info = env.create_bounty(1, deadline);
    let (wallet, dest) = env.new_recipient();
    let f = default_fields(deadline);

    env.set_time(deadline + GRACE_PERIOD + 1);
    env.refund(&info).expect("refund failed");

    // A perfectly valid attestation (merge was before the deadline) arrives
    // too late: the refund is final.
    let msg = serialize(&env.attestation(&info, wallet, &f));
    let signer = attestor_clone(&env);
    let res = env.release_signed(&info, wallet, dest, &f, &signer, &msg);
    assert_fails(res);
    assert_eq!(env.bounty_status(&info), BountyStatus::Refunded);
    assert_eq!(env.token_balance(&dest), Some(0));
}

// ----------------------------------------------------------------- pause

#[test]
fn paused_blocks_create_bounty() {
    let mut env = Env::new();
    env.set_paused(true);
    let (ix, _info) = env.create_bounty_ix(1, AMOUNT, env.now() + 3600);
    let res = send(&mut env.svm, &[ix], &env.maintainer);
    assert_program_error(res, OpenBountyError::Paused);
}

#[test]
fn paused_blocks_release() {
    let mut env = Env::new();
    let deadline = env.now() + WEEK;
    let info = env.create_bounty(1, deadline);
    let (wallet, dest) = env.new_recipient();
    let f = default_fields(deadline);
    env.set_paused(true);

    let msg = serialize(&env.attestation(&info, wallet, &f));
    let signer = attestor_clone(&env);
    let res = env.release_signed(&info, wallet, dest, &f, &signer, &msg);
    assert_program_error(res, OpenBountyError::Paused);
    assert_untouched(&env, &info, &dest);
}

#[test]
fn paused_still_allows_refund() {
    let mut env = Env::new();
    let deadline = env.now() + 30;
    let info = env.create_bounty(1, deadline);
    env.set_paused(true);
    env.set_time(deadline + GRACE_PERIOD + 1);
    env.refund(&info).expect("a pause must never trap a maintainer's funds");
    assert_eq!(env.bounty_status(&info), BountyStatus::Refunded);
    assert_eq!(env.token_balance(&env.maintainer_token_account), Some(100_000_000));
}

// ------------------------------------------------- create_bounty checks

#[test]
fn create_bounty_zero_amount_fails() {
    let mut env = Env::new();
    let (ix, _) = env.create_bounty_ix(1, 0, env.now() + 3600);
    let res = send(&mut env.svm, &[ix], &env.maintainer);
    assert_program_error(res, OpenBountyError::ZeroAmount);
}

#[test]
fn create_bounty_over_cap_fails() {
    let mut env = Env::new();
    let (ix, _) = env.create_bounty_ix(1, 50_000_000 + 1, env.now() + 3600);
    let res = send(&mut env.svm, &[ix], &env.maintainer);
    assert_program_error(res, OpenBountyError::AmountTooLarge);
}

#[test]
fn create_bounty_deadline_not_in_future_fails() {
    let mut env = Env::new();
    let (ix, _) = env.create_bounty_ix(1, AMOUNT, env.now() - 1);
    let res = send(&mut env.svm, &[ix], &env.maintainer);
    assert_program_error(res, OpenBountyError::DeadlineInPast);

    let (ix, _) = env.create_bounty_ix(1, AMOUNT, env.now()); // equal is not "future"
    let res = send(&mut env.svm, &[ix], &env.maintainer);
    assert_program_error(res, OpenBountyError::DeadlineInPast);
}

#[test]
fn create_bounty_duplicate_nonce_fails() {
    let mut env = Env::new();
    let deadline = env.now() + 3600;
    env.create_bounty(1, deadline);
    let (ix, _) = env.create_bounty_ix(1, AMOUNT, deadline);
    assert_fails(send(&mut env.svm, &[ix], &env.maintainer));
    // Only one deposit ever left the maintainer's account.
    assert_eq!(env.token_balance(&env.maintainer_token_account), Some(90_000_000));
}

#[test]
fn create_bounty_wrong_mint_fails() {
    let mut env = Env::new();
    let other_mint = litesvm_token::CreateMint::new(&mut env.svm, &env.authority)
        .decimals(6)
        .send()
        .unwrap();
    let deadline = env.now() + 3600;
    let (_ix, info) = env.create_bounty_ix(1, AMOUNT, deadline);

    let ix = Instruction::new_with_bytes(
        env.program_id,
        &open_bounty::instruction::CreateBounty {
            nonce: 1,
            amount_base_units: AMOUNT,
            repo_hash: REPO_HASH,
            issue_number: ISSUE_NUMBER,
            deadline_unix_timestamp: deadline,
        }
        .data(),
        open_bounty::accounts::CreateBounty {
            maintainer: env.maintainer.pubkey(),
            config: env.config,
            usdc_mint: other_mint, // not the mint the config allows
            bounty: info.bounty,
            maintainer_token_account: env.maintainer_token_account,
            escrow_token_account: ata(&info.bounty, &other_mint),
            token_program: anchor_spl::token::spl_token::id(),
            associated_token_program: anchor_spl::associated_token::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    assert_fails(send(&mut env.svm, &[ix], &env.maintainer));
    assert_eq!(env.token_balance(&env.maintainer_token_account), Some(100_000_000));
}

// ------------------------------------------------------ admin / config

#[test]
fn initialize_config_twice_cannot_swap_attestor() {
    // If an attacker could re-run initialization they could replace the
    // attestor key and authorize payouts from every bounty.
    let mut env = Env::new();
    let ix = Instruction::new_with_bytes(
        env.program_id,
        &open_bounty::instruction::InitializeConfig {
            attestor_pubkey: Pubkey::new_unique(),
            usdc_mint: env.usdc_mint,
            max_bounty_amount_base_units: u64::MAX,
            default_refund_grace_period_seconds: 0,
        }
        .data(),
        open_bounty::accounts::InitializeConfig {
            authority: env.authority.pubkey(),
            config: env.config,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    assert_fails(send(&mut env.svm, &[ix], &env.authority));

    let acct = env.svm.get_account(&env.config).unwrap();
    let cfg = open_bounty::state::OpenBountyConfig::try_deserialize(&mut &acct.data[..]).unwrap();
    assert_eq!(cfg.attestor_pubkey, env.attestor.pubkey());
    assert_eq!(cfg.max_bounty_amount_base_units, 50_000_000);
}

#[test]
fn release_rent_cannot_be_redirected() {
    // The escrow account's rent goes back to the maintainer. Swapping in
    // another address for that slot must be rejected.
    let mut env = Env::new();
    let deadline = env.now() + WEEK;
    let info = env.create_bounty(1, deadline);
    let (wallet, dest) = env.new_recipient();
    let f = default_fields(deadline);

    let msg = serialize(&env.attestation(&info, wallet, &f));
    let ed = ed25519_ix(&env.attestor, &msg);
    let mut rel = env.release_ix(&info, wallet, dest, &f);
    let maintainer = env.maintainer.pubkey();
    let attacker = Pubkey::new_unique();
    for m in rel.accounts.iter_mut() {
        if m.pubkey == maintainer {
            m.pubkey = attacker;
        }
    }
    assert_fails(send(&mut env.svm, &[ed, rel], &env.relayer));
    assert_untouched(&env, &info, &dest);
}
