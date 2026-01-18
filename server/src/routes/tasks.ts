import { Hono } from "hono";
import { z } from "zod";
import { nanoid } from "nanoid";
import { getDb } from "../lib/db";
import { broadcastToClients } from "../ws/handler";

export const tasksRouter = new Hono();

// Task schema validation
const TaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  project: z.string().optional(),
});

// POST /api/tasks - Create a new task
tasksRouter.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = TaskSchema.parse(body);

    const db = getDb();
    const taskId = nanoid();
    const timestamp = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO tasks (task_id, title, description, priority, project, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      taskId,
      validatedData.title,
      validatedData.description || null,
      validatedData.priority,
      validatedData.project || null,
      "pending",
      timestamp,
      timestamp
    );

    const task = {
      task_id: taskId,
      title: validatedData.title,
      description: validatedData.description || null,
      priority: validatedData.priority,
      project: validatedData.project || null,
      status: "pending",
      created_at: timestamp,
      updated_at: timestamp,
    };

    // Broadcast to WebSocket clients
    broadcastToClients({
      type: "task",
      action: "created",
      data: task,
    });

    return c.json({ success: true, task }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation error", details: error.errors }, 400);
    }
    console.error("Error creating task:", error);
    return c.json({ error: "Failed to create task" }, 500);
  }
});

// GET /api/tasks - List tasks
tasksRouter.get("/", async (c) => {
  try {
    const db = getDb();
    const limit = parseInt(c.req.query("limit") || "50");
    const offset = parseInt(c.req.query("offset") || "0");
    const status = c.req.query("status");
    const project = c.req.query("project");
    const priority = c.req.query("priority");

    let query = "SELECT * FROM tasks WHERE 1=1";
    const params: any[] = [];

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    if (project) {
      query += " AND project = ?";
      params.push(project);
    }

    if (priority) {
      query += " AND priority = ?";
      params.push(priority);
    }

    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const tasks = db.prepare(query).all(...params);

    return c.json({ tasks, limit, offset });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return c.json({ error: "Failed to fetch tasks" }, 500);
  }
});

// GET /api/tasks/:id - Get single task
tasksRouter.get("/:id", async (c) => {
  try {
    const db = getDb();
    const taskId = c.req.param("id");

    const task = db
      .prepare("SELECT * FROM tasks WHERE task_id = ?")
      .get(taskId);

    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }

    return c.json(task);
  } catch (error) {
    console.error("Error fetching task:", error);
    return c.json({ error: "Failed to fetch task" }, 500);
  }
});

// PATCH /api/tasks/:id - Update task
tasksRouter.patch("/:id", async (c) => {
  try {
    const db = getDb();
    const taskId = c.req.param("id");
    const body = await c.req.json();

    const existingTask: any = db
      .prepare("SELECT * FROM tasks WHERE task_id = ?")
      .get(taskId);

    if (!existingTask) {
      return c.json({ error: "Task not found" }, 404);
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (body.title !== undefined) {
      updates.push("title = ?");
      params.push(body.title);
    }
    if (body.description !== undefined) {
      updates.push("description = ?");
      params.push(body.description);
    }
    if (body.priority !== undefined) {
      updates.push("priority = ?");
      params.push(body.priority);
    }
    if (body.status !== undefined) {
      updates.push("status = ?");
      params.push(body.status);
    }

    if (updates.length === 0) {
      return c.json({ error: "No updates provided" }, 400);
    }

    updates.push("updated_at = ?");
    params.push(new Date().toISOString());
    params.push(taskId);

    db.prepare(`UPDATE tasks SET ${updates.join(", ")} WHERE task_id = ?`).run(
      ...params
    );

    const updatedTask = db
      .prepare("SELECT * FROM tasks WHERE task_id = ?")
      .get(taskId);

    // Broadcast to WebSocket clients
    broadcastToClients({
      type: "task",
      action: "updated",
      data: updatedTask,
    });

    return c.json(updatedTask);
  } catch (error) {
    console.error("Error updating task:", error);
    return c.json({ error: "Failed to update task" }, 500);
  }
});

// DELETE /api/tasks/:id - Delete task
tasksRouter.delete("/:id", async (c) => {
  try {
    const db = getDb();
    const taskId = c.req.param("id");

    const existingTask = db
      .prepare("SELECT * FROM tasks WHERE task_id = ?")
      .get(taskId);

    if (!existingTask) {
      return c.json({ error: "Task not found" }, 404);
    }

    db.prepare("DELETE FROM tasks WHERE task_id = ?").run(taskId);

    // Broadcast to WebSocket clients
    broadcastToClients({
      type: "task",
      action: "deleted",
      data: { task_id: taskId },
    });

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting task:", error);
    return c.json({ error: "Failed to delete task" }, 500);
  }
});
