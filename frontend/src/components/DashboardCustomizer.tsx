"use client";

import { useState, useEffect } from "react";
import { Modal } from "./Modal";
import { GripVertical, Eye, EyeOff, RotateCcw, Save } from "lucide-react";

export interface PanelConfig {
  id: string;
  name: string;
  visible: boolean;
  order: number;
}

const DEFAULT_PANELS: PanelConfig[] = [
  { id: "metrics", name: "Metrics Cards", visible: true, order: 0 },
  { id: "timeline", name: "Timeline Chart", visible: true, order: 1 },
  { id: "events", name: "Recent Events", visible: true, order: 2 },
  { id: "sessions", name: "Sessions", visible: true, order: 3 },
  { id: "tasks", name: "Tasks", visible: true, order: 4 },
  { id: "agents", name: "Agents", visible: true, order: 5 },
  { id: "taskQueue", name: "Task Queue", visible: true, order: 6 },
  { id: "alerts", name: "Alerts", visible: true, order: 7 },
  { id: "ccpm", name: "CCPM / WBS", visible: true, order: 8 },
];

const STORAGE_KEY = "aod-panel-config";

export function loadPanelConfig(): PanelConfig[] {
  if (typeof window === "undefined") return DEFAULT_PANELS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge with defaults to handle new panels
      const merged = DEFAULT_PANELS.map((defaultPanel) => {
        const savedPanel = parsed.find((p: PanelConfig) => p.id === defaultPanel.id);
        return savedPanel ? { ...defaultPanel, ...savedPanel } : defaultPanel;
      });
      return merged.sort((a, b) => a.order - b.order);
    }
  } catch (e) {
    console.error("Failed to load panel config:", e);
  }
  return DEFAULT_PANELS;
}

export function savePanelConfig(config: PanelConfig[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error("Failed to save panel config:", e);
  }
}

interface DashboardCustomizerProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: PanelConfig[]) => void;
  currentConfig: PanelConfig[];
}

export function DashboardCustomizer({
  isOpen,
  onClose,
  onSave,
  currentConfig,
}: DashboardCustomizerProps) {
  const [panels, setPanels] = useState<PanelConfig[]>(currentConfig);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPanels([...currentConfig]);
    }
  }, [isOpen, currentConfig]);

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newPanels = [...panels];
    const draggedPanel = newPanels[draggedIndex];
    newPanels.splice(draggedIndex, 1);
    newPanels.splice(index, 0, draggedPanel);

    // Update order values
    newPanels.forEach((panel, i) => {
      panel.order = i;
    });

    setPanels(newPanels);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const toggleVisibility = (id: string) => {
    setPanels((prev) =>
      prev.map((p) => (p.id === id ? { ...p, visible: !p.visible } : p))
    );
  };

  const handleReset = () => {
    setPanels([...DEFAULT_PANELS]);
  };

  const handleSave = () => {
    savePanelConfig(panels);
    onSave(panels);
    onClose();
  };

  const movePanel = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= panels.length) return;

    const newPanels = [...panels];
    [newPanels[index], newPanels[newIndex]] = [newPanels[newIndex], newPanels[index]];
    newPanels.forEach((panel, i) => {
      panel.order = i;
    });
    setPanels(newPanels);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Customize Dashboard">
      <div className="space-y-4">
        <p className="text-sm text-theme-secondary">
          Drag panels to reorder or toggle visibility. Changes are saved to your browser.
        </p>

        <div className="space-y-2">
          {panels.map((panel, index) => (
            <div
              key={panel.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={`
                flex items-center gap-3 p-3 rounded-lg border border-theme
                ${draggedIndex === index ? "bg-blue-500/20 border-blue-500" : "bg-theme-primary"}
                ${!panel.visible ? "opacity-50" : ""}
                cursor-move transition-colors
              `}
            >
              <GripVertical className="h-4 w-4 text-theme-secondary flex-shrink-0" />

              <span className="flex-1 text-sm text-theme-primary">{panel.name}</span>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => movePanel(index, "up")}
                  disabled={index === 0}
                  className="p-1 rounded hover:bg-theme-card disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Move up"
                >
                  <svg className="h-4 w-4 text-theme-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 15l-6-6-6 6" />
                  </svg>
                </button>
                <button
                  onClick={() => movePanel(index, "down")}
                  disabled={index === panels.length - 1}
                  className="p-1 rounded hover:bg-theme-card disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Move down"
                >
                  <svg className="h-4 w-4 text-theme-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
              </div>

              <button
                onClick={() => toggleVisibility(panel.id)}
                className={`
                  p-1.5 rounded transition-colors
                  ${panel.visible ? "text-green-400 hover:bg-green-400/10" : "text-gray-500 hover:bg-gray-500/10"}
                `}
                title={panel.visible ? "Hide panel" : "Show panel"}
              >
                {panel.visible ? (
                  <Eye className="h-4 w-4" />
                ) : (
                  <EyeOff className="h-4 w-4" />
                )}
              </button>
            </div>
          ))}
        </div>

        <div className="flex justify-between pt-4 border-t border-theme">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-theme-card text-theme-secondary transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            Reset to Default
          </button>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-md hover:bg-theme-card text-theme-secondary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              <Save className="h-4 w-4" />
              Save Layout
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
