"use client";

import { cn } from "@/lib/utils";
import { Wifi, WifiOff } from "lucide-react";

interface ConnectionStatusProps {
  isConnected: boolean;
  apiStatus?: "ok" | "error" | "unknown";
}

export function ConnectionStatus({ isConnected, apiStatus = "unknown" }: ConnectionStatusProps) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        {isConnected ? (
          <Wifi className="h-4 w-4 text-green-400" />
        ) : (
          <WifiOff className="h-4 w-4 text-red-400" />
        )}
        <span className={cn(
          "text-sm",
          isConnected ? "text-green-400" : "text-red-400"
        )}>
          {isConnected ? "Connected" : "Disconnected"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className={cn(
          "h-2 w-2 rounded-full",
          apiStatus === "ok" ? "bg-green-400" :
          apiStatus === "error" ? "bg-red-400" : "bg-yellow-400"
        )} />
        <span className="text-sm text-theme-secondary">
          API: {apiStatus}
        </span>
      </div>
    </div>
  );
}
