import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { eventsRouter } from "./routes/events";
import { sessionsRouter } from "./routes/sessions";
import { metricsRouter } from "./routes/metrics";
import { wsHandler } from "./ws/handler";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    credentials: true,
  })
);

// Health check
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

// API Routes
app.route("/api/events", eventsRouter);
app.route("/api/sessions", sessionsRouter);
app.route("/api/metrics", metricsRouter);

// WebSocket upgrade handler
app.get("/ws", (c) => {
  const upgradeHeader = c.req.header("Upgrade");
  if (upgradeHeader !== "websocket") {
    return c.text("Expected WebSocket", 426);
  }
  // WebSocket handling is done at server level
  return c.text("WebSocket endpoint", 200);
});

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
  fetch: app.fetch,
  websocket: wsHandler,
});

console.log(`AOD API Gateway running at http://localhost:${server.port}`);

export default app;
