import { PublicKey } from "@solana/web3.js";
import type { VerifiedMerge } from "./github.ts";
import { repoHash } from "./repo.ts";
import type { SubmitResult } from "./submit.ts";

export interface PipelineDeps {
  verifyPr: (o: { repoFullName: string; prNumber: bigint }) => Promise<VerifiedMerge>;
  findBounties: (repo: Uint8Array, issue: bigint) => Promise<Array<{ address: PublicKey }>>;
  release: (bounty: PublicKey, repoFullName: string, prNumber: bigint) => Promise<SubmitResult>;
  log?: (msg: string) => void;
}

export type Outcome =
  | { bounty: string; result: SubmitResult }
  | { bounty: string; error: string };

/** Returns a processor that skips a (repo, PR) already in flight, so duplicate webhooks can't double-run. */
export function createMergeProcessor(d: PipelineDeps) {
  const inFlight = new Set<string>();
  const log = d.log ?? (() => {});

  return async function processMerge(m: { repoFullName: string; prNumber: bigint }): Promise<Outcome[]> {
    const key = `${m.repoFullName.toLowerCase()}#${m.prNumber}`;
    if (inFlight.has(key)) {
      log(`skip ${key}: already in flight`);
      return [];
    }
    inFlight.add(key);
    try {
      const merge = await d.verifyPr(m);
      const issues = merge.closingIssues ?? [];
      if (issues.length === 0) {
        log(`${key}: no closing issues`);
        return [];
      }
      const repo = repoHash(m.repoFullName);
      const outcomes: Outcome[] = [];
      for (const issue of issues) {
        for (const b of await d.findBounties(repo, issue)) {
          const id = b.address.toBase58();
          try {
            outcomes.push({ bounty: id, result: await d.release(b.address, m.repoFullName, m.prNumber) });
          } catch (e) {
            outcomes.push({ bounty: id, error: e instanceof Error ? e.message : String(e) });
          }
        }
      }
      log(`${key}: ${JSON.stringify(outcomes)}`);
      return outcomes;
    } finally {
      inFlight.delete(key);
    }
  };
}
