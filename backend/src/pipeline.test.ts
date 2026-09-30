import assert from "node:assert/strict";
import { test } from "node:test";
import { PublicKey } from "@solana/web3.js";
import { createMergeProcessor } from "./pipeline.ts";

const filled = (b: number, n: number) => new Uint8Array(n).fill(b);
const pk = (b: number) => new PublicKey(filled(b, 32));
const merge = (body: string) => async () => ({
  prNumber: 99n, commitSha: filled(3, 20), githubUserId: 555n, mergeTimestamp: 1n, repoFullName: "owner/repo", body,
});
const m = { repoFullName: "owner/repo", prNumber: 99n };

test("releases every funded bounty for the closed issues", async () => {
  const released: string[] = [];
  const p = createMergeProcessor({
    verifyPr: merge("Fixes #42"),
    findBounties: async (_r, issue) => (issue === 42n ? [{ address: pk(1) }, { address: pk(2) }] : []),
    release: async (b) => { released.push(b.toBase58()); return { status: "confirmed", signature: "s" }; },
  });
  const out = await p(m);
  assert.equal(out.length, 2);
  assert.deepEqual(released, [pk(1).toBase58(), pk(2).toBase58()]);
});
test("does nothing when the PR closes no issue", async () => {
  let called = false;
  const p = createMergeProcessor({
    verifyPr: merge("just a refactor"),
    findBounties: async () => { called = true; return []; },
    release: async () => { called = true; return { status: "already_released" }; },
  });
  assert.deepEqual(await p(m), []);
  assert.equal(called, false);
});
test("one failing bounty does not block the others", async () => {
  const p = createMergeProcessor({
    verifyPr: merge("Fixes #42"),
    findBounties: async () => [{ address: pk(1) }, { address: pk(2) }],
    release: async (b) => {
      if (b.equals(pk(1))) throw new Error("PR author has no bound wallet");
      return { status: "confirmed", signature: "s" };
    },
  });
  const out = await p(m);
  assert.ok("error" in out[0]! && /no bound wallet/.test(out[0]!.error));
  assert.ok("result" in out[1]!);
});
test("a duplicate webhook while one is in flight is skipped", async () => {
  let n = 0;
  let unblock!: () => void;
  const gate = new Promise<void>((r) => { unblock = r; });
  const p = createMergeProcessor({
    verifyPr: merge("Fixes #42"),
    findBounties: async () => [{ address: pk(1) }],
    release: async () => { n++; await gate; return { status: "confirmed", signature: "s" }; },
  });
  const first = p(m);
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(await p(m), []);
  unblock();
  await first;
  assert.equal(n, 1);
});
test("verification failure propagates", async () => {
  const p = createMergeProcessor({
    verifyPr: async () => { throw new Error("pr not merged"); },
    findBounties: async () => [],
    release: async () => ({ status: "already_released" }),
  });
  await assert.rejects(p(m), /not merged/);
});
