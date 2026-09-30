import { DatabaseSync } from "node:sqlite";
import { PublicKey } from "@solana/web3.js";

/** Persistent github_user_id -> wallet bindings. Pass ":memory:" for tests. */
export class BindingStore {
  private db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS bindings (github_user_id TEXT PRIMARY KEY, wallet TEXT NOT NULL, updated_at INTEGER NOT NULL)",
    );
  }

  save(githubUserId: bigint, wallet: PublicKey, now: number = Math.floor(Date.now() / 1000)): void {
    this.db
      .prepare(
        "INSERT INTO bindings (github_user_id, wallet, updated_at) VALUES (?, ?, ?) " +
          "ON CONFLICT(github_user_id) DO UPDATE SET wallet = excluded.wallet, updated_at = excluded.updated_at",
      )
      .run(githubUserId.toString(), wallet.toBase58(), now);
  }

  get(githubUserId: bigint): PublicKey | null {
    const row = this.db
      .prepare("SELECT wallet FROM bindings WHERE github_user_id = ?")
      .get(githubUserId.toString()) as { wallet: string } | undefined;
    return row ? new PublicKey(row.wallet) : null;
  }

  close(): void {
    this.db.close();
  }
}
