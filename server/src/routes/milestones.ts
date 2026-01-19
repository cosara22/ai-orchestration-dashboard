import { Hono } from "hono";
import { db } from "../lib/db";
import { nanoid } from "nanoid";

const app = new Hono();

interface Milestone {
  id: number;
  milestone_id: string;
  project_id: string;
  wbs_id: string | null;
  title: string;
  description: string | null;
  type: string;
  status: string;
  target_date: string | null;
  achieved_date: string | null;
  evidence: string | null;
  next_actions: string | null;
  lessons_learned: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

interface SemanticRecord {
  id: number;
  record_id: string;
  project_id: string;
  milestone_id: string | null;
  record_type: string;
  title: string;
  content: string;
  tags: string | null;
  relations: string | null;
  source_session_id: string | null;
  source_event_id: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

// GET /api/milestones - List milestones
app.get("/", async (c) => {
  const projectId = c.req.query("project_id");
  const status = c.req.query("status");
  const type = c.req.query("type");
  const limit = parseInt(c.req.query("limit") || "50");
  const offset = parseInt(c.req.query("offset") || "0");

  let query = "SELECT * FROM milestones WHERE 1=1";
  const params: (string | number)[] = [];

  if (projectId) {
    query += " AND project_id = ?";
    params.push(projectId);
  }
  if (status) {
    query += " AND status = ?";
    params.push(status);
  }
  if (type) {
    query += " AND type = ?";
    params.push(type);
  }

  query += " ORDER BY target_date ASC, created_at DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  const milestones = db.query(query).all(...params) as Milestone[];

  return c.json({
    milestones: milestones.map((m) => ({
      ...m,
      evidence: m.evidence ? JSON.parse(m.evidence) : null,
      next_actions: m.next_actions ? JSON.parse(m.next_actions) : null,
      metadata: m.metadata ? JSON.parse(m.metadata) : null,
    })),
  });
});

// POST /api/milestones - Create milestone
app.post("/", async (c) => {
  const body = await c.req.json();
  const milestoneId = `ms_${nanoid(12)}`;
  const now = new Date().toISOString();

  const {
    project_id,
    wbs_id,
    title,
    description,
    type = "checkpoint",
    status = "pending",
    target_date,
    metadata,
  } = body;

  if (!project_id || !title) {
    return c.json({ error: "project_id and title are required" }, 400);
  }

  db.query(`
    INSERT INTO milestones (
      milestone_id, project_id, wbs_id, title, description, type, status,
      target_date, metadata, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    milestoneId,
    project_id,
    wbs_id || null,
    title,
    description || null,
    type,
    status,
    target_date || null,
    metadata ? JSON.stringify(metadata) : null,
    now,
    now
  );

  const milestone = db.query("SELECT * FROM milestones WHERE milestone_id = ?").get(milestoneId) as Milestone;

  return c.json({
    ...milestone,
    evidence: null,
    next_actions: null,
    metadata: metadata || null,
  }, 201);
});

// GET /api/milestones/:id - Get single milestone
app.get("/:id", async (c) => {
  const milestoneId = c.req.param("id");

  const milestone = db.query("SELECT * FROM milestones WHERE milestone_id = ?").get(milestoneId) as Milestone | null;

  if (!milestone) {
    return c.json({ error: "Milestone not found" }, 404);
  }

  // Get related semantic records
  const records = db.query(
    "SELECT * FROM semantic_records WHERE milestone_id = ? ORDER BY created_at DESC"
  ).all(milestoneId) as SemanticRecord[];

  return c.json({
    ...milestone,
    evidence: milestone.evidence ? JSON.parse(milestone.evidence) : null,
    next_actions: milestone.next_actions ? JSON.parse(milestone.next_actions) : null,
    metadata: milestone.metadata ? JSON.parse(milestone.metadata) : null,
    semantic_records: records.map((r) => ({
      ...r,
      tags: r.tags ? JSON.parse(r.tags) : null,
      relations: r.relations ? JSON.parse(r.relations) : null,
      metadata: r.metadata ? JSON.parse(r.metadata) : null,
    })),
  });
});

// PATCH /api/milestones/:id - Update milestone
app.patch("/:id", async (c) => {
  const milestoneId = c.req.param("id");
  const body = await c.req.json();
  const now = new Date().toISOString();

  const milestone = db.query("SELECT * FROM milestones WHERE milestone_id = ?").get(milestoneId);

  if (!milestone) {
    return c.json({ error: "Milestone not found" }, 404);
  }

  const updates: string[] = [];
  const params: (string | number | null)[] = [];

  const allowedFields = [
    "title", "description", "type", "status", "target_date", "achieved_date",
    "evidence", "next_actions", "lessons_learned", "metadata", "wbs_id"
  ];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      if (["evidence", "next_actions", "metadata"].includes(field)) {
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
  params.push(milestoneId);

  db.query(`UPDATE milestones SET ${updates.join(", ")} WHERE milestone_id = ?`).run(...params);

  const updated = db.query("SELECT * FROM milestones WHERE milestone_id = ?").get(milestoneId) as Milestone;

  return c.json({
    ...updated,
    evidence: updated.evidence ? JSON.parse(updated.evidence) : null,
    next_actions: updated.next_actions ? JSON.parse(updated.next_actions) : null,
    metadata: updated.metadata ? JSON.parse(updated.metadata) : null,
  });
});

// POST /api/milestones/:id/achieve - Mark milestone as achieved with evidence
app.post("/:id/achieve", async (c) => {
  const milestoneId = c.req.param("id");
  const body = await c.req.json();
  const now = new Date().toISOString();

  const milestone = db.query("SELECT * FROM milestones WHERE milestone_id = ?").get(milestoneId) as Milestone | null;

  if (!milestone) {
    return c.json({ error: "Milestone not found" }, 404);
  }

  const { evidence, lessons_learned, next_actions } = body;

  // Update milestone
  db.query(`
    UPDATE milestones SET
      status = 'achieved',
      achieved_date = ?,
      evidence = ?,
      lessons_learned = ?,
      next_actions = ?,
      updated_at = ?
    WHERE milestone_id = ?
  `).run(
    now,
    evidence ? JSON.stringify(evidence) : null,
    lessons_learned || null,
    next_actions ? JSON.stringify(next_actions) : null,
    now,
    milestoneId
  );

  // Create semantic record for the achievement
  const recordId = `sr_${nanoid(12)}`;
  db.query(`
    INSERT INTO semantic_records (
      record_id, project_id, milestone_id, record_type, title, content,
      tags, metadata, created_at, updated_at
    ) VALUES (?, ?, ?, 'achievement', ?, ?, ?, ?, ?, ?)
  `).run(
    recordId,
    milestone.project_id,
    milestoneId,
    `Milestone Achieved: ${milestone.title}`,
    lessons_learned || `Milestone "${milestone.title}" was achieved.`,
    JSON.stringify(["milestone", "achievement"]),
    JSON.stringify({ evidence, next_actions }),
    now,
    now
  );

  // Generate report
  const report = generateMilestoneReport(milestone, {
    achieved_date: now,
    evidence,
    lessons_learned,
    next_actions,
  });

  const updated = db.query("SELECT * FROM milestones WHERE milestone_id = ?").get(milestoneId) as Milestone;

  return c.json({
    milestone: {
      ...updated,
      evidence: updated.evidence ? JSON.parse(updated.evidence) : null,
      next_actions: updated.next_actions ? JSON.parse(updated.next_actions) : null,
      metadata: updated.metadata ? JSON.parse(updated.metadata) : null,
    },
    report,
  });
});

// GET /api/milestones/:id/report - Generate milestone report
app.get("/:id/report", async (c) => {
  const milestoneId = c.req.param("id");
  const format = c.req.query("format") || "md";

  const milestone = db.query("SELECT * FROM milestones WHERE milestone_id = ?").get(milestoneId) as Milestone | null;

  if (!milestone) {
    return c.json({ error: "Milestone not found" }, 404);
  }

  const evidence = milestone.evidence ? JSON.parse(milestone.evidence) : null;
  const nextActions = milestone.next_actions ? JSON.parse(milestone.next_actions) : null;

  const report = generateMilestoneReport(milestone, {
    achieved_date: milestone.achieved_date,
    evidence,
    lessons_learned: milestone.lessons_learned,
    next_actions: nextActions,
  });

  if (format === "json") {
    return c.json({
      milestone_id: milestoneId,
      report_format: "json",
      data: {
        title: milestone.title,
        status: milestone.status,
        achieved_date: milestone.achieved_date,
        evidence,
        lessons_learned: milestone.lessons_learned,
        next_actions: nextActions,
      },
    });
  }

  // Return markdown
  return c.text(report);
});

// DELETE /api/milestones/:id - Delete milestone
app.delete("/:id", async (c) => {
  const milestoneId = c.req.param("id");

  const milestone = db.query("SELECT * FROM milestones WHERE milestone_id = ?").get(milestoneId);

  if (!milestone) {
    return c.json({ error: "Milestone not found" }, 404);
  }

  // Delete related semantic records
  db.query("DELETE FROM semantic_records WHERE milestone_id = ?").run(milestoneId);
  db.query("DELETE FROM milestones WHERE milestone_id = ?").run(milestoneId);

  return c.json({ success: true });
});

// ============================================================
// Semantic Records API
// ============================================================

// GET /api/milestones/semantic - List semantic records
app.get("/semantic/list", async (c) => {
  const projectId = c.req.query("project_id");
  const recordType = c.req.query("record_type");
  const tags = c.req.query("tags");
  const search = c.req.query("search");
  const limit = parseInt(c.req.query("limit") || "50");

  let query = "SELECT * FROM semantic_records WHERE 1=1";
  const params: (string | number)[] = [];

  if (projectId) {
    query += " AND project_id = ?";
    params.push(projectId);
  }
  if (recordType) {
    query += " AND record_type = ?";
    params.push(recordType);
  }
  if (search) {
    query += " AND (title LIKE ? OR content LIKE ?)";
    params.push(`%${search}%`, `%${search}%`);
  }

  query += " ORDER BY created_at DESC LIMIT ?";
  params.push(limit);

  const records = db.query(query).all(...params) as SemanticRecord[];

  // Filter by tags if specified
  let filteredRecords = records;
  if (tags) {
    const tagArray = tags.split(",").map((t) => t.trim().toLowerCase());
    filteredRecords = records.filter((r) => {
      if (!r.tags) return false;
      const recordTags = JSON.parse(r.tags) as string[];
      return tagArray.some((t) => recordTags.map((rt) => rt.toLowerCase()).includes(t));
    });
  }

  return c.json({
    records: filteredRecords.map((r) => ({
      ...r,
      tags: r.tags ? JSON.parse(r.tags) : null,
      relations: r.relations ? JSON.parse(r.relations) : null,
      metadata: r.metadata ? JSON.parse(r.metadata) : null,
    })),
  });
});

// POST /api/milestones/semantic - Create semantic record
app.post("/semantic", async (c) => {
  const body = await c.req.json();
  const recordId = `sr_${nanoid(12)}`;
  const now = new Date().toISOString();

  const {
    project_id,
    milestone_id,
    record_type,
    title,
    content,
    tags,
    relations,
    source_session_id,
    source_event_id,
    metadata,
  } = body;

  if (!project_id || !record_type || !title || !content) {
    return c.json({ error: "project_id, record_type, title, and content are required" }, 400);
  }

  db.query(`
    INSERT INTO semantic_records (
      record_id, project_id, milestone_id, record_type, title, content,
      tags, relations, source_session_id, source_event_id, metadata,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    recordId,
    project_id,
    milestone_id || null,
    record_type,
    title,
    content,
    tags ? JSON.stringify(tags) : null,
    relations ? JSON.stringify(relations) : null,
    source_session_id || null,
    source_event_id || null,
    metadata ? JSON.stringify(metadata) : null,
    now,
    now
  );

  const record = db.query("SELECT * FROM semantic_records WHERE record_id = ?").get(recordId) as SemanticRecord;

  return c.json({
    ...record,
    tags: tags || null,
    relations: relations || null,
    metadata: metadata || null,
  }, 201);
});

// GET /api/milestones/semantic/:id - Get single record
app.get("/semantic/:id", async (c) => {
  const recordId = c.req.param("id");

  const record = db.query("SELECT * FROM semantic_records WHERE record_id = ?").get(recordId) as SemanticRecord | null;

  if (!record) {
    return c.json({ error: "Record not found" }, 404);
  }

  return c.json({
    ...record,
    tags: record.tags ? JSON.parse(record.tags) : null,
    relations: record.relations ? JSON.parse(record.relations) : null,
    metadata: record.metadata ? JSON.parse(record.metadata) : null,
  });
});

// DELETE /api/milestones/semantic/:id - Delete record
app.delete("/semantic/:id", async (c) => {
  const recordId = c.req.param("id");

  const record = db.query("SELECT * FROM semantic_records WHERE record_id = ?").get(recordId);

  if (!record) {
    return c.json({ error: "Record not found" }, 404);
  }

  db.query("DELETE FROM semantic_records WHERE record_id = ?").run(recordId);

  return c.json({ success: true });
});

// Helper: Generate milestone report in markdown
function generateMilestoneReport(
  milestone: Milestone,
  data: {
    achieved_date: string | null;
    evidence: any;
    lessons_learned: string | null;
    next_actions: any[] | null;
  }
): string {
  const lines: string[] = [];

  lines.push(`# Milestone Report: ${milestone.title}`);
  lines.push("");
  lines.push(`**Milestone ID**: ${milestone.milestone_id}`);
  lines.push(`**Project ID**: ${milestone.project_id}`);
  lines.push(`**Type**: ${milestone.type}`);
  lines.push(`**Status**: ${milestone.status}`);
  if (milestone.target_date) {
    lines.push(`**Target Date**: ${milestone.target_date}`);
  }
  if (data.achieved_date) {
    lines.push(`**Achieved Date**: ${data.achieved_date}`);
  }
  lines.push("");

  lines.push("## 1. Description");
  lines.push(milestone.description || "_No description provided._");
  lines.push("");

  if (data.evidence) {
    lines.push("## 2. Evidence");
    if (data.evidence.commits && data.evidence.commits.length > 0) {
      lines.push("### Commits");
      data.evidence.commits.forEach((commit: string) => {
        lines.push(`- ${commit}`);
      });
    }
    if (data.evidence.sessions && data.evidence.sessions.length > 0) {
      lines.push("### Sessions");
      data.evidence.sessions.forEach((session: string) => {
        lines.push(`- ${session}`);
      });
    }
    if (data.evidence.files_changed && data.evidence.files_changed.length > 0) {
      lines.push("### Files Changed");
      data.evidence.files_changed.forEach((file: string) => {
        lines.push(`- ${file}`);
      });
    }
    lines.push("");
  }

  if (data.lessons_learned) {
    lines.push("## 3. Lessons Learned");
    lines.push(data.lessons_learned);
    lines.push("");
  }

  if (data.next_actions && data.next_actions.length > 0) {
    lines.push("## 4. Next Actions");
    lines.push("");
    lines.push("| Priority | Action | Due Date | Context |");
    lines.push("|----------|--------|----------|---------|");
    data.next_actions.forEach((action: any) => {
      lines.push(`| ${action.priority || "medium"} | ${action.action} | ${action.due_date || "-"} | ${action.context || "-"} |`);
    });
    lines.push("");
  }

  lines.push("---");
  lines.push(`_Generated at ${new Date().toISOString()}_`);

  return lines.join("\n");
}

// ===== AI Agent Integration Endpoints =====

// POST /api/milestones/agent/record - AI Agent records milestone automatically
// Called from Claude Code Hooks on session end, commit, or significant events
app.post("/agent/record", async (c) => {
  const body = await c.req.json();
  const now = new Date().toISOString();

  const {
    session_id,
    project_id,
    event_type, // "session_end" | "commit" | "task_complete" | "phase_complete"
    title,
    description,
    summary, // AI-generated summary of what was accomplished
    files_changed,
    commits,
    tools_used,
    duration_minutes,
    outcome, // "success" | "partial" | "blocked"
    next_steps,
    lessons_learned,
    tags,
    wbs_id,
  } = body;

  if (!project_id || !event_type || !title) {
    return c.json({ error: "project_id, event_type, and title are required" }, 400);
  }

  // Determine milestone type based on event
  let milestoneType = "checkpoint";
  if (event_type === "phase_complete") milestoneType = "phase";
  if (event_type === "commit") milestoneType = "commit";
  if (event_type === "session_end") milestoneType = "session";

  // Determine status based on outcome
  let status = "achieved";
  if (outcome === "partial") status = "in_progress";
  if (outcome === "blocked") status = "pending";

  // Create milestone
  const milestoneId = `ms_${nanoid(12)}`;

  const evidence = {
    type: event_type,
    session_id: session_id || null,
    files_changed: files_changed || [],
    commits: commits || [],
    tools_used: tools_used || [],
    duration_minutes: duration_minutes || null,
    outcome: outcome || "success",
    recorded_at: now,
  };

  const nextActions = next_steps?.map((step: string, i: number) => ({
    id: `action_${nanoid(8)}`,
    title: step,
    priority: i === 0 ? "high" : "medium",
    status: "pending",
    created_from: "agent",
  })) || null;

  db.query(`
    INSERT INTO milestones (
      milestone_id, project_id, wbs_id, title, description, type, status,
      target_date, achieved_date, evidence, next_actions, lessons_learned,
      metadata, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    milestoneId,
    project_id,
    wbs_id || null,
    title,
    description || summary || null,
    milestoneType,
    status,
    null, // target_date
    status === "achieved" ? now : null,
    JSON.stringify(evidence),
    nextActions ? JSON.stringify(nextActions) : null,
    lessons_learned || null,
    JSON.stringify({ source: "agent", event_type, session_id }),
    now,
    now
  );

  // Create semantic record for knowledge preservation
  const recordId = `sr_${nanoid(12)}`;

  // Build content for semantic record
  const contentParts: string[] = [];
  contentParts.push(`## ${title}`);
  contentParts.push("");
  if (summary) {
    contentParts.push("### Summary");
    contentParts.push(summary);
    contentParts.push("");
  }
  if (description) {
    contentParts.push("### Description");
    contentParts.push(description);
    contentParts.push("");
  }
  if (files_changed && files_changed.length > 0) {
    contentParts.push("### Files Changed");
    files_changed.forEach((f: string) => contentParts.push(`- ${f}`));
    contentParts.push("");
  }
  if (commits && commits.length > 0) {
    contentParts.push("### Commits");
    commits.forEach((c: string) => contentParts.push(`- ${c}`));
    contentParts.push("");
  }
  if (next_steps && next_steps.length > 0) {
    contentParts.push("### Next Steps");
    next_steps.forEach((s: string, i: number) => contentParts.push(`${i + 1}. ${s}`));
    contentParts.push("");
  }
  if (lessons_learned) {
    contentParts.push("### Lessons Learned");
    contentParts.push(lessons_learned);
  }

  const recordTags = [
    event_type,
    outcome || "success",
    ...(tags || []),
  ];

  db.query(`
    INSERT INTO semantic_records (
      record_id, project_id, milestone_id, record_type, title, content,
      tags, relations, source_session_id, source_event_id, metadata,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    recordId,
    project_id,
    milestoneId,
    `milestone_${event_type}`,
    title,
    contentParts.join("\n"),
    JSON.stringify(recordTags),
    null,
    session_id || null,
    null,
    JSON.stringify({ source: "agent", auto_generated: true }),
    now,
    now
  );

  // Generate markdown report
  const milestone = db.query("SELECT * FROM milestones WHERE milestone_id = ?").get(milestoneId) as Milestone;
  const report = generateMilestoneReport(milestone, {
    achieved_date: status === "achieved" ? now : null,
    evidence,
    lessons_learned: lessons_learned || null,
    next_actions: nextActions,
  });

  return c.json({
    milestone_id: milestoneId,
    record_id: recordId,
    status,
    report,
  }, 201);
});

// POST /api/milestones/agent/progress - Update progress from AI agent
app.post("/agent/progress", async (c) => {
  const body = await c.req.json();
  const now = new Date().toISOString();

  const {
    session_id,
    project_id,
    wbs_id,
    progress_type, // "task_start" | "task_progress" | "task_complete" | "blocker"
    task_title,
    details,
    percent_complete,
    blockers,
    tools_used,
  } = body;

  if (!project_id || !progress_type) {
    return c.json({ error: "project_id and progress_type are required" }, 400);
  }

  // Create semantic record for progress tracking
  const recordId = `sr_${nanoid(12)}`;

  const contentParts: string[] = [];
  contentParts.push(`## Progress Update: ${task_title || progress_type}`);
  contentParts.push("");
  contentParts.push(`**Type**: ${progress_type}`);
  if (percent_complete !== undefined) {
    contentParts.push(`**Progress**: ${percent_complete}%`);
  }
  contentParts.push(`**Time**: ${now}`);
  contentParts.push("");

  if (details) {
    contentParts.push("### Details");
    contentParts.push(details);
    contentParts.push("");
  }

  if (blockers && blockers.length > 0) {
    contentParts.push("### Blockers");
    blockers.forEach((b: string) => contentParts.push(`- ${b}`));
    contentParts.push("");
  }

  if (tools_used && tools_used.length > 0) {
    contentParts.push("### Tools Used");
    tools_used.forEach((t: string) => contentParts.push(`- ${t}`));
  }

  db.query(`
    INSERT INTO semantic_records (
      record_id, project_id, milestone_id, record_type, title, content,
      tags, relations, source_session_id, source_event_id, metadata,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    recordId,
    project_id,
    null,
    `progress_${progress_type}`,
    task_title || `Progress: ${progress_type}`,
    contentParts.join("\n"),
    JSON.stringify([progress_type, ...(blockers?.length ? ["has_blockers"] : [])]),
    wbs_id ? JSON.stringify({ wbs_id }) : null,
    session_id || null,
    null,
    JSON.stringify({ source: "agent", progress_type, percent_complete }),
    now,
    now
  );

  // If WBS ID provided, update WBS item progress
  if (wbs_id && percent_complete !== undefined) {
    try {
      const wbsItem = db.query("SELECT * FROM wbs_items WHERE wbs_id = ?").get(wbs_id);
      if (wbsItem) {
        let newStatus = "pending";
        if (percent_complete > 0 && percent_complete < 100) newStatus = "in_progress";
        if (percent_complete >= 100) newStatus = "completed";
        if (blockers && blockers.length > 0) newStatus = "blocked";

        db.query(`
          UPDATE wbs_items SET
            status = ?,
            actual_start = COALESCE(actual_start, ?),
            actual_end = CASE WHEN ? >= 100 THEN ? ELSE actual_end END,
            updated_at = ?
          WHERE wbs_id = ?
        `).run(newStatus, now, percent_complete, now, now, wbs_id);
      }
    } catch (error) {
      console.error("Failed to update WBS item:", error);
    }
  }

  return c.json({
    record_id: recordId,
    progress_type,
    percent_complete,
    has_blockers: blockers && blockers.length > 0,
  }, 201);
});

// GET /api/milestones/agent/context/:project_id - Get context for AI agent
// Provides current state, active milestones, and pending next actions
app.get("/agent/context/:projectId", async (c) => {
  const projectId = c.req.param("projectId");

  // Get recent milestones
  const milestones = db.query(`
    SELECT * FROM milestones
    WHERE project_id = ?
    ORDER BY created_at DESC
    LIMIT 10
  `).all(projectId) as Milestone[];

  // Get pending next actions from all milestones
  const pendingActions: any[] = [];
  milestones.forEach((m) => {
    if (m.next_actions) {
      const actions = JSON.parse(m.next_actions);
      actions.filter((a: any) => a.status === "pending").forEach((a: any) => {
        pendingActions.push({
          ...a,
          milestone_id: m.milestone_id,
          milestone_title: m.title,
        });
      });
    }
  });

  // Get recent progress records
  const recentProgress = db.query(`
    SELECT * FROM semantic_records
    WHERE project_id = ? AND record_type LIKE 'progress_%'
    ORDER BY created_at DESC
    LIMIT 5
  `).all(projectId) as SemanticRecord[];

  // Get active WBS items
  const activeWbs = db.query(`
    SELECT * FROM wbs_items
    WHERE project_id = ? AND status = 'in_progress'
    ORDER BY updated_at DESC
  `).all(projectId);

  return c.json({
    project_id: projectId,
    recent_milestones: milestones.slice(0, 5).map((m) => ({
      id: m.milestone_id,
      title: m.title,
      type: m.type,
      status: m.status,
      achieved_date: m.achieved_date,
    })),
    pending_actions: pendingActions.slice(0, 10),
    recent_progress: recentProgress.map((r) => ({
      id: r.record_id,
      type: r.record_type,
      title: r.title,
      created_at: r.created_at,
    })),
    active_wbs_items: activeWbs,
    summary: {
      total_milestones: milestones.length,
      achieved: milestones.filter((m) => m.status === "achieved").length,
      pending_actions_count: pendingActions.length,
      active_wbs_count: (activeWbs as any[]).length,
    },
  });
});

export default app;
