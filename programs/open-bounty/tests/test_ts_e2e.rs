mod common;

use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::instruction::{AccountMeta, Instruction},
    },
    open_bounty::state::BountyStatus,
    solana_signer::Signer,
    std::{fs, process::Command, str::FromStr},
};

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{:02x}", x)).collect()
}

fn unhex(s: &str) -> Vec<u8> {
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
        .collect()
}

#[test]
fn ts_built_release_succeeds_against_real_program() {
    let mut env = common::Env::new();
    let deadline = env.now() + 30 * 24 * 3600;
    let info = env.create_bounty(1, deadline);
    let f = common::default_fields(deadline);

    // Fresh wallet with NO token account: the TS-built ATA instruction must create it.
    let wallet = Pubkey::new_unique();
    let dest = common::ata(&wallet, &env.usdc_mint);
    assert!(env.svm.get_account(&dest).is_none());

    let bounty_data = env.svm.get_account(&info.bounty).unwrap().data;
    let input = format!(
        "program_id={}\npayer={}\nbounty={}\nbounty_data={}\nwallet={}\nattestor_secret={}\npr_number={}\ncommit_sha={}\ngithub_user_id={}\nmerge_timestamp={}\n",
        env.program_id,
        env.relayer.pubkey(),
        info.bounty,
        hex(&bounty_data),
        wallet,
        hex(&env.attestor.to_bytes()),
        f.pr_number,
        hex(&f.commit_sha),
        f.github_user_id,
        f.merge_timestamp,
    );
    let dir = std::env::temp_dir();
    let in_path = dir.join("ob_e2e_in.txt");
    let out_path = dir.join("ob_e2e_out.txt");
    let _ = fs::remove_file(&out_path);
    fs::write(&in_path, input).unwrap();

    let out = Command::new("node")
        .current_dir(concat!(env!("CARGO_MANIFEST_DIR"), "/../../backend"))
        .args(["--import", "tsx", "src/e2e-build.ts"])
        .arg(&in_path)
        .arg(&out_path)
        .output()
        .expect("failed to run node");
    assert!(
        out.status.success(),
        "TS builder failed: {}",
        String::from_utf8_lossy(&out.stderr)
    );

    let text = fs::read_to_string(&out_path).unwrap();
    let mut ixs: Vec<Instruction> = Vec::new();
    let mut cur: Option<(Pubkey, Vec<AccountMeta>, Vec<u8>)> = None;
    for line in text.lines() {
        let p: Vec<&str> = line.split(' ').collect();
        match p[0] {
            "IX" => cur = Some((Pubkey::from_str(p[1]).unwrap(), vec![], vec![])),
            "KEY" => cur.as_mut().unwrap().1.push(AccountMeta {
                pubkey: Pubkey::from_str(p[1]).unwrap(),
                is_signer: p[2] == "1",
                is_writable: p[3] == "1",
            }),
            "DATA" => cur.as_mut().unwrap().2 = unhex(p.get(1).copied().unwrap_or("")),
            "END" => {
                let (program_id, accounts, data) = cur.take().unwrap();
                ixs.push(Instruction { program_id, accounts, data });
            }
            _ => {}
        }
    }
    assert_eq!(ixs.len(), 3, "expected [ATA, Ed25519, release]");

    let res = common::send(&mut env.svm, &ixs, &env.relayer);
    assert!(res.is_ok(), "TS-built release failed: {:?}", res.err());

    assert_eq!(env.token_balance(&dest), Some(f.amount));
    assert_eq!(env.bounty_status(&info), BountyStatus::Paid);
}
