-- AI Orchestration Dashboard Database Schema
-- SQLite Database for persistent storage

-- Events table: Stores all events from Claude Code hooks
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT UNIQUE NOT NULL,
    event_type TEXT NOT NULL,
    session_id TEXT,
    timestamp TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Sessions table: Tracks Claude Code sessions
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT UNIQUE NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT,
    status TEXT DEFAULT 'active',
    metadata TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Tasks table: Tracks tasks within sessions or standalone tasks
CREATE TABLE IF NOT EXISTS tasks (
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
);

-- Tool executions table: Tracks tool usage
CREATE TABLE IF NOT EXISTS tool_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    execution_id TEXT UNIQUE NOT NULL,
    session_id TEXT NOT NULL,
    task_id TEXT,
    tool_name TEXT NOT NULL,
    input TEXT,
    output TEXT,
    status TEXT DEFAULT 'pending',
    start_time TEXT,
    end_time TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES sessions(session_id),
    FOREIGN KEY (task_id) REFERENCES tasks(task_id)
);

-- Metrics table: Stores aggregated metrics
CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_name TEXT NOT NULL,
    metric_value REAL NOT NULL,
    metric_type TEXT NOT NULL,
    tags TEXT,
    timestamp TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_tasks_session_id ON tasks(session_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tool_executions_session_id ON tool_executions(session_id);
CREATE INDEX IF NOT EXISTS idx_metrics_metric_name ON metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp);

-- Agents table: Tracks AI agent instances
CREATE TABLE IF NOT EXISTS agents (
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
);

CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_last_heartbeat ON agents(last_heartbeat);

-- Alerts table: Stores alert configurations
CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL,           -- 'threshold', 'pattern', 'anomaly'
    target TEXT NOT NULL,         -- 'sessions', 'events', 'tasks', 'agents'
    condition TEXT NOT NULL,      -- JSON: { field, operator, value }
    severity TEXT DEFAULT 'warning', -- 'info', 'warning', 'critical'
    enabled INTEGER DEFAULT 1,
    cooldown_minutes INTEGER DEFAULT 5,
    last_triggered TEXT,
    trigger_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Alert history table: Logs triggered alerts
CREATE TABLE IF NOT EXISTS alert_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_id TEXT NOT NULL,
    triggered_at TEXT NOT NULL,
    resolved_at TEXT,
    status TEXT DEFAULT 'active', -- 'active', 'acknowledged', 'resolved'
    details TEXT,                  -- JSON: trigger context
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (alert_id) REFERENCES alerts(alert_id)
);

CREATE INDEX IF NOT EXISTS idx_alerts_enabled ON alerts(enabled);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(type);
CREATE INDEX IF NOT EXISTS idx_alert_history_alert_id ON alert_history(alert_id);
CREATE INDEX IF NOT EXISTS idx_alert_history_status ON alert_history(status);

-- ============================================================
-- CCPM/WBS Tables for Project Management
-- ============================================================

-- Projects table: CCPM project management
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'active',      -- 'planning', 'active', 'completed', 'on_hold'

    -- CCPM settings
    project_buffer_ratio REAL DEFAULT 0.5,
    feeding_buffer_ratio REAL DEFAULT 0.5,

    -- Schedule
    planned_start TEXT,
    planned_end TEXT,
    actual_start TEXT,
    actual_end TEXT,

    -- Buffer state
    project_buffer_days INTEGER,
    project_buffer_consumed REAL DEFAULT 0,

    -- Claude Code integration
    auto_track_sessions INTEGER DEFAULT 1,

    metadata TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

-- WBS items table: Work Breakdown Structure
CREATE TABLE IF NOT EXISTS wbs_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wbs_id TEXT UNIQUE NOT NULL,
    project_id TEXT NOT NULL,
    parent_id TEXT,                    -- Parent wbs_id (NULL = root)
    code TEXT NOT NULL,                -- WBS code (e.g., "1.2.3")
    title TEXT NOT NULL,
    description TEXT,
    type TEXT DEFAULT 'task',          -- 'phase', 'milestone', 'task', 'subtask'
    status TEXT DEFAULT 'pending',     -- 'pending', 'in_progress', 'completed', 'blocked'

    -- Estimates (in hours)
    estimated_duration INTEGER,
    aggressive_duration INTEGER,       -- 50% probability estimate
    safe_duration INTEGER,             -- 90% probability estimate
    actual_duration INTEGER,

    -- Schedule
    planned_start TEXT,
    planned_end TEXT,
    actual_start TEXT,
    actual_end TEXT,

    -- Assignment
    assignee TEXT,

    -- Claude Code integration
    linked_task_id TEXT,
    linked_session_id TEXT,
    auto_created INTEGER DEFAULT 0,

    -- Ordering
    sort_order INTEGER DEFAULT 0,
    metadata TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (project_id) REFERENCES projects(project_id),
    FOREIGN KEY (parent_id) REFERENCES wbs_items(wbs_id),
    FOREIGN KEY (linked_task_id) REFERENCES tasks(task_id)
);

CREATE INDEX IF NOT EXISTS idx_wbs_items_project_id ON wbs_items(project_id);
CREATE INDEX IF NOT EXISTS idx_wbs_items_parent_id ON wbs_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_wbs_items_status ON wbs_items(status);
CREATE INDEX IF NOT EXISTS idx_wbs_items_linked_task_id ON wbs_items(linked_task_id);
CREATE INDEX IF NOT EXISTS idx_wbs_items_linked_session_id ON wbs_items(linked_session_id);

-- WBS dependencies table: Task dependencies
CREATE TABLE IF NOT EXISTS wbs_dependencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dependency_id TEXT UNIQUE NOT NULL,
    predecessor_id TEXT NOT NULL,
    successor_id TEXT NOT NULL,
    type TEXT DEFAULT 'FS',            -- 'FS', 'FF', 'SS', 'SF'
    lag INTEGER DEFAULT 0,             -- Lag in hours
    created_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (predecessor_id) REFERENCES wbs_items(wbs_id),
    FOREIGN KEY (successor_id) REFERENCES wbs_items(wbs_id)
);

CREATE INDEX IF NOT EXISTS idx_wbs_dependencies_predecessor ON wbs_dependencies(predecessor_id);
CREATE INDEX IF NOT EXISTS idx_wbs_dependencies_successor ON wbs_dependencies(successor_id);

-- Buffer history table: CCPM buffer tracking
CREATE TABLE IF NOT EXISTS buffer_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    history_id TEXT UNIQUE NOT NULL,
    project_id TEXT NOT NULL,
    buffer_type TEXT NOT NULL,         -- 'project', 'feeding'
    wbs_id TEXT,                       -- For feeding buffer
    consumed_percent REAL NOT NULL,
    progress_percent REAL NOT NULL,
    recorded_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (project_id) REFERENCES projects(project_id)
);

CREATE INDEX IF NOT EXISTS idx_buffer_history_project_id ON buffer_history(project_id);
CREATE INDEX IF NOT EXISTS idx_buffer_history_recorded_at ON buffer_history(recorded_at);
