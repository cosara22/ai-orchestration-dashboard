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

// Auto-migrate: Create CCPM/WBS tables if not exists
function migrateCCPMTables() {
  try {
    // Check if projects table exists
    const projectsExists = db.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='projects'"
    ).get();

    if (!projectsExists) {
      console.log("Migrating: Creating projects table...");
      db.exec(`
        CREATE TABLE projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          status TEXT DEFAULT 'active',
          project_buffer_ratio REAL DEFAULT 0.5,
          feeding_buffer_ratio REAL DEFAULT 0.5,
          planned_start TEXT,
          planned_end TEXT,
          actual_start TEXT,
          actual_end TEXT,
          project_buffer_days INTEGER,
          project_buffer_consumed REAL DEFAULT 0,
          auto_track_sessions INTEGER DEFAULT 1,
          metadata TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);
      db.exec("CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status)");
      console.log("Projects table created.");
    }

    // Check if wbs_items table exists
    const wbsExists = db.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='wbs_items'"
    ).get();

    if (!wbsExists) {
      console.log("Migrating: Creating wbs_items table...");
      db.exec(`
        CREATE TABLE wbs_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          wbs_id TEXT UNIQUE NOT NULL,
          project_id TEXT NOT NULL,
          parent_id TEXT,
          code TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          type TEXT DEFAULT 'task',
          status TEXT DEFAULT 'pending',
          estimated_duration INTEGER,
          aggressive_duration INTEGER,
          safe_duration INTEGER,
          actual_duration INTEGER,
          planned_start TEXT,
          planned_end TEXT,
          actual_start TEXT,
          actual_end TEXT,
          assignee TEXT,
          linked_task_id TEXT,
          linked_session_id TEXT,
          auto_created INTEGER DEFAULT 0,
          sort_order INTEGER DEFAULT 0,
          metadata TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (project_id) REFERENCES projects(project_id),
          FOREIGN KEY (parent_id) REFERENCES wbs_items(wbs_id),
          FOREIGN KEY (linked_task_id) REFERENCES tasks(task_id)
        )
      `);
      db.exec("CREATE INDEX IF NOT EXISTS idx_wbs_items_project_id ON wbs_items(project_id)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_wbs_items_parent_id ON wbs_items(parent_id)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_wbs_items_status ON wbs_items(status)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_wbs_items_linked_task_id ON wbs_items(linked_task_id)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_wbs_items_linked_session_id ON wbs_items(linked_session_id)");
      console.log("WBS items table created.");
    }

    // Check if wbs_dependencies table exists
    const depsExists = db.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='wbs_dependencies'"
    ).get();

    if (!depsExists) {
      console.log("Migrating: Creating wbs_dependencies table...");
      db.exec(`
        CREATE TABLE wbs_dependencies (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          dependency_id TEXT UNIQUE NOT NULL,
          predecessor_id TEXT NOT NULL,
          successor_id TEXT NOT NULL,
          type TEXT DEFAULT 'FS',
          lag INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (predecessor_id) REFERENCES wbs_items(wbs_id),
          FOREIGN KEY (successor_id) REFERENCES wbs_items(wbs_id)
        )
      `);
      db.exec("CREATE INDEX IF NOT EXISTS idx_wbs_dependencies_predecessor ON wbs_dependencies(predecessor_id)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_wbs_dependencies_successor ON wbs_dependencies(successor_id)");
      console.log("WBS dependencies table created.");
    }

    // Check if buffer_history table exists
    const bufferExists = db.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='buffer_history'"
    ).get();

    if (!bufferExists) {
      console.log("Migrating: Creating buffer_history table...");
      db.exec(`
        CREATE TABLE buffer_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          history_id TEXT UNIQUE NOT NULL,
          project_id TEXT NOT NULL,
          buffer_type TEXT NOT NULL,
          wbs_id TEXT,
          consumed_percent REAL NOT NULL,
          progress_percent REAL NOT NULL,
          recorded_at TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (project_id) REFERENCES projects(project_id)
        )
      `);
      db.exec("CREATE INDEX IF NOT EXISTS idx_buffer_history_project_id ON buffer_history(project_id)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_buffer_history_recorded_at ON buffer_history(recorded_at)");
      console.log("Buffer history table created.");
    }
  } catch (error) {
    console.error("CCPM migration error:", error);
  }
}

migrateCCPMTables();

// Auto-migrate: Create parsed_documents table if not exists
function migrateDocumentsTables() {
  try {
    const tableExists = db.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='parsed_documents'"
    ).get();

    if (!tableExists) {
      console.log("Migrating: Creating parsed_documents table...");
      db.exec(`
        CREATE TABLE parsed_documents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          doc_id TEXT UNIQUE NOT NULL,
          project_id TEXT NOT NULL,
          doc_type TEXT NOT NULL,
          doc_path TEXT NOT NULL,
          doc_hash TEXT NOT NULL,
          parsed_structure TEXT NOT NULL,
          wbs_mappings TEXT,
          parsed_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (project_id) REFERENCES projects(project_id)
        )
      `);
      db.exec("CREATE INDEX IF NOT EXISTS idx_parsed_documents_project_id ON parsed_documents(project_id)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_parsed_documents_doc_hash ON parsed_documents(doc_hash)");
      console.log("Parsed documents table created.");
    }

    // Create milestones table
    const milestonesExists = db.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='milestones'"
    ).get();

    if (!milestonesExists) {
      console.log("Migrating: Creating milestones table...");
      db.exec(`
        CREATE TABLE milestones (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          milestone_id TEXT UNIQUE NOT NULL,
          project_id TEXT NOT NULL,
          wbs_id TEXT,
          title TEXT NOT NULL,
          description TEXT,
          type TEXT DEFAULT 'checkpoint',
          status TEXT DEFAULT 'pending',
          target_date TEXT,
          achieved_date TEXT,
          evidence TEXT,
          next_actions TEXT,
          lessons_learned TEXT,
          metadata TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (project_id) REFERENCES projects(project_id),
          FOREIGN KEY (wbs_id) REFERENCES wbs_items(wbs_id)
        )
      `);
      db.exec("CREATE INDEX IF NOT EXISTS idx_milestones_project_id ON milestones(project_id)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_milestones_status ON milestones(status)");
      console.log("Milestones table created.");
    }

    // Create semantic_records table
    const semanticExists = db.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='semantic_records'"
    ).get();

    if (!semanticExists) {
      console.log("Migrating: Creating semantic_records table...");
      db.exec(`
        CREATE TABLE semantic_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          record_id TEXT UNIQUE NOT NULL,
          project_id TEXT NOT NULL,
          milestone_id TEXT,
          record_type TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          tags TEXT,
          relations TEXT,
          source_session_id TEXT,
          source_event_id TEXT,
          metadata TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (project_id) REFERENCES projects(project_id),
          FOREIGN KEY (milestone_id) REFERENCES milestones(milestone_id)
        )
      `);
      db.exec("CREATE INDEX IF NOT EXISTS idx_semantic_records_project_id ON semantic_records(project_id)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_semantic_records_record_type ON semantic_records(record_type)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_semantic_records_milestone_id ON semantic_records(milestone_id)");
      console.log("Semantic records table created.");
    }
  } catch (error) {
    console.error("Documents migration error:", error);
  }
}

migrateDocumentsTables();

export function getDb() {
  return db;
}

export function closeDb() {
  db.close();
}
