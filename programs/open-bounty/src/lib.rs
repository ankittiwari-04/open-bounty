pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
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
}
