import { createHash } from "node:crypto";

/** 4 x 32-byte fields + 5 x 8-byte integers + 20-byte commit SHA. */
export const ATTESTATION_LENGTH = 188;

const U64_MAX = (1n << 64n) - 1n;
const I64_MIN = -(1n << 63n);
const I64_MAX = (1n << 63n) - 1n;

/** SHA-256("OPENBOUNTY_MERGE_ATTESTATION_V1"): the on-chain domain separator. */
export const DOMAIN: Uint8Array = new Uint8Array(
  createHash("sha256").update("OPENBOUNTY_MERGE_ATTESTATION_V1").digest(),
);

/** Mirrors the Rust struct MergeAttestationV1 field for field. */
export interface MergeAttestationV1 {
  bounty: Uint8Array; // 32 bytes: the Bounty PDA
  repoHash: Uint8Array; // 32 bytes
  issueNumber: bigint; // u64
  prNumber: bigint; // u64
  commitSha: Uint8Array; // 20 bytes: raw Git SHA-1, not the 40-char hex string
  githubUserId: bigint; // u64
  payoutWallet: Uint8Array; // 32 bytes
  amountBaseUnits: bigint; // u64
  mergeTimestamp: bigint; // i64, unix seconds
}

function requireBytes(name: string, value: Uint8Array, length: number): void {
  if (!(value instanceof Uint8Array) || value.length !== length) {
    throw new RangeError(`${name} must be exactly ${length} bytes`);
  }
}

function requireU64(name: string, value: bigint): void {
  if (typeof value !== "bigint" || value < 0n || value > U64_MAX) {
    throw new RangeError(`${name} must be a u64 (0 to 2^64-1)`);
  }
}

function requireI64(name: string, value: bigint): void {
  if (typeof value !== "bigint" || value < I64_MIN || value > I64_MAX) {
    throw new RangeError(`${name} must be an i64`);
  }
}

/** Decodes a 40-character Git SHA-1 hex string into the 20 raw bytes the program expects. */
export function commitShaFromHex(hex: string): Uint8Array {
  if (!/^[0-9a-fA-F]{40}$/.test(hex)) {
    throw new RangeError("commit SHA must be exactly 40 hex characters (SHA-1)");
  }
  return new Uint8Array(Buffer.from(hex, "hex"));
}

export function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

/**
 * Canonical bytes signed by the attestor. Borsh layout: fixed-size arrays are
 * written raw (no length prefix), integers are little-endian.
 */
export function serializeAttestation(a: MergeAttestationV1): Uint8Array {
  requireBytes("bounty", a.bounty, 32);
  requireBytes("repoHash", a.repoHash, 32);
  requireBytes("commitSha", a.commitSha, 20);
  requireBytes("payoutWallet", a.payoutWallet, 32);
  requireU64("issueNumber", a.issueNumber);
  requireU64("prNumber", a.prNumber);
  requireU64("githubUserId", a.githubUserId);
  requireU64("amountBaseUnits", a.amountBaseUnits);
  requireI64("mergeTimestamp", a.mergeTimestamp);

  const out = new Uint8Array(ATTESTATION_LENGTH);
  const view = new DataView(out.buffer);
  let offset = 0;

  const putBytes = (bytes: Uint8Array): void => {
    out.set(bytes, offset);
    offset += bytes.length;
  };
  const putU64 = (value: bigint): void => {
    view.setBigUint64(offset, value, true); // true = little-endian
    offset += 8;
  };

  putBytes(DOMAIN);
  putBytes(a.bounty);
  putBytes(a.repoHash);
  putU64(a.issueNumber);
  putU64(a.prNumber);
  putBytes(a.commitSha);
  putU64(a.githubUserId);
  putBytes(a.payoutWallet);
  putU64(a.amountBaseUnits);
  view.setBigInt64(offset, a.mergeTimestamp, true);
  offset += 8;

  if (offset !== ATTESTATION_LENGTH) {
    throw new Error("internal error: attestation length mismatch");
  }
  return out;
}
