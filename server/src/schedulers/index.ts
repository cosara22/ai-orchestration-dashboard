/**
 * Scheduler Index - Manages all background jobs
 * Phase 15-G: Automation & Monitoring
 */

import { autoDispatchTasks } from "./taskDispatcher";
import { checkTaskTimeouts } from "./timeoutMonitor";
import { checkAgentHealth } from "./healthChecker";
import { cleanupExpiredLocks } from "./lockCleanup";

interface SchedulerConfig {
  dispatchIntervalMs: number;    // Task auto-assignment (default: 30s)
  timeoutIntervalMs: number;     // Timeout check (default: 5min)
  healthIntervalMs: number;      // Health check (default: 1min)
  lockCleanupIntervalMs: number; // Lock cleanup (default: 1hour)
}

const DEFAULT_CONFIG: SchedulerConfig = {
  dispatchIntervalMs: 30000,      // 30 seconds
  timeoutIntervalMs: 300000,      // 5 minutes
  healthIntervalMs: 60000,        // 1 minute
  lockCleanupIntervalMs: 3600000, // 1 hour
};

let dispatchInterval: ReturnType<typeof setInterval> | null = null;
let timeoutInterval: ReturnType<typeof setInterval> | null = null;
let healthInterval: ReturnType<typeof setInterval> | null = null;
let lockCleanupInterval: ReturnType<typeof setInterval> | null = null;

let isRunning = false;

/**
 * Start all schedulers
 */
export function startSchedulers(config: Partial<SchedulerConfig> = {}): void {
  if (isRunning) {
    console.log("[Scheduler] Already running, skipping start");
    return;
  }

  const cfg = { ...DEFAULT_CONFIG, ...config };
  console.log("[Scheduler] Starting all schedulers...");

  // Task auto-dispatch (30s interval)
  dispatchInterval = setInterval(async () => {
    try {
      await autoDispatchTasks();
    } catch (error) {
      console.error("[Scheduler] Task dispatch error:", error);
    }
  }, cfg.dispatchIntervalMs);
  console.log(`[Scheduler] Task dispatcher started (interval: ${cfg.dispatchIntervalMs}ms)`);

  // Timeout check (5min interval)
  timeoutInterval = setInterval(async () => {
    try {
      await checkTaskTimeouts();
    } catch (error) {
      console.error("[Scheduler] Timeout check error:", error);
    }
  }, cfg.timeoutIntervalMs);
  console.log(`[Scheduler] Timeout monitor started (interval: ${cfg.timeoutIntervalMs}ms)`);

  // Health check (1min interval)
  healthInterval = setInterval(async () => {
    try {
      await checkAgentHealth();
    } catch (error) {
      console.error("[Scheduler] Health check error:", error);
    }
  }, cfg.healthIntervalMs);
  console.log(`[Scheduler] Health checker started (interval: ${cfg.healthIntervalMs}ms)`);

  // Lock cleanup (1hour interval)
  lockCleanupInterval = setInterval(async () => {
    try {
      await cleanupExpiredLocks();
    } catch (error) {
      console.error("[Scheduler] Lock cleanup error:", error);
    }
  }, cfg.lockCleanupIntervalMs);
  console.log(`[Scheduler] Lock cleanup started (interval: ${cfg.lockCleanupIntervalMs}ms)`);

  isRunning = true;
  console.log("[Scheduler] All schedulers started successfully");
}

/**
 * Stop all schedulers
 */
export function stopSchedulers(): void {
  if (!isRunning) {
    console.log("[Scheduler] Not running, skipping stop");
    return;
  }

  console.log("[Scheduler] Stopping all schedulers...");

  if (dispatchInterval) {
    clearInterval(dispatchInterval);
    dispatchInterval = null;
  }

  if (timeoutInterval) {
    clearInterval(timeoutInterval);
    timeoutInterval = null;
  }

  if (healthInterval) {
    clearInterval(healthInterval);
    healthInterval = null;
  }

  if (lockCleanupInterval) {
    clearInterval(lockCleanupInterval);
    lockCleanupInterval = null;
  }

  isRunning = false;
  console.log("[Scheduler] All schedulers stopped");
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus(): {
  running: boolean;
  jobs: {
    dispatch: boolean;
    timeout: boolean;
    health: boolean;
    lockCleanup: boolean;
  };
} {
  return {
    running: isRunning,
    jobs: {
      dispatch: dispatchInterval !== null,
      timeout: timeoutInterval !== null,
      health: healthInterval !== null,
      lockCleanup: lockCleanupInterval !== null,
    },
  };
}

/**
 * Run a specific job immediately (for testing/manual trigger)
 */
export async function runJobNow(
  jobName: "dispatch" | "timeout" | "health" | "lockCleanup"
): Promise<void> {
  console.log(`[Scheduler] Running job manually: ${jobName}`);

  switch (jobName) {
    case "dispatch":
      await autoDispatchTasks();
      break;
    case "timeout":
      await checkTaskTimeouts();
      break;
    case "health":
      await checkAgentHealth();
      break;
    case "lockCleanup":
      await cleanupExpiredLocks();
      break;
  }

  console.log(`[Scheduler] Manual job completed: ${jobName}`);
}
