import { Hono } from "hono";
import { getDb } from "../lib/db";
import { broadcastToChannel } from "../ws/handler";

const teamsRouter = new Hono();

// Types
interface Team {
  id: number;
  team_id: string;
  name: string;
  description: string | null;
  project_id: string | null;
  color: string;
  lead_agent_id: string | null;
  max_members: number;
  status: string;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

interface TeamMember {
  id: number;
  team_id: string;
  agent_id: string;
  role: string;
  joined_at: string;
  // Joined data
  agent_name?: string;
  agent_status?: string;
}

interface TeamWithMembers extends Team {
  members: TeamMember[];
  member_count: number;
  lead_name?: string;
}

// GET /api/teams - List all teams
teamsRouter.get("/", async (c) => {
  const db = getDb();
  const projectId = c.req.query("project_id");
  const status = c.req.query("status") || "active";
  const limit = parseInt(c.req.query("limit") || "50");
  const offset = parseInt(c.req.query("offset") || "0");

  try {
    let query = `
      SELECT t.*,
        (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.team_id) as member_count,
        (SELECT name FROM agents WHERE agent_id = t.lead_agent_id) as lead_name
      FROM teams t
      WHERE 1=1
    `;
    const params: any[] = [];

    if (projectId) {
      query += " AND t.project_id = ?";
      params.push(projectId);
    }

    if (status && status !== "all") {
      query += " AND t.status = ?";
      params.push(status);
    }

    query += " ORDER BY t.created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const teams: any[] = db.prepare(query).all(...params);

    // Get total count
    let countQuery = "SELECT COUNT(*) as count FROM teams WHERE 1=1";
    const countParams: any[] = [];
    if (projectId) {
      countQuery += " AND project_id = ?";
      countParams.push(projectId);
    }
    if (status && status !== "all") {
      countQuery += " AND status = ?";
      countParams.push(status);
    }
    const total: any = db.prepare(countQuery).get(...countParams);

    return c.json({
      teams: teams.map(t => ({
        ...t,
        metadata: t.metadata ? JSON.parse(t.metadata) : null,
      })),
      total: total?.count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Failed to list teams:", error);
    return c.json({ error: "Failed to list teams" }, 500);
  }
});

// POST /api/teams - Create a new team
teamsRouter.post("/", async (c) => {
  const db = getDb();
  const body = await c.req.json();
  const { name, description, project_id, color, lead_agent_id, max_members, metadata } = body;

  if (!name) {
    return c.json({ error: "name is required" }, 400);
  }

  try {
    const { nanoid } = await import("nanoid");
    const teamId = `team_${nanoid(12)}`;

    db.prepare(`
      INSERT INTO teams (
        team_id, name, description, project_id, color, lead_agent_id, max_members, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      teamId,
      name,
      description || null,
      project_id || null,
      color || "#6366f1",
      lead_agent_id || null,
      max_members || 5,
      metadata ? JSON.stringify(metadata) : null
    );

    // If lead_agent_id is specified, add them as a lead member
    if (lead_agent_id) {
      db.prepare(`
        INSERT OR IGNORE INTO team_members (team_id, agent_id, role, joined_at)
        VALUES (?, ?, 'lead', datetime('now'))
      `).run(teamId, lead_agent_id);
    }

    const team = db.prepare("SELECT * FROM teams WHERE team_id = ?").get(teamId);

    // Broadcast creation
    broadcastToChannel("all", {
      type: "team_created",
      team_id: teamId,
      name,
    });

    return c.json({
      success: true,
      team: {
        ...team,
        metadata: (team as any).metadata ? JSON.parse((team as any).metadata) : null,
      },
    }, 201);
  } catch (error) {
    console.error("Failed to create team:", error);
    return c.json({ error: "Failed to create team" }, 500);
  }
});

// GET /api/teams/:id - Get team details with members
teamsRouter.get("/:id", async (c) => {
  const db = getDb();
  const teamId = c.req.param("id");

  try {
    const team: any = db.prepare(`
      SELECT t.*,
        (SELECT name FROM agents WHERE agent_id = t.lead_agent_id) as lead_name
      FROM teams t
      WHERE t.team_id = ?
    `).get(teamId);

    if (!team) {
      return c.json({ error: "Team not found" }, 404);
    }

    // Get members
    const members: any[] = db.prepare(`
      SELECT tm.*, a.name as agent_name, a.status as agent_status
      FROM team_members tm
      JOIN agents a ON tm.agent_id = a.agent_id
      WHERE tm.team_id = ?
      ORDER BY tm.role DESC, tm.joined_at ASC
    `).all(teamId);

    // Get team stats
    const stats: any = db.prepare(`
      SELECT
        COUNT(CASE WHEN a.status = 'active' THEN 1 END) as active_agents,
        COUNT(CASE WHEN a.status = 'idle' THEN 1 END) as idle_agents
      FROM team_members tm
      JOIN agents a ON tm.agent_id = a.agent_id
      WHERE tm.team_id = ?
    `).get(teamId);

    // Get task stats if project is assigned
    let taskStats = null;
    if (team.project_id) {
      taskStats = db.prepare(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress,
          COUNT(CASE WHEN status IN ('pending', 'queued') THEN 1 END) as pending
        FROM task_queue
        WHERE project_id = ?
        AND assigned_to IN (SELECT agent_id FROM team_members WHERE team_id = ?)
      `).get(team.project_id, teamId);
    }

    return c.json({
      ...team,
      metadata: team.metadata ? JSON.parse(team.metadata) : null,
      members,
      member_count: members.length,
      stats: {
        ...stats,
        tasks: taskStats,
      },
    });
  } catch (error) {
    console.error("Failed to get team:", error);
    return c.json({ error: "Failed to get team" }, 500);
  }
});

// PATCH /api/teams/:id - Update team
teamsRouter.patch("/:id", async (c) => {
  const db = getDb();
  const teamId = c.req.param("id");
  const body = await c.req.json();
  const { name, description, project_id, color, lead_agent_id, max_members, status, metadata } = body;

  try {
    const team = db.prepare("SELECT * FROM teams WHERE team_id = ?").get(teamId);
    if (!team) {
      return c.json({ error: "Team not found" }, 404);
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (name !== undefined) {
      updates.push("name = ?");
      params.push(name);
    }
    if (description !== undefined) {
      updates.push("description = ?");
      params.push(description);
    }
    if (project_id !== undefined) {
      updates.push("project_id = ?");
      params.push(project_id);
    }
    if (color !== undefined) {
      updates.push("color = ?");
      params.push(color);
    }
    if (lead_agent_id !== undefined) {
      updates.push("lead_agent_id = ?");
      params.push(lead_agent_id);

      // Update lead role if changing lead
      if (lead_agent_id) {
        // Demote old lead
        db.prepare(`
          UPDATE team_members SET role = 'member' WHERE team_id = ? AND role = 'lead'
        `).run(teamId);

        // Promote new lead (insert if not exists)
        db.prepare(`
          INSERT INTO team_members (team_id, agent_id, role, joined_at)
          VALUES (?, ?, 'lead', datetime('now'))
          ON CONFLICT(team_id, agent_id) DO UPDATE SET role = 'lead'
        `).run(teamId, lead_agent_id);
      }
    }
    if (max_members !== undefined) {
      updates.push("max_members = ?");
      params.push(max_members);
    }
    if (status !== undefined) {
      updates.push("status = ?");
      params.push(status);
    }
    if (metadata !== undefined) {
      updates.push("metadata = ?");
      params.push(JSON.stringify(metadata));
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      params.push(teamId);

      db.prepare(`
        UPDATE teams SET ${updates.join(", ")} WHERE team_id = ?
      `).run(...params);
    }

    const updated = db.prepare("SELECT * FROM teams WHERE team_id = ?").get(teamId);

    return c.json({
      success: true,
      team: {
        ...updated,
        metadata: (updated as any).metadata ? JSON.parse((updated as any).metadata) : null,
      },
    });
  } catch (error) {
    console.error("Failed to update team:", error);
    return c.json({ error: "Failed to update team" }, 500);
  }
});

// DELETE /api/teams/:id - Delete team
teamsRouter.delete("/:id", async (c) => {
  const db = getDb();
  const teamId = c.req.param("id");

  try {
    const team = db.prepare("SELECT * FROM teams WHERE team_id = ?").get(teamId);
    if (!team) {
      return c.json({ error: "Team not found" }, 404);
    }

    // Delete members first
    db.prepare("DELETE FROM team_members WHERE team_id = ?").run(teamId);

    // Delete team
    db.prepare("DELETE FROM teams WHERE team_id = ?").run(teamId);

    // Broadcast deletion
    broadcastToChannel("all", {
      type: "team_deleted",
      team_id: teamId,
    });

    return c.json({ success: true, deleted: teamId });
  } catch (error) {
    console.error("Failed to delete team:", error);
    return c.json({ error: "Failed to delete team" }, 500);
  }
});

// POST /api/teams/:id/members - Add member to team
teamsRouter.post("/:id/members", async (c) => {
  const db = getDb();
  const teamId = c.req.param("id");
  const body = await c.req.json();
  const { agent_id, role } = body;

  if (!agent_id) {
    return c.json({ error: "agent_id is required" }, 400);
  }

  try {
    const team: any = db.prepare("SELECT * FROM teams WHERE team_id = ?").get(teamId);
    if (!team) {
      return c.json({ error: "Team not found" }, 404);
    }

    // Check member count
    const memberCount: any = db.prepare(
      "SELECT COUNT(*) as count FROM team_members WHERE team_id = ?"
    ).get(teamId);

    if (memberCount.count >= team.max_members) {
      return c.json({ error: `Team is full (max ${team.max_members} members)` }, 400);
    }

    // Check if agent exists
    const agent = db.prepare("SELECT * FROM agents WHERE agent_id = ?").get(agent_id);
    if (!agent) {
      return c.json({ error: "Agent not found" }, 404);
    }

    // Add member
    db.prepare(`
      INSERT INTO team_members (team_id, agent_id, role, joined_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(team_id, agent_id) DO UPDATE SET role = excluded.role
    `).run(teamId, agent_id, role || "member");

    // If adding as lead, update team's lead_agent_id
    if (role === "lead") {
      db.prepare("UPDATE teams SET lead_agent_id = ? WHERE team_id = ?").run(agent_id, teamId);
    }

    // Broadcast update
    broadcastToChannel("all", {
      type: "team_member_added",
      team_id: teamId,
      agent_id,
      role: role || "member",
    });

    return c.json({
      success: true,
      team_id: teamId,
      agent_id,
      role: role || "member",
    });
  } catch (error) {
    console.error("Failed to add member:", error);
    return c.json({ error: "Failed to add member" }, 500);
  }
});

// DELETE /api/teams/:id/members/:agentId - Remove member from team
teamsRouter.delete("/:id/members/:agentId", async (c) => {
  const db = getDb();
  const teamId = c.req.param("id");
  const agentId = c.req.param("agentId");

  try {
    const member = db.prepare(
      "SELECT * FROM team_members WHERE team_id = ? AND agent_id = ?"
    ).get(teamId, agentId);

    if (!member) {
      return c.json({ error: "Member not found" }, 404);
    }

    // Remove member
    db.prepare("DELETE FROM team_members WHERE team_id = ? AND agent_id = ?").run(teamId, agentId);

    // If this was the lead, clear team's lead_agent_id
    const team: any = db.prepare("SELECT lead_agent_id FROM teams WHERE team_id = ?").get(teamId);
    if (team?.lead_agent_id === agentId) {
      db.prepare("UPDATE teams SET lead_agent_id = NULL WHERE team_id = ?").run(teamId);
    }

    // Broadcast update
    broadcastToChannel("all", {
      type: "team_member_removed",
      team_id: teamId,
      agent_id: agentId,
    });

    return c.json({
      success: true,
      team_id: teamId,
      agent_id: agentId,
    });
  } catch (error) {
    console.error("Failed to remove member:", error);
    return c.json({ error: "Failed to remove member" }, 500);
  }
});

// PATCH /api/teams/:id/members/:agentId - Update member role
teamsRouter.patch("/:id/members/:agentId", async (c) => {
  const db = getDb();
  const teamId = c.req.param("id");
  const agentId = c.req.param("agentId");
  const body = await c.req.json();
  const { role } = body;

  if (!role) {
    return c.json({ error: "role is required" }, 400);
  }

  try {
    const member = db.prepare(
      "SELECT * FROM team_members WHERE team_id = ? AND agent_id = ?"
    ).get(teamId, agentId);

    if (!member) {
      return c.json({ error: "Member not found" }, 404);
    }

    // Update role
    db.prepare(`
      UPDATE team_members SET role = ? WHERE team_id = ? AND agent_id = ?
    `).run(role, teamId, agentId);

    // If promoting to lead, update team's lead_agent_id and demote others
    if (role === "lead") {
      db.prepare(`
        UPDATE team_members SET role = 'member' WHERE team_id = ? AND agent_id != ? AND role = 'lead'
      `).run(teamId, agentId);
      db.prepare("UPDATE teams SET lead_agent_id = ? WHERE team_id = ?").run(agentId, teamId);
    }

    return c.json({
      success: true,
      team_id: teamId,
      agent_id: agentId,
      role,
    });
  } catch (error) {
    console.error("Failed to update member role:", error);
    return c.json({ error: "Failed to update member role" }, 500);
  }
});

// GET /api/teams/:id/members - List team members
teamsRouter.get("/:id/members", async (c) => {
  const db = getDb();
  const teamId = c.req.param("id");

  try {
    const team = db.prepare("SELECT * FROM teams WHERE team_id = ?").get(teamId);
    if (!team) {
      return c.json({ error: "Team not found" }, 404);
    }

    const members: any[] = db.prepare(`
      SELECT
        tm.*,
        a.name as agent_name,
        a.status as agent_status,
        a.type as agent_type,
        a.last_heartbeat,
        (SELECT COUNT(*) FROM task_queue tq WHERE tq.assigned_to = tm.agent_id AND tq.status IN ('queued', 'in_progress')) as current_workload
      FROM team_members tm
      JOIN agents a ON tm.agent_id = a.agent_id
      WHERE tm.team_id = ?
      ORDER BY tm.role DESC, tm.joined_at ASC
    `).all(teamId);

    return c.json({
      team_id: teamId,
      members,
      total: members.length,
    });
  } catch (error) {
    console.error("Failed to list members:", error);
    return c.json({ error: "Failed to list members" }, 500);
  }
});

// GET /api/teams/overview - Get overview of all teams with stats
teamsRouter.get("/overview/all", async (c) => {
  const db = getDb();

  try {
    const teams: any[] = db.prepare(`
      SELECT
        t.*,
        (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.team_id) as member_count,
        (SELECT name FROM agents WHERE agent_id = t.lead_agent_id) as lead_name,
        (SELECT COUNT(*) FROM task_queue tq
         WHERE tq.project_id = t.project_id
         AND tq.assigned_to IN (SELECT agent_id FROM team_members WHERE team_id = t.team_id)
         AND tq.status = 'completed') as completed_tasks,
        (SELECT COUNT(*) FROM task_queue tq
         WHERE tq.project_id = t.project_id
         AND tq.assigned_to IN (SELECT agent_id FROM team_members WHERE team_id = t.team_id)
         AND tq.status = 'in_progress') as in_progress_tasks,
        (SELECT name FROM projects WHERE project_id = t.project_id) as project_name
      FROM teams t
      WHERE t.status = 'active'
      ORDER BY t.created_at DESC
    `).all();

    // Get overall stats
    const totalAgents: any = db.prepare(
      "SELECT COUNT(*) as count FROM agents WHERE status = 'active'"
    ).get();

    const assignedAgents: any = db.prepare(
      "SELECT COUNT(DISTINCT agent_id) as count FROM team_members"
    ).get();

    return c.json({
      teams: teams.map(t => ({
        ...t,
        metadata: t.metadata ? JSON.parse(t.metadata) : null,
      })),
      summary: {
        total_teams: teams.length,
        total_agents: totalAgents?.count || 0,
        assigned_agents: assignedAgents?.count || 0,
        unassigned_agents: (totalAgents?.count || 0) - (assignedAgents?.count || 0),
      },
    });
  } catch (error) {
    console.error("Failed to get teams overview:", error);
    return c.json({ error: "Failed to get teams overview" }, 500);
  }
});

export { teamsRouter };
