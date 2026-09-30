import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount, mintTo,
} from "@solana/spl-token";
import { findBounty, findConfig } from "./pda.ts";
import { repoHash } from "./repo.ts";

const [REPO, ISSUE_STR, AMOUNT_STR = "10000000"] = process.argv.slice(2);
if (!REPO || !ISSUE_STR) throw new Error("usage: devnet-create-bounty.ts <owner/repo> <issue> [amountBaseUnits]");
const ISSUE = BigInt(ISSUE_STR);
const AMOUNT = BigInt(AMOUNT_STR);

const PROGRAM_ID = new PublicKey("DNLHZMdnmgxpWWYbqdNcp5xLqvyJ6zxonn27qUAveGch");
const load = (p: string): Keypair => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8"))));
const conn = new Connection("https://api.devnet.solana.com", "confirmed");
const maintainer = load(join(homedir(), ".config/solana/id.json"));
const mint = new PublicKey(readFileSync(join(homedir(), "ob-keys/mint.txt"), "utf8").trim());

const now = Math.floor(Date.now() / 1000);
const nonce = BigInt(now);
const deadline = BigInt(now + 30 * 86_400);

const mAta = await getOrCreateAssociatedTokenAccount(conn, maintainer, mint, maintainer.publicKey);
await mintTo(conn, maintainer, mint, mAta.address, maintainer, AMOUNT);

const bounty = findBounty(PROGRAM_ID, maintainer.publicKey, nonce);
const escrow = getAssociatedTokenAddressSync(mint, bounty, true);
const data = Buffer.alloc(64 + 8 + 8);
createHash("sha256").update("global:create_bounty").digest().subarray(0, 8).copy(data, 0);
data.writeBigUInt64LE(nonce, 8);
data.writeBigUInt64LE(AMOUNT, 16);
Buffer.from(repoHash(REPO)).copy(data, 24);
data.writeBigUInt64LE(ISSUE, 56);
data.writeBigInt64LE(deadline, 64);

const ix = new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [
    { pubkey: maintainer.publicKey, isSigner: true, isWritable: true },
    { pubkey: findConfig(PROGRAM_ID), isSigner: false, isWritable: false },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: bounty, isSigner: false, isWritable: true },
    { pubkey: mAta.address, isSigner: false, isWritable: true },
    { pubkey: escrow, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data,
});
const sig = await sendAndConfirmTransaction(conn, new Transaction().add(ix), [maintainer]);
console.log("bounty:", bounty.toBase58());
console.log("repo:", REPO, "issue:", ISSUE.toString(), "amount:", AMOUNT.toString());
console.log(`https://explorer.solana.com/tx/${sig}?cluster=devnet`);
