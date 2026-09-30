import { PublicKey } from "@solana/web3.js";

const u64le = (n: bigint): Buffer => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
};

export const findConfig = (programId: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([Buffer.from("open_bounty_config")], programId)[0];

export const findBounty = (programId: PublicKey, maintainer: PublicKey, nonce: bigint): PublicKey =>
  PublicKey.findProgramAddressSync([Buffer.from("bounty"), maintainer.toBuffer(), u64le(nonce)], programId)[0];

export const findReceipt = (programId: PublicKey, bounty: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([Buffer.from("receipt"), bounty.toBuffer()], programId)[0];
