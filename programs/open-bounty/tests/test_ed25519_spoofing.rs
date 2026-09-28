mod common;

use {
    anchor_lang::{prelude::Pubkey, solana_program::instruction::Instruction},
    common::*,
    open_bounty::error::OpenBountyError,
    solana_keypair::Keypair,
    solana_signer::Signer,
};

const CUR: u16 = u16::MAX; // "read from this same instruction"

fn attestor_clone(env: &Env) -> Keypair {
    Keypair::try_from(env.attestor.to_bytes().as_slice()).unwrap()
}

/// Hand-assembles a native Ed25519 instruction so we can set the three
/// instruction-index fields to anything we like.
/// Layout: [num_sigs, pad, 14-byte offsets block, signature, pubkey, message]
fn raw_ed25519_ix(
    signer: &Keypair,
    message: &[u8],
    sig_ix: u16,
    pk_ix: u16,
    msg_ix: u16,
) -> Instruction {
    let sig: [u8; 64] = signer.sign_message(message).into();
    let pk: [u8; 32] = signer.pubkey().to_bytes();
    let sig_off: u16 = 16;
    let pk_off: u16 = 16 + 64;
    let msg_off: u16 = 16 + 64 + 32;
    let mut data = vec![1u8, 0u8];
    for v in [sig_off, sig_ix, pk_off, pk_ix, msg_off, message.len() as u16, msg_ix] {
        data.extend_from_slice(&v.to_le_bytes());
    }
    data.extend_from_slice(&sig);
    data.extend_from_slice(&pk);
    data.extend_from_slice(message);
    Instruction {
        program_id: solana_sdk_ids::ed25519_program::ID,
        accounts: vec![],
        data,
    }
}

/// Two (valid) signatures in one Ed25519 instruction.
fn raw_two_signature_ix(signer: &Keypair, message: &[u8]) -> Instruction {
    let sig: [u8; 64] = signer.sign_message(message).into();
    let pk: [u8; 32] = signer.pubkey().to_bytes();
    let sig_off: u16 = 30; // 2 + 2 * 14
    let pk_off: u16 = 30 + 64;
    let msg_off: u16 = 30 + 64 + 32;
    let mut data = vec![2u8, 0u8];
    for _ in 0..2 {
        for v in [sig_off, CUR, pk_off, CUR, msg_off, message.len() as u16, CUR] {
            data.extend_from_slice(&v.to_le_bytes());
        }
    }
    data.extend_from_slice(&sig);
    data.extend_from_slice(&pk);
    data.extend_from_slice(message);
    Instruction {
        program_id: solana_sdk_ids::ed25519_program::ID,
        accounts: vec![],
        data,
    }
}

fn setup() -> (Env, BountyInfo, Pubkey, Pubkey, Fields, Vec<u8>) {
    let mut env = Env::new();
    let deadline = env.now() + 7 * 24 * 3600;
    let info = env.create_bounty(1, deadline);
    let (wallet, dest) = env.new_recipient();
    let f = default_fields(deadline);
    let msg = serialize(&env.attestation(&info, wallet, &f));
    (env, info, wallet, dest, f, msg)
}

fn run(
    env: &mut Env,
    ed: Instruction,
    info: &BountyInfo,
    wallet: Pubkey,
    dest: Pubkey,
    f: &Fields,
) -> Result<(), String> {
    let rel = env.release_ix(info, wallet, dest, f);
    send(&mut env.svm, &[ed, rel], &env.relayer)
}

#[test]
fn raw_builder_control_succeeds() {
    // Same hand-built layout with correct (sentinel) indices must pay out.
    // This proves the failures below are caused by the indices themselves.
    let (mut env, info, wallet, dest, f, msg) = setup();
    let ed = raw_ed25519_ix(&attestor_clone(&env), &msg, CUR, CUR, CUR);
    run(&mut env, ed, &info, wallet, dest, &f).expect("control release failed");
    assert_eq!(env.token_balance(&dest), Some(AMOUNT));
}

#[test]
fn signature_index_spoof_fails() {
    // Index 0 is this very instruction, so the precompile happily verifies it,
    // but it is not the "current instruction" sentinel, so we must reject.
    let (mut env, info, wallet, dest, f, msg) = setup();
    let ed = raw_ed25519_ix(&attestor_clone(&env), &msg, 0, CUR, CUR);
    let res = run(&mut env, ed, &info, wallet, dest, &f);
    assert_program_error(res, OpenBountyError::Ed25519IndexSpoof);
    assert_untouched(&env, &info, &dest);
}

#[test]
fn public_key_index_spoof_fails() {
    let (mut env, info, wallet, dest, f, msg) = setup();
    let ed = raw_ed25519_ix(&attestor_clone(&env), &msg, CUR, 0, CUR);
    let res = run(&mut env, ed, &info, wallet, dest, &f);
    assert_program_error(res, OpenBountyError::Ed25519IndexSpoof);
    assert_untouched(&env, &info, &dest);
}

#[test]
fn message_index_spoof_fails() {
    let (mut env, info, wallet, dest, f, msg) = setup();
    let ed = raw_ed25519_ix(&attestor_clone(&env), &msg, CUR, CUR, 0);
    let res = run(&mut env, ed, &info, wallet, dest, &f);
    assert_program_error(res, OpenBountyError::Ed25519IndexSpoof);
    assert_untouched(&env, &info, &dest);
}

#[test]
fn multiple_signatures_fail() {
    let (mut env, info, wallet, dest, f, msg) = setup();
    let ed = raw_two_signature_ix(&attestor_clone(&env), &msg);
    let res = run(&mut env, ed, &info, wallet, dest, &f);
    assert_program_error(res, OpenBountyError::MultipleSignatures);
    assert_untouched(&env, &info, &dest);
}

#[test]
fn corrupted_signature_is_rejected_by_the_runtime() {
    // A tampered signature never reaches our program: the precompile
    // rejects the whole transaction first.
    let (mut env, info, wallet, dest, f, msg) = setup();
    let mut ed = raw_ed25519_ix(&attestor_clone(&env), &msg, CUR, CUR, CUR);
    ed.data[16] ^= 0xFF; // flip a byte inside the signature
    let res = run(&mut env, ed, &info, wallet, dest, &f);
    assert_fails(res);
    assert_untouched(&env, &info, &dest);
}

#[test]
fn truncated_ed25519_data_fails_safely() {
    let (mut env, info, wallet, dest, f, _msg) = setup();
    let ed = Instruction {
        program_id: solana_sdk_ids::ed25519_program::ID,
        accounts: vec![],
        data: vec![1u8, 0u8, 3u8],
    };
    let res = run(&mut env, ed, &info, wallet, dest, &f);
    assert_fails(res);
    assert_untouched(&env, &info, &dest);
}
