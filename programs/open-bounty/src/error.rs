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
    #[msg("Refund is not yet available")]
    RefundNotYetAvailable,
}
