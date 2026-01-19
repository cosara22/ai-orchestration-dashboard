"use client";

import { useState } from "react";
import { Users, Lock, Share2, Cpu, Activity, Network } from "lucide-react";
import { FileLockPanel } from "./FileLockPanel";
import { SharedContextPanel } from "./SharedContextPanel";
import { AgentCapabilityPanel } from "./AgentCapabilityPanel";
import { ConductorPanel } from "./ConductorPanel";
import { OrgChartView } from "./OrgChartView";
import MonitoringDashboard from "./MonitoringDashboard";

type TabId = "monitoring" | "conductor" | "teams" | "locks" | "context" | "capabilities";

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

const tabs: Tab[] = [
  { id: "monitoring", label: "Monitoring", icon: <Activity className="w-4 h-4" /> },
  { id: "conductor", label: "Conductor", icon: <Cpu className="w-4 h-4" /> },
  { id: "teams", label: "Teams", icon: <Network className="w-4 h-4" /> },
  { id: "locks", label: "File Locks", icon: <Lock className="w-4 h-4" /> },
  { id: "context", label: "Shared Context", icon: <Share2 className="w-4 h-4" /> },
  { id: "capabilities", label: "Capabilities", icon: <Users className="w-4 h-4" /> },
];

interface MultiAgentViewProps {
  projectId?: string;
}

export default function MultiAgentView({ projectId }: MultiAgentViewProps) {
  const [activeTab, setActiveTab] = useState<TabId>("monitoring");

  return (
    <div className="space-y-4">
      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors ${
              activeTab === tab.id
                ? "bg-indigo-500 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {tab.icon}
            <span className="text-sm font-medium">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="min-h-[500px]">
        {activeTab === "monitoring" && <MonitoringDashboard />}
        {activeTab === "conductor" && <ConductorPanel projectId={projectId} />}
        {activeTab === "teams" && <OrgChartView />}
        {activeTab === "locks" && <FileLockPanel projectId={projectId} />}
        {activeTab === "context" && <SharedContextPanel projectId={projectId} />}
        {activeTab === "capabilities" && <AgentCapabilityPanel />}
      </div>
    </div>
  );
}
