use anchor_lang::prelude::*;

#[error_code]
pub enum OpenBountyError {
    #[msg("Program is paused")]
    Paused,
    #[msg("Bounty amount must be greater than zero")]
    ZeroAmount,
    #[msg("Bounty amount exceeds the configured maximum")]
    AmountTooLarge,
    #[msg("Deadline must be in the future")]
    DeadlineInPast,
    #[msg("Bounty is not in the Funded state")]
    NotFunded,
    #[msg("Ed25519 instruction data is malformed or out of bounds")]
    InvalidEd25519Data,
    #[msg("Ed25519 instruction contains more than one signature")]
    MultipleSignatures,
    #[msg("Ed25519 signature/pubkey/message instruction index does not point to the current instruction")]
    Ed25519IndexSpoof,
    #[msg("Ed25519 verified public key does not match the configured attestor")]
    WrongAttestor,
    #[msg("Ed25519 verified message does not match the expected attestation bytes")]
    AttestationMismatch,
    #[msg("Refund is not yet available")]
    RefundNotYetAvailable,
}
