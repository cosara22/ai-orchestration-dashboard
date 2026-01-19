import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { eventsRouter } from "./routes/events";
import { sessionsRouter } from "./routes/sessions";
import { metricsRouter } from "./routes/metrics";
import { projectsRouter } from "./routes/projects";
import { tasksRouter } from "./routes/tasks";
import { agentsRouter } from "./routes/agents";
import { searchRouter } from "./routes/search";
import { alertsRouter } from "./routes/alerts";
import ccpmRouter from "./routes/ccpm";
import docsRouter from "./routes/docs";
import milestonesRouter from "./routes/milestones";
import { queueRouter } from "./routes/queue";
import { locksRouter } from "./routes/locks";
import { contextRouter } from "./routes/context";
import { conductorRouter } from "./routes/conductor";
import { teamsRouter } from "./routes/teams";
import { wsHandler } from "./ws/handler";
import { authMiddleware, isAuthEnabled } from "./middleware/auth";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: ["http://localhost:3000", "http://localhost:3002", "http://127.0.0.1:3000", "http://127.0.0.1:3002"],
    credentials: true,
  })
);

// Health check (before auth middleware)
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    auth_enabled: isAuthEnabled(),
  });
});

// Auth middleware for API routes
app.use("/api/*", authMiddleware);

// API Routes
app.route("/api/events", eventsRouter);
app.route("/api/sessions", sessionsRouter);
app.route("/api/metrics", metricsRouter);
app.route("/api/projects", projectsRouter);
app.route("/api/tasks", tasksRouter);
app.route("/api/agents", agentsRouter);
app.route("/api/search", searchRouter);
app.route("/api/alerts", alertsRouter);
app.route("/api/ccpm", ccpmRouter);
app.route("/api/docs", docsRouter);
app.route("/api/milestones", milestonesRouter);
app.route("/api/queue", queueRouter);
app.route("/api/locks", locksRouter);
app.route("/api/context", contextRouter);
app.route("/api/conductor", conductorRouter);
app.route("/api/teams", teamsRouter);

// WebSocket upgrade is handled at Bun.serve level

// 404 handler
app.notFound((c) => {
  return c.json({ error: "Not Found" }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error("Server error:", err);
  return c.json({ error: "Internal Server Error" }, 500);
});

const PORT = process.env.PORT || 4000;

console.log(`Starting AOD API Gateway on port ${PORT}...`);

const server = Bun.serve({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    // Handle WebSocket upgrade for /ws path
    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req, {
        data: { id: "", subscribedChannels: new Set(["all"]) },
      });
      if (upgraded) {
        return undefined;
      }
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // Handle regular HTTP requests with Hono
    return app.fetch(req, server);
  },
  websocket: wsHandler,
});

console.log(`AOD API Gateway running at http://localhost:${server.port}`);

export default app;
