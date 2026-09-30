import { randomBytes } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";

interface Pending {
  githubUserId: bigint;
  wallet: string; // base58
  expiresAt: number; // unix seconds
  message: string;
}

export interface Issued {
  nonce: string;
  message: string;
  expiresAt: number;
}

export function buildBindingMessage(githubUserId: bigint, wallet: PublicKey, nonce: string, expiresAt: number): string {
  return [
    "OpenBounty wallet binding",
    `GitHub user id: ${githubUserId}`,
    `Wallet: ${wallet.toBase58()}`,
    `Nonce: ${nonce}`,
    `Expires: ${expiresAt}`,
  ].join("\n");
}

/** One-time-nonce wallet binding. githubUserId MUST come from a verified GitHub OAuth session. */
export class BindingService {
  private pending = new Map<string, Pending>();

  constructor(
    private now: () => number = () => Math.floor(Date.now() / 1000),
    private ttlSeconds = 300,
  ) {}

  issue(githubUserId: bigint, wallet: PublicKey): Issued {
    const nonce = randomBytes(16).toString("hex");
    const expiresAt = this.now() + this.ttlSeconds;
    const message = buildBindingMessage(githubUserId, wallet, nonce, expiresAt);
    this.pending.set(nonce, { githubUserId, wallet: wallet.toBase58(), expiresAt, message });
    return { nonce, message, expiresAt };
  }

  /** Nonce is consumed on ANY attempt, so a signature can never be retried or replayed. */
  verifyAndConsume(nonce: string, signature: Uint8Array): { githubUserId: bigint; wallet: PublicKey } {
    const p = this.pending.get(nonce);
    this.pending.delete(nonce);
    if (!p) throw new Error("unknown or already used nonce");
    if (this.now() > p.expiresAt) throw new Error("nonce expired");
    const wallet = new PublicKey(p.wallet);
    const ok = nacl.sign.detached.verify(new TextEncoder().encode(p.message), signature, wallet.toBytes());
    if (!ok) throw new Error("bad signature");
    return { githubUserId: p.githubUserId, wallet };
  }
}
