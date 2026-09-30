import { createHash } from "node:crypto";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import type { MergeAttestationV1 } from "./attestation.ts";
import { buildEd25519Ix, signAttestation } from "./signer.ts";

export const RELEASE_DISCRIMINATOR: Uint8Array = new Uint8Array(
  createHash("sha256").update("global:release_with_attestation").digest().subarray(0, 8),
);

/** Borsh args: u64 pr_number, [u8;20] commit_sha, u64 github_user_id, u64 amount, i64 merge_ts. */
export function encodeReleaseData(a: MergeAttestationV1): Buffer {
  const out = Buffer.alloc(8 + 8 + 20 + 8 + 8 + 8);
  let o = 0;
  out.set(RELEASE_DISCRIMINATOR, o); o += 8;
  out.writeBigUInt64LE(a.prNumber, o); o += 8;
  out.set(a.commitSha, o); o += 20;
  out.writeBigUInt64LE(a.githubUserId, o); o += 8;
  out.writeBigUInt64LE(a.amountBaseUnits, o); o += 8;
  out.writeBigInt64LE(a.mergeTimestamp, o); o += 8;
  return out;
}

export interface ReleaseCtx {
  programId: PublicKey;
  payer: PublicKey;
  config: PublicKey;
  receipt: PublicKey;
  maintainer: PublicKey;
  usdcMint: PublicKey;
  attestor: Keypair;
}

/** [create dest ATA (idempotent), Ed25519 verify, release_with_attestation]. */
export function buildReleaseTx(a: MergeAttestationV1, c: ReleaseCtx): Transaction {
  const bounty = new PublicKey(a.bounty);
  const destinationOwner = new PublicKey(a.payoutWallet);
  const escrow = getAssociatedTokenAddressSync(c.usdcMint, bounty, true);
  const destAta = getAssociatedTokenAddressSync(c.usdcMint, destinationOwner, true);

  const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
    c.payer, destAta, destinationOwner, c.usdcMint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  const ed25519Ix = buildEd25519Ix(signAttestation(a, c.attestor));

  const releaseIx = new TransactionInstruction({
    programId: c.programId,
    keys: [
      { pubkey: c.payer, isSigner: true, isWritable: true },
      { pubkey: c.config, isSigner: false, isWritable: false },
      { pubkey: bounty, isSigner: false, isWritable: true },
      { pubkey: c.receipt, isSigner: false, isWritable: true },
      { pubkey: escrow, isSigner: false, isWritable: true },
      { pubkey: destAta, isSigner: false, isWritable: true },
      { pubkey: destinationOwner, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: c.maintainer, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: encodeReleaseData(a),
  });

  // Ed25519 must sit immediately before release. No ComputeBudget ix in between.
  return new Transaction().add(createAtaIx, ed25519Ix, releaseIx);
}
