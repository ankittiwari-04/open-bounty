import assert from "node:assert/strict";
import { test } from "node:test";
import { PublicKey } from "@solana/web3.js";
import { buildAttestation } from "./attestor.ts";
import { repoHash } from "./repo.ts";

const filled = (b: number, n: number) => new Uint8Array(n).fill(b);
const RUST =
  "ed1069c61345f2ea00050505050505050505050505050505050505050505050505050505050505050507000000000000000606060606060606060606060606060606060606060606060606060606060606809698000000000002020202020202020202020202020202020202020202020202020202020202022a0000000000000000f15365000000008051010000000000fe";

// Real bounty bytes, but with repo_hash swapped to hash("owner/repo").
const bountyBytes = (status = 0, deadline?: bigint): Uint8Array => {
  const b = Buffer.from(RUST, "hex");
  b[8] = status;
  Buffer.from(repoHash("owner/repo")).copy(b, 8 + 1 + 32 + 8 + 32 + 8);
  if (deadline !== undefined) b.writeBigInt64LE(deadline, 8 + 1 + 32 + 8 + 32 + 8 + 32 + 8);
  return b;
};

const bounty = new PublicKey(filled(1, 32));
const wallet = new PublicKey(filled(4, 32));
const merge = (ts = 1_600_000_000n) => async () => ({
  prNumber: 99n,
  commitSha: filled(3, 20),
  githubUserId: 555n,
  mergeTimestamp: ts,
  repoFullName: "owner/repo",
});
const req = { bounty, repoFullName: "owner/repo", prNumber: 99n, payoutWallet: wallet };

test("builds an attestation from on-chain + GitHub facts", async () => {
  const r = await buildAttestation(req, { githubToken: "test-token", getAccountData: async () => bountyBytes(), verifyPr: merge() });
  assert.equal(r.attestation.amountBaseUnits, 10_000_000n);
  assert.equal(r.attestation.issueNumber, 42n);
  assert.equal(r.attestation.githubUserId, 555n);
  assert.deepEqual(r.attestation.repoHash, repoHash("owner/repo"));
});
test("rejects missing bounty", async () => {
  await assert.rejects(buildAttestation(req, { githubToken: "test-token", getAccountData: async () => null, verifyPr: merge() }));
});
test("rejects bounty that is not Funded", async () => {
  await assert.rejects(buildAttestation(req, { githubToken: "test-token", getAccountData: async () => bountyBytes(1), verifyPr: merge() }));
});
test("rejects repo that does not match the bounty", async () => {
  await assert.rejects(buildAttestation({ ...req, repoFullName: "evil/repo" }, { githubToken: "test-token", getAccountData: async () => bountyBytes(), verifyPr: merge() }));
});
test("rejects merge after deadline", async () => {
  await assert.rejects(buildAttestation(req, { githubToken: "test-token", getAccountData: async () => bountyBytes(0, 1_500_000_000n), verifyPr: merge(1_600_000_000n) }));
});
test("propagates GitHub verification failure", async () => {
  await assert.rejects(buildAttestation(req, { githubToken: "test-token", getAccountData: async () => bountyBytes(), verifyPr: async () => { throw new Error("pr not merged"); } }));
});
