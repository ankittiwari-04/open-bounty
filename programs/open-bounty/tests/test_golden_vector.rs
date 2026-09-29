//! Cross-language golden vector for MergeAttestationV1.
//! The expected bytes were derived independently (Python: plain concatenation
//! of the fields, little-endian integers). The TypeScript backend must
//! produce the same 188 bytes, or every real payout fails with
//! AttestationMismatch.

use {
    anchor_lang::{prelude::Pubkey, AnchorSerialize},
    open_bounty::attestation::{expected_domain, MergeAttestationV1},
};

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

fn golden_attestation() -> MergeAttestationV1 {
    MergeAttestationV1 {
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
    }
}

#[test]
fn domain_separator_matches_golden() {
    assert_eq!(
        hex(&expected_domain()),
        "48032c76f3d3c854360f732ab1abe56a29094e477c613359e99fcb4a19d932e4"
    );
}

#[test]
fn attestation_bytes_match_golden() {
    let mut bytes = Vec::new();
    golden_attestation().serialize(&mut bytes).unwrap();

    assert_eq!(bytes.len(), 188);

    let expected = format!(
        "{}{}{}{}{}{}{}{}{}{}",
        "48032c76f3d3c854360f732ab1abe56a29094e477c613359e99fcb4a19d932e4", // domain
        "01".repeat(32),   // bounty
        "02".repeat(32),   // repo_hash
        "2a00000000000000", // issue_number = 42 (u64 LE)
        "6300000000000000", // pr_number = 99 (u64 LE)
        "03".repeat(20),   // commit_sha
        "2b02000000000000", // github_user_id = 555 (u64 LE)
        "04".repeat(32),   // payout_wallet
        "8096980000000000", // amount = 10_000_000 (u64 LE)
        "00f1536500000000", // merge_timestamp = 1_700_000_000 (i64 LE)
    );
    assert_eq!(hex(&bytes), expected);

    let digest = solana_sha256_hasher::hash(&bytes).to_bytes();
    assert_eq!(
        hex(&digest),
        "118184ed2220bbcdb7313d99b1879a4a5e207cb83d2d6e137b750e8447e39b42"
    );
}
