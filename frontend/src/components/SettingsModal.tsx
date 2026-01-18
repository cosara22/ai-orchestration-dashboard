"use client";

import { useState, useEffect } from "react";
import { Modal } from "./Modal";
import { useToast } from "./Toast";
import { Settings, Monitor, Bell, Database, RefreshCw } from "lucide-react";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AppSettings {
  display: {
    refreshInterval: number; // seconds
    eventsLimit: number;
    sessionsLimit: number;
    showTimestamps: boolean;
  };
  notifications: {
    enabled: boolean;
    onError: boolean;
    onSessionEnd: boolean;
  };
  connection: {
    apiUrl: string;
    wsUrl: string;
  };
}

const DEFAULT_SETTINGS: AppSettings = {
  display: {
    refreshInterval: 30,
    eventsLimit: 50,
    sessionsLimit: 20,
    showTimestamps: true,
  },
  notifications: {
    enabled: true,
    onError: true,
    onSessionEnd: false,
  },
  connection: {
    apiUrl: "http://localhost:4000",
    wsUrl: "ws://localhost:4000/ws",
  },
};

const STORAGE_KEY = "aod-settings";

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch {
    // ignore parse errors
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

type TabId = "display" | "notifications" | "connection";

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<TabId>("display");
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSettings(loadSettings());
      setHasChanges(false);
    }
  }, [isOpen]);

  const updateSettings = <K extends keyof AppSettings>(
    category: K,
    key: keyof AppSettings[K],
    value: AppSettings[K][keyof AppSettings[K]]
  ) => {
    setSettings((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [key]: value,
      },
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    saveSettings(settings);
    setHasChanges(false);
    toast.success("Settings saved", "Your preferences have been updated");
    onClose();
    // Reload to apply new settings
    window.location.reload();
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    setHasChanges(true);
  };

  const tabs: { id: TabId; label: string; icon: typeof Monitor }[] = [
    { id: "display", label: "Display", icon: Monitor },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "connection", label: "Connection", icon: Database },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Settings" size="lg">
      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-40 space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
                  activeTab === tab.id
                    ? "bg-blue-600 text-white"
                    : "text-gray-400 hover:text-white hover:bg-gray-800"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 min-h-[300px]">
          {activeTab === "display" && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-white mb-4">Display Settings</h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Auto-refresh interval (seconds)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={300}
                    value={settings.display.refreshInterval}
                    onChange={(e) =>
                      updateSettings("display", "refreshInterval", parseInt(e.target.value) || 30)
                    }
                    className="w-full px-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded-md text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Events to display
                  </label>
                  <select
                    value={settings.display.eventsLimit}
                    onChange={(e) =>
                      updateSettings("display", "eventsLimit", parseInt(e.target.value))
                    }
                    className="w-full px-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded-md text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Sessions to display
                  </label>
                  <select
                    value={settings.display.sessionsLimit}
                    onChange={(e) =>
                      updateSettings("display", "sessionsLimit", parseInt(e.target.value))
                    }
                    className="w-full px-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded-md text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm text-gray-300">Show timestamps</label>
                  <button
                    onClick={() =>
                      updateSettings("display", "showTimestamps", !settings.display.showTimestamps)
                    }
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      settings.display.showTimestamps ? "bg-blue-600" : "bg-gray-700"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                        settings.display.showTimestamps ? "translate-x-5" : ""
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "notifications" && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-white mb-4">Notification Settings</h3>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm text-gray-300">Enable notifications</label>
                  <button
                    onClick={() =>
                      updateSettings("notifications", "enabled", !settings.notifications.enabled)
                    }
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      settings.notifications.enabled ? "bg-blue-600" : "bg-gray-700"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                        settings.notifications.enabled ? "translate-x-5" : ""
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm text-gray-300">Notify on errors</label>
                  <button
                    onClick={() =>
                      updateSettings("notifications", "onError", !settings.notifications.onError)
                    }
                    disabled={!settings.notifications.enabled}
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      settings.notifications.onError && settings.notifications.enabled
                        ? "bg-blue-600"
                        : "bg-gray-700"
                    } ${!settings.notifications.enabled ? "opacity-50" : ""}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                        settings.notifications.onError && settings.notifications.enabled
                          ? "translate-x-5"
                          : ""
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm text-gray-300">Notify on session end</label>
                  <button
                    onClick={() =>
                      updateSettings("notifications", "onSessionEnd", !settings.notifications.onSessionEnd)
                    }
                    disabled={!settings.notifications.enabled}
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      settings.notifications.onSessionEnd && settings.notifications.enabled
                        ? "bg-blue-600"
                        : "bg-gray-700"
                    } ${!settings.notifications.enabled ? "opacity-50" : ""}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                        settings.notifications.onSessionEnd && settings.notifications.enabled
                          ? "translate-x-5"
                          : ""
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "connection" && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-white mb-4">Connection Settings</h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    API URL
                  </label>
                  <input
                    type="text"
                    value={settings.connection.apiUrl}
                    onChange={(e) =>
                      updateSettings("connection", "apiUrl", e.target.value)
                    }
                    placeholder="http://localhost:4000"
                    className="w-full px-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    WebSocket URL
                  </label>
                  <input
                    type="text"
                    value={settings.connection.wsUrl}
                    onChange={(e) =>
                      updateSettings("connection", "wsUrl", e.target.value)
                    }
                    placeholder="ws://localhost:4000/ws"
                    className="w-full px-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                <p className="text-xs text-gray-500 mt-2">
                  Note: Changing connection settings requires a page reload to take effect.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-800">
        <button
          onClick={handleReset}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Reset to defaults
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Settings className="h-4 w-4" />
            Save Changes
          </button>
        </div>
      </div>
    </Modal>
  );
}
