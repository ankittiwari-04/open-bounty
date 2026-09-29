import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
  ATTESTATION_LENGTH,
  DOMAIN,
  commitShaFromHex,
  serializeAttestation,
  toHex,
  type MergeAttestationV1,
} from "./attestation.ts";

const filled = (byte: number, length: number): Uint8Array =>
  new Uint8Array(length).fill(byte);

// Same inputs as programs/open-bounty/tests/test_golden_vector.rs
const golden = (): MergeAttestationV1 => ({
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

test("domain separator matches the Rust/Python golden value", () => {
  assert.equal(
    toHex(DOMAIN),
    "48032c76f3d3c854360f732ab1abe56a29094e477c613359e99fcb4a19d932e4",
  );
});

test("serialized attestation matches the Rust/Python golden bytes", () => {
  const bytes = serializeAttestation(golden());
  assert.equal(bytes.length, ATTESTATION_LENGTH);

  const expected = [
    "48032c76f3d3c854360f732ab1abe56a29094e477c613359e99fcb4a19d932e4", // domain
    "01".repeat(32), // bounty
    "02".repeat(32), // repo_hash
    "2a00000000000000", // issue_number = 42 (u64 LE)
    "6300000000000000", // pr_number = 99 (u64 LE)
    "03".repeat(20), // commit_sha
    "2b02000000000000", // github_user_id = 555 (u64 LE)
    "04".repeat(32), // payout_wallet
    "8096980000000000", // amount = 10_000_000 (u64 LE)
    "00f1536500000000", // merge_timestamp = 1_700_000_000 (i64 LE)
  ].join("");
  assert.equal(toHex(bytes), expected);

  const digest = createHash("sha256").update(bytes).digest("hex");
  assert.equal(
    digest,
    "118184ed2220bbcdb7313d99b1879a4a5e207cb83d2d6e137b750e8447e39b42",
  );
});

test("rejects fields of the wrong size", () => {
  assert.throws(() => serializeAttestation({ ...golden(), bounty: filled(1, 31) }), RangeError);
  assert.throws(() => serializeAttestation({ ...golden(), payoutWallet: filled(4, 33) }), RangeError);
  // A SHA-256 (32 bytes) where a SHA-1 (20 bytes) belongs:
  assert.throws(() => serializeAttestation({ ...golden(), commitSha: filled(3, 32) }), RangeError);
});

test("rejects out-of-range integers", () => {
  assert.throws(() => serializeAttestation({ ...golden(), amountBaseUnits: -1n }), RangeError);
  assert.throws(() => serializeAttestation({ ...golden(), prNumber: 1n << 64n }), RangeError);
  assert.throws(() => serializeAttestation({ ...golden(), mergeTimestamp: 1n << 63n }), RangeError);
});

test("commitShaFromHex decodes 40 hex chars into 20 raw bytes", () => {
  assert.deepEqual(commitShaFromHex("03".repeat(20)), filled(3, 20));
  assert.equal(commitShaFromHex("A".repeat(40)).length, 20); // uppercase is fine
  assert.throws(() => commitShaFromHex("03".repeat(19)), RangeError); // 38 chars
  assert.throws(() => commitShaFromHex("03".repeat(32)), RangeError); // SHA-256 length
  assert.throws(() => commitShaFromHex("zz".repeat(20)), RangeError); // not hex
});
