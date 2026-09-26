use anchor_lang::prelude::*;
use anchor_spl::token::{close_account, transfer, CloseAccount, Token, TokenAccount, Transfer};

use crate::{
    constants::BOUNTY_SEED,
    error::OpenBountyError,
    state::{Bounty, BountyStatus},
};

#[derive(Accounts)]
pub struct RefundExpired<'info> {
    #[account(mut, address = bounty.maintainer)]
    pub maintainer: Signer<'info>,

    #[account(
        mut,
        seeds = [BOUNTY_SEED, bounty.maintainer.as_ref(), &bounty.nonce.to_le_bytes()],
        bump = bounty.bump
    )]
    pub bounty: Account<'info, Bounty>,

    #[account(
        mut,
        associated_token::mint = bounty.usdc_mint,
        associated_token::authority = bounty,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = bounty.usdc_mint,
        associated_token::authority = maintainer,
    )]
    pub maintainer_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_refund_expired(ctx: Context<RefundExpired>) -> Result<()> {
    let bounty = &ctx.accounts.bounty;
    require!(bounty.status == BountyStatus::Funded, OpenBountyError::NotFunded);

    let now = Clock::get()?.unix_timestamp;
    let refund_available_at = bounty
        .deadline_unix_timestamp
        .checked_add(bounty.refund_grace_period_seconds)
        .ok_or(OpenBountyError::RefundTimestampOverflow)?;
    require!(now > refund_available_at, OpenBountyError::RefundNotYetAvailable);

    let maintainer_key = bounty.maintainer;
    let nonce_bytes = bounty.nonce.to_le_bytes();
    let bounty_bump = bounty.bump;
    let signer_seeds: &[&[u8]] = &[
        BOUNTY_SEED,
        maintainer_key.as_ref(),
        &nonce_bytes,
        &[bounty_bump],
    ];
    let signer = &[signer_seeds];

    let refund_amount = ctx.accounts.escrow_token_account.amount;

    let transfer_accounts = Transfer {
        from: ctx.accounts.escrow_token_account.to_account_info(),
        to: ctx.accounts.maintainer_token_account.to_account_info(),
        authority: ctx.accounts.bounty.to_account_info(),
    };
    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        transfer_accounts,
        signer,
    );
    transfer(transfer_ctx, refund_amount)?;

    let close_accounts = CloseAccount {
        account: ctx.accounts.escrow_token_account.to_account_info(),
        destination: ctx.accounts.maintainer.to_account_info(),
        authority: ctx.accounts.bounty.to_account_info(),
    };
    let close_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        close_accounts,
        signer,
    );
    close_account(close_ctx)?;

    ctx.accounts.bounty.status = BountyStatus::Refunded;

    Ok(())
}
