use anchor_lang::prelude::*;

use crate::{constants::CONFIG_SEED, state::OpenBountyConfig};

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + OpenBountyConfig::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, OpenBountyConfig>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_config(
    ctx: Context<InitializeConfig>,
    attestor_pubkey: Pubkey,
    usdc_mint: Pubkey,
    max_bounty_amount_base_units: u64,
    default_refund_grace_period_seconds: i64,
) -> Result<()> {
    let config = &mut ctx.accounts.config;

    config.authority = ctx.accounts.authority.key();
    config.attestor_pubkey = attestor_pubkey;
    config.usdc_mint = usdc_mint;
    config.max_bounty_amount_base_units = max_bounty_amount_base_units;
    config.default_refund_grace_period_seconds = default_refund_grace_period_seconds;
    config.paused = false;
    config.bump = ctx.bumps.config;

    Ok(())
}
