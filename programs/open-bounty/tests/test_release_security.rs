mod common;

use {
    anchor_lang::prelude::Pubkey,
    common::*,
    open_bounty::{error::OpenBountyError, state::BountyStatus},
    solana_keypair::Keypair,
    solana_signer::Signer,
};

fn setup() -> (Env, BountyInfo, Pubkey, Pubkey, Fields) {
    let mut env = Env::new();
    let deadline = env.now() + 7 * 24 * 3600;
    let info = env.create_bounty(1, deadline);
    let (wallet, token_account) = env.new_recipient();
    let f = default_fields(deadline);
    (env, info, wallet, token_account, f)
}

#[test]
fn wrong_attestor_fails() {
    let (mut env, info, wallet, dest, f) = setup();
    let msg = serialize(&env.attestation(&info, wallet, &f));
    let imposter = Keypair::new(); // valid signature, but not the configured attestor
    let res = env.release_signed(&info, wallet, dest, &f, &imposter, &msg);
    assert_program_error(res, OpenBountyError::WrongAttestor);
    assert_untouched(&env, &info, &dest);
}

#[test]
fn wrong_bounty_in_payload_fails() {
    let (mut env, info, wallet, dest, f) = setup();
    let mut att = env.attestation(&info, wallet, &f);
    att.bounty = Pubkey::new_unique(); // attestation was issued for a different bounty
    let msg = serialize(&att);
    let signer = Keypair::try_from(env.attestor.to_bytes().as_slice()).unwrap();
    let res = env.release_signed(&info, wallet, dest, &f, &signer, &msg);
    assert_program_error(res, OpenBountyError::AttestationMismatch);
    assert_untouched(&env, &info, &dest);
}

#[test]
fn wrong_repo_hash_fails() {
    let (mut env, info, wallet, dest, f) = setup();
    let mut att = env.attestation(&info, wallet, &f);
    att.repo_hash = [9u8; 32];
    let msg = serialize(&att);
    let signer = Keypair::try_from(env.attestor.to_bytes().as_slice()).unwrap();
    let res = env.release_signed(&info, wallet, dest, &f, &signer, &msg);
    assert_program_error(res, OpenBountyError::AttestationMismatch);
    assert_untouched(&env, &info, &dest);
}

#[test]
fn wrong_issue_number_fails() {
    let (mut env, info, wallet, dest, f) = setup();
    let mut att = env.attestation(&info, wallet, &f);
    att.issue_number = 43;
    let msg = serialize(&att);
    let signer = Keypair::try_from(env.attestor.to_bytes().as_slice()).unwrap();
    let res = env.release_signed(&info, wallet, dest, &f, &signer, &msg);
    assert_program_error(res, OpenBountyError::AttestationMismatch);
    assert_untouched(&env, &info, &dest);
}

#[test]
fn wrong_domain_separator_fails() {
    let (mut env, info, wallet, dest, f) = setup();
    let mut att = env.attestation(&info, wallet, &f);
    att.domain = [0u8; 32];
    let msg = serialize(&att);
    let signer = Keypair::try_from(env.attestor.to_bytes().as_slice()).unwrap();
    let res = env.release_signed(&info, wallet, dest, &f, &signer, &msg);
    assert_program_error(res, OpenBountyError::AttestationMismatch);
    assert_untouched(&env, &info, &dest);
}

#[test]
fn payout_redirection_fails() {
    // The attestor authorized wallet A. An attacker submits the transaction
    // with their own wallet B as the destination.
    let (mut env, info, wallet_a, _dest_a, f) = setup();
    let (wallet_b, dest_b) = env.new_recipient();
    let msg = serialize(&env.attestation(&info, wallet_a, &f));
    let signer = Keypair::try_from(env.attestor.to_bytes().as_slice()).unwrap();
    let res = env.release_signed(&info, wallet_b, dest_b, &f, &signer, &msg);
    assert_program_error(res, OpenBountyError::AttestationMismatch);
    assert_untouched(&env, &info, &dest_b);
}

#[test]
fn wrong_destination_token_account_fails() {
    // Correct owner in the attestation, but someone else's token account
    // passed as the destination: the canonical-ATA constraint rejects it.
    let (mut env, info, wallet, dest, f) = setup();
    let (_other_wallet, other_dest) = env.new_recipient();
    let msg = serialize(&env.attestation(&info, wallet, &f));
    let signer = Keypair::try_from(env.attestor.to_bytes().as_slice()).unwrap();
    let res = env.release_signed(&info, wallet, other_dest, &f, &signer, &msg);
    assert_fails(res);
    assert_untouched(&env, &info, &dest);
}

#[test]
fn attested_amount_differs_from_argument_fails() {
    // Argument matches the bounty, but the attestor signed a different amount.
    let (mut env, info, wallet, dest, f) = setup();
    let mut att = env.attestation(&info, wallet, &f);
    att.amount_base_units = AMOUNT + 1;
    let msg = serialize(&att);
    let signer = Keypair::try_from(env.attestor.to_bytes().as_slice()).unwrap();
    let res = env.release_signed(&info, wallet, dest, &f, &signer, &msg);
    assert_program_error(res, OpenBountyError::AttestationMismatch);
    assert_untouched(&env, &info, &dest);
}

#[test]
fn amount_argument_differs_from_bounty_fails() {
    // Attestation and argument agree with each other but not with the bounty.
    let (mut env, info, wallet, dest, mut f) = setup();
    f.amount = AMOUNT + 1;
    let msg = serialize(&env.attestation(&info, wallet, &f));
    let signer = Keypair::try_from(env.attestor.to_bytes().as_slice()).unwrap();
    let res = env.release_signed(&info, wallet, dest, &f, &signer, &msg);
    assert_program_error(res, OpenBountyError::AmountMismatch);
    assert_untouched(&env, &info, &dest);
}

#[test]
fn merge_after_deadline_fails() {
    let (mut env, info, wallet, dest, mut f) = setup();
    f.merge_timestamp = info.deadline + 1;
    let msg = serialize(&env.attestation(&info, wallet, &f));
    let signer = Keypair::try_from(env.attestor.to_bytes().as_slice()).unwrap();
    let res = env.release_signed(&info, wallet, dest, &f, &signer, &msg);
    assert_program_error(res, OpenBountyError::MergeAfterDeadline);
    assert_untouched(&env, &info, &dest);
}

#[test]
fn missing_ed25519_instruction_fails() {
    // The release instruction is the first instruction in the transaction.
    let (mut env, info, wallet, dest, f) = setup();
    let rel = env.release_ix(&info, wallet, dest, &f);
    let res = send(&mut env.svm, &[rel], &env.relayer);
    assert_program_error(res, OpenBountyError::MissingEd25519Instruction);
    assert_untouched(&env, &info, &dest);
}

#[test]
fn ed25519_not_immediately_before_release_fails() {
    // [ed25519, spacer, release]: a valid signature exists in the
    // transaction, but not in the slot right before our instruction.
    let (mut env, info, wallet, dest, f) = setup();
    let msg = serialize(&env.attestation(&info, wallet, &f));
    let ed = ed25519_ix(&env.attestor, &msg);
    let spacer = dummy_ix(env.relayer.pubkey(), Pubkey::new_unique());
    let rel = env.release_ix(&info, wallet, dest, &f);
    let res = send(&mut env.svm, &[ed, spacer, rel], &env.relayer);
    assert_program_error(res, OpenBountyError::MissingEd25519Instruction);
    assert_untouched(&env, &info, &dest);
}

#[test]
fn create_ata_before_ed25519_succeeds() {
    // This is the exact layout the backend relayer will use: create the
    // recipient's ATA if needed, then Ed25519 verify, then release.
    let mut env = Env::new();
    let deadline = env.now() + 7 * 24 * 3600;
    let info = env.create_bounty(1, deadline);
    let wallet = Pubkey::new_unique();
    let dest = ata(&wallet, &env.usdc_mint);
    let f = default_fields(deadline);

    let msg = serialize(&env.attestation(&info, wallet, &f));
    let create_ata = create_ata_idempotent_ix(env.relayer.pubkey(), wallet, env.usdc_mint);
    let ed = ed25519_ix(&env.attestor, &msg);
    let rel = env.release_ix(&info, wallet, dest, &f);
    send(&mut env.svm, &[create_ata, ed, rel], &env.relayer).expect("release failed");

    assert_eq!(env.token_balance(&dest), Some(AMOUNT));
    assert_eq!(env.bounty_status(&info), BountyStatus::Paid);
}

#[test]
fn release_during_grace_period_succeeds() {
    // The merge happened before the deadline. The deadline has now passed,
    // but we're still inside the grace window, so payout must still work.
    let (mut env, info, wallet, dest, f) = setup();
    env.set_time(info.deadline + 10);
    let msg = serialize(&env.attestation(&info, wallet, &f));
    let signer = Keypair::try_from(env.attestor.to_bytes().as_slice()).unwrap();
    env.release_signed(&info, wallet, dest, &f, &signer, &msg)
        .expect("release during grace failed");
    assert_eq!(env.token_balance(&dest), Some(AMOUNT));
    assert_eq!(env.token_balance(&info.escrow), None); // escrow closed
    assert_eq!(env.bounty_status(&info), BountyStatus::Paid);
}

#[test]
fn second_payout_fails() {
    let (mut env, info, wallet, dest, f) = setup();
    let msg = serialize(&env.attestation(&info, wallet, &f));
    let signer = Keypair::try_from(env.attestor.to_bytes().as_slice()).unwrap();
    env.release_signed(&info, wallet, dest, &f, &signer, &msg)
        .expect("first release failed");

    let res = env.release_signed(&info, wallet, dest, &f, &signer, &msg);
    assert_fails(res);
    assert_eq!(env.token_balance(&dest), Some(AMOUNT)); // paid exactly once
    assert_eq!(env.bounty_status(&info), BountyStatus::Paid);
}
