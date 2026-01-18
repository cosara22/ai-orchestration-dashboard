import { Database } from "bun:sqlite";
import { join, dirname } from "path";

const dbPath = join(dirname(dirname(dirname(import.meta.path))), "..", "data", "aod.db");

export const db = new Database(dbPath);

// Enable WAL mode for better concurrent access
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA synchronous = NORMAL");

// Auto-migrate: Recreate tasks table with nullable session_id
function migrateTasksTable() {
  try {
    const tableInfo = db.query("PRAGMA table_info(tasks)").all() as Array<{ name: string; notnull: number }>;
    const sessionCol = tableInfo.find((col) => col.name === "session_id");

    // Check if we need to recreate the table (session_id should be nullable)
    if (sessionCol && sessionCol.notnull === 1) {
      console.log("Migrating: Recreating tasks table with nullable session_id...");

      // Backup existing data
      db.exec("ALTER TABLE tasks RENAME TO tasks_old");

      // Create new table with proper schema
      db.exec(`
        CREATE TABLE tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id TEXT UNIQUE NOT NULL,
          session_id TEXT,
          title TEXT NOT NULL,
          description TEXT,
          priority TEXT DEFAULT 'medium',
          project TEXT,
          status TEXT DEFAULT 'pending',
          progress INTEGER DEFAULT 0,
          result TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (session_id) REFERENCES sessions(session_id)
        )
      `);

      // Copy old data (only columns that exist in both)
      db.exec(`
        INSERT INTO tasks (id, task_id, session_id, title, status, progress, result, created_at, updated_at)
        SELECT id, task_id, session_id, title, status, progress, result, created_at, updated_at
        FROM tasks_old
      `);

      // Drop old table
      db.exec("DROP TABLE tasks_old");

      // Recreate index
      db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_session_id ON tasks(session_id)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)");

      console.log("Tasks table migration completed.");
    } else {
      // Just add new columns if they don't exist
      const columnNames = tableInfo.map((col) => col.name);

      if (!columnNames.includes("description")) {
        console.log("Migrating: Adding description column to tasks table...");
        db.exec("ALTER TABLE tasks ADD COLUMN description TEXT");
      }

      if (!columnNames.includes("priority")) {
        console.log("Migrating: Adding priority column to tasks table...");
        db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT DEFAULT 'medium'");
      }

      if (!columnNames.includes("project")) {
        console.log("Migrating: Adding project column to tasks table...");
        db.exec("ALTER TABLE tasks ADD COLUMN project TEXT");
      }
    }
  } catch (error) {
    console.error("Migration error:", error);
  }
}

migrateTasksTable();

export function getDb() {
  return db;
}

export function closeDb() {
  db.close();
}
