import { Database } from "bun:sqlite";
import { join, dirname } from "path";

const dbPath = join(dirname(dirname(dirname(import.meta.path))), "..", "data", "aod.db");

export const db = new Database(dbPath);

// Enable WAL mode for better concurrent access
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA synchronous = NORMAL");

export function getDb() {
  return db;
}

export function closeDb() {
  db.close();
}
