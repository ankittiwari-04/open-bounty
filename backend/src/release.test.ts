import assert from "node:assert/strict";
import { test } from "node:test";
import { Ed25519Program, Keypair, PublicKey } from "@solana/web3.js";
import { prepareRelease } from "./release.ts";
import { findBounty } from "./pda.ts";
import { repoHash } from "./repo.ts";

const filled = (b: number, n: number) => new Uint8Array(n).fill(b);
const pk = (b: number) => new PublicKey(filled(b, 32));
const RUST =
  "ed1069c61345f2ea00050505050505050505050505050505050505050505050505050505050505050507000000000000000606060606060606060606060606060606060606060606060606060606060606809698000000000002020202020202020202020202020202020202020202020202020202020202022a0000000000000000f15365000000008051010000000000fe";

const bountyBytes = (): Uint8Array => {
  const b = Buffer.from(RUST, "hex");
  Buffer.from(repoHash("owner/repo")).copy(b, 8 + 1 + 32 + 8 + 32 + 8);
  return b;
};

const programId = pk(9);
const bountyPda = findBounty(programId, pk(5), 7n); // fixture: maintainer=[5;32], nonce=7
const winner = pk(31);
const merge = async () => ({
  prNumber: 99n,
  commitSha: filled(3, 20),
  githubUserId: 555n,
  mergeTimestamp: 1_600_000_000n,
  repoFullName: "owner/repo",
});
const deps = (over: object = {}) => ({
  programId,
  payer: pk(10),
  githubToken: "test-token",
  attestor: Keypair.fromSeed(filled(7, 32)),
  getAccountData: async () => bountyBytes(),
  verifyPr: merge,
  getBoundWallet: async (id: bigint) => (id === 555n ? winner : null),
  ...over,
});
const req = { bounty: bountyPda, repoFullName: "owner/repo", prNumber: 99n };

test("builds [ATA, Ed25519, release] paying the bound wallet", async () => {
  const tx = await prepareRelease(req, deps());
  assert.equal(tx.instructions.length, 3);
  assert.ok(tx.instructions[1]!.programId.equals(Ed25519Program.programId));
  const rel = tx.instructions[2]!;
  assert.ok(rel.keys[2]!.pubkey.equals(bountyPda));
  assert.ok(rel.keys[6]!.pubkey.equals(winner));
  assert.ok(Buffer.from(tx.instructions[1]!.data).includes(Buffer.from(winner.toBytes())));
});
test("rejects when the PR author has no bound wallet", async () => {
  await assert.rejects(prepareRelease(req, deps({ getBoundWallet: async () => null })), /no bound wallet/);
});
test("rejects a bounty address that is not the real PDA", async () => {
  await assert.rejects(prepareRelease({ ...req, bounty: pk(1) }, deps()), /address mismatch/);
});
test("rejects a missing bounty account", async () => {
  await assert.rejects(prepareRelease(req, deps({ getAccountData: async () => null })), /not found/);
});
test("propagates PR verification failure", async () => {
  await assert.rejects(prepareRelease(req, deps({ verifyPr: async () => { throw new Error("pr not merged"); } })), /not merged/);
});
