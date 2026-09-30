import { createHash } from "node:crypto";

/** repo_hash = SHA-256 of the lowercase "owner/repo" string (UTF-8). */
export function repoHash(repoFullName: string): Uint8Array {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repoFullName)) throw new RangeError("bad repo name");
  return new Uint8Array(createHash("sha256").update(repoFullName.toLowerCase()).digest());
}
