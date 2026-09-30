use anchor_lang::{prelude::Pubkey, AccountSerialize};
use open_bounty::state::{Bounty, BountyStatus};

#[test]
fn bounty_account_vector() {
    let b = Bounty {
        status: BountyStatus::Funded,
        maintainer: Pubkey::new_from_array([5u8; 32]),
        nonce: 7,
        usdc_mint: Pubkey::new_from_array([6u8; 32]),
        amount_base_units: 10_000_000,
        repo_hash: [2u8; 32],
        issue_number: 42,
        deadline_unix_timestamp: 1_700_000_000,
        refund_grace_period_seconds: 86_400,
        bump: 254,
    };
    let mut v = Vec::new();
    b.try_serialize(&mut v).unwrap();
    let hex: String = v.iter().map(|x| format!("{:02x}", x)).collect();
    println!("RUST_BOUNTY_LEN={}", v.len());
    println!("RUST_BOUNTY_DATA={}", hex);
}
