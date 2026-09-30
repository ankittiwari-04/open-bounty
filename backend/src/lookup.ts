import { PublicKey } from "@solana/web3.js";
import { BOUNTY_ACCOUNT_LENGTH, decodeBounty, type BountyAccount } from "./bounty.ts";
import { findBounty } from "./pda.ts";

export interface ProgramAccountsRpc {
  getProgramAccounts(
    programId: PublicKey,
    cfg: { filters: any[] },
  ): Promise<Array<{ pubkey: PublicKey; account: { data: Uint8Array } }>>;
}

const REPO_HASH_OFFSET = 8 + 1 + 32 + 8 + 32 + 8; // = 89

/** Funded bounties for (repo, issue). Each result's address is re-derived from its own fields. */
export async function findFundedBounties(
  rpc: ProgramAccountsRpc,
  programId: PublicKey,
  repo: Uint8Array,
  issue: bigint,
): Promise<Array<{ address: PublicKey; bounty: BountyAccount }>> {
  const accounts = await rpc.getProgramAccounts(programId, {
    filters: [
      { dataSize: BOUNTY_ACCOUNT_LENGTH },
      { memcmp: { offset: REPO_HASH_OFFSET, bytes: new PublicKey(repo).toBase58() } }, // 32 bytes -> base58
    ],
  });
  const out: Array<{ address: PublicKey; bounty: BountyAccount }> = [];
  for (const a of accounts) {
    try {
      const b = decodeBounty(a.account.data);
      if (b.status !== "Funded" || b.issueNumber !== issue) continue;
      if (!findBounty(programId, b.maintainer, b.nonce).equals(a.pubkey)) continue;
      out.push({ address: a.pubkey, bounty: b });
    } catch {
      /* skip undecodable accounts */
    }
  }
  return out;
}
