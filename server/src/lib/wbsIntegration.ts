import { db } from "./db";
import { nanoid } from "nanoid";

interface EventPayload {
  session_id?: string;
  source_app?: string;
  tool_name?: string;
  todos?: Array<{ content: string; status: string }>;
  [key: string]: unknown;
}

interface Project {
  project_id: string;
  name: string;
  auto_track_sessions: number;
}

interface WBSItem {
  wbs_id: string;
  project_id: string;
  status: string;
  linked_session_id: string | null;
  linked_task_id: string | null;
}

// Find or create a project for the source app
function findOrCreateProject(sourceApp: string): Project | null {
  if (!sourceApp) return null;

  // Check if project exists
  let project = db.query(
    "SELECT * FROM projects WHERE name = ?"
  ).get(sourceApp) as Project | null;

  if (!project) {
    // Create new project
    const projectId = `prj_${nanoid(12)}`;
    const now = new Date().toISOString();

    db.query(`
      INSERT INTO projects (project_id, name, status, auto_track_sessions, created_at, updated_at)
      VALUES (?, ?, 'active', 1, ?, ?)
    `).run(projectId, sourceApp, now, now);

    project = db.query(
      "SELECT * FROM projects WHERE project_id = ?"
    ).get(projectId) as Project;
  }

  return project;
}

// Generate WBS code for a new item
function generateWBSCode(projectId: string, parentId: string | null): string {
  if (!parentId) {
    const count = db.query(
      "SELECT COUNT(*) as count FROM wbs_items WHERE project_id = ? AND parent_id IS NULL"
    ).get(projectId) as { count: number };
    return String(count.count + 1);
  }

  const parent = db.query(
    "SELECT code FROM wbs_items WHERE wbs_id = ?"
  ).get(parentId) as { code: string } | null;

  if (!parent) return "1";

  const childCount = db.query(
    "SELECT COUNT(*) as count FROM wbs_items WHERE parent_id = ?"
  ).get(parentId) as { count: number };

  return `${parent.code}.${childCount.count + 1}`;
}

// Handle SessionStart event
export function handleSessionStart(sessionId: string, payload: EventPayload): void {
  const sourceApp = payload.source_app;
  if (!sourceApp) return;

  const project = findOrCreateProject(sourceApp);
  if (!project || !project.auto_track_sessions) return;

  // Check if WBS item already exists for this session
  const existing = db.query(
    "SELECT * FROM wbs_items WHERE linked_session_id = ?"
  ).get(sessionId) as WBSItem | null;

  if (existing) return;

  // Create WBS item for the session
  const wbsId = `wbs_${nanoid(12)}`;
  const now = new Date().toISOString();
  const code = generateWBSCode(project.project_id, null);

  db.query(`
    INSERT INTO wbs_items (
      wbs_id, project_id, code, title, type, status,
      linked_session_id, auto_created, actual_start,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'task', 'in_progress', ?, 1, ?, ?, ?)
  `).run(
    wbsId,
    project.project_id,
    code,
    `Session: ${sessionId.substring(0, 8)}...`,
    sessionId,
    now,
    now,
    now
  );

  console.log(`[WBS Integration] Created WBS item ${wbsId} for session ${sessionId}`);
}

// Handle SessionEnd event
export function handleSessionEnd(sessionId: string): void {
  const now = new Date().toISOString();

  // Find WBS item linked to this session
  const wbsItem = db.query(
    "SELECT * FROM wbs_items WHERE linked_session_id = ?"
  ).get(sessionId) as WBSItem | null;

  if (!wbsItem) return;

  // Calculate actual duration
  const item = db.query(
    "SELECT actual_start FROM wbs_items WHERE wbs_id = ?"
  ).get(wbsItem.wbs_id) as { actual_start: string | null };

  let actualDuration = 0;
  if (item?.actual_start) {
    const start = new Date(item.actual_start);
    const end = new Date(now);
    actualDuration = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60)); // hours
  }

  // Update WBS item
  db.query(`
    UPDATE wbs_items
    SET status = 'completed', actual_end = ?, actual_duration = ?, updated_at = ?
    WHERE wbs_id = ?
  `).run(now, actualDuration, now, wbsItem.wbs_id);

  console.log(`[WBS Integration] Completed WBS item ${wbsItem.wbs_id} for session ${sessionId}`);
}

// Handle TodoWrite event (task updates)
export function handleTodoUpdate(sessionId: string, payload: EventPayload): void {
  const todos = payload.todos;
  if (!todos || !Array.isArray(todos)) return;

  // Find WBS item linked to this session
  const wbsItem = db.query(
    "SELECT * FROM wbs_items WHERE linked_session_id = ?"
  ).get(sessionId) as WBSItem | null;

  if (!wbsItem) return;

  const now = new Date().toISOString();

  // Update or create subtasks for each todo
  for (let i = 0; i < todos.length; i++) {
    const todo = todos[i];
    const todoTitle = todo.content || `Task ${i + 1}`;
    const todoStatus = mapTodoStatus(todo.status);

    // Check if subtask exists
    const existingSubtask = db.query(`
      SELECT * FROM wbs_items
      WHERE parent_id = ? AND title = ?
    `).get(wbsItem.wbs_id, todoTitle) as WBSItem | null;

    if (existingSubtask) {
      // Update status
      db.query(`
        UPDATE wbs_items SET status = ?, updated_at = ? WHERE wbs_id = ?
      `).run(todoStatus, now, existingSubtask.wbs_id);
    } else {
      // Create new subtask
      const subtaskId = `wbs_${nanoid(12)}`;
      const code = generateWBSCode(wbsItem.project_id, wbsItem.wbs_id);

      db.query(`
        INSERT INTO wbs_items (
          wbs_id, project_id, parent_id, code, title, type, status,
          linked_session_id, auto_created, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'subtask', ?, ?, 1, ?, ?)
      `).run(
        subtaskId,
        wbsItem.project_id,
        wbsItem.wbs_id,
        code,
        todoTitle,
        todoStatus,
        sessionId,
        now,
        now
      );
    }
  }

  // Update parent WBS item status based on children
  updateParentStatus(wbsItem.wbs_id);
}

// Map Claude Code todo status to WBS status
function mapTodoStatus(status: string): string {
  switch (status) {
    case "completed":
      return "completed";
    case "in_progress":
      return "in_progress";
    case "pending":
    default:
      return "pending";
  }
}

// Update parent status based on children
function updateParentStatus(parentId: string): void {
  const children = db.query(`
    SELECT status FROM wbs_items WHERE parent_id = ?
  `).all(parentId) as { status: string }[];

  if (children.length === 0) return;

  const now = new Date().toISOString();
  let newStatus = "pending";

  const allCompleted = children.every((c) => c.status === "completed");
  const anyInProgress = children.some((c) => c.status === "in_progress");
  const anyBlocked = children.some((c) => c.status === "blocked");

  if (allCompleted) {
    newStatus = "completed";
  } else if (anyBlocked) {
    newStatus = "blocked";
  } else if (anyInProgress || children.some((c) => c.status === "completed")) {
    newStatus = "in_progress";
  }

  db.query(`
    UPDATE wbs_items SET status = ?, updated_at = ? WHERE wbs_id = ?
  `).run(newStatus, now, parentId);
}

// Handle error events
export function handleError(sessionId: string): void {
  const now = new Date().toISOString();

  // Find WBS item linked to this session
  const wbsItem = db.query(
    "SELECT * FROM wbs_items WHERE linked_session_id = ?"
  ).get(sessionId) as WBSItem | null;

  if (!wbsItem) return;

  // Mark as blocked
  db.query(`
    UPDATE wbs_items SET status = 'blocked', updated_at = ? WHERE wbs_id = ?
  `).run(now, wbsItem.wbs_id);

  console.log(`[WBS Integration] Blocked WBS item ${wbsItem.wbs_id} due to error`);
}

// Main event handler
export function processEventForWBS(eventType: string, sessionId: string | null, payload: EventPayload): void {
  if (!sessionId) return;

  try {
    switch (eventType) {
      case "SessionStart":
        handleSessionStart(sessionId, payload);
        break;
      case "SessionEnd":
        handleSessionEnd(sessionId);
        break;
      case "PostToolUse":
        if (payload.tool_name === "TodoWrite") {
          handleTodoUpdate(sessionId, payload);
        }
        break;
      case "Error":
        handleError(sessionId);
        break;
    }
  } catch (error) {
    console.error("[WBS Integration] Error processing event:", error);
  }
}
