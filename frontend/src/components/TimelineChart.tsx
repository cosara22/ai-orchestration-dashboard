"use client";

import { useEffect, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { api } from "@/lib/api";
import { BarChart3, RefreshCw } from "lucide-react";

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface TimelineData {
  hour: string;
  event_count: number;
}

export function TimelineChart() {
  const [timelineData, setTimelineData] = useState<TimelineData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hours, setHours] = useState(24);

  const fetchTimeline = async () => {
    setIsLoading(true);
    try {
      const res = await api.getTimeline(hours);
      setTimelineData(res.timeline || []);
    } catch (error) {
      console.error("Failed to fetch timeline:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTimeline();
  }, [hours]);

  const chartData = {
    labels: timelineData.map((d) => {
      const date = new Date(d.hour);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }),
    datasets: [
      {
        label: "Events",
        data: timelineData.map((d) => d.event_count),
        fill: true,
        borderColor: "rgb(59, 130, 246)",
        backgroundColor: "rgba(59, 130, 246, 0.1)",
        tension: 0.4,
        pointRadius: 2,
        pointHoverRadius: 5,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        titleColor: "#fff",
        bodyColor: "#fff",
        padding: 12,
        displayColors: false,
      },
    },
    scales: {
      x: {
        grid: {
          color: "rgba(75, 85, 99, 0.3)",
        },
        ticks: {
          color: "#9ca3af",
          maxTicksLimit: 12,
        },
      },
      y: {
        grid: {
          color: "rgba(75, 85, 99, 0.3)",
        },
        ticks: {
          color: "#9ca3af",
          stepSize: 1,
        },
        beginAtZero: true,
      },
    },
  };

  return (
    <div className="rounded-lg border border-gray-800 bg-[#0f0f0f]">
      <div className="border-b border-gray-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-blue-400" />
            <h2 className="font-semibold text-white">Event Timeline</h2>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="px-2 py-1 text-xs bg-gray-900 border border-gray-700 rounded text-gray-200 focus:outline-none focus:border-blue-500"
            >
              <option value={6}>Last 6 hours</option>
              <option value={12}>Last 12 hours</option>
              <option value={24}>Last 24 hours</option>
              <option value={48}>Last 48 hours</option>
            </select>
            <button
              onClick={fetchTimeline}
              className="p-1 hover:bg-gray-800 rounded transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`h-3 w-3 text-gray-400 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>
      <div className="p-4">
        {isLoading && timelineData.length === 0 ? (
          <div className="flex items-center justify-center h-[200px]">
            <RefreshCw className="h-6 w-6 animate-spin text-blue-400" />
          </div>
        ) : timelineData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[200px] text-gray-500">
            <BarChart3 className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">No data available</p>
          </div>
        ) : (
          <div className="h-[200px]">
            <Line data={chartData} options={chartOptions} />
          </div>
        )}
      </div>
    </div>
  );
}
