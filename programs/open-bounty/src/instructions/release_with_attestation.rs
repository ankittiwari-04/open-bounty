use anchor_lang::prelude::*;
use anchor_spl::token::{close_account, transfer, CloseAccount, Token, TokenAccount, Transfer};
use borsh::BorshSerialize;

use crate::{
    attestation::{expected_domain, MergeAttestationV1},
    constants::{BOUNTY_SEED, RECEIPT_SEED},
    ed25519::{get_preceding_ed25519_instruction_data, verify_ed25519_instruction_data},
    error::OpenBountyError,
    state::{Bounty, BountyStatus, OpenBountyConfig, Receipt},
};

#[derive(Accounts)]
pub struct ReleaseWithAttestation<'info> {
    /// Anyone may submit this transaction — the attestation itself
    /// fixes the bounty, amount, and destination wallet, so an
    /// untrusted submitter cannot redirect funds.
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(seeds = [crate::constants::CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, OpenBountyConfig>,

    #[account(
        mut,
        seeds = [BOUNTY_SEED, bounty.maintainer.as_ref(), &bounty.nonce.to_le_bytes()],
        bump = bounty.bump
    )]
    pub bounty: Account<'info, Bounty>,

    #[account(
        init,
        payer = payer,
        space = 8 + Receipt::INIT_SPACE,
        seeds = [RECEIPT_SEED, bounty.key().as_ref()],
        bump
    )]
    pub receipt: Account<'info, Receipt>,

    #[account(
        mut,
        associated_token::mint = bounty.usdc_mint,
        associated_token::authority = bounty,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = bounty.usdc_mint,
        associated_token::authority = destination_owner,
    )]
    pub destination_token_account: Account<'info, TokenAccount>,

    /// CHECK: only used as the expected owner of `destination_token_account`,
    /// checked against the attestation's `payout_wallet` field below. Does
    /// not need to sign — the attestation, not this account, authorizes
    /// the payout.
    pub destination_owner: UncheckedAccount<'info>,

    /// CHECK: verified by address constraint against the real
    /// Instructions sysvar; contents are parsed manually in
    /// `get_preceding_ed25519_instruction_data`.
    #[account(address = solana_sdk_ids::sysvar::instructions::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,

    #[account(mut, address = bounty.maintainer)]
    pub maintainer: SystemAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handle_release_with_attestation(
    ctx: Context<ReleaseWithAttestation>,
    pr_number: u64,
    commit_sha: [u8; 20],
    github_user_id: u64,
    amount_base_units: u64,
    merge_timestamp: i64,
) -> Result<()> {
    let config = &ctx.accounts.config;
    require!(!config.paused, OpenBountyError::Paused);

    let bounty = &ctx.accounts.bounty;
    require!(bounty.status == BountyStatus::Funded, OpenBountyError::NotFunded);
    require!(
        amount_base_units == bounty.amount_base_units,
        OpenBountyError::AmountTooLarge
    );
    require!(
        merge_timestamp <= bounty.deadline_unix_timestamp,
        OpenBountyError::MergeAfterDeadline
    );

    let payout_wallet = ctx.accounts.destination_owner.key();

    let expected_attestation = MergeAttestationV1 {
        domain: expected_domain(),
        bounty: bounty.key(),
        repo_hash: bounty.repo_hash,
        issue_number: bounty.issue_number,
        pr_number,
        commit_sha,
        github_user_id,
        payout_wallet,
        amount_base_units,
        merge_timestamp,
    };
    let mut expected_message = Vec::new();
    expected_attestation
        .serialize(&mut expected_message)
        .map_err(|_| OpenBountyError::InvalidEd25519Data)?;

    let ed25519_data =
        get_preceding_ed25519_instruction_data(&ctx.accounts.instructions_sysvar)?;
    verify_ed25519_instruction_data(&ed25519_data, &config.attestor_pubkey, &expected_message)?;

    // All checks passed — move funds, record the receipt, close escrow.
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

    let transfer_accounts = Transfer {
        from: ctx.accounts.escrow_token_account.to_account_info(),
        to: ctx.accounts.destination_token_account.to_account_info(),
        authority: ctx.accounts.bounty.to_account_info(),
    };
    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        transfer_accounts,
        signer,
    );
    transfer(transfer_ctx, amount_base_units)?;

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

    let receipt = &mut ctx.accounts.receipt;
    receipt.bounty = bounty.key();
    receipt.repo_hash = bounty.repo_hash;
    receipt.issue_number = bounty.issue_number;
    receipt.pr_number = pr_number;
    receipt.commit_sha = commit_sha;
    receipt.github_user_id = github_user_id;
    receipt.payout_wallet = payout_wallet;
    receipt.amount_base_units = amount_base_units;
    receipt.merge_timestamp = merge_timestamp;
    receipt.released_at = Clock::get()?.unix_timestamp;

    ctx.accounts.bounty.status = BountyStatus::Paid;

    Ok(())
}
