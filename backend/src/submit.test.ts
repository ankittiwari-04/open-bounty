import assert from "node:assert/strict";
import { test } from "node:test";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { submitRelease, type RpcLike } from "./submit.ts";

const filled = (b: number, n: number) => new Uint8Array(n).fill(b);
const payer = Keypair.fromSeed(filled(1, 32));
const receipt = new PublicKey(filled(2, 32));
const bh = new PublicKey(filled(3, 32)).toBase58();

const mkTx = () =>
  new Transaction().add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: receipt, lamports: 1 }));

const mkRpc = (over: Partial<RpcLike> = {}, log: string[] = []): RpcLike => ({
  getAccountInfo: async () => null,
  getLatestBlockhash: async () => ({ blockhash: bh, lastValidBlockHeight: 100 }),
  sendRawTransaction: async () => { log.push("send"); return "sig123"; },
  confirmTransaction: async () => ({ value: { err: null } }),
  ...over,
});

test("sends and confirms when no receipt exists", async () => {
  const log: string[] = [];
  const r = await submitRelease(mkTx(), payer, receipt, mkRpc({}, log));
  assert.deepEqual(r, { status: "confirmed", signature: "sig123" });
  assert.deepEqual(log, ["send"]);
});
test("does not send when the receipt already exists", async () => {
  const log: string[] = [];
  const rpc = mkRpc({ getAccountInfo: async () => ({ data: new Uint8Array(1) }) }, log);
  assert.deepEqual(await submitRelease(mkTx(), payer, receipt, rpc), { status: "already_released" });
  assert.equal(log.length, 0);
});
test("throws when confirmation reports an error", async () => {
  const rpc = mkRpc({ confirmTransaction: async () => ({ value: { err: { InstructionError: [0, "Custom"] } } }) });
  await assert.rejects(submitRelease(mkTx(), payer, receipt, rpc), /transaction failed/);
});
test("propagates send errors", async () => {
  const rpc = mkRpc({ sendRawTransaction: async () => { throw new Error("preflight failed"); } });
  await assert.rejects(submitRelease(mkTx(), payer, receipt, rpc), /preflight failed/);
});
