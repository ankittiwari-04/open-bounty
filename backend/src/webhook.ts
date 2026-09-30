import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies GitHub's X-Hub-Signature-256 header ("sha256=<hex>") over the RAW
 * request body bytes. Must run before any JSON parsing.
 */
export function verifyGithubSignature(
  rawBody: Uint8Array,
  header: string | undefined,
  secret: string,
): boolean {
  if (!secret || typeof header !== "string") return false;
  const m = /^sha256=([0-9a-f]{64})$/i.exec(header);
  if (!m) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const given = Buffer.from(m[1]!, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
