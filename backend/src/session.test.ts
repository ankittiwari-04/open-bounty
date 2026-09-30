import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, readCookie, verifySession } from "./session.ts";
import { authorizeUrl, exchangeCodeForUserId, newState, statesMatch } from "./oauth.ts";

const S = "session-secret";

test("session round-trips", () => {
  assert.equal(verifySession(createSession(555n, S, 1000), S, 1001), 555n);
});
test("session rejects wrong secret, tampering and expiry", () => {
  const t = createSession(555n, S, 1000, 100);
  assert.equal(verifySession(t, "other", 1001), null);
  assert.equal(verifySession(t.replace(/^555/, "556"), S, 1001), null);
  assert.equal(verifySession(t, S, 1101), null);
  assert.equal(verifySession("garbage", S, 1001), null);
  assert.equal(verifySession(undefined, S, 1001), null);
  assert.equal(verifySession(t, "", 1001), null);
});
test("readCookie picks the right cookie", () => {
  assert.equal(readCookie("a=1; ob_session=xyz; b=2", "ob_session"), "xyz");
  assert.equal(readCookie("a=1", "ob_session"), undefined);
  assert.equal(readCookie(undefined, "x"), undefined);
});
test("state check", () => {
  const s = newState();
  assert.ok(statesMatch(s, s));
  assert.ok(!statesMatch(s, newState()));
  assert.ok(!statesMatch(undefined, s));
  assert.ok(!statesMatch(s, undefined));
});
test("authorizeUrl carries client id, redirect and state", () => {
  const u = new URL(authorizeUrl("cid", "https://x.test/cb", "st"));
  assert.equal(u.origin + u.pathname, "https://github.com/login/oauth/authorize");
  assert.equal(u.searchParams.get("client_id"), "cid");
  assert.equal(u.searchParams.get("state"), "st");
});

const mkFetch = (tok: any, user: any, tokOk = true, userOk = true): typeof fetch =>
  (async (url: string) =>
    String(url).includes("access_token")
      ? { ok: tokOk, status: tokOk ? 200 : 500, json: async () => tok }
      : { ok: userOk, status: userOk ? 200 : 401, json: async () => user }) as any;
const base = { code: "abc123", clientId: "cid", clientSecret: "sec", redirectUri: "https://x.test/cb" };

test("exchange returns the numeric GitHub user id", async () => {
  assert.equal(await exchangeCodeForUserId({ ...base, fetchFn: mkFetch({ access_token: "t" }, { id: 555 }) }), 555n);
});
test("exchange rejects failures and bad data", async () => {
  await assert.rejects(exchangeCodeForUserId({ ...base, fetchFn: mkFetch({ error: "bad_verification_code" }, {}) }));
  await assert.rejects(exchangeCodeForUserId({ ...base, fetchFn: mkFetch({ access_token: "t" }, {}, true, false) }));
  await assert.rejects(exchangeCodeForUserId({ ...base, fetchFn: mkFetch({ access_token: "t" }, { id: -1 }) }));
  await assert.rejects(exchangeCodeForUserId({ ...base, code: "../bad code", fetchFn: mkFetch({ access_token: "t" }, { id: 1 }) }));
});
