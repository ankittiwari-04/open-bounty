import { Keypair, PublicKey, Transaction } from "@solana/web3.js";

export interface RpcLike {
  getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }>;
  sendRawTransaction(raw: Uint8Array, opts?: { skipPreflight?: boolean; maxRetries?: number }): Promise<string>;
  confirmTransaction(
    args: { signature: string; blockhash: string; lastValidBlockHeight: number },
    commitment?: "confirmed" | "finalized",
  ): Promise<{ value: { err: unknown } }>;
  getAccountInfo(address: PublicKey): Promise<{ data: Uint8Array } | null>;
}

export type SubmitResult =
  | { status: "already_released" }
  | { status: "confirmed"; signature: string };

/** Idempotent: if the receipt PDA exists the payout already happened, so nothing is sent. */
export async function submitRelease(
  tx: Transaction,
  payer: Keypair,
  receipt: PublicKey,
  rpc: RpcLike,
): Promise<SubmitResult> {
  if (await rpc.getAccountInfo(receipt)) return { status: "already_released" };

  const { blockhash, lastValidBlockHeight } = await rpc.getLatestBlockhash();
  tx.feePayer = payer.publicKey;
  tx.recentBlockhash = blockhash;
  tx.sign(payer);

  const signature = await rpc.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  const res = await rpc.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  if (res.value.err) throw new Error("transaction failed: " + JSON.stringify(res.value.err));
  return { status: "confirmed", signature };
}
