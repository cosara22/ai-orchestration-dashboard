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

  // CCPM/WBS
  getCCPMProjects: (params?: { status?: string; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set("status", params.status);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.offset) searchParams.set("offset", String(params.offset));
    const query = searchParams.toString();
    return fetchApi<{ projects: CCPMProject[]; total: number; limit: number; offset: number }>(
      `/api/ccpm/projects${query ? `?${query}` : ""}`
    );
  },

  getCCPMProject: (id: string) => fetchApi<CCPMProject & { stats: WBSStats; progress: number }>(`/api/ccpm/projects/${id}`),

  createCCPMProject: (project: {
    name: string;
    description?: string;
    planned_start?: string;
    planned_end?: string;
    project_buffer_ratio?: number;
    feeding_buffer_ratio?: number;
  }) =>
    fetchApi<CCPMProject>("/api/ccpm/projects", {
      method: "POST",
      body: JSON.stringify(project),
    }),

  updateCCPMProject: (id: string, updates: Partial<CCPMProject>) =>
    fetchApi<CCPMProject>(`/api/ccpm/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }),

  deleteCCPMProject: (id: string) =>
    fetchApi<{ success: boolean }>(`/api/ccpm/projects/${id}`, {
      method: "DELETE",
    }),

  getWBS: (projectId: string, flat?: boolean) =>
    fetchApi<{ items: WBSItem[] }>(`/api/ccpm/projects/${projectId}/wbs${flat ? "?flat=true" : ""}`),

  createWBSItem: (projectId: string, item: {
    title: string;
    parent_id?: string;
    type?: string;
    estimated_duration?: number;
    aggressive_duration?: number;
    safe_duration?: number;
    planned_start?: string;
    planned_end?: string;
    assignee?: string;
  }) =>
    fetchApi<WBSItem>(`/api/ccpm/projects/${projectId}/wbs`, {
      method: "POST",
      body: JSON.stringify(item),
    }),

  updateWBSItem: (id: string, updates: Partial<WBSItem>) =>
    fetchApi<WBSItem>(`/api/ccpm/wbs/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }),

  updateWBSSchedule: (id: string, planned_start: string, planned_end: string) =>
    fetchApi<{ success: boolean; item: WBSItem; conflicts: Array<{ wbs_id: string; code: string; title: string; conflict_type: string }> }>(
      `/api/ccpm/wbs/${id}/schedule`,
      {
        method: "PATCH",
        body: JSON.stringify({ planned_start, planned_end }),
      }
    ),

  deleteWBSItem: (id: string) =>
    fetchApi<{ success: boolean }>(`/api/ccpm/wbs/${id}`, {
      method: "DELETE",
    }),

  moveWBSItem: (id: string, data: { new_parent_id?: string | null; new_sort_order?: number }) =>
    fetchApi<WBSItem>(`/api/ccpm/wbs/${id}/move`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getDependencies: (projectId: string) =>
    fetchApi<{ dependencies: WBSDependency[] }>(`/api/ccpm/projects/${projectId}/dependencies`),

  createDependency: (projectId: string, dep: { predecessor_id: string; successor_id: string; type?: string; lag?: number }) =>
    fetchApi<WBSDependency>(`/api/ccpm/projects/${projectId}/dependencies`, {
      method: "POST",
      body: JSON.stringify(dep),
    }),

  deleteDependency: (id: string) =>
    fetchApi<{ success: boolean }>(`/api/ccpm/dependencies/${id}`, {
      method: "DELETE",
    }),

  getCriticalChain: (projectId: string) =>
    fetchApi<{ critical_chain: string[]; critical_items: WBSItem[]; total_duration: number; all_items: number }>(
      `/api/ccpm/projects/${projectId}/critical-chain`
    ),

  getBuffers: (projectId: string) =>
    fetchApi<{
      project_buffer: { size: number; consumed: number; consumed_percent: number; remaining: number };
      progress: { completed_duration: number; total_duration: number; percent: number };
      fever_status: "green" | "yellow" | "red";
      estimates: { safe_total: number; aggressive_total: number; actual_total: number };
    }>(`/api/ccpm/projects/${projectId}/buffers`),

  getBufferTrend: (projectId: string, days?: number) =>
    fetchApi<{ history: BufferHistoryEntry[] }>(`/api/ccpm/projects/${projectId}/buffer-trend${days ? `?days=${days}` : ""}`),

  recordBuffer: (projectId: string) =>
    fetchApi<{ success: boolean; history_id: string }>(`/api/ccpm/projects/${projectId}/record-buffer`, {
      method: "POST",
    }),

  // Document Parser API
  parseDocument: (projectId: string, docPath: string) =>
    fetchApi<ParseResult>("/api/docs/parse", {
      method: "POST",
      body: JSON.stringify({ project_id: projectId, doc_path: docPath }),
    }),

  getDocuments: (projectId: string) =>
    fetchApi<{ documents: ParsedDocument[] }>(`/api/docs/project/${projectId}`),

  getWBSPreview: (docId: string) =>
    fetchApi<{ doc_id: string; doc_type: string; wbs_items: WBSSuggestion[] }>(`/api/docs/${docId}/wbs-preview`),

  applyWBS: (docId: string, selectedItems?: string[]) =>
    fetchApi<{ success: boolean; created_count: number; created_wbs: Array<{ wbs_id: string; code: string; title: string }> }>(
      `/api/docs/${docId}/apply`,
      {
        method: "POST",
        body: JSON.stringify({ selected_items: selectedItems }),
      }
    ),

  scanDocuments: (projectId: string, directory: string) =>
    fetchApi<{ directory: string; found: number; documents: Array<{ path: string; type: string; title: string }> }>(
      "/api/docs/scan",
      {
        method: "POST",
        body: JSON.stringify({ project_id: projectId, directory }),
      }
    ),

  // Milestones API
  getMilestones: (params?: { project_id?: string; status?: string; type?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.project_id) searchParams.set("project_id", params.project_id);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.type) searchParams.set("type", params.type);
    const query = searchParams.toString();
    return fetchApi<{ milestones: Milestone[] }>(`/api/milestones${query ? `?${query}` : ""}`);
  },

  createMilestone: (milestone: {
    project_id: string;
    title: string;
    description?: string;
    type?: string;
    target_date?: string;
    wbs_id?: string;
  }) =>
    fetchApi<Milestone>("/api/milestones", {
      method: "POST",
      body: JSON.stringify(milestone),
    }),

  getMilestone: (id: string) => fetchApi<Milestone & { semantic_records: SemanticRecord[] }>(`/api/milestones/${id}`),

  updateMilestone: (id: string, updates: Partial<Milestone>) =>
    fetchApi<Milestone>(`/api/milestones/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }),

  achieveMilestone: (id: string, data: { evidence?: MilestoneEvidence; lessons_learned?: string; next_actions?: NextAction[] }) =>
    fetchApi<{ milestone: Milestone; report: string }>(`/api/milestones/${id}/achieve`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getMilestoneReport: async (id: string, format: "md" | "json" = "md"): Promise<string> => {
    const apiKey = getApiKey();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["X-API-Key"] = apiKey;
    }
    const response = await fetch(`${API_BASE}/api/milestones/${id}/report?format=${format}`, { headers });
    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }
    if (format === "md") {
      return response.text();
    }
    return response.json();
  },

  deleteMilestone: (id: string) =>
    fetchApi<{ success: boolean }>(`/api/milestones/${id}`, { method: "DELETE" }),

  // Semantic Records API
  getSemanticRecords: (params?: { project_id?: string; record_type?: string; tags?: string; search?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.project_id) searchParams.set("project_id", params.project_id);
    if (params?.record_type) searchParams.set("record_type", params.record_type);
    if (params?.tags) searchParams.set("tags", params.tags);
    if (params?.search) searchParams.set("search", params.search);
    const query = searchParams.toString();
    return fetchApi<{ records: SemanticRecord[] }>(`/api/milestones/semantic/list${query ? `?${query}` : ""}`);
  },

  createSemanticRecord: (record: {
    project_id: string;
    record_type: string;
    title: string;
    content: string;
    milestone_id?: string;
    tags?: string[];
    source_session_id?: string;
  }) =>
    fetchApi<SemanticRecord>("/api/milestones/semantic", {
      method: "POST",
      body: JSON.stringify(record),
    }),

  deleteSemanticRecord: (id: string) =>
    fetchApi<{ success: boolean }>(`/api/milestones/semantic/${id}`, { method: "DELETE" }),

  // Agent Integration API
  getAgentContext: (projectId: string) =>
    fetchApi<{
      project_id: string;
      recent_milestones: Array<{ id: string; title: string; type: string; status: string; achieved_date: string | null }>;
      pending_actions: Array<{ id: string; title: string; priority: string; milestone_id: string; milestone_title: string }>;
      recent_progress: Array<{ id: string; type: string; title: string; created_at: string }>;
      active_wbs_items: WBSItem[];
      summary: { total_milestones: number; achieved: number; pending_actions_count: number; active_wbs_count: number };
    }>(`/api/milestones/agent/context/${projectId}`),

  recordAgentMilestone: (data: {
    session_id?: string;
    project_id: string;
    event_type: "session_end" | "commit" | "task_complete" | "phase_complete";
    title: string;
    description?: string;
    summary?: string;
    files_changed?: string[];
    commits?: string[];
    tools_used?: string[];
    duration_minutes?: number;
    outcome?: "success" | "partial" | "blocked";
    next_steps?: string[];
    lessons_learned?: string;
    tags?: string[];
    wbs_id?: string;
  }) =>
    fetchApi<{ milestone_id: string; record_id: string; status: string; report: string }>(
      "/api/milestones/agent/record",
      { method: "POST", body: JSON.stringify(data) }
    ),

  recordAgentProgress: (data: {
    session_id?: string;
    project_id: string;
    wbs_id?: string;
    progress_type: "task_start" | "task_progress" | "task_complete" | "blocker";
    task_title?: string;
    details?: string;
    percent_complete?: number;
    blockers?: string[];
    tools_used?: string[];
  }) =>
    fetchApi<{ record_id: string; progress_type: string; percent_complete?: number; has_blockers: boolean }>(
      "/api/milestones/agent/progress",
      { method: "POST", body: JSON.stringify(data) }
    ),
};

// CCPM/WBS Types
export interface CCPMProject {
  project_id: string;
  name: string;
  description: string | null;
  status: "planning" | "active" | "completed" | "on_hold";
  project_buffer_ratio: number;
  feeding_buffer_ratio: number;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  project_buffer_days: number | null;
  project_buffer_consumed: number;
  auto_track_sessions: number;
  metadata: Record<string, unknown> | null;
  wbs_count?: number;
  completed_count?: number;
  progress?: number;
  created_at: string;
  updated_at: string;
}

export interface WBSItem {
  wbs_id: string;
  project_id: string;
  parent_id: string | null;
  code: string;
  title: string;
  description: string | null;
  type: "phase" | "milestone" | "task" | "subtask";
  status: "pending" | "in_progress" | "completed" | "blocked";
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
  metadata: Record<string, unknown> | null;
  children?: WBSItem[];
  created_at: string;
  updated_at: string;
}

export interface WBSDependency {
  dependency_id: string;
  predecessor_id: string;
  successor_id: string;
  type: "FS" | "FF" | "SS" | "SF";
  lag: number;
  created_at: string;
}

export interface WBSStats {
  total: number;
  completed: number;
  in_progress: number;
  blocked: number;
  pending: number;
  total_estimated: number;
  total_actual: number;
}

export interface BufferHistoryEntry {
  history_id: string;
  buffer_type: string;
  consumed_percent: number;
  progress_percent: number;
  recorded_at: string;
}

// Document Parser Types
export interface WBSSuggestion {
  code: string;
  title: string;
  type: "phase" | "milestone" | "task" | "subtask";
  description: string;
  estimated_duration?: number;
  parent_code?: string;
  source_doc: string;
  source_section: string;
}

export interface ParsedDocument {
  doc_id: string;
  doc_type: "PRJ" | "REQ" | "DES" | "UNKNOWN";
  doc_path: string;
  doc_hash: string;
  has_mappings: boolean;
  parsed_at: string;
}

export interface ParseResult {
  doc_id: string;
  doc_type: string;
  title: string;
  doc_hash: string;
  is_update: boolean;
  extraction_summary: {
    type: string;
    item_count: number;
  };
  suggested_wbs: WBSSuggestion[];
}

// Milestone Types
export interface Milestone {
  milestone_id: string;
  project_id: string;
  wbs_id: string | null;
  title: string;
  description: string | null;
  type: "checkpoint" | "release" | "review" | "decision";
  status: "pending" | "achieved" | "missed" | "deferred";
  target_date: string | null;
  achieved_date: string | null;
  evidence: MilestoneEvidence | null;
  next_actions: NextAction[] | null;
  lessons_learned: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface MilestoneEvidence {
  commits?: string[];
  sessions?: string[];
  files_changed?: string[];
  test_results?: Record<string, unknown>;
}

export interface NextAction {
  action: string;
  priority: "high" | "medium" | "low";
  assignee?: string;
  due_date?: string;
  context?: string;
}

export interface SemanticRecord {
  record_id: string;
  project_id: string;
  milestone_id: string | null;
  record_type: "decision" | "insight" | "problem" | "solution" | "context" | "achievement";
  title: string;
  content: string;
  tags: string[] | null;
  relations: string[] | null;
  source_session_id: string | null;
  source_event_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}
