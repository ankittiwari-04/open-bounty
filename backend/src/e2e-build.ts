import { readFileSync, writeFileSync } from "node:fs";
import { Keypair, PublicKey } from "@solana/web3.js";
import { commitShaFromHex, type MergeAttestationV1 } from "./attestation.ts";
import { decodeBounty } from "./bounty.ts";
import { findBounty, findConfig, findReceipt } from "./pda.ts";
import { buildReleaseTx } from "./tx.ts";

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) throw new Error("usage: e2e-build.ts <in> <out>");

const kv = new Map<string, string>();
for (const line of readFileSync(inPath, "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) kv.set(line.slice(0, i), line.slice(i + 1).trim());
}
const get = (k: string): string => {
  const v = kv.get(k);
  if (v === undefined) throw new Error("missing " + k);
  return v;
};

const programId = new PublicKey(get("program_id"));
const bountyKey = new PublicKey(get("bounty"));
const b = decodeBounty(Buffer.from(get("bounty_data"), "hex"));
if (!findBounty(programId, b.maintainer, b.nonce).equals(bountyKey)) throw new Error("bounty PDA mismatch");

const attestation: MergeAttestationV1 = {
  bounty: bountyKey.toBytes(),
  repoHash: b.repoHash,
  issueNumber: b.issueNumber,
  prNumber: BigInt(get("pr_number")),
  commitSha: commitShaFromHex(get("commit_sha")),
  githubUserId: BigInt(get("github_user_id")),
  payoutWallet: new PublicKey(get("wallet")).toBytes(),
  amountBaseUnits: b.amountBaseUnits,
  mergeTimestamp: BigInt(get("merge_timestamp")),
};

const tx = buildReleaseTx(attestation, {
  programId,
  payer: new PublicKey(get("payer")),
  config: findConfig(programId),
  receipt: findReceipt(programId, bountyKey),
  maintainer: b.maintainer,
  usdcMint: b.usdcMint,
  attestor: Keypair.fromSecretKey(Buffer.from(get("attestor_secret"), "hex")),
});

const lines: string[] = [];
for (const ix of tx.instructions) {
  lines.push("IX " + ix.programId.toBase58());
  for (const k of ix.keys) lines.push(`KEY ${k.pubkey.toBase58()} ${k.isSigner ? 1 : 0} ${k.isWritable ? 1 : 0}`);
  lines.push("DATA " + Buffer.from(ix.data).toString("hex"));
  lines.push("END");
}
writeFileSync(outPath, lines.join("\n") + "\n");
