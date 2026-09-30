import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import { BindingService } from "./binding.ts";
import { createApp } from "./server.ts";

const secret = "s3cret";
const kp = Keypair.fromSeed(new Uint8Array(32).fill(21));
const sigOf = (b: string) => "sha256=" + createHmac("sha256", secret).update(b).digest("hex");

async function withApp(fn: (url: string, calls: any[], bound: any[]) => Promise<void>, uid: bigint | null = 555n) {
  const calls: any[] = [];
  const bound: any[] = [];
  const app = createApp({
    webhookSecret: secret,
    binding: new BindingService(),
    getSessionUserId: () => uid,
    onMerged: async (m) => { calls.push(m); },
    saveBinding: async (id, w) => { bound.push([id, w.toBase58()]); },
  });
  await new Promise<void>((r) => app.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
  try { await fn(url, calls, bound); } finally { await new Promise((r) => app.close(r)); }
}

const merged = JSON.stringify({ action: "closed", repository: { full_name: "owner/repo" }, pull_request: { number: 99, merged: true } });
const post = (url: string, path: string, body: string, headers: Record<string, string> = {}) =>
  fetch(url + path, { method: "POST", body, headers });

test("webhook: valid signed merge event is accepted once", async () => {
  await withApp(async (url, calls) => {
    const r = await post(url, "/webhook/github", merged, { "x-hub-signature-256": sigOf(merged), "x-github-event": "pull_request" });
    assert.equal(r.status, 202);
    assert.deepEqual(calls, [{ repoFullName: "owner/repo", prNumber: 99n }]);
  });
});
test("webhook: bad or missing signature is rejected", async () => {
  await withApp(async (url, calls) => {
    assert.equal((await post(url, "/webhook/github", merged, { "x-github-event": "pull_request" })).status, 401);
    assert.equal((await post(url, "/webhook/github", merged, { "x-hub-signature-256": sigOf("x"), "x-github-event": "pull_request" })).status, 401);
    assert.equal(calls.length, 0);
  });
});
test("webhook: unmerged close and other events are ignored", async () => {
  await withApp(async (url, calls) => {
    const unmerged = JSON.stringify({ action: "closed", repository: { full_name: "o/r" }, pull_request: { number: 1, merged: false } });
    assert.equal((await post(url, "/webhook/github", unmerged, { "x-hub-signature-256": sigOf(unmerged), "x-github-event": "pull_request" })).status, 200);
    assert.equal((await post(url, "/webhook/github", merged, { "x-hub-signature-256": sigOf(merged), "x-github-event": "push" })).status, 200);
    assert.equal(calls.length, 0);
  });
});
test("binding: full issue -> sign -> verify flow", async () => {
  await withApp(async (url, _c, bound) => {
    const i = await (await post(url, "/binding/issue", JSON.stringify({ wallet: kp.publicKey.toBase58() }))).json() as any;
    const signature = Buffer.from(nacl.sign.detached(new TextEncoder().encode(i.message), kp.secretKey)).toString("base64");
    const r = await post(url, "/binding/verify", JSON.stringify({ nonce: i.nonce, signature }));
    assert.equal(r.status, 200);
    assert.deepEqual(bound, [[555n, kp.publicKey.toBase58()]]);
  });
});
test("binding: requires a signed-in session", async () => {
  await withApp(async (url) => {
    assert.equal((await post(url, "/binding/issue", JSON.stringify({ wallet: kp.publicKey.toBase58() }))).status, 401);
  }, null);
});
test("rejects oversized bodies and unknown routes", async () => {
  await withApp(async (url) => {
    assert.equal((await post(url, "/webhook/github", "x".repeat(1_100_000))).status, 413);
    assert.equal((await post(url, "/nope", "{}")).status, 404);
  });
});
