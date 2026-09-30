/** Issue numbers a PR claims to close ("Fixes #12", "closes #7"). Same-repo "#N" only. */
export function parseClosingIssues(body: string): bigint[] {
  const re = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#(\d{1,9})\b/gi;
  const out = new Set<bigint>();
  for (const m of body.matchAll(re)) {
    const n = BigInt(m[1]!);
    if (n > 0n) out.add(n);
    if (out.size >= 10) break;
  }
  return [...out];
}
