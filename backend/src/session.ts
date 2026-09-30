import { createHmac, timingSafeEqual } from "node:crypto";

const sign = (payload: string, secret: string): string =>
  createHmac("sha256", secret).update(payload).digest("base64url");

/** Token format: "<githubUserId>.<expiresAtUnix>.<hmac>". Stateless, tamper-evident. */
export function createSession(githubUserId: bigint, secret: string, now: number, ttlSeconds = 86_400): string {
  if (!secret) throw new Error("session secret required");
  const payload = `${githubUserId}.${now + ttlSeconds}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySession(token: string | undefined, secret: string, now: number): bigint | null {
  if (!secret || typeof token !== "string") return null;
  const m = /^(\d{1,20})\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!m) return null;
  const expected = Buffer.from(sign(`${m[1]}.${m[2]}`, secret));
  const given = Buffer.from(m[3]!);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  if (now > Number(m[2])) return null;
  return BigInt(m[1]!);
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}
