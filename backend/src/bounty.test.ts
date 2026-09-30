import assert from "node:assert/strict";
import { test } from "node:test";
import { PublicKey } from "@solana/web3.js";
import { BOUNTY_ACCOUNT_LENGTH, BOUNTY_DISCRIMINATOR, decodeBounty } from "./bounty.ts";
import { toHex } from "./attestation.ts";

const RUST =
  "ed1069c61345f2ea00050505050505050505050505050505050505050505050505050505050505050507000000000000000606060606060606060606060606060606060606060606060606060606060606809698000000000002020202020202020202020202020202020202020202020202020202020202022a0000000000000000f15365000000008051010000000000fe";
const filled = (b: number, n: number) => new Uint8Array(n).fill(b);

test("decodes the real Rust-serialized Bounty account", () => {
  const raw = Buffer.from(RUST, "hex");
  assert.equal(raw.length, BOUNTY_ACCOUNT_LENGTH);
  assert.equal(toHex(BOUNTY_DISCRIMINATOR), "ed1069c61345f2ea");
  const b = decodeBounty(raw);
  assert.equal(b.status, "Funded");
  assert.ok(b.maintainer.equals(new PublicKey(filled(5, 32))));
  assert.equal(b.nonce, 7n);
  assert.ok(b.usdcMint.equals(new PublicKey(filled(6, 32))));
  assert.equal(b.amountBaseUnits, 10_000_000n);
  assert.deepEqual(b.repoHash, filled(2, 32));
  assert.equal(b.issueNumber, 42n);
  assert.equal(b.deadlineUnixTimestamp, 1_700_000_000n);
  assert.equal(b.refundGracePeriodSeconds, 86_400n);
  assert.equal(b.bump, 254);
});

test("rejects short data, wrong discriminator and bad status", () => {
  const raw = Buffer.from(RUST, "hex");
  assert.throws(() => decodeBounty(raw.subarray(0, 100)), RangeError);
  const wrongDisc = Buffer.from(raw);
  wrongDisc[0] ^= 1;
  assert.throws(() => decodeBounty(wrongDisc));
  const badStatus = Buffer.from(raw);
  badStatus[8] = 9;
  assert.throws(() => decodeBounty(badStatus), RangeError);
});
