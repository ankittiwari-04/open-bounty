import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { buildAttestation, type AttestorDeps } from "./attestor.ts";
import { decodeBounty } from "./bounty.ts";
import { verifyMergedPr } from "./github.ts";
import { findBounty, findConfig, findReceipt } from "./pda.ts";
import { buildReleaseTx } from "./tx.ts";

export interface ReleaseDeps extends AttestorDeps {
  programId: PublicKey;
  payer: PublicKey;
  attestor: Keypair;
  /** Wallet bound to a GitHub user id through the binding flow, or null. */
  getBoundWallet: (githubUserId: bigint) => Promise<PublicKey | null>;
}

export interface ReleaseRequest {
  bounty: PublicKey;
  repoFullName: string;
  prNumber: bigint;
  expectedBaseRef?: string;
}

/**
 * Order matters: verify PR -> resolve the author's bound wallet -> build attestation
 * -> build tx. The payout wallet is never taken from the caller.
 */
export async function prepareRelease(req: ReleaseRequest, d: ReleaseDeps): Promise<Transaction> {
  const data = await d.getAccountData(req.bounty);
  if (!data) throw new Error("bounty account not found");
  const b = decodeBounty(data);

  const expectedPda = findBounty(d.programId, b.maintainer, b.nonce);
  if (!expectedPda.equals(req.bounty)) throw new Error("bounty address mismatch");

  const verify = d.verifyPr ?? verifyMergedPr;
  const merge = await verify({
    fetchFn: d.fetchFn,
    token: d.githubToken!,
    repoFullName: req.repoFullName,
    prNumber: req.prNumber,
    issueNumber: b.issueNumber,
    expectedBaseRef: req.expectedBaseRef,
  });

  const wallet = await d.getBoundWallet(merge.githubUserId);
  if (!wallet) throw new Error("PR author has no bound wallet");

  const { attestation } = await buildAttestation(
    { bounty: req.bounty, repoFullName: req.repoFullName, prNumber: req.prNumber, payoutWallet: wallet, expectedBaseRef: req.expectedBaseRef },
    { ...d, verifyPr: async () => merge }, // reuse the already-verified merge, no second fetch
  );

  return buildReleaseTx(attestation, {
    programId: d.programId,
    payer: d.payer,
    config: findConfig(d.programId),
    receipt: findReceipt(d.programId, req.bounty),
    maintainer: b.maintainer,
    usdcMint: b.usdcMint,
    attestor: d.attestor,
  });
}
