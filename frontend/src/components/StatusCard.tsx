"use client";

import { cn } from "@/lib/utils";
import { Activity, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

interface StatusCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  status?: "success" | "warning" | "error" | "info";
  icon?: "activity" | "clock" | "check" | "error" | "alert";
}

const iconMap = {
  activity: Activity,
  clock: Clock,
  check: CheckCircle2,
  error: XCircle,
  alert: AlertCircle,
};

const statusColors = {
  success: "text-green-400 bg-green-400/10 border-green-400/20",
  warning: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  error: "text-red-400 bg-red-400/10 border-red-400/20",
  info: "text-blue-400 bg-blue-400/10 border-blue-400/20",
};

export function StatusCard({
  title,
  value,
  subtitle,
  status = "info",
  icon = "activity",
}: StatusCardProps) {
  const Icon = iconMap[icon];

  return (
    <div
      className={cn(
        "rounded-lg border p-4 transition-colors",
        statusColors[status]
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium opacity-80">{title}</span>
        <Icon className="h-4 w-4 opacity-60" />
      </div>
      <div className="mt-2">
        <span className="text-3xl font-bold">{value}</span>
        {subtitle && (
          <span className="ml-2 text-sm opacity-60">{subtitle}</span>
        )}
      </div>
    </div>
  );
}
