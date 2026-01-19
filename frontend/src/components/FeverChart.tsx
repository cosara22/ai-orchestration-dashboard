"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import { api, BufferHistoryEntry } from "@/lib/api";
import { TrendingUp, RefreshCw } from "lucide-react";

interface FeverChartProps {
  projectId: string;
  onRefresh?: () => void;
}

export function FeverChart({ projectId, onRefresh }: FeverChartProps) {
  const [history, setHistory] = useState<BufferHistoryEntry[]>([]);
  const [currentPoint, setCurrentPoint] = useState<{ progress: number; buffer: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [trendData, bufferData] = await Promise.all([
        api.getBufferTrend(projectId, 30),
        api.getBuffers(projectId),
      ]);

      setHistory(trendData.history);
      setCurrentPoint({
        progress: bufferData.progress.percent,
        buffer: bufferData.project_buffer.consumed_percent,
      });
    } catch (error) {
      console.error("Failed to fetch fever chart data:", error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRecordBuffer = async () => {
    try {
      await api.recordBuffer(projectId);
      fetchData();
      onRefresh?.();
    } catch (error) {
      console.error("Failed to record buffer:", error);
    }
  };

  // Prepare chart data
  const chartData = [
    ...history.map((h) => ({
      progress: h.progress_percent,
      buffer: h.consumed_percent,
      date: new Date(h.recorded_at).toLocaleDateString(),
    })),
    ...(currentPoint
      ? [{ progress: currentPoint.progress, buffer: currentPoint.buffer, date: "Current", isCurrent: true }]
      : []),
  ];

  return (
    <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-primary)] p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-orange-400" />
          <h3 className="font-semibold text-[var(--text-primary)]">Fever Chart</h3>
        </div>
        <button
          onClick={handleRecordBuffer}
          disabled={loading}
          className="flex items-center gap-1 px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          Record
        </button>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />

            {/* Green Zone */}
            <ReferenceArea
              x1={0}
              x2={100}
              y1={0}
              y2={50}
              fill="#22c55e"
              fillOpacity={0.1}
            />

            {/* Yellow Zone */}
            <ReferenceArea
              x1={0}
              x2={100}
              y1={50}
              y2={100}
              fill="#eab308"
              fillOpacity={0.1}
            />

            {/* Red Zone - above the diagonal */}
            <ReferenceArea
              x1={0}
              x2={100}
              y1={100}
              y2={150}
              fill="#ef4444"
              fillOpacity={0.1}
            />

            {/* Diagonal reference line (buffer = progress) */}
            <ReferenceLine
              segment={[
                { x: 0, y: 0 },
                { x: 100, y: 100 },
              ]}
              stroke="#ef4444"
              strokeDasharray="5 5"
              label={{ value: "Critical", fill: "#ef4444", fontSize: 10 }}
            />

            {/* 50% buffer line */}
            <ReferenceLine
              segment={[
                { x: 0, y: 0 },
                { x: 100, y: 50 },
              ]}
              stroke="#eab308"
              strokeDasharray="3 3"
              label={{ value: "Warning", fill: "#eab308", fontSize: 10 }}
            />

            <XAxis
              type="number"
              dataKey="progress"
              name="Progress"
              unit="%"
              domain={[0, 100]}
              tick={{ fill: "var(--text-secondary)", fontSize: 10 }}
              label={{
                value: "Progress %",
                position: "bottom",
                fill: "var(--text-secondary)",
                fontSize: 11,
              }}
            />
            <YAxis
              type="number"
              dataKey="buffer"
              name="Buffer Consumed"
              unit="%"
              domain={[0, 150]}
              tick={{ fill: "var(--text-secondary)", fontSize: 10 }}
              label={{
                value: "Buffer %",
                angle: -90,
                position: "left",
                fill: "var(--text-secondary)",
                fontSize: 11,
              }}
            />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              contentStyle={{
                backgroundColor: "var(--bg-secondary)",
                border: "1px solid var(--border-primary)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              formatter={(value: number, name: string) => [
                `${value.toFixed(1)}%`,
                name === "progress" ? "Progress" : "Buffer Consumed",
              ]}
              labelFormatter={(label) => `Date: ${label}`}
            />
            <Scatter
              name="History"
              data={chartData.filter((d) => !("isCurrent" in d))}
              fill="#8b5cf6"
              opacity={0.6}
            />
            <Scatter
              name="Current"
              data={chartData.filter((d) => "isCurrent" in d)}
              fill="#f97316"
              shape="star"
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-2 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-green-500/30 border border-green-500" />
          <span className="text-[var(--text-secondary)]">Safe</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-yellow-500/30 border border-yellow-500" />
          <span className="text-[var(--text-secondary)]">Watch</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-red-500/30 border border-red-500" />
          <span className="text-[var(--text-secondary)]">Act Now</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-orange-500" />
          <span className="text-[var(--text-secondary)]">Current</span>
        </div>
      </div>
    </div>
  );
}
