mod common;

use {
    anchor_lang::prelude::Pubkey,
    open_bounty::attestation::{expected_domain, MergeAttestationV1},
    solana_keypair::Keypair,
    solana_signer::Signer,
};

#[test]
fn ed25519_ix_vector() {
    let att = MergeAttestationV1 {
        domain: expected_domain(),
        bounty: Pubkey::new_from_array([1u8; 32]),
        repo_hash: [2u8; 32],
        issue_number: 42,
        pr_number: 99,
        commit_sha: [3u8; 20],
        github_user_id: 555,
        payout_wallet: Pubkey::new_from_array([4u8; 32]),
        amount_base_units: 10_000_000,
        merge_timestamp: 1_700_000_000,
    };
    let signer = Keypair::new_from_array([7u8; 32]);
    let msg = common::serialize(&att);
    let ix = common::ed25519_ix(&signer, &msg);
    let hex: String = ix.data.iter().map(|b| format!("{:02x}", b)).collect();
    println!("RUST_ED25519_PUBKEY={}", signer.pubkey());
    println!("RUST_ED25519_DATA={}", hex);
}
