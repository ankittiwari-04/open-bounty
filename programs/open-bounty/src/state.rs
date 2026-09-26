use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, PartialEq, Eq, Debug)]
pub enum BountyStatus {
    Funded,
    Paid,
    Refunded,
}

#[account]
#[derive(InitSpace)]
pub struct OpenBountyConfig {
    pub authority: Pubkey,
    pub attestor_pubkey: Pubkey,
    pub usdc_mint: Pubkey,
    pub max_bounty_amount_base_units: u64,
    pub default_refund_grace_period_seconds: i64,
    pub paused: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Bounty {
    pub status: BountyStatus,
    pub maintainer: Pubkey,
    pub nonce: u64,
    pub usdc_mint: Pubkey,
    pub amount_base_units: u64,
    pub repo_hash: [u8; 32],
    pub issue_number: u64,
    pub deadline_unix_timestamp: i64,
    pub refund_grace_period_seconds: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Receipt {
    pub bounty: Pubkey,
    pub repo_hash: [u8; 32],
    pub issue_number: u64,
    pub pr_number: u64,
    pub commit_sha: [u8; 20],
    pub github_user_id: u64,
    pub payout_wallet: Pubkey,
    pub amount_base_units: u64,
    pub merge_timestamp: i64,
    pub released_at: i64,
}
