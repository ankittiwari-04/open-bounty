import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { PublicKey } from "@solana/web3.js";
import { BindingStore } from "./store.ts";

const pk = (b: number) => new PublicKey(new Uint8Array(32).fill(b));

test("returns null for an unknown user", () => {
  const s = new BindingStore(":memory:");
  assert.equal(s.get(1n), null);
  s.close();
});
test("saves and reads a binding", () => {
  const s = new BindingStore(":memory:");
  s.save(555n, pk(1));
  assert.ok(s.get(555n)!.equals(pk(1)));
  assert.equal(s.get(556n), null);
  s.close();
});
test("re-binding replaces the wallet", () => {
  const s = new BindingStore(":memory:");
  s.save(555n, pk(1));
  s.save(555n, pk(2));
  assert.ok(s.get(555n)!.equals(pk(2)));
  s.close();
});
test("bindings survive a restart (file-backed)", () => {
  const dir = mkdtempSync(join(tmpdir(), "ob-"));
  const path = join(dir, "b.db");
  try {
    const a = new BindingStore(path);
    a.save(555n, pk(7));
    a.close();
    const b = new BindingStore(path);
    assert.ok(b.get(555n)!.equals(pk(7)));
    b.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("handles ids beyond 2^53 exactly", () => {
  const s = new BindingStore(":memory:");
  const big = (1n << 60n) + 1n;
  s.save(big, pk(3));
  assert.ok(s.get(big)!.equals(pk(3)));
  assert.equal(s.get(big - 1n), null);
  s.close();
});
