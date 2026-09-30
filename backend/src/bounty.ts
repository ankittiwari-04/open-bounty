import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";

export const BOUNTY_ACCOUNT_LENGTH = 146; // 8 disc + 1 + 32 + 8 + 32 + 8 + 32 + 8 + 8 + 8 + 1

export const BOUNTY_DISCRIMINATOR: Uint8Array = new Uint8Array(
  createHash("sha256").update("account:Bounty").digest().subarray(0, 8),
);

export type BountyStatus = "Funded" | "Paid" | "Refunded";
const STATUSES: BountyStatus[] = ["Funded", "Paid", "Refunded"];

export interface BountyAccount {
  status: BountyStatus;
  maintainer: PublicKey;
  nonce: bigint;
  usdcMint: PublicKey;
  amountBaseUnits: bigint;
  repoHash: Uint8Array;
  issueNumber: bigint;
  deadlineUnixTimestamp: bigint;
  refundGracePeriodSeconds: bigint;
  bump: number;
}

/** Decodes raw on-chain Bounty account data (Borsh, after the 8-byte Anchor discriminator). */
export function decodeBounty(data: Uint8Array): BountyAccount {
  if (data.length < BOUNTY_ACCOUNT_LENGTH) throw new RangeError("bounty account too short");
  const b = Buffer.from(data);
  if (!b.subarray(0, 8).equals(Buffer.from(BOUNTY_DISCRIMINATOR))) throw new Error("not a Bounty account");
  let o = 8;
  const statusByte = b.readUInt8(o); o += 1;
  const status = STATUSES[statusByte];
  if (!status) throw new RangeError("unknown bounty status");
  const pk = (): PublicKey => { const k = new PublicKey(b.subarray(o, o + 32)); o += 32; return k; };
  const u64 = (): bigint => { const v = b.readBigUInt64LE(o); o += 8; return v; };
  const i64 = (): bigint => { const v = b.readBigInt64LE(o); o += 8; return v; };

  const maintainer = pk();
  const nonce = u64();
  const usdcMint = pk();
  const amountBaseUnits = u64();
  const repoHash = new Uint8Array(b.subarray(o, o + 32)); o += 32;
  const issueNumber = u64();
  const deadlineUnixTimestamp = i64();
  const refundGracePeriodSeconds = i64();
  const bump = b.readUInt8(o);

  return { status, maintainer, nonce, usdcMint, amountBaseUnits, repoHash, issueNumber, deadlineUnixTimestamp, refundGracePeriodSeconds, bump };
}
