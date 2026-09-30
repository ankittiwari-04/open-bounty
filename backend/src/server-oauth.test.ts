import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { BindingService } from "./binding.ts";
import { createApp } from "./server.ts";
import { readCookie, verifySession } from "./session.ts";

const SECRET = "x".repeat(32);
const gh: typeof fetch = (async (url: string) =>
  String(url).includes("access_token")
    ? { ok: true, status: 200, json: async () => ({ access_token: "t" }) }
    : { ok: true, status: 200, json: async () => ({ id: 555 }) }) as any;

async function withApp(fn: (url: string) => Promise<void>) {
  const app = createApp({
    webhookSecret: "s",
    binding: new BindingService(),
    getSessionUserId: () => null,
    onMerged: async () => {},
    saveBinding: async () => {},
    oauth: { clientId: "cid", clientSecret: "sec", redirectUri: "http://localhost/cb", sessionSecret: SECRET, secureCookies: false, fetchFn: gh },
  });
  await new Promise<void>((r) => app.listen(0, "127.0.0.1", r));
  try { await fn(`http://127.0.0.1:${(app.address() as AddressInfo).port}`); }
  finally { await new Promise((r) => app.close(r)); }
}

const cookieVal = (setCookie: string[], name: string) => readCookie(setCookie.map((c) => c.split(";")[0]).join("; "), name);

test("login redirects to GitHub and sets an HttpOnly state cookie", async () => {
  await withApp(async (url) => {
    const r = await fetch(url + "/auth/github/login", { redirect: "manual" });
    assert.equal(r.status, 302);
    const loc = new URL(r.headers.get("location")!);
    assert.equal(loc.origin, "https://github.com");
    const sc = r.headers.getSetCookie();
    assert.ok(sc[0]!.includes("HttpOnly"));
    assert.equal(cookieVal(sc, "ob_state"), loc.searchParams.get("state"));
  });
});
test("callback with matching state issues a valid session cookie", async () => {
  await withApp(async (url) => {
    const login = await fetch(url + "/auth/github/login", { redirect: "manual" });
    const state = cookieVal(login.headers.getSetCookie(), "ob_state")!;
    const r = await fetch(`${url}/auth/github/callback?code=abc123&state=${state}`, { headers: { cookie: `ob_state=${state}` } });
    assert.equal(r.status, 200);
    const sc = r.headers.getSetCookie();
    assert.ok(sc.some((c) => c.startsWith("ob_session=") && c.includes("HttpOnly")));
    assert.equal(verifySession(cookieVal(sc, "ob_session"), SECRET, Math.floor(Date.now() / 1000)), 555n);
  });
});
test("callback rejects a missing or mismatched state", async () => {
  await withApp(async (url) => {
    assert.equal((await fetch(`${url}/auth/github/callback?code=abc123&state=zzz`)).status, 400);
    assert.equal((await fetch(`${url}/auth/github/callback?code=abc123&state=zzz`, { headers: { cookie: "ob_state=other" } })).status, 400);
    assert.equal((await fetch(`${url}/auth/github/callback?state=zzz`, { headers: { cookie: "ob_state=zzz" } })).status, 400);
  });
});
