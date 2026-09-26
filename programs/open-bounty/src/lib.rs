pub mod constants;
pub mod attestation;
pub mod ed25519;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use attestation::*;
pub use instructions::*;
pub use state::*;

declare_id!("3vrdRy3zamdYvUZJ34uinMbpJ5ZS8BqxxJD2a8EzUs2H");

#[program]
pub mod open_bounty {
    use super::*;

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        attestor_pubkey: Pubkey,
        usdc_mint: Pubkey,
        max_bounty_amount_base_units: u64,
        default_refund_grace_period_seconds: i64,
    ) -> Result<()> {
        crate::instructions::initialize_config::handle_initialize_config(
            ctx,
            attestor_pubkey,
            usdc_mint,
            max_bounty_amount_base_units,
            default_refund_grace_period_seconds,
        )
    }

    pub fn create_bounty(
        ctx: Context<CreateBounty>,
        nonce: u64,
        amount_base_units: u64,
        repo_hash: [u8; 32],
        issue_number: u64,
        deadline_unix_timestamp: i64,
    ) -> Result<()> {
        crate::instructions::create_bounty::handle_create_bounty(
            ctx,
            nonce,
            amount_base_units,
            repo_hash,
            issue_number,
            deadline_unix_timestamp,
        )
    }

    pub fn release_with_attestation(
        ctx: Context<ReleaseWithAttestation>,
        pr_number: u64,
        commit_sha: [u8; 20],
        github_user_id: u64,
        amount_base_units: u64,
        merge_timestamp: i64,
    ) -> Result<()> {
        crate::instructions::release_with_attestation::handle_release_with_attestation(
            ctx,
            pr_number,
            commit_sha,
            github_user_id,
            amount_base_units,
            merge_timestamp,
        )
    }

    pub fn refund_expired(ctx: Context<RefundExpired>) -> Result<()> {
        crate::instructions::refund_expired::handle_refund_expired(ctx)
    }
}
