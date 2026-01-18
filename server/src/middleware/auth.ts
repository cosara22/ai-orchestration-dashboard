import { Context, Next } from "hono";

const API_KEY = process.env.AOD_API_KEY || "";

export async function authMiddleware(c: Context, next: Next) {
  // Skip auth if no API key is configured (development mode)
  if (!API_KEY) {
    return next();
  }

  // Allow health check without auth
  if (c.req.path === "/health") {
    return next();
  }

  // Check Authorization header
  const authHeader = c.req.header("Authorization");

  if (!authHeader) {
    return c.json({ error: "Authorization header required" }, 401);
  }

  // Support both "Bearer <token>" and raw token
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  if (token !== API_KEY) {
    return c.json({ error: "Invalid API key" }, 401);
  }

  return next();
}

export function isAuthEnabled(): boolean {
  return !!API_KEY;
}
