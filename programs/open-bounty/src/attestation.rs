use anchor_lang::prelude::*;

/// The exact byte layout signed by the backend attestor and verified
/// on-chain via the Ed25519 precompile. Field order and types here
/// must never change without bumping the domain string below.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub struct MergeAttestationV1 {
    pub domain: [u8; 32],
    pub bounty: Pubkey,
    pub repo_hash: [u8; 32],
    pub issue_number: u64,
    pub pr_number: u64,
    pub commit_sha: [u8; 20],
    pub github_user_id: u64,
    pub payout_wallet: Pubkey,
    pub amount_base_units: u64,
    pub merge_timestamp: i64,
}

/// SHA-256("OPENBOUNTY_MERGE_ATTESTATION_V1"), computed at runtime.
/// A fixed domain separator so an attestation can never be replayed
/// as a different message type or a future protocol version.
pub fn expected_domain() -> [u8; 32] {
    solana_sha256_hasher::hash(b"OPENBOUNTY_MERGE_ATTESTATION_V1").to_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn domain_is_stable_and_32_bytes() {
        let a = expected_domain();
        let b = expected_domain();
        assert_eq!(a, b, "domain hash must be deterministic");
        assert_eq!(a.len(), 32);
    }

    #[test]
    fn serialization_round_trips() {
        let original = MergeAttestationV1 {
            domain: expected_domain(),
            bounty: Pubkey::new_unique(),
            repo_hash: [1u8; 32],
            issue_number: 42,
            pr_number: 7,
            commit_sha: [2u8; 20],
            github_user_id: 999,
            payout_wallet: Pubkey::new_unique(),
            amount_base_units: 10_000_000,
            merge_timestamp: 1_700_000_000,
        };
        let mut bytes = Vec::new();
        original.serialize(&mut bytes).unwrap();
        let decoded = MergeAttestationV1::try_from_slice(&bytes).unwrap();
        assert_eq!(original, decoded);
    }
}
