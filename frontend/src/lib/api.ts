const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

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
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
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

export const api = {
  // Events
  getEvents: (params?: { limit?: number; offset?: number; event_type?: string; project?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.offset) searchParams.set("offset", String(params.offset));
    if (params?.event_type) searchParams.set("event_type", params.event_type);
    if (params?.project) searchParams.set("project", params.project);
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
};
