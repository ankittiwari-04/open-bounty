use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer, Mint, Token, TokenAccount, Transfer},
};

use crate::{
    constants::BOUNTY_SEED,
    error::OpenBountyError,
    state::{Bounty, BountyStatus, OpenBountyConfig},
};

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct CreateBounty<'info> {
    #[account(mut)]
    pub maintainer: Signer<'info>,

    #[account(seeds = [crate::constants::CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, OpenBountyConfig>,

    #[account(address = config.usdc_mint)]
    pub usdc_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = maintainer,
        space = 8 + Bounty::INIT_SPACE,
        seeds = [BOUNTY_SEED, maintainer.key().as_ref(), &nonce.to_le_bytes()],
        bump
    )]
    pub bounty: Account<'info, Bounty>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = maintainer,
    )]
    pub maintainer_token_account: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = maintainer,
        associated_token::mint = usdc_mint,
        associated_token::authority = bounty,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_bounty(
    ctx: Context<CreateBounty>,
    nonce: u64,
    amount_base_units: u64,
    repo_hash: [u8; 32],
    issue_number: u64,
    deadline_unix_timestamp: i64,
) -> Result<()> {
    let config = &ctx.accounts.config;

    require!(!config.paused, OpenBountyError::Paused);
    require!(amount_base_units > 0, OpenBountyError::ZeroAmount);
    require!(
        amount_base_units <= config.max_bounty_amount_base_units,
        OpenBountyError::AmountTooLarge
    );

    let now = Clock::get()?.unix_timestamp;
    require!(
        deadline_unix_timestamp > now,
        OpenBountyError::DeadlineInPast
    );

    let bounty = &mut ctx.accounts.bounty;
    bounty.status = BountyStatus::Funded;
    bounty.maintainer = ctx.accounts.maintainer.key();
    bounty.nonce = nonce;
    bounty.usdc_mint = ctx.accounts.usdc_mint.key();
    bounty.amount_base_units = amount_base_units;
    bounty.repo_hash = repo_hash;
    bounty.issue_number = issue_number;
    bounty.deadline_unix_timestamp = deadline_unix_timestamp;
    bounty.refund_grace_period_seconds = config.default_refund_grace_period_seconds;
    bounty.bump = ctx.bumps.bounty;

    let cpi_accounts = Transfer {
        from: ctx.accounts.maintainer_token_account.to_account_info(),
        to: ctx.accounts.escrow_token_account.to_account_info(),
        authority: ctx.accounts.maintainer.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts);
    transfer(cpi_ctx, amount_base_units)?;

    Ok(())
}
