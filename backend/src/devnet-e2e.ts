import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAccount, getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount, mintTo,
} from "@solana/spl-token";
import { findBounty, findConfig, findReceipt } from "./pda.ts";
import { prepareRelease } from "./release.ts";
import { repoHash } from "./repo.ts";
import { submitRelease } from "./submit.ts";

const PROGRAM_ID = new PublicKey("DNLHZMdnmgxpWWYbqdNcp5xLqvyJ6zxonn27qUAveGch");
const dir = join(homedir(), "ob-keys");
const load = (p: string): Keypair => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8"))));

const conn = new Connection("https://api.devnet.solana.com", "confirmed");
const maintainer = load(join(homedir(), ".config/solana/id.json")); // also the test-mint authority
const attestor = load(join(dir, "attestor.json"));
const payer = load(join(dir, "payer.json"));
const mint = new PublicKey(readFileSync(join(dir, "mint.txt"), "utf8").trim());

const REPO = "owner/repo";
const ISSUE = 42n;
const AMOUNT = 10_000_000n; // 10 test USDC

async function main() {
  const now = Math.floor(Date.now() / 1000);
  const nonce = BigInt(now); // unique per run
  const deadline = BigInt(now + 30 * 86_400);

  // 1) Fund the maintainer with test USDC.
  const mAta = await getOrCreateAssociatedTokenAccount(conn, maintainer, mint, maintainer.publicKey);
  await mintTo(conn, maintainer, mint, mAta.address, maintainer, 20_000_000n);
  console.log("minted 20 test USDC to maintainer");

  // 2) create_bounty(nonce u64, amount u64, repo_hash [u8;32], issue u64, deadline i64)
  const bounty = findBounty(PROGRAM_ID, maintainer.publicKey, nonce);
  const escrow = getAssociatedTokenAddressSync(mint, bounty, true);
  const data = Buffer.alloc(8 + 8 + 8 + 32 + 8 + 8);
  createHash("sha256").update("global:create_bounty").digest().subarray(0, 8).copy(data, 0);
  data.writeBigUInt64LE(nonce, 8);
  data.writeBigUInt64LE(AMOUNT, 16);
  Buffer.from(repoHash(REPO)).copy(data, 24);
  data.writeBigUInt64LE(ISSUE, 56);
  data.writeBigInt64LE(deadline, 64);
  const createIx = new TransactionInstruction({
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
  const createSig = await sendAndConfirmTransaction(conn, new Transaction().add(createIx), [maintainer]);
  console.log("create_bounty:", createSig);

  // 3) Release. GitHub is mocked; everything else is the real pipeline.
  const winner = Keypair.generate().publicKey; // fresh wallet, no token account
  const tx = await prepareRelease(
    { bounty, repoFullName: REPO, prNumber: 99n },
    {
      programId: PROGRAM_ID,
      payer: payer.publicKey,
      attestor,
      getAccountData: async (a) => (await conn.getAccountInfo(a))?.data ?? null,
      getBoundWallet: async (id) => (id === 555n ? winner : null),
      verifyPr: async () => ({
        prNumber: 99n,
        commitSha: new Uint8Array(20).fill(3),
        githubUserId: 555n,
        mergeTimestamp: BigInt(now - 100),
        repoFullName: REPO,
      }),
    },
  );
  const rpc = {
    getLatestBlockhash: () => conn.getLatestBlockhash("confirmed"),
    sendRawTransaction: (raw: Uint8Array, o?: any) => conn.sendRawTransaction(raw, o),
    confirmTransaction: (a: any, c?: any) => conn.confirmTransaction(a, c),
    getAccountInfo: (a: PublicKey) => conn.getAccountInfo(a),
  };
  const receipt = findReceipt(PROGRAM_ID, bounty);
  const r1 = await submitRelease(tx, payer, receipt, rpc as any);
  console.log("release:", JSON.stringify(r1));
  if (r1.status === "confirmed") console.log(`https://explorer.solana.com/tx/${r1.signature}?cluster=devnet`);

  const winnerAta = getAssociatedTokenAddressSync(mint, winner, true);
  console.log("winner token balance:", (await getAccount(conn, winnerAta)).amount.toString(), "(expect", AMOUNT.toString() + ")");

  // 4) Idempotency: resubmitting must NOT send again.
  const r2 = await submitRelease(tx, payer, receipt, rpc as any);
  console.log("second submit:", JSON.stringify(r2), "(expect already_released)");
}
main().catch((e) => { console.error(e); process.exit(1); });
