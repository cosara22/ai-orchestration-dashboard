import { Hono } from "hono";
import { db } from "../lib/db";
import { nanoid } from "nanoid";

const app = new Hono();

// Types
interface Project {
  id: number;
  project_id: string;
  name: string;
  description: string | null;
  status: string;
  project_buffer_ratio: number;
  feeding_buffer_ratio: number;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  project_buffer_days: number | null;
  project_buffer_consumed: number;
  auto_track_sessions: number;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

interface WBSItem {
  id: number;
  wbs_id: string;
  project_id: string;
  parent_id: string | null;
  code: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  estimated_duration: number | null;
  aggressive_duration: number | null;
  safe_duration: number | null;
  actual_duration: number | null;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  assignee: string | null;
  linked_task_id: string | null;
  linked_session_id: string | null;
  auto_created: number;
  sort_order: number;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

interface Dependency {
  id: number;
  dependency_id: string;
  predecessor_id: string;
  successor_id: string;
  type: string;
  lag: number;
  created_at: string;
}

// ============================================================
// CCPM Projects API
// ============================================================

// GET /api/ccpm/projects - List all CCPM projects
app.get("/projects", async (c) => {
  const status = c.req.query("status");
  const limit = parseInt(c.req.query("limit") || "50");
  const offset = parseInt(c.req.query("offset") || "0");

  let query = "SELECT * FROM projects";
  const params: (string | number)[] = [];

  if (status) {
    query += " WHERE status = ?";
    params.push(status);
  }

  query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  const projects = db.query(query).all(...params) as Project[];

  const countQuery = status
    ? db.query("SELECT COUNT(*) as count FROM projects WHERE status = ?").get(status) as { count: number }
    : db.query("SELECT COUNT(*) as count FROM projects").get() as { count: number };

  const projectsWithCounts = projects.map((project) => {
    const wbsCount = db.query(
      "SELECT COUNT(*) as count FROM wbs_items WHERE project_id = ?"
    ).get(project.project_id) as { count: number };

    const completedCount = db.query(
      "SELECT COUNT(*) as count FROM wbs_items WHERE project_id = ? AND status = 'completed'"
    ).get(project.project_id) as { count: number };

    return {
      ...project,
      metadata: project.metadata ? JSON.parse(project.metadata) : null,
      wbs_count: wbsCount.count,
      completed_count: completedCount.count,
      progress: wbsCount.count > 0 ? Math.round((completedCount.count / wbsCount.count) * 100) : 0,
    };
  });

  return c.json({
    projects: projectsWithCounts,
    total: countQuery.count,
    limit,
    offset,
  });
});

// POST /api/ccpm/projects - Create a new project
app.post("/projects", async (c) => {
  const body = await c.req.json();
  const projectId = `prj_${nanoid(12)}`;
  const now = new Date().toISOString();

  const {
    name,
    description,
    status = "active",
    project_buffer_ratio = 0.5,
    feeding_buffer_ratio = 0.5,
    planned_start,
    planned_end,
    auto_track_sessions = 1,
    metadata,
  } = body;

  if (!name) {
    return c.json({ error: "Name is required" }, 400);
  }

  db.query(`
    INSERT INTO projects (
      project_id, name, description, status,
      project_buffer_ratio, feeding_buffer_ratio,
      planned_start, planned_end,
      auto_track_sessions, metadata,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    projectId,
    name,
    description || null,
    status,
    project_buffer_ratio,
    feeding_buffer_ratio,
    planned_start || null,
    planned_end || null,
    auto_track_sessions,
    metadata ? JSON.stringify(metadata) : null,
    now,
    now
  );

  const project = db.query("SELECT * FROM projects WHERE project_id = ?").get(projectId) as Project;

  return c.json({
    ...project,
    metadata: project.metadata ? JSON.parse(project.metadata) : null,
  }, 201);
});

// GET /api/ccpm/projects/:id - Get a single project
app.get("/projects/:id", async (c) => {
  const projectId = c.req.param("id");

  const project = db.query("SELECT * FROM projects WHERE project_id = ?").get(projectId) as Project | null;

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const wbsStats = db.query(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as blocked,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(COALESCE(estimated_duration, 0)) as total_estimated,
      SUM(COALESCE(actual_duration, 0)) as total_actual
    FROM wbs_items WHERE project_id = ?
  `).get(projectId) as {
    total: number;
    completed: number;
    in_progress: number;
    blocked: number;
    pending: number;
    total_estimated: number;
    total_actual: number;
  };

  return c.json({
    ...project,
    metadata: project.metadata ? JSON.parse(project.metadata) : null,
    stats: wbsStats,
    progress: wbsStats.total > 0 ? Math.round((wbsStats.completed / wbsStats.total) * 100) : 0,
  });
});

// PATCH /api/ccpm/projects/:id - Update a project
app.patch("/projects/:id", async (c) => {
  const projectId = c.req.param("id");
  const body = await c.req.json();
  const now = new Date().toISOString();

  const project = db.query("SELECT * FROM projects WHERE project_id = ?").get(projectId);

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const updates: string[] = [];
  const params: (string | number | null)[] = [];

  const allowedFields = [
    "name", "description", "status",
    "project_buffer_ratio", "feeding_buffer_ratio",
    "planned_start", "planned_end", "actual_start", "actual_end",
    "project_buffer_days", "project_buffer_consumed",
    "auto_track_sessions", "metadata"
  ];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      if (field === "metadata") {
        params.push(body[field] ? JSON.stringify(body[field]) : null);
      } else {
        params.push(body[field]);
      }
    }
  }

  if (updates.length === 0) {
    return c.json({ error: "No fields to update" }, 400);
  }

  updates.push("updated_at = ?");
  params.push(now);
  params.push(projectId);

  db.query(`UPDATE projects SET ${updates.join(", ")} WHERE project_id = ?`).run(...params);

  const updated = db.query("SELECT * FROM projects WHERE project_id = ?").get(projectId) as Project;

  return c.json({
    ...updated,
    metadata: updated.metadata ? JSON.parse(updated.metadata) : null,
  });
});

// DELETE /api/ccpm/projects/:id - Delete a project
app.delete("/projects/:id", async (c) => {
  const projectId = c.req.param("id");

  const project = db.query("SELECT * FROM projects WHERE project_id = ?").get(projectId);

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  db.query("DELETE FROM buffer_history WHERE project_id = ?").run(projectId);
  db.query("DELETE FROM wbs_dependencies WHERE predecessor_id IN (SELECT wbs_id FROM wbs_items WHERE project_id = ?)").run(projectId);
  db.query("DELETE FROM wbs_dependencies WHERE successor_id IN (SELECT wbs_id FROM wbs_items WHERE project_id = ?)").run(projectId);
  db.query("DELETE FROM wbs_items WHERE project_id = ?").run(projectId);
  db.query("DELETE FROM projects WHERE project_id = ?").run(projectId);

  return c.json({ success: true });
});

// ============================================================
// WBS API
// ============================================================

// Helper: Build WBS tree
function buildWBSTree(items: WBSItem[]): WBSItem[] {
  const map = new Map<string, WBSItem & { children: WBSItem[] }>();
  const roots: (WBSItem & { children: WBSItem[] })[] = [];

  items.forEach((item) => {
    map.set(item.wbs_id, { ...item, children: [] });
  });

  items.forEach((item) => {
    const node = map.get(item.wbs_id)!;
    if (item.parent_id && map.has(item.parent_id)) {
      map.get(item.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

// Helper: Generate next WBS code
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

// GET /api/ccpm/projects/:id/wbs - Get WBS tree
app.get("/projects/:id/wbs", async (c) => {
  const projectId = c.req.param("id");
  const flat = c.req.query("flat") === "true";

  const items = db.query(
    "SELECT * FROM wbs_items WHERE project_id = ? ORDER BY sort_order, code"
  ).all(projectId) as WBSItem[];

  const parsedItems = items.map((item) => ({
    ...item,
    metadata: item.metadata ? JSON.parse(item.metadata) : null,
  }));

  if (flat) {
    return c.json({ items: parsedItems });
  }

  return c.json({ items: buildWBSTree(parsedItems as WBSItem[]) });
});

// POST /api/ccpm/projects/:id/wbs - Create WBS item
app.post("/projects/:id/wbs", async (c) => {
  const projectId = c.req.param("id");
  const body = await c.req.json();
  const wbsId = `wbs_${nanoid(12)}`;
  const now = new Date().toISOString();

  const project = db.query("SELECT * FROM projects WHERE project_id = ?").get(projectId);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const {
    parent_id,
    title,
    description,
    type = "task",
    status = "pending",
    estimated_duration,
    aggressive_duration,
    safe_duration,
    planned_start,
    planned_end,
    assignee,
    linked_task_id,
    linked_session_id,
    auto_created = 0,
    metadata,
  } = body;

  if (!title) {
    return c.json({ error: "Title is required" }, 400);
  }

  const code = body.code || generateWBSCode(projectId, parent_id);

  const maxOrder = db.query(
    "SELECT MAX(sort_order) as max FROM wbs_items WHERE project_id = ? AND (parent_id = ? OR (parent_id IS NULL AND ? IS NULL))"
  ).get(projectId, parent_id, parent_id) as { max: number | null };

  const sortOrder = (maxOrder.max || 0) + 1;

  db.query(`
    INSERT INTO wbs_items (
      wbs_id, project_id, parent_id, code, title, description, type, status,
      estimated_duration, aggressive_duration, safe_duration,
      planned_start, planned_end, assignee,
      linked_task_id, linked_session_id, auto_created,
      sort_order, metadata, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    wbsId, projectId, parent_id || null, code, title, description || null, type, status,
    estimated_duration || null, aggressive_duration || null, safe_duration || null,
    planned_start || null, planned_end || null, assignee || null,
    linked_task_id || null, linked_session_id || null, auto_created,
    sortOrder, metadata ? JSON.stringify(metadata) : null, now, now
  );

  const item = db.query("SELECT * FROM wbs_items WHERE wbs_id = ?").get(wbsId) as WBSItem;

  return c.json({
    ...item,
    metadata: item.metadata ? JSON.parse(item.metadata) : null,
  }, 201);
});

// PATCH /api/ccpm/wbs/:id - Update WBS item
app.patch("/wbs/:id", async (c) => {
  const wbsId = c.req.param("id");
  const body = await c.req.json();
  const now = new Date().toISOString();

  const item = db.query("SELECT * FROM wbs_items WHERE wbs_id = ?").get(wbsId);
  if (!item) {
    return c.json({ error: "WBS item not found" }, 404);
  }

  const updates: string[] = [];
  const params: (string | number | null)[] = [];

  const allowedFields = [
    "title", "description", "type", "status",
    "estimated_duration", "aggressive_duration", "safe_duration", "actual_duration",
    "planned_start", "planned_end", "actual_start", "actual_end",
    "assignee", "linked_task_id", "linked_session_id",
    "sort_order", "metadata"
  ];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      if (field === "metadata") {
        params.push(body[field] ? JSON.stringify(body[field]) : null);
      } else {
        params.push(body[field]);
      }
    }
  }

  if (updates.length === 0) {
    return c.json({ error: "No fields to update" }, 400);
  }

  updates.push("updated_at = ?");
  params.push(now);
  params.push(wbsId);

  db.query(`UPDATE wbs_items SET ${updates.join(", ")} WHERE wbs_id = ?`).run(...params);

  const updated = db.query("SELECT * FROM wbs_items WHERE wbs_id = ?").get(wbsId) as WBSItem;

  return c.json({
    ...updated,
    metadata: updated.metadata ? JSON.parse(updated.metadata) : null,
  });
});

// DELETE /api/ccpm/wbs/:id - Delete WBS item
app.delete("/wbs/:id", async (c) => {
  const wbsId = c.req.param("id");

  const item = db.query("SELECT * FROM wbs_items WHERE wbs_id = ?").get(wbsId);
  if (!item) {
    return c.json({ error: "WBS item not found" }, 404);
  }

  // Delete children recursively
  const deleteChildren = (parentId: string) => {
    const children = db.query("SELECT wbs_id FROM wbs_items WHERE parent_id = ?").all(parentId) as { wbs_id: string }[];
    for (const child of children) {
      deleteChildren(child.wbs_id);
    }
    db.query("DELETE FROM wbs_dependencies WHERE predecessor_id = ? OR successor_id = ?").run(parentId, parentId);
    db.query("DELETE FROM wbs_items WHERE wbs_id = ?").run(parentId);
  };

  deleteChildren(wbsId);

  return c.json({ success: true });
});

// POST /api/ccpm/wbs/:id/move - Move WBS item
app.post("/wbs/:id/move", async (c) => {
  const wbsId = c.req.param("id");
  const body = await c.req.json();
  const { new_parent_id, new_sort_order } = body;
  const now = new Date().toISOString();

  const item = db.query("SELECT * FROM wbs_items WHERE wbs_id = ?").get(wbsId) as WBSItem | null;
  if (!item) {
    return c.json({ error: "WBS item not found" }, 404);
  }

  // Update parent and regenerate code if needed
  if (new_parent_id !== undefined) {
    const newCode = generateWBSCode(item.project_id, new_parent_id);
    db.query("UPDATE wbs_items SET parent_id = ?, code = ?, updated_at = ? WHERE wbs_id = ?")
      .run(new_parent_id || null, newCode, now, wbsId);
  }

  if (new_sort_order !== undefined) {
    db.query("UPDATE wbs_items SET sort_order = ?, updated_at = ? WHERE wbs_id = ?")
      .run(new_sort_order, now, wbsId);
  }

  const updated = db.query("SELECT * FROM wbs_items WHERE wbs_id = ?").get(wbsId) as WBSItem;

  return c.json({
    ...updated,
    metadata: updated.metadata ? JSON.parse(updated.metadata) : null,
  });
});

// ============================================================
// Dependencies API
// ============================================================

// GET /api/ccpm/projects/:id/dependencies - Get all dependencies
app.get("/projects/:id/dependencies", async (c) => {
  const projectId = c.req.param("id");

  const deps = db.query(`
    SELECT d.* FROM wbs_dependencies d
    JOIN wbs_items w ON d.predecessor_id = w.wbs_id
    WHERE w.project_id = ?
  `).all(projectId) as Dependency[];

  return c.json({ dependencies: deps });
});

// POST /api/ccpm/projects/:id/dependencies - Create dependency
app.post("/projects/:id/dependencies", async (c) => {
  const projectId = c.req.param("id");
  const body = await c.req.json();
  const depId = `dep_${nanoid(12)}`;
  const now = new Date().toISOString();

  const { predecessor_id, successor_id, type = "FS", lag = 0 } = body;

  if (!predecessor_id || !successor_id) {
    return c.json({ error: "predecessor_id and successor_id are required" }, 400);
  }

  // Verify both items exist and belong to the project
  const pred = db.query("SELECT * FROM wbs_items WHERE wbs_id = ? AND project_id = ?").get(predecessor_id, projectId);
  const succ = db.query("SELECT * FROM wbs_items WHERE wbs_id = ? AND project_id = ?").get(successor_id, projectId);

  if (!pred || !succ) {
    return c.json({ error: "Invalid predecessor or successor" }, 400);
  }

  // Check for circular dependency (simple check)
  if (predecessor_id === successor_id) {
    return c.json({ error: "Cannot create self-dependency" }, 400);
  }

  db.query(`
    INSERT INTO wbs_dependencies (dependency_id, predecessor_id, successor_id, type, lag, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(depId, predecessor_id, successor_id, type, lag, now);

  const dep = db.query("SELECT * FROM wbs_dependencies WHERE dependency_id = ?").get(depId) as Dependency;

  return c.json(dep, 201);
});

// DELETE /api/ccpm/dependencies/:id - Delete dependency
app.delete("/dependencies/:id", async (c) => {
  const depId = c.req.param("id");

  const dep = db.query("SELECT * FROM wbs_dependencies WHERE dependency_id = ?").get(depId);
  if (!dep) {
    return c.json({ error: "Dependency not found" }, 404);
  }

  db.query("DELETE FROM wbs_dependencies WHERE dependency_id = ?").run(depId);

  return c.json({ success: true });
});

// ============================================================
// CCPM Calculation API
// ============================================================

// GET /api/ccpm/projects/:id/critical-chain - Get critical chain
app.get("/projects/:id/critical-chain", async (c) => {
  const projectId = c.req.param("id");

  // Get all WBS items with dependencies
  const items = db.query(`
    SELECT * FROM wbs_items WHERE project_id = ? AND type IN ('task', 'subtask')
  `).all(projectId) as WBSItem[];

  const deps = db.query(`
    SELECT d.* FROM wbs_dependencies d
    JOIN wbs_items w ON d.predecessor_id = w.wbs_id
    WHERE w.project_id = ?
  `).all(projectId) as Dependency[];

  // Build adjacency list
  const successors = new Map<string, string[]>();
  const predecessors = new Map<string, string[]>();

  for (const dep of deps) {
    if (!successors.has(dep.predecessor_id)) {
      successors.set(dep.predecessor_id, []);
    }
    successors.get(dep.predecessor_id)!.push(dep.successor_id);

    if (!predecessors.has(dep.successor_id)) {
      predecessors.set(dep.successor_id, []);
    }
    predecessors.get(dep.successor_id)!.push(dep.predecessor_id);
  }

  // Find start nodes (no predecessors)
  const startNodes = items.filter((item) => !predecessors.has(item.wbs_id));

  // Find end nodes (no successors)
  const endNodes = items.filter((item) => !successors.has(item.wbs_id));

  // Calculate longest path (critical chain) using dynamic programming
  const durations = new Map<string, number>();
  const longestPath = new Map<string, string[]>();

  for (const item of items) {
    durations.set(item.wbs_id, item.aggressive_duration || item.estimated_duration || 0);
    longestPath.set(item.wbs_id, [item.wbs_id]);
  }

  // Topological sort + longest path
  const visited = new Set<string>();
  const sorted: string[] = [];

  const visit = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    for (const succ of successors.get(id) || []) {
      visit(succ);
    }
    sorted.unshift(id);
  };

  for (const item of items) {
    visit(item.wbs_id);
  }

  // Calculate longest paths
  const distances = new Map<string, number>();
  const pathTo = new Map<string, string[]>();

  for (const id of sorted) {
    const preds = predecessors.get(id) || [];
    if (preds.length === 0) {
      distances.set(id, durations.get(id) || 0);
      pathTo.set(id, [id]);
    } else {
      let maxDist = 0;
      let maxPath: string[] = [];
      for (const pred of preds) {
        const dist = (distances.get(pred) || 0) + (durations.get(id) || 0);
        if (dist > maxDist) {
          maxDist = dist;
          maxPath = [...(pathTo.get(pred) || []), id];
        }
      }
      distances.set(id, maxDist);
      pathTo.set(id, maxPath);
    }
  }

  // Find the critical chain (longest path to any end node)
  let criticalChain: string[] = [];
  let maxDuration = 0;

  for (const endNode of endNodes) {
    const dist = distances.get(endNode.wbs_id) || 0;
    if (dist > maxDuration) {
      maxDuration = dist;
      criticalChain = pathTo.get(endNode.wbs_id) || [];
    }
  }

  // Get items on critical chain
  const criticalItems = criticalChain.map((id) =>
    items.find((item) => item.wbs_id === id)
  ).filter(Boolean);

  return c.json({
    critical_chain: criticalChain,
    critical_items: criticalItems,
    total_duration: maxDuration,
    all_items: items.length,
  });
});

// GET /api/ccpm/projects/:id/buffers - Get buffer status
app.get("/projects/:id/buffers", async (c) => {
  const projectId = c.req.param("id");

  const project = db.query("SELECT * FROM projects WHERE project_id = ?").get(projectId) as Project | null;
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  // Calculate buffer from WBS items
  const items = db.query(`
    SELECT * FROM wbs_items WHERE project_id = ? AND type IN ('task', 'subtask')
  `).all(projectId) as WBSItem[];

  let totalSafe = 0;
  let totalAggressive = 0;
  let totalActual = 0;
  let completedDuration = 0;

  for (const item of items) {
    const safe = item.safe_duration || item.estimated_duration || 0;
    const aggressive = item.aggressive_duration || item.estimated_duration || 0;
    totalSafe += safe;
    totalAggressive += aggressive;

    if (item.status === "completed") {
      completedDuration += item.actual_duration || aggressive;
      totalActual += item.actual_duration || 0;
    } else if (item.status === "in_progress") {
      totalActual += item.actual_duration || 0;
    }
  }

  const bufferSize = Math.round((totalSafe - totalAggressive) * project.project_buffer_ratio);
  const bufferConsumed = Math.max(0, totalActual - totalAggressive);
  const bufferConsumedPercent = bufferSize > 0 ? Math.round((bufferConsumed / bufferSize) * 100) : 0;

  const progressPercent = totalAggressive > 0 ? Math.round((completedDuration / totalAggressive) * 100) : 0;

  // Fever chart status
  let feverStatus: "green" | "yellow" | "red" = "green";
  if (bufferConsumedPercent >= progressPercent) {
    feverStatus = "red";
  } else if (bufferConsumedPercent >= progressPercent * 0.5) {
    feverStatus = "yellow";
  }

  return c.json({
    project_buffer: {
      size: bufferSize,
      consumed: bufferConsumed,
      consumed_percent: bufferConsumedPercent,
      remaining: Math.max(0, bufferSize - bufferConsumed),
    },
    progress: {
      completed_duration: completedDuration,
      total_duration: totalAggressive,
      percent: progressPercent,
    },
    fever_status: feverStatus,
    estimates: {
      safe_total: totalSafe,
      aggressive_total: totalAggressive,
      actual_total: totalActual,
    },
  });
});

// GET /api/ccpm/projects/:id/buffer-trend - Get buffer trend history
app.get("/projects/:id/buffer-trend", async (c) => {
  const projectId = c.req.param("id");
  const days = parseInt(c.req.query("days") || "30");

  const history = db.query(`
    SELECT * FROM buffer_history
    WHERE project_id = ?
    ORDER BY recorded_at DESC
    LIMIT ?
  `).all(projectId, days * 24) as Array<{
    history_id: string;
    buffer_type: string;
    consumed_percent: number;
    progress_percent: number;
    recorded_at: string;
  }>;

  return c.json({ history: history.reverse() });
});

// POST /api/ccpm/projects/:id/record-buffer - Record current buffer state
app.post("/projects/:id/record-buffer", async (c) => {
  const projectId = c.req.param("id");
  const historyId = `bh_${nanoid(12)}`;
  const now = new Date().toISOString();

  // Get current buffer status
  const bufferResponse = await fetch(`http://localhost:${process.env.PORT || 4000}/api/ccpm/projects/${projectId}/buffers`);
  const bufferData = await bufferResponse.json() as {
    project_buffer: { consumed_percent: number };
    progress: { percent: number };
  };

  db.query(`
    INSERT INTO buffer_history (history_id, project_id, buffer_type, consumed_percent, progress_percent, recorded_at)
    VALUES (?, ?, 'project', ?, ?, ?)
  `).run(
    historyId,
    projectId,
    bufferData.project_buffer.consumed_percent,
    bufferData.progress.percent,
    now
  );

  return c.json({ success: true, history_id: historyId });
});

export default app;
