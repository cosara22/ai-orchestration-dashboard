"use client";

import { useEffect, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { Clock, RefreshCw } from "lucide-react";
import { useTheme } from "./ThemeProvider";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface HourlyData {
  hour: number;
  events: number;
  tasks: number;
  tools: number;
  total: number;
}

interface HourlyActivityResponse {
  days: number;
  hourly_activity: HourlyData[];
  summary: {
    total_events: number;
    total_tasks: number;
    total_tools: number;
    peak_hour: number;
  };
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export function HourlyActivityChart() {
  const { theme } = useTheme();
  const [data, setData] = useState<HourlyActivityResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [error, setError] = useState<string | null>(null);

  const isLight = theme === "light";

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/metrics/hourly-activity?days=${days}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError("Failed to load hourly activity data");
      console.error("Failed to fetch hourly activity:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [days]);

  const formatHour = (hour: number) => {
    return `${hour.toString().padStart(2, "0")}:00`;
  };

  const chartData = {
    labels: Array.from({ length: 24 }, (_, i) => formatHour(i)),
    datasets: [
      {
        label: "Events",
        data: data?.hourly_activity.map((h) => h.events) || [],
        backgroundColor: isLight ? "rgba(59, 130, 246, 0.7)" : "rgba(96, 165, 250, 0.7)",
        borderColor: isLight ? "rgb(59, 130, 246)" : "rgb(96, 165, 250)",
        borderWidth: 1,
        borderRadius: 2,
      },
      {
        label: "Tasks",
        data: data?.hourly_activity.map((h) => h.tasks) || [],
        backgroundColor: isLight ? "rgba(34, 197, 94, 0.7)" : "rgba(74, 222, 128, 0.7)",
        borderColor: isLight ? "rgb(34, 197, 94)" : "rgb(74, 222, 128)",
        borderWidth: 1,
        borderRadius: 2,
      },
      {
        label: "Tools",
        data: data?.hourly_activity.map((h) => h.tools) || [],
        backgroundColor: isLight ? "rgba(168, 85, 247, 0.7)" : "rgba(192, 132, 252, 0.7)",
        borderColor: isLight ? "rgb(168, 85, 247)" : "rgb(192, 132, 252)",
        borderWidth: 1,
        borderRadius: 2,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "index" as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: "top" as const,
        labels: {
          color: isLight ? "#37352f" : "rgba(255, 255, 255, 0.8)",
          boxWidth: 12,
          padding: 15,
        },
      },
      tooltip: {
        backgroundColor: isLight ? "#ffffff" : "#262626",
        titleColor: isLight ? "#37352f" : "rgba(255, 255, 255, 0.9)",
        bodyColor: isLight ? "#37352f" : "rgba(255, 255, 255, 0.9)",
        borderColor: isLight ? "#e9e9e7" : "#3d3d3d",
        borderWidth: 1,
        padding: 12,
        callbacks: {
          title: (items: any[]) => {
            if (items.length > 0) {
              const hour = items[0].dataIndex;
              return `${formatHour(hour)} - ${formatHour((hour + 1) % 24)}`;
            }
            return "";
          },
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        grid: {
          color: isLight ? "rgba(55, 53, 47, 0.08)" : "rgba(255, 255, 255, 0.08)",
        },
        ticks: {
          color: isLight ? "#787774" : "rgba(255, 255, 255, 0.6)",
          maxRotation: 0,
          callback: function(value: any, index: number) {
            return index % 3 === 0 ? formatHour(index) : "";
          },
        },
      },
      y: {
        stacked: true,
        grid: {
          color: isLight ? "rgba(55, 53, 47, 0.08)" : "rgba(255, 255, 255, 0.08)",
        },
        ticks: {
          color: isLight ? "#787774" : "rgba(255, 255, 255, 0.6)",
          stepSize: 1,
        },
        beginAtZero: true,
      },
    },
  };

  return (
    <div className="rounded-lg border border-theme bg-theme-card">
      <div className="border-b border-theme px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-purple-400" />
            <h2 className="font-semibold text-theme-primary">Hourly Activity</h2>
            {data?.summary && (
              <span className="text-xs text-theme-secondary ml-2">
                Peak: {formatHour(data.summary.peak_hour)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="px-2 py-1 text-xs bg-theme-primary border border-theme rounded text-theme-primary focus:outline-none focus:border-purple-500"
            >
              <option value={1}>Last 1 day</option>
              <option value={3}>Last 3 days</option>
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
            </select>
            <button
              onClick={fetchData}
              className="p-1 hover:bg-theme-card rounded transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`h-3 w-3 text-theme-secondary ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>
      <div className="p-4">
        {isLoading && !data ? (
          <div className="flex items-center justify-center h-[250px]">
            <RefreshCw className="h-6 w-6 animate-spin text-purple-400" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-[250px] text-theme-secondary">
            <Clock className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">{error}</p>
          </div>
        ) : !data || data.hourly_activity.every((h) => h.total === 0) ? (
          <div className="flex flex-col items-center justify-center h-[250px] text-theme-secondary">
            <Clock className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">No activity data available</p>
          </div>
        ) : (
          <div className="h-[250px]">
            <Bar data={chartData} options={chartOptions} />
          </div>
        )}
        {data?.summary && (
          <div className="mt-3 pt-3 border-t border-theme grid grid-cols-3 gap-4 text-center text-xs">
            <div>
              <div className="text-blue-500 font-medium">{data.summary.total_events}</div>
              <div className="text-theme-secondary">Events</div>
            </div>
            <div>
              <div className="text-green-500 font-medium">{data.summary.total_tasks}</div>
              <div className="text-theme-secondary">Tasks</div>
            </div>
            <div>
              <div className="text-purple-500 font-medium">{data.summary.total_tools}</div>
              <div className="text-theme-secondary">Tools</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
