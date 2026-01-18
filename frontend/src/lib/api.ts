const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// API Key management
const API_KEY_STORAGE_KEY = "aod_api_key";

export function getApiKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(API_KEY_STORAGE_KEY);
}

export function setApiKey(key: string | null): void {
  if (typeof window === "undefined") return;
  if (key) {
    localStorage.setItem(API_KEY_STORAGE_KEY, key);
  } else {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
  }
}

export interface Event {
  id: number;
  event_id: string;
  event_type: string;
  session_id: string | null;
  timestamp: string;
  payload: Record<string, any>;
  created_at: string;
}

export interface Session {
  id: number;
  session_id: string;
  start_time: string;
  end_time: string | null;
  status: "active" | "completed" | "failed";
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface MetricsSummary {
  sessions: {
    total: number;
    active: number;
    completed: number;
    failed: number;
  };
  events: {
    total: number;
    recent_by_type: Array<{ event_type: string; count: number }>;
  };
  tasks: {
    total: number;
    pending: number;
    in_progress: number;
    completed: number;
  };
  tools: {
    recent_usage: Array<{ tool_name: string; count: number }>;
  };
  timestamp: string;
}

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const apiKey = getApiKey();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      ...headers,
      ...options?.headers,
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Unauthorized: Invalid or missing API key");
    }
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export interface Project {
  name: string;
  event_count: number;
  session_count: number;
  last_activity: string | null;
}

export interface Task {
  task_id: string;
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high";
  project: string | null;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  created_at: string;
  updated_at: string;
}

export interface Agent {
  agent_id: string;
  name: string;
  type: string;
  status: "active" | "idle" | "error";
  current_task_id: string | null;
  state: Record<string, any>;
  metrics: {
    tasks_completed?: number;
    tasks_failed?: number;
    error_rate?: number;
    avg_duration?: number;
  };
  last_heartbeat: string;
  created_at: string;
  updated_at: string;
}

export interface AgentCounts {
  active: number;
  idle: number;
  error: number;
  total: number;
}

export interface AlertCondition {
  field: string;
  operator: "gt" | "lt" | "eq" | "ne" | "gte" | "lte" | "contains";
  value: string | number;
}

export interface Alert {
  alert_id: string;
  name: string;
  description: string | null;
  type: "threshold" | "pattern" | "anomaly";
  target: "sessions" | "events" | "tasks" | "agents";
  condition: AlertCondition;
  severity: "info" | "warning" | "critical";
  enabled: boolean;
  cooldown_minutes: number;
  last_triggered: string | null;
  trigger_count: number;
  created_at: string;
  updated_at: string;
}

export interface AlertCounts {
  total: number;
  enabled: number;
  critical: number;
  warning: number;
  info: number;
}

export interface AlertHistory {
  id: number;
  alert_id: string;
  triggered_at: string;
  resolved_at: string | null;
  status: "active" | "acknowledged" | "resolved";
  details: Record<string, any>;
  alert_name?: string;
  severity?: string;
  target?: string;
}

export const api = {
  // Events
  getEvents: (params?: { limit?: number; offset?: number; event_type?: string; project?: string; session_id?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.offset) searchParams.set("offset", String(params.offset));
    if (params?.event_type) searchParams.set("event_type", params.event_type);
    if (params?.project) searchParams.set("project", params.project);
    if (params?.session_id) searchParams.set("session_id", params.session_id);
    const query = searchParams.toString();
    return fetchApi<{ events: Event[]; limit: number; offset: number }>(
      `/api/events${query ? `?${query}` : ""}`
    );
  },

  // Sessions
  getSessions: (params?: { limit?: number; status?: string; project?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.status) searchParams.set("status", params.status);
    if (params?.project) searchParams.set("project", params.project);
    const query = searchParams.toString();
    return fetchApi<{ sessions: Session[]; limit: number; offset: number }>(
      `/api/sessions${query ? `?${query}` : ""}`
    );
  },

  // Projects
  getProjects: () => fetchApi<{ projects: Project[] }>("/api/projects"),

  getSession: (id: string) => fetchApi<Session>(`/api/sessions/${id}`),

  // Metrics
  getMetricsSummary: () => fetchApi<MetricsSummary>("/api/metrics/summary"),

  getTimeline: (hours?: number) =>
    fetchApi<{ timeline: Array<{ hour: string; event_count: number }>; hours: number }>(
      `/api/metrics/timeline${hours ? `?hours=${hours}` : ""}`
    ),

  // Health
  getHealth: () => fetchApi<{ status: string; timestamp: string }>("/health"),

  // Tasks
  getTasks: (params?: { limit?: number; status?: string; project?: string; priority?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.status) searchParams.set("status", params.status);
    if (params?.project) searchParams.set("project", params.project);
    if (params?.priority) searchParams.set("priority", params.priority);
    const query = searchParams.toString();
    return fetchApi<{ tasks: Task[]; limit: number; offset: number }>(
      `/api/tasks${query ? `?${query}` : ""}`
    );
  },

  createTask: (task: { title: string; description?: string; priority?: string; project?: string }) =>
    fetchApi<{ success: boolean; task: Task }>("/api/tasks", {
      method: "POST",
      body: JSON.stringify(task),
    }),

  updateTask: (id: string, updates: { title?: string; description?: string; priority?: string; status?: string }) =>
    fetchApi<Task>(`/api/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }),

  deleteTask: (id: string) =>
    fetchApi<{ success: boolean }>(`/api/tasks/${id}`, {
      method: "DELETE",
    }),

  // Agents
  getAgents: (params?: { limit?: number; status?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.status) searchParams.set("status", params.status);
    const query = searchParams.toString();
    return fetchApi<{ agents: Agent[]; counts: AgentCounts; limit: number; offset: number }>(
      `/api/agents${query ? `?${query}` : ""}`
    );
  },

  getAgent: (id: string) => fetchApi<Agent>(`/api/agents/${id}`),

  createAgent: (agent: { name: string; type?: string }) =>
    fetchApi<{ success: boolean; agent: Agent }>("/api/agents", {
      method: "POST",
      body: JSON.stringify(agent),
    }),

  updateAgent: (id: string, updates: { name?: string; status?: string; current_task_id?: string | null; state?: Record<string, any>; metrics?: Record<string, any> }) =>
    fetchApi<{ success: boolean; agent: Agent }>(`/api/agents/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }),

  deleteAgent: (id: string) =>
    fetchApi<{ success: boolean }>(`/api/agents/${id}`, {
      method: "DELETE",
    }),

  heartbeatAgent: (id: string) =>
    fetchApi<{ success: boolean; last_heartbeat: string }>(`/api/agents/${id}/heartbeat`, {
      method: "POST",
    }),

  // Search
  search: (params: { q: string; type?: "events" | "sessions" | "tasks" | "all"; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    searchParams.set("q", params.q);
    if (params.type) searchParams.set("type", params.type);
    if (params.limit) searchParams.set("limit", String(params.limit));
    if (params.offset) searchParams.set("offset", String(params.offset));
    return fetchApi<{
      query: string;
      results: {
        events: Array<Event & { _type: "event" }>;
        sessions: Array<Session & { _type: "session" }>;
        tasks: Array<Task & { _type: "task" }>;
      };
      total: { events: number; sessions: number; tasks: number };
      limit: number;
      offset: number;
    }>(`/api/search?${searchParams.toString()}`);
  },

  searchEvents: (params: {
    q?: string;
    event_type?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
    offset?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params.q) searchParams.set("q", params.q);
    if (params.event_type) searchParams.set("event_type", params.event_type);
    if (params.start_date) searchParams.set("start_date", params.start_date);
    if (params.end_date) searchParams.set("end_date", params.end_date);
    if (params.limit) searchParams.set("limit", String(params.limit));
    if (params.offset) searchParams.set("offset", String(params.offset));
    return fetchApi<{
      events: Event[];
      total: number;
      limit: number;
      offset: number;
    }>(`/api/search/events?${searchParams.toString()}`);
  },

  // Alerts
  getAlerts: (params?: { enabled?: boolean; severity?: string; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.enabled !== undefined) searchParams.set("enabled", String(params.enabled));
    if (params?.severity) searchParams.set("severity", params.severity);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    const query = searchParams.toString();
    return fetchApi<{ alerts: Alert[]; counts: AlertCounts; limit: number; offset: number }>(
      `/api/alerts${query ? `?${query}` : ""}`
    );
  },

  getAlert: (id: string) => fetchApi<Alert>(`/api/alerts/${id}`),

  createAlert: (alert: {
    name: string;
    description?: string;
    type: "threshold" | "pattern" | "anomaly";
    target: "sessions" | "events" | "tasks" | "agents";
    condition: AlertCondition;
    severity?: "info" | "warning" | "critical";
    cooldown_minutes?: number;
  }) =>
    fetchApi<{ success: boolean; alert: Alert }>("/api/alerts", {
      method: "POST",
      body: JSON.stringify(alert),
    }),

  updateAlert: (id: string, updates: Partial<{
    name: string;
    description: string;
    type: string;
    target: string;
    condition: AlertCondition;
    severity: string;
    enabled: boolean;
    cooldown_minutes: number;
  }>) =>
    fetchApi<{ success: boolean; alert: Alert }>(`/api/alerts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }),

  deleteAlert: (id: string) =>
    fetchApi<{ success: boolean }>(`/api/alerts/${id}`, {
      method: "DELETE",
    }),

  testAlert: (id: string) =>
    fetchApi<{ success: boolean; triggered_at: string }>(`/api/alerts/${id}/test`, {
      method: "POST",
    }),

  getAlertHistory: (id: string, params?: { limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", String(params.limit));
    const query = searchParams.toString();
    return fetchApi<{ history: AlertHistory[]; limit: number; offset: number }>(
      `/api/alerts/${id}/history${query ? `?${query}` : ""}`
    );
  },

  getActiveAlerts: (limit?: number) =>
    fetchApi<{ active_alerts: AlertHistory[] }>(
      `/api/alerts/history/active${limit ? `?limit=${limit}` : ""}`
    ),

  acknowledgeAlert: (historyId: number) =>
    fetchApi<{ success: boolean }>(`/api/alerts/history/${historyId}/acknowledge`, {
      method: "PATCH",
    }),

  resolveAlert: (historyId: number) =>
    fetchApi<{ success: boolean; resolved_at: string }>(`/api/alerts/history/${historyId}/resolve`, {
      method: "PATCH",
    }),
};
