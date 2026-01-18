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

// Auto-migrate: Create agents table if not exists
function migrateAgentsTable() {
  try {
    // Check if agents table exists
    const tableExists = db.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='agents'"
    ).get();

    if (!tableExists) {
      console.log("Migrating: Creating agents table...");
      db.exec(`
        CREATE TABLE agents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agent_id TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          type TEXT DEFAULT 'default',
          status TEXT DEFAULT 'idle',
          current_task_id TEXT,
          state TEXT,
          metrics TEXT,
          last_heartbeat TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (current_task_id) REFERENCES tasks(task_id)
        )
      `);

      db.exec("CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_agents_last_heartbeat ON agents(last_heartbeat)");

      console.log("Agents table created.");
    }
  } catch (error) {
    console.error("Agents migration error:", error);
  }
}

migrateAgentsTable();

// Auto-migrate: Create alerts tables if not exists
function migrateAlertsTable() {
  try {
    // Check if alerts table exists
    const tableExists = db.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='alerts'"
    ).get();

    if (!tableExists) {
      console.log("Migrating: Creating alerts table...");
      db.exec(`
        CREATE TABLE alerts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          alert_id TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          type TEXT NOT NULL,
          target TEXT NOT NULL,
          condition TEXT NOT NULL,
          severity TEXT DEFAULT 'warning',
          enabled INTEGER DEFAULT 1,
          cooldown_minutes INTEGER DEFAULT 5,
          last_triggered TEXT,
          trigger_count INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);

      db.exec("CREATE INDEX IF NOT EXISTS idx_alerts_enabled ON alerts(enabled)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(type)");

      console.log("Alerts table created.");
    }

    // Check if alert_history table exists
    const historyExists = db.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='alert_history'"
    ).get();

    if (!historyExists) {
      console.log("Migrating: Creating alert_history table...");
      db.exec(`
        CREATE TABLE alert_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          alert_id TEXT NOT NULL,
          triggered_at TEXT NOT NULL,
          resolved_at TEXT,
          status TEXT DEFAULT 'active',
          details TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (alert_id) REFERENCES alerts(alert_id)
        )
      `);

      db.exec("CREATE INDEX IF NOT EXISTS idx_alert_history_alert_id ON alert_history(alert_id)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_alert_history_status ON alert_history(status)");

      console.log("Alert history table created.");
    }
  } catch (error) {
    console.error("Alerts migration error:", error);
  }
}

migrateAlertsTable();

export function getDb() {
  return db;
}

export function closeDb() {
  db.close();
}
