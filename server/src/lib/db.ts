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

// Auto-migrate: Create multi-agent orchestration tables (Phase 15)
function migrateMultiAgentTables() {
  try {
    // Task Queue table
    const taskQueueExists = db.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='task_queue'"
    ).get();

    if (!taskQueueExists) {
      console.log("Migrating: Creating task_queue table...");
      db.exec(`
        CREATE TABLE task_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          queue_id TEXT UNIQUE NOT NULL,
          project_id TEXT NOT NULL,
          task_id TEXT NOT NULL,
          priority INTEGER DEFAULT 1,
          required_capabilities TEXT,
          assigned_agent_id TEXT,
          status TEXT DEFAULT 'pending',
          enqueued_at TEXT DEFAULT (datetime('now')),
          assigned_at TEXT,
          started_at TEXT,
          completed_at TEXT,
          timeout_minutes INTEGER DEFAULT 60,
          retry_count INTEGER DEFAULT 0,
          max_retries INTEGER DEFAULT 3,
          metadata TEXT,
          FOREIGN KEY (project_id) REFERENCES projects(project_id),
          FOREIGN KEY (task_id) REFERENCES tasks(task_id),
          FOREIGN KEY (assigned_agent_id) REFERENCES agents(agent_id)
        )
      `);
      db.exec("CREATE INDEX IF NOT EXISTS idx_task_queue_status ON task_queue(status)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_task_queue_priority ON task_queue(priority, enqueued_at)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_task_queue_agent ON task_queue(assigned_agent_id)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_task_queue_project ON task_queue(project_id)");
      console.log("Task queue table created.");
    }

    // Agent Capabilities table
    const capabilitiesExists = db.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='agent_capabilities'"
    ).get();

    if (!capabilitiesExists) {
      console.log("Migrating: Creating agent_capabilities table...");
      db.exec(`
        CREATE TABLE agent_capabilities (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          capability_id TEXT UNIQUE NOT NULL,
          agent_id TEXT NOT NULL,
          capability TEXT NOT NULL,
          proficiency INTEGER DEFAULT 3,
          verified INTEGER DEFAULT 0,
          last_used TEXT,
          success_rate REAL DEFAULT 0.0,
          tasks_completed INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (agent_id) REFERENCES agents(agent_id)
        )
      `);
      db.exec("CREATE INDEX IF NOT EXISTS idx_agent_capabilities_agent ON agent_capabilities(agent_id)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_agent_capabilities_capability ON agent_capabilities(capability)");
      console.log("Agent capabilities table created.");
    }

    // Capability Tags master table
    const tagsExists = db.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='capability_tags'"
    ).get();

    if (!tagsExists) {
      console.log("Migrating: Creating capability_tags table...");
      db.exec(`
        CREATE TABLE capability_tags (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tag TEXT UNIQUE NOT NULL,
          category TEXT NOT NULL,
          description TEXT,
          parent_tag TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);
      db.exec("CREATE INDEX IF NOT EXISTS idx_capability_tags_category ON capability_tags(category)");
      console.log("Capability tags table created.");

      // Insert default capability tags
      const defaultTags = [
        // Languages
        { tag: 'typescript', category: 'language', description: 'TypeScript言語', parent_tag: null },
        { tag: 'javascript', category: 'language', description: 'JavaScript言語', parent_tag: null },
        { tag: 'python', category: 'language', description: 'Python言語', parent_tag: null },
        { tag: 'go', category: 'language', description: 'Go言語', parent_tag: null },
        { tag: 'rust', category: 'language', description: 'Rust言語', parent_tag: null },
        { tag: 'sql', category: 'language', description: 'SQL', parent_tag: null },
        // Frameworks - Frontend
        { tag: 'frontend', category: 'framework', description: 'フロントエンド全般', parent_tag: null },
        { tag: 'react', category: 'framework', description: 'Reactフレームワーク', parent_tag: 'frontend' },
        { tag: 'nextjs', category: 'framework', description: 'Next.jsフレームワーク', parent_tag: 'frontend' },
        { tag: 'vue', category: 'framework', description: 'Vue.jsフレームワーク', parent_tag: 'frontend' },
        // Frameworks - Backend
        { tag: 'backend', category: 'framework', description: 'バックエンド全般', parent_tag: null },
        { tag: 'hono', category: 'framework', description: 'Honoフレームワーク', parent_tag: 'backend' },
        { tag: 'express', category: 'framework', description: 'Expressフレームワーク', parent_tag: 'backend' },
        { tag: 'fastapi', category: 'framework', description: 'FastAPIフレームワーク', parent_tag: 'backend' },
        // Domain
        { tag: 'api', category: 'domain', description: 'API設計・実装', parent_tag: null },
        { tag: 'database', category: 'domain', description: 'データベース設計・操作', parent_tag: null },
        { tag: 'authentication', category: 'domain', description: '認証・認可', parent_tag: null },
        { tag: 'testing', category: 'domain', description: 'テスト設計・実装', parent_tag: null },
        { tag: 'security', category: 'domain', description: 'セキュリティ', parent_tag: null },
        { tag: 'performance', category: 'domain', description: 'パフォーマンス最適化', parent_tag: null },
        // Tools
        { tag: 'git', category: 'tool', description: 'Gitバージョン管理', parent_tag: null },
        { tag: 'docker', category: 'tool', description: 'Dockerコンテナ', parent_tag: null },
        { tag: 'ci-cd', category: 'tool', description: 'CI/CDパイプライン', parent_tag: null },
      ];

      const insertTag = db.prepare(
        "INSERT INTO capability_tags (tag, category, description, parent_tag) VALUES (?, ?, ?, ?)"
      );
      for (const t of defaultTags) {
        insertTag.run(t.tag, t.category, t.description, t.parent_tag);
      }
      console.log("Default capability tags inserted.");
    }

    // File Locks table
    const locksExists = db.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='file_locks'"
    ).get();

    if (!locksExists) {
      console.log("Migrating: Creating file_locks table...");
      db.exec(`
        CREATE TABLE file_locks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          lock_id TEXT UNIQUE NOT NULL,
          project_id TEXT NOT NULL,
          file_path TEXT NOT NULL,
          agent_id TEXT NOT NULL,
          lock_type TEXT DEFAULT 'exclusive',
          reason TEXT,
          acquired_at TEXT DEFAULT (datetime('now')),
          expires_at TEXT,
          released_at TEXT,
          status TEXT DEFAULT 'active',
          FOREIGN KEY (project_id) REFERENCES projects(project_id),
          FOREIGN KEY (agent_id) REFERENCES agents(agent_id)
        )
      `);
      db.exec("CREATE INDEX IF NOT EXISTS idx_file_locks_file ON file_locks(project_id, file_path)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_file_locks_agent ON file_locks(agent_id)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_file_locks_status ON file_locks(status)");
      console.log("File locks table created.");
    }

    // Shared Context table
    const contextExists = db.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='shared_context'"
    ).get();

    if (!contextExists) {
      console.log("Migrating: Creating shared_context table...");
      db.exec(`
        CREATE TABLE shared_context (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          context_id TEXT UNIQUE NOT NULL,
          project_id TEXT NOT NULL,
          context_type TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          author_agent_id TEXT,
          visibility TEXT DEFAULT 'all',
          priority INTEGER DEFAULT 0,
          tags TEXT,
          related_task_id TEXT,
          related_file_paths TEXT,
          expires_at TEXT,
          status TEXT DEFAULT 'active',
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (project_id) REFERENCES projects(project_id),
          FOREIGN KEY (author_agent_id) REFERENCES agents(agent_id)
        )
      `);
      db.exec("CREATE INDEX IF NOT EXISTS idx_shared_context_project ON shared_context(project_id)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_shared_context_type ON shared_context(context_type)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_shared_context_status ON shared_context(status)");
      console.log("Shared context table created.");
    }

    // Conductor Decisions table
    const decisionsExists = db.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='conductor_decisions'"
    ).get();

    if (!decisionsExists) {
      console.log("Migrating: Creating conductor_decisions table...");
      db.exec(`
        CREATE TABLE conductor_decisions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          decision_id TEXT UNIQUE NOT NULL,
          project_id TEXT NOT NULL,
          decision_type TEXT NOT NULL,
          description TEXT NOT NULL,
          affected_agents TEXT,
          affected_tasks TEXT,
          rationale TEXT,
          outcome TEXT DEFAULT 'pending',
          decided_at TEXT DEFAULT (datetime('now')),
          executed_at TEXT,
          metadata TEXT,
          FOREIGN KEY (project_id) REFERENCES projects(project_id)
        )
      `);
      db.exec("CREATE INDEX IF NOT EXISTS idx_conductor_decisions_project ON conductor_decisions(project_id)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_conductor_decisions_type ON conductor_decisions(decision_type)");
      console.log("Conductor decisions table created.");
    }

    // Conflict History table
    const conflictsExists = db.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='conflict_history'"
    ).get();

    if (!conflictsExists) {
      console.log("Migrating: Creating conflict_history table...");
      db.exec(`
        CREATE TABLE conflict_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          conflict_id TEXT UNIQUE NOT NULL,
          project_id TEXT NOT NULL,
          conflict_type TEXT NOT NULL,
          involved_agents TEXT NOT NULL,
          involved_resources TEXT NOT NULL,
          description TEXT,
          resolution_strategy TEXT,
          resolution_result TEXT,
          detected_at TEXT DEFAULT (datetime('now')),
          resolved_at TEXT,
          status TEXT DEFAULT 'detected',
          FOREIGN KEY (project_id) REFERENCES projects(project_id)
        )
      `);
      db.exec("CREATE INDEX IF NOT EXISTS idx_conflict_history_project ON conflict_history(project_id)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_conflict_history_status ON conflict_history(status)");
      console.log("Conflict history table created.");
    }

    // Agent Health table
    const healthExists = db.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='agent_health'"
    ).get();

    if (!healthExists) {
      console.log("Migrating: Creating agent_health table...");
      db.exec(`
        CREATE TABLE agent_health (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          health_id TEXT UNIQUE NOT NULL,
          agent_id TEXT NOT NULL,
          status TEXT NOT NULL,
          health TEXT DEFAULT 'healthy',
          current_task_id TEXT,
          progress INTEGER,
          memory_usage_mb INTEGER,
          cpu_percent REAL,
          message TEXT,
          recorded_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (agent_id) REFERENCES agents(agent_id)
        )
      `);
      db.exec("CREATE INDEX IF NOT EXISTS idx_agent_health_agent ON agent_health(agent_id)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_agent_health_recorded ON agent_health(recorded_at)");
      console.log("Agent health table created.");
    }

  } catch (error) {
    console.error("Multi-agent migration error:", error);
  }
}

migrateMultiAgentTables();

export function getDb() {
  return db;
}

export function closeDb() {
  db.close();
}
