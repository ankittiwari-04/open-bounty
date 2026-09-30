import assert from "node:assert/strict";
import { test } from "node:test";
import { Ed25519Program, Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import { ATTESTATION_LENGTH, type MergeAttestationV1 } from "./attestation.ts";
import { buildEd25519Ix, signAttestation } from "./signer.ts";

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
const kp = () => Keypair.fromSeed(filled(7, 32));

test("signature verifies over the 188 bytes", () => {
  const s = signAttestation(att(), kp());
  assert.equal(s.message.length, ATTESTATION_LENGTH);
  assert.ok(nacl.sign.detached.verify(s.message, s.signature, s.attestor.toBytes()));
});

test("signing is deterministic", () => {
  assert.deepEqual(signAttestation(att(), kp()).signature, signAttestation(att(), kp()).signature);
});

test("tampered message fails verification", () => {
  const s = signAttestation(att(), kp());
  const bad = s.message.slice();
  bad[100] ^= 1;
  assert.ok(!nacl.sign.detached.verify(bad, s.signature, s.attestor.toBytes()));
});

test("wrong key does not verify", () => {
  const s = signAttestation(att(), kp());
  const other = Keypair.fromSeed(filled(8, 32));
  assert.ok(!nacl.sign.detached.verify(s.message, s.signature, other.publicKey.toBytes()));
});

test("ed25519 ix targets the precompile with expected data length", () => {
  const ix = buildEd25519Ix(signAttestation(att(), kp()));
  assert.ok(ix.programId.equals(Ed25519Program.programId));
  assert.equal(ix.data.length, 16 + 32 + 64 + ATTESTATION_LENGTH);
  assert.equal(ix.keys.length, 0);
});

test("ed25519 ix data matches the Rust golden vector", () => {
  const ix = buildEd25519Ix(signAttestation(att(), kp()));
  assert.equal(kp().publicKey.toBase58(), "GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB");
  assert.equal(
    Buffer.from(ix.data).toString("hex"),
    "01003000ffff1000ffff7000bc00ffffea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c727455d332bc71fbe4943a26f84ff8b2372b990dafd8ebb95e43214fc06d1c57f8d7de2e9200807b8021209702a35e5413a81239bfdbbd46e2ca89e790bb630d48032c76f3d3c854360f732ab1abe56a29094e477c613359e99fcb4a19d932e4010101010101010101010101010101010101010101010101010101010101010102020202020202020202020202020202020202020202020202020202020202022a00000000000000630000000000000003030303030303030303030303030303030303032b020000000000000404040404040404040404040404040404040404040404040404040404040404809698000000000000f1536500000000",
  );
});
