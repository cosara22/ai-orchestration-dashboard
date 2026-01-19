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

// Task Queue Types (Phase 15-A)
export interface QueueTask {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  required_capabilities: string[];
  priority: number; // 0=Critical, 1=High, 2=Medium, 3=Low, 4=Background
  status: "pending" | "assigned" | "in_progress" | "completed" | "failed" | "cancelled";
  estimated_minutes: number | null;
  actual_minutes: number | null;
  dependencies: string[];
  assigned_to: string | null;
  assigned_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  retry_count: number;
  metadata: Record<string, any> | null;
  result: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  queue_score?: number;
}

export interface QueueStats {
  by_status: {
    pending: number;
    assigned: number;
    in_progress: number;
    completed: number;
    failed: number;
    cancelled: number;
  };
  by_priority: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    background: number;
  };
  average_completion_minutes: number | null;
  agent_workload: Array<{ assigned_to: string; task_count: number }>;
  recent_failures: Array<{ id: string; title: string; error_message: string; retry_count: number; updated_at: string }>;
}

export interface AgentCapability {
  agent_id: string;
  tag: string;
  proficiency: number;
  category?: string;
  tag_description?: string;
  updated_at: string;
}

export interface CapabilityTag {
  tag: string;
  category: string;
  description: string | null;
}

// Conductor Types (Phase 15-E)
export interface ConductorAgentStatus {
  agent_id: string;
  name: string;
  status: string;
  current_workload: number;
  current_task_id: string | null;
  current_task_title: string | null;
  last_heartbeat: string;
}

export interface ConductorBlockedTask {
  task_id: string;
  title: string;
  blocked_by: string;
  blocked_reason: string;
  assigned_to: string | null;
  agent_name: string | null;
}

export interface ConductorBottleneck {
  type: "agent_overload" | "capability_gap" | "dependency_chain" | "lock_contention" | "queue_stall" | "communication_gap";
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  affected_items: string[];
  suggested_action: string;
  metrics?: Record<string, number>;
}

export interface ConductorRisk {
  type: "deadline" | "quality" | "resource" | "dependency";
  probability: "low" | "medium" | "high";
  impact: "low" | "medium" | "high" | "critical";
  description: string;
  mitigation: string;
}

export interface ConductorProjectStatus {
  project_id: string;
  project_name: string;
  overall_progress: number;
  health: "good" | "warning" | "critical";
  active_agents: ConductorAgentStatus[];
  queued_tasks: number;
  in_progress_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  blocked_tasks: ConductorBlockedTask[];
  bottlenecks: ConductorBottleneck[];
  risks: ConductorRisk[];
  active_locks: number;
  unresolved_conflicts: number;
  recent_contexts: number;
  estimated_completion: string | null;
}

export interface ConductorDecision {
  decision_id: string;
  project_id: string;
  decision_type: string;
  description: string;
  affected_tasks: string[];
  affected_agents: string[];
  metadata: Record<string, any>;
  created_at: string;
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

  // Task Queue API (Phase 15-A)
  getQueueTasks: (params?: { project_id?: string; status?: string; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.project_id) searchParams.set("project_id", params.project_id);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.offset) searchParams.set("offset", String(params.offset));
    const query = searchParams.toString();
    return fetchApi<{ tasks: QueueTask[]; total: number; limit: number; offset: number }>(
      `/api/queue/list${query ? `?${query}` : ""}`
    );
  },

  enqueueTask: (task: {
    project_id: string;
    title: string;
    description?: string;
    required_capabilities?: string[];
    priority?: number;
    estimated_minutes?: number;
    dependencies?: string[];
    metadata?: Record<string, any>;
  }) =>
    fetchApi<{ success: boolean; task: QueueTask }>("/api/queue/enqueue", {
      method: "POST",
      body: JSON.stringify(task),
    }),

  getNextTask: (agentId: string, projectId?: string) => {
    const params = new URLSearchParams({ agent_id: agentId });
    if (projectId) params.set("project_id", projectId);
    return fetchApi<{ task: QueueTask | null; message?: string }>(`/api/queue/next?${params}`);
  },

  assignTask: (taskId: string, agentId: string) =>
    fetchApi<{ success: boolean; task: QueueTask }>(`/api/queue/${taskId}/assign`, {
      method: "POST",
      body: JSON.stringify({ agent_id: agentId }),
    }),

  startTask: (taskId: string) =>
    fetchApi<{ success: boolean; task: QueueTask }>(`/api/queue/${taskId}/start`, {
      method: "POST",
    }),

  completeTask: (taskId: string, result?: Record<string, any>) =>
    fetchApi<{ success: boolean; task: QueueTask }>(`/api/queue/${taskId}/complete`, {
      method: "POST",
      body: JSON.stringify({ result }),
    }),

  failTask: (taskId: string, errorMessage: string) =>
    fetchApi<{ success: boolean; task: QueueTask }>(`/api/queue/${taskId}/fail`, {
      method: "POST",
      body: JSON.stringify({ error_message: errorMessage }),
    }),

  retryTask: (taskId: string) =>
    fetchApi<{ success: boolean; task: QueueTask }>(`/api/queue/${taskId}/retry`, {
      method: "POST",
    }),

  cancelTask: (taskId: string) =>
    fetchApi<{ success: boolean; message: string }>(`/api/queue/${taskId}`, {
      method: "DELETE",
    }),

  getQueueStats: (projectId?: string) => {
    const query = projectId ? `?project_id=${projectId}` : "";
    return fetchApi<QueueStats>(`/api/queue/stats${query}`);
  },

  dispatchTasks: (projectId?: string, max?: number) => {
    const params = new URLSearchParams();
    if (projectId) params.set("project_id", projectId);
    if (max) params.set("max", String(max));
    const query = params.toString();
    return fetchApi<{
      success: boolean;
      assignments: Array<{ task_id: string; title: string; agent_id: string; agent_name: string; priority: number }>;
      skipped: Array<{ task_id: string; title: string; reason: string }>;
      summary: { assigned: number; skipped: number; remaining_pending: number };
    }>(`/api/queue/dispatch${query ? `?${query}` : ""}`, { method: "POST" });
  },

  checkTimeouts: (timeoutMinutes?: number) => {
    const query = timeoutMinutes ? `?timeout_minutes=${timeoutMinutes}` : "";
    return fetchApi<{
      success: boolean;
      timeout_minutes: number;
      processed: Array<{ task_id: string; title: string; action: string; retry_count: number }>;
      total_processed: number;
    }>(`/api/queue/timeout-check${query}`, { method: "POST" });
  },

  // Agent Capability API (Phase 15-A/B)
  getAgentCapabilities: (agentId: string) =>
    fetchApi<{ agent_id: string; agent_name: string; capabilities: AgentCapability[] }>(
      `/api/agents/${agentId}/capabilities`
    ),

  registerCapabilities: (agentId: string, capabilities: Array<{ tag: string; proficiency?: number }>) =>
    fetchApi<{ success: boolean; agent_id: string; capabilities: AgentCapability[] }>(
      `/api/agents/${agentId}/capabilities`,
      { method: "POST", body: JSON.stringify({ capabilities }) }
    ),

  removeCapability: (agentId: string, tag: string) =>
    fetchApi<{ success: boolean }>(`/api/agents/${agentId}/capabilities/${tag}`, {
      method: "DELETE",
    }),

  getAvailableAgents: (params?: { tags?: string[]; max_workload?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.tags?.length) searchParams.set("tags", params.tags.join(","));
    if (params?.max_workload) searchParams.set("max_workload", String(params.max_workload));
    const query = searchParams.toString();
    return fetchApi<{
      available_agents: Array<Agent & { current_workload: number; capabilities: AgentCapability[]; availability_score: number }>;
      total: number;
      filter: { max_workload: number; required_tags: string[] };
    }>(`/api/agents/status/available${query ? `?${query}` : ""}`);
  },

  getCapabilityTags: (category?: string) => {
    const query = category ? `?category=${category}` : "";
    return fetchApi<{ tags: CapabilityTag[]; grouped: Record<string, CapabilityTag[]> }>(
      `/api/agents/capability/tags${query}`
    );
  },

  addCapabilityTag: (tag: string, category: string, description?: string) =>
    fetchApi<{ success: boolean; tag: CapabilityTag }>("/api/agents/capability/tags", {
      method: "POST",
      body: JSON.stringify({ tag, category, description }),
    }),

  matchAgentForTask: (tags: string[], excludeAgents?: string[]) => {
    const params = new URLSearchParams({ tags: tags.join(",") });
    if (excludeAgents?.length) params.set("exclude", excludeAgents.join(","));
    return fetchApi<{
      required_tags: string[];
      candidates: Array<{
        agent_id: string;
        agent_name: string;
        status: string;
        current_workload: number;
        capabilities: AgentCapability[];
        match_score: number;
        final_score: number;
        last_heartbeat: string;
      }>;
      best_match: { agent_id: string; agent_name: string } | null;
      total_candidates: number;
    }>(`/api/agents/match/task?${params}`);
  },

  // File Lock API (Phase 15-C)
  acquireLock: (data: {
    project_id: string;
    file_path: string;
    agent_id: string;
    lock_type?: "exclusive" | "shared";
    reason?: string;
    timeout_minutes?: number;
  }) =>
    fetchApi<{
      success: boolean;
      lock_id?: string;
      file_path: string;
      acquired_at?: string;
      expires_at?: string;
      extended?: boolean;
      error?: string;
      conflict?: {
        lock_id: string;
        locked_by: string;
        agent_name: string;
        lock_type: string;
        acquired_at: string;
        expires_at: string | null;
        reason: string | null;
      };
      suggestion?: string;
    }>("/api/locks/acquire", { method: "POST", body: JSON.stringify(data) }),

  releaseLock: (data: { lock_id?: string; file_path?: string; agent_id: string }) =>
    fetchApi<{ success: boolean; lock_id: string; released_at: string; duration_minutes: number }>(
      "/api/locks/release",
      { method: "POST", body: JSON.stringify(data) }
    ),

  checkLock: (projectId: string, filePath: string, agentId?: string) => {
    const params = new URLSearchParams({ project_id: projectId, file_path: filePath });
    if (agentId) params.set("agent_id", agentId);
    return fetchApi<{
      file_path: string;
      locked: boolean;
      lock_id?: string;
      lock_type?: string;
      locked_by?: string;
      agent_name?: string;
      is_mine?: boolean;
      acquired_at?: string;
      expires_at?: string;
      reason?: string;
    }>(`/api/locks/check?${params}`);
  },

  getLocks: (params?: { project_id?: string; status?: string; agent_id?: string; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.project_id) searchParams.set("project_id", params.project_id);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.agent_id) searchParams.set("agent_id", params.agent_id);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    const query = searchParams.toString();
    return fetchApi<{ locks: FileLock[]; total: number; active: number; released: number; expired: number }>(
      `/api/locks/list${query ? `?${query}` : ""}`
    );
  },

  getAgentLocks: (agentId: string) =>
    fetchApi<{ agent_id: string; locks: FileLock[]; total_locks: number }>(`/api/locks/agent/${agentId}`),

  forceReleaseLock: (lockId: string, reason: string) =>
    fetchApi<{ success: boolean; lock_id: string; force_released_at: string; reason: string }>(
      "/api/locks/force-release",
      { method: "POST", body: JSON.stringify({ lock_id: lockId, reason }) }
    ),

  cleanupLocks: () =>
    fetchApi<{ success: boolean; expired_count: number; cleaned_at: string }>("/api/locks/cleanup", {
      method: "POST",
    }),

  getLockConflicts: (params?: { project_id?: string; status?: string; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.project_id) searchParams.set("project_id", params.project_id);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    const query = searchParams.toString();
    return fetchApi<{ conflicts: LockConflict[]; total: number }>(`/api/locks/conflicts${query ? `?${query}` : ""}`);
  },

  resolveConflict: (conflictId: string, resolutionResult: string) =>
    fetchApi<{ success: boolean; conflict_id: string; status: string }>(
      `/api/locks/conflicts/${conflictId}/resolve`,
      { method: "POST", body: JSON.stringify({ resolution_result: resolutionResult }) }
    ),

  // Shared Context API (Phase 15-D)
  postContext: (data: {
    project_id: string;
    context_type: "decision" | "blocker" | "learning" | "status" | "question" | "answer";
    title: string;
    content: string;
    author_agent_id: string;
    visibility?: "all" | "team" | "specific";
    target_agents?: string[];
    priority?: number;
    tags?: string[];
    related_task_id?: string;
    related_file_paths?: string[];
    expires_at?: string;
  }) =>
    fetchApi<{ success: boolean; context: SharedContext }>("/api/context/post", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getContexts: (params?: {
    project_id?: string;
    type?: string;
    author?: string;
    status?: string;
    priority?: number;
    limit?: number;
    offset?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.project_id) searchParams.set("project_id", params.project_id);
    if (params?.type) searchParams.set("type", params.type);
    if (params?.author) searchParams.set("author", params.author);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.priority) searchParams.set("priority", String(params.priority));
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.offset) searchParams.set("offset", String(params.offset));
    const query = searchParams.toString();
    return fetchApi<{ contexts: SharedContext[]; total: number; limit: number; offset: number }>(
      `/api/context/list${query ? `?${query}` : ""}`
    );
  },

  getContextsForMe: (agentId: string, projectId?: string, since?: string, limit?: number) => {
    const params = new URLSearchParams({ agent_id: agentId });
    if (projectId) params.set("project_id", projectId);
    if (since) params.set("since", since);
    if (limit) params.set("limit", String(limit));
    return fetchApi<{
      agent_id: string;
      contexts: SharedContext[];
      by_type: Record<string, SharedContext[]>;
      total: number;
      blockers: number;
      urgent: number;
    }>(`/api/context/for-me?${params}`);
  },

  getContext: (contextId: string) => fetchApi<SharedContext>(`/api/context/${contextId}`),

  updateContext: (contextId: string, updates: Partial<{ title: string; content: string; priority: number; status: string; tags: string[] }>) =>
    fetchApi<{ success: boolean; context: SharedContext }>(`/api/context/${contextId}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }),

  deleteContext: (contextId: string, hard?: boolean) =>
    fetchApi<{ success: boolean; action: string }>(`/api/context/${contextId}${hard ? "?hard=true" : ""}`, {
      method: "DELETE",
    }),

  acknowledgeContext: (contextId: string, agentId: string) =>
    fetchApi<{ success: boolean; context_id: string; acknowledged_by: string }>(
      `/api/context/${contextId}/acknowledge`,
      { method: "POST", body: JSON.stringify({ agent_id: agentId }) }
    ),

  searchContexts: (query: string, projectId?: string, limit?: number) => {
    const params = new URLSearchParams({ q: query });
    if (projectId) params.set("project_id", projectId);
    if (limit) params.set("limit", String(limit));
    return fetchApi<{ query: string; results: SharedContext[]; total: number }>(`/api/context/search/query?${params}`);
  },

  getContextStats: (projectId?: string) => {
    const query = projectId ? `?project_id=${projectId}` : "";
    return fetchApi<{
      by_type: Record<string, number>;
      by_priority: Record<string, number>;
      recent_24h: number;
      active_blockers: number;
    }>(`/api/context/stats/summary${query}`);
  },

  // Conductor API (Phase 15-E)
  getConductorStatus: (projectId: string) =>
    fetchApi<ConductorProjectStatus>(`/api/conductor/status/${projectId}`),

  getConductorOverview: () =>
    fetchApi<{
      projects: Array<{
        project_id: string;
        name: string;
        status: string;
        agent_count: number;
        progress: number;
        queued_tasks: number;
        in_progress_tasks: number;
        completed_tasks: number;
        blocked_tasks: number;
        health: "good" | "warning" | "critical";
      }>;
      total_active_agents: number;
      total_pending_tasks: number;
      total_active_locks: number;
    }>("/api/conductor/overview"),

  decomposeTasks: (data: {
    project_id: string;
    parent_task_id?: string;
    subtasks: Array<{
      title: string;
      description?: string;
      priority?: number;
      estimated_minutes?: number;
      required_capabilities?: string[];
      dependencies?: string[];
    }>;
    auto_assign?: boolean;
  }) =>
    fetchApi<{
      success: boolean;
      decision_id: string;
      created_tasks: Array<{ task_id: string; title: string; priority: number }>;
    }>("/api/conductor/decompose", { method: "POST", body: JSON.stringify(data) }),

  reallocateTasks: (data: {
    project_id?: string;
    task_ids: string[];
    from_agent_id?: string;
    to_agent_id: string;
    reason?: string;
  }) =>
    fetchApi<{
      success: boolean;
      decision_id: string;
      reallocated_count: number;
      reallocated_tasks: string[];
    }>("/api/conductor/reallocate", { method: "POST", body: JSON.stringify(data) }),

  escalateIssue: (data: {
    project_id: string;
    issue_type: "blocker" | "conflict" | "delay" | "quality";
    description: string;
    affected_tasks?: string[];
    affected_agents?: string[];
    severity?: "low" | "medium" | "high" | "critical";
    suggested_actions?: string[];
  }) =>
    fetchApi<{ success: boolean; escalation_id: string; alert_id: string }>(
      "/api/conductor/escalate",
      { method: "POST", body: JSON.stringify(data) }
    ),

  requestIntervention: (data: {
    project_id: string;
    request_type: string;
    description: string;
    urgency?: "normal" | "urgent" | "critical";
    context?: Record<string, any>;
    requester_agent_id?: string;
  }) =>
    fetchApi<{ success: boolean; intervention_id: string; alert_id: string }>(
      "/api/conductor/request-intervention",
      { method: "POST", body: JSON.stringify(data) }
    ),

  getConductorDecisions: (params?: {
    project_id?: string;
    type?: string;
    limit?: number;
    offset?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.project_id) searchParams.set("project_id", params.project_id);
    if (params?.type) searchParams.set("type", params.type);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.offset) searchParams.set("offset", String(params.offset));
    const query = searchParams.toString();
    return fetchApi<{
      decisions: ConductorDecision[];
      total: number;
      limit: number;
      offset: number;
    }>(`/api/conductor/decisions${query ? `?${query}` : ""}`);
  },

  overrideDecision: (data: {
    decision_id: string;
    override_action: string;
    reason?: string;
    operator?: string;
  }) =>
    fetchApi<{ success: boolean; override_id: string }>("/api/conductor/override", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Teams API (Phase 15-F)
  getTeams: (params?: { project_id?: string; status?: string; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.project_id) searchParams.set("project_id", params.project_id);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.offset) searchParams.set("offset", String(params.offset));
    const query = searchParams.toString();
    return fetchApi<{ teams: Team[]; total: number; limit: number; offset: number }>(
      `/api/teams${query ? `?${query}` : ""}`
    );
  },

  createTeam: (data: {
    name: string;
    description?: string;
    project_id?: string;
    color?: string;
    lead_agent_id?: string;
    max_members?: number;
    metadata?: Record<string, any>;
  }) =>
    fetchApi<{ success: boolean; team: Team }>("/api/teams", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getTeam: (teamId: string) => fetchApi<TeamWithMembers>(`/api/teams/${teamId}`),

  updateTeam: (teamId: string, updates: Partial<{
    name: string;
    description: string;
    project_id: string;
    color: string;
    lead_agent_id: string;
    max_members: number;
    status: string;
    metadata: Record<string, any>;
  }>) =>
    fetchApi<{ success: boolean; team: Team }>(`/api/teams/${teamId}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }),

  deleteTeam: (teamId: string) =>
    fetchApi<{ success: boolean; deleted: string }>(`/api/teams/${teamId}`, {
      method: "DELETE",
    }),

  getTeamMembers: (teamId: string) =>
    fetchApi<{ team_id: string; members: TeamMember[]; total: number }>(`/api/teams/${teamId}/members`),

  addTeamMember: (teamId: string, agentId: string, role?: string) =>
    fetchApi<{ success: boolean; team_id: string; agent_id: string; role: string }>(
      `/api/teams/${teamId}/members`,
      { method: "POST", body: JSON.stringify({ agent_id: agentId, role }) }
    ),

  removeTeamMember: (teamId: string, agentId: string) =>
    fetchApi<{ success: boolean; team_id: string; agent_id: string }>(
      `/api/teams/${teamId}/members/${agentId}`,
      { method: "DELETE" }
    ),

  updateTeamMemberRole: (teamId: string, agentId: string, role: string) =>
    fetchApi<{ success: boolean; team_id: string; agent_id: string; role: string }>(
      `/api/teams/${teamId}/members/${agentId}`,
      { method: "PATCH", body: JSON.stringify({ role }) }
    ),

  getTeamsOverview: () =>
    fetchApi<{
      teams: TeamWithStats[];
      summary: {
        total_teams: number;
        total_agents: number;
        assigned_agents: number;
        unassigned_agents: number;
      };
    }>("/api/teams/overview/all"),
};

// Team Types (Phase 15-F)
export interface Team {
  id: number;
  team_id: string;
  name: string;
  description: string | null;
  project_id: string | null;
  color: string;
  lead_agent_id: string | null;
  max_members: number;
  status: string;
  metadata: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  id: number;
  team_id: string;
  agent_id: string;
  role: string;
  joined_at: string;
  agent_name?: string;
  agent_status?: string;
  agent_type?: string;
  last_heartbeat?: string;
  current_workload?: number;
}

export interface TeamWithMembers extends Team {
  members: TeamMember[];
  member_count: number;
  lead_name?: string;
  stats?: {
    active_agents: number;
    idle_agents: number;
    tasks?: {
      total: number;
      completed: number;
      in_progress: number;
      pending: number;
    };
  };
}

export interface TeamWithStats extends Team {
  member_count: number;
  lead_name?: string;
  completed_tasks: number;
  in_progress_tasks: number;
  project_name?: string;
}

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

// File Lock Types (Phase 15-C)
export interface FileLock {
  lock_id: string;
  project_id: string;
  file_path: string;
  agent_id: string;
  agent_name?: string;
  lock_type: "exclusive" | "shared";
  reason: string | null;
  acquired_at: string;
  expires_at: string | null;
  released_at: string | null;
  status: "active" | "released" | "expired" | "force_released";
  is_expired?: boolean;
}

export interface LockConflict {
  conflict_id: string;
  project_id: string;
  conflict_type: string;
  involved_agents: string[];
  involved_resources: Record<string, unknown>;
  description: string | null;
  resolution_strategy: string | null;
  resolution_result: string | null;
  detected_at: string;
  resolved_at: string | null;
  status: "detected" | "resolved";
}

// Shared Context Types (Phase 15-D)
export interface SharedContext {
  context_id: string;
  project_id: string;
  context_type: "decision" | "blocker" | "learning" | "status" | "question" | "answer";
  context_type_label?: string;
  title: string;
  content: string;
  author_agent_id: string;
  author_name?: string;
  visibility: "all" | "team" | "specific";
  priority: number;
  priority_label?: string;
  tags: string[];
  related_task_id: string | null;
  related_file_paths: string[];
  expires_at: string | null;
  status: "active" | "archived" | "expired";
  created_at: string;
  updated_at: string;
  is_mine?: boolean;
}
