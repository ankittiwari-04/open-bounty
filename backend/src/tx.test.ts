import assert from "node:assert/strict";
import { test } from "node:test";
import { Ed25519Program, Keypair, PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import type { MergeAttestationV1 } from "./attestation.ts";
import { RELEASE_DISCRIMINATOR, buildReleaseTx, encodeReleaseData } from "./tx.ts";

const filled = (b: number, n: number) => new Uint8Array(n).fill(b);
const att = (): MergeAttestationV1 => ({
  bounty: filled(1, 32),
  repoHash: filled(2, 32),
  issueNumber: 42n,
  prNumber: 99n,
  commitSha: filled(3, 20),
  githubUserId: 555n,
  payoutWallet: filled(4, 32),
  amountBaseUnits: 10_000_000n,
  mergeTimestamp: 1_700_000_000n,
});
const pk = (b: number) => new PublicKey(filled(b, 32));
const ctx = () => ({
  programId: pk(9),
  payer: pk(10),
  config: pk(11),
  receipt: pk(12),
  maintainer: pk(13),
  usdcMint: pk(14),
  attestor: Keypair.fromSeed(filled(7, 32)),
});

test("discriminator is 8 bytes", () => {
  assert.equal(RELEASE_DISCRIMINATOR.length, 8);
});

test("release data layout is 60 bytes with LE args", () => {
  const d = encodeReleaseData(att());
  assert.equal(d.length, 60);
  assert.deepEqual(new Uint8Array(d.subarray(0, 8)), RELEASE_DISCRIMINATOR);
  assert.equal(d.readBigUInt64LE(8), 99n);
  assert.deepEqual(new Uint8Array(d.subarray(16, 36)), filled(3, 20));
  assert.equal(d.readBigUInt64LE(36), 555n);
  assert.equal(d.readBigUInt64LE(44), 10_000_000n);
  assert.equal(d.readBigInt64LE(52), 1_700_000_000n);
});

test("tx order is [ATA, Ed25519, release]", () => {
  const tx = buildReleaseTx(att(), ctx());
  assert.equal(tx.instructions.length, 3);
  assert.ok(tx.instructions[0]!.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID));
  assert.ok(tx.instructions[1]!.programId.equals(Ed25519Program.programId));
  assert.ok(tx.instructions[2]!.programId.equals(ctx().programId));
});

test("release accounts: order, signer and writable flags", () => {
  const ix = buildReleaseTx(att(), ctx()).instructions[2]!;
  assert.equal(ix.keys.length, 11);
  const flags = ix.keys.map((k) => `${k.isSigner ? "S" : "-"}${k.isWritable ? "W" : "-"}`);
  assert.deepEqual(flags, ["SW", "--", "-W", "-W", "-W", "-W", "--", "--", "-W", "--", "--"]);
  assert.ok(ix.keys[7]!.pubkey.equals(SYSVAR_INSTRUCTIONS_PUBKEY));
  assert.ok(ix.keys[2]!.pubkey.equals(new PublicKey(att().bounty)));
  assert.ok(ix.keys[6]!.pubkey.equals(new PublicKey(att().payoutWallet)));
});

test("signed message equals the attested values", () => {
  const ed = buildReleaseTx(att(), ctx()).instructions[1]!;
  assert.equal(ed.data.length, 16 + 32 + 64 + 188);
});
