use anchor_lang::InstructionData;

#[test]
fn release_ix_data_vector() {
    let data = open_bounty::instruction::ReleaseWithAttestation {
        pr_number: 99,
        commit_sha: [3u8; 20],
        github_user_id: 555,
        amount_base_units: 10_000_000,
        merge_timestamp: 1_700_000_000,
    }
    .data();
    let hex: String = data.iter().map(|b| format!("{:02x}", b)).collect();
    println!("RUST_RELEASE_DATA={}", hex);
}
