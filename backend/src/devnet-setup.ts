import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction,
} from "@solana/web3.js";
import { createMint } from "@solana/spl-token";
import { findConfig } from "./pda.ts";

const PROGRAM_ID = new PublicKey("DNLHZMdnmgxpWWYbqdNcp5xLqvyJ6zxonn27qUAveGch");
const dir = join(homedir(), "ob-keys");
mkdirSync(dir, { recursive: true, mode: 0o700 });

const load = (p: string): Keypair => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8"))));
const loadOrCreate = (p: string): Keypair => {
  if (existsSync(p)) return load(p);
  const k = Keypair.generate();
  writeFileSync(p, JSON.stringify(Array.from(k.secretKey)), { mode: 0o600 });
  return k;
};

const conn = new Connection("https://api.devnet.solana.com", "confirmed");
const authority = load(join(homedir(), ".config/solana/id.json"));
const attestor = loadOrCreate(join(dir, "attestor.json"));
const payer = loadOrCreate(join(dir, "payer.json"));

async function main() {
  const bal = await conn.getBalance(payer.publicKey);
  if (bal < 300_000_000) {
    await sendAndConfirmTransaction(
      conn,
      new Transaction().add(SystemProgram.transfer({ fromPubkey: authority.publicKey, toPubkey: payer.publicKey, lamports: 500_000_000 })),
      [authority],
    );
    console.log("funded payer with 0.5 SOL");
  }

  const mintFile = join(dir, "mint.txt");
  let mint: PublicKey;
  if (existsSync(mintFile)) {
    mint = new PublicKey(readFileSync(mintFile, "utf8").trim());
  } else {
    mint = await createMint(conn, authority, authority.publicKey, null, 6);
    writeFileSync(mintFile, mint.toBase58());
    console.log("created test USDC mint", mint.toBase58());
  }

  // initialize_config(attestor_pubkey, usdc_mint, max_bounty_amount_base_units: u64, default_refund_grace_period_seconds: i64)
  const config = findConfig(PROGRAM_ID);
  if (await conn.getAccountInfo(config)) {
    console.log("config already initialized:", config.toBase58());
  } else {
    const data = Buffer.alloc(8 + 32 + 32 + 8 + 8);
    createHash("sha256").update("global:initialize_config").digest().subarray(0, 8).copy(data, 0);
    attestor.publicKey.toBuffer().copy(data, 8);
    mint.toBuffer().copy(data, 40);
    data.writeBigUInt64LE(50_000_000n, 72);
    data.writeBigInt64LE(86_400n, 80);
    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: authority.publicKey, isSigner: true, isWritable: true },
        { pubkey: config, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });
    const sig = await sendAndConfirmTransaction(conn, new Transaction().add(ix), [authority]);
    console.log("initialize_config tx:", sig);
  }

  console.log("\n--- server env ---");
  console.log("PROGRAM_ID=" + PROGRAM_ID.toBase58());
  console.log("ATTESTOR_KEYPAIR_PATH=" + join(dir, "attestor.json"));
  console.log("PAYER_KEYPAIR_PATH=" + join(dir, "payer.json"));
  console.log("attestor pubkey:", attestor.publicKey.toBase58());
  console.log("usdc mint:", mint.toBase58());
  console.log("config PDA:", config.toBase58());
}
main().catch((e) => { console.error(e); process.exit(1); });
