import { randomBytes, timingSafeEqual } from "node:crypto";

export const newState = (): string => randomBytes(16).toString("hex");

/** CSRF check: the state echoed by GitHub must equal the one we stored in the browser's cookie. */
export function statesMatch(cookieState: string | undefined, queryState: string | undefined): boolean {
  if (!cookieState || !queryState) return false;
  const a = Buffer.from(cookieState);
  const b = Buffer.from(queryState);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function authorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const u = new URL("https://github.com/login/oauth/authorize");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  return u.toString();
}

export interface ExchangeOpts {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetchFn?: typeof fetch;
}

/** Exchanges an OAuth code for the signed-in user's numeric GitHub id. The access token is never stored. */
export async function exchangeCodeForUserId(o: ExchangeOpts): Promise<bigint> {
  const f = o.fetchFn ?? fetch;
  if (!/^[\w-]{1,200}$/.test(o.code)) throw new Error("bad code");

  const tokRes = await f("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "open-bounty-attestor" },
    body: JSON.stringify({ client_id: o.clientId, client_secret: o.clientSecret, code: o.code, redirect_uri: o.redirectUri }),
  });
  if (!tokRes.ok) throw new Error(`github token exchange ${tokRes.status}`);
  const tok: any = await tokRes.json();
  if (typeof tok?.access_token !== "string") throw new Error("no access token");

  const userRes = await f("https://api.github.com/user", {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${tok.access_token}`, "User-Agent": "open-bounty-attestor" },
  });
  if (!userRes.ok) throw new Error(`github user ${userRes.status}`);
  const user: any = await userRes.json();
  if (!Number.isSafeInteger(user?.id) || user.id <= 0) throw new Error("bad user id");
  return BigInt(user.id);
}
