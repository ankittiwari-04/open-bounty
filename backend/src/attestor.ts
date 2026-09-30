import { PublicKey } from "@solana/web3.js";
import type { MergeAttestationV1 } from "./attestation.ts";
import { decodeBounty, type BountyAccount } from "./bounty.ts";
import { verifyMergedPr, type VerifiedMerge } from "./github.ts";
import { repoHash } from "./repo.ts";

export interface AttestorDeps {
  /** Returns raw on-chain account data for the bounty PDA, or null if missing. */
  getAccountData: (address: PublicKey) => Promise<Uint8Array | null>;
  verifyPr?: typeof verifyMergedPr;
  fetchFn?: typeof fetch;
  githubToken: string;
}

export interface AttestRequest {
  bounty: PublicKey; // Bounty PDA
  repoFullName: string; // "owner/repo"
  prNumber: bigint;
  payoutWallet: PublicKey; // the wallet bound to the PR author's GitHub id
  expectedBaseRef?: string;
}

export interface AttestResult {
  attestation: MergeAttestationV1;
  bountyAccount: BountyAccount;
  merge: VerifiedMerge;
}

const eq = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/** Builds an attestation ONLY from facts confirmed on-chain and by GitHub. */
export async function buildAttestation(req: AttestRequest, d: AttestorDeps): Promise<AttestResult> {
  const data = await d.getAccountData(req.bounty);
  if (!data) throw new Error("bounty account not found");
  const bountyAccount = decodeBounty(data);

  if (bountyAccount.status !== "Funded") throw new Error("bounty is not funded");
  if (!eq(bountyAccount.repoHash, repoHash(req.repoFullName))) throw new Error("repo does not match bounty");

  const verify = d.verifyPr ?? verifyMergedPr;
  const merge = await verify({
    fetchFn: d.fetchFn,
    token: d.githubToken,
    repoFullName: req.repoFullName,
    prNumber: req.prNumber,
    issueNumber: bountyAccount.issueNumber,
    expectedBaseRef: req.expectedBaseRef,
  });

  if (merge.mergeTimestamp > bountyAccount.deadlineUnixTimestamp) throw new Error("merged after deadline");

  const attestation: MergeAttestationV1 = {
    bounty: req.bounty.toBytes(),
    repoHash: bountyAccount.repoHash,
    issueNumber: bountyAccount.issueNumber,
    prNumber: merge.prNumber,
    commitSha: merge.commitSha,
    githubUserId: merge.githubUserId,
    payoutWallet: req.payoutWallet.toBytes(),
    amountBaseUnits: bountyAccount.amountBaseUnits,
    mergeTimestamp: merge.mergeTimestamp,
  };
  return { attestation, bountyAccount, merge };
}
