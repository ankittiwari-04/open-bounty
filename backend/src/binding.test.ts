import assert from "node:assert/strict";
import { test } from "node:test";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import { BindingService } from "./binding.ts";

const filled = (b: number, n: number) => new Uint8Array(n).fill(b);
const alice = () => Keypair.fromSeed(filled(21, 32));
const mallory = () => Keypair.fromSeed(filled(22, 32));
const sign = (msg: string, kp: Keypair) => nacl.sign.detached(new TextEncoder().encode(msg), kp.secretKey);

test("valid signature binds github id to wallet", () => {
  const s = new BindingService(() => 1000);
  const i = s.issue(555n, alice().publicKey);
  const r = s.verifyAndConsume(i.nonce, sign(i.message, alice()));
  assert.equal(r.githubUserId, 555n);
  assert.ok(r.wallet.equals(alice().publicKey));
});
test("signature from a different wallet is rejected", () => {
  const s = new BindingService(() => 1000);
  const i = s.issue(555n, alice().publicKey);
  assert.throws(() => s.verifyAndConsume(i.nonce, sign(i.message, mallory())), /bad signature/);
});
test("signature over a different message is rejected", () => {
  const s = new BindingService(() => 1000);
  const i = s.issue(555n, alice().publicKey);
  assert.throws(() => s.verifyAndConsume(i.nonce, sign(i.message + "x", alice())), /bad signature/);
});
test("nonce cannot be replayed", () => {
  const s = new BindingService(() => 1000);
  const i = s.issue(555n, alice().publicKey);
  s.verifyAndConsume(i.nonce, sign(i.message, alice()));
  assert.throws(() => s.verifyAndConsume(i.nonce, sign(i.message, alice())), /unknown or already used/);
});
test("failed attempt also burns the nonce", () => {
  const s = new BindingService(() => 1000);
  const i = s.issue(555n, alice().publicKey);
  assert.throws(() => s.verifyAndConsume(i.nonce, sign(i.message, mallory())));
  assert.throws(() => s.verifyAndConsume(i.nonce, sign(i.message, alice())), /unknown or already used/);
});
test("expired nonce is rejected", () => {
  let t = 1000;
  const s = new BindingService(() => t, 300);
  const i = s.issue(555n, alice().publicKey);
  t = 1301;
  assert.throws(() => s.verifyAndConsume(i.nonce, sign(i.message, alice())), /expired/);
});
test("unknown nonce is rejected", () => {
  const s = new BindingService(() => 1000);
  assert.throws(() => s.verifyAndConsume("deadbeef", new Uint8Array(64)), /unknown or already used/);
});
