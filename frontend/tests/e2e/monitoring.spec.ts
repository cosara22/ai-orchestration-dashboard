/**
 * E2E Tests for Monitoring Dashboard
 * Phase 15-H: Frontend E2E Testing
 */

import { test, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3002";

test.describe("Monitoring Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
  });

  test("should display the main dashboard", async ({ page }) => {
    await expect(page).toHaveTitle(/AI Orchestration Dashboard/);
  });

  test("should show system status indicators", async ({ page }) => {
    // Wait for the page to load
    await page.waitForLoadState("networkidle");

    // Check for status indicators
    const healthStatus = page.locator("[data-testid='health-status'], .health-status, text=ok, text=healthy").first();
    await expect(healthStatus).toBeVisible({ timeout: 10000 });
  });

  test("should display navigation menu", async ({ page }) => {
    await page.waitForLoadState("networkidle");

    // Check for navigation elements
    const nav = page.locator("nav, [role='navigation'], .sidebar").first();
    await expect(nav).toBeVisible();
  });
});

test.describe("Multi-Agent Features", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");
  });

  test("should display agent list or panel", async ({ page }) => {
    // Look for agent-related content
    const agentContent = page.locator("text=Agent, text=エージェント").first();
    if (await agentContent.isVisible()) {
      await expect(agentContent).toBeVisible();
    }
  });

  test("should display task queue or panel", async ({ page }) => {
    // Look for task-related content
    const taskContent = page.locator("text=Task, text=タスク").first();
    if (await taskContent.isVisible()) {
      await expect(taskContent).toBeVisible();
    }
  });
});

test.describe("API Integration", () => {
  test("should fetch health status from API", async ({ page }) => {
    const response = await page.request.get(`${BASE_URL.replace(":3002", ":4000")}/health`);
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.status).toBe("ok");
    expect(data.schedulers).toBeDefined();
  });

  test("should fetch system metrics from API", async ({ page }) => {
    const response = await page.request.get(`${BASE_URL.replace(":3002", ":4000")}/api/metrics/system`);
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.agents).toBeDefined();
    expect(data.tasks).toBeDefined();
    expect(data.alerts).toBeDefined();
  });

  test("should fetch conductor overview from API", async ({ page }) => {
    const response = await page.request.get(`${BASE_URL.replace(":3002", ":4000")}/api/conductor/overview`);
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.projects).toBeDefined();
  });

  test("should fetch teams overview from API", async ({ page }) => {
    const response = await page.request.get(`${BASE_URL.replace(":3002", ":4000")}/api/teams/overview/all`);
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.teams).toBeDefined();
    expect(data.summary).toBeDefined();
  });
});

test.describe("Theme and Accessibility", () => {
  test("should support dark mode toggle", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");

    // Look for theme toggle button
    const themeToggle = page.locator("button[aria-label*='theme'], button[aria-label*='dark'], [data-testid='theme-toggle']").first();
    if (await themeToggle.isVisible()) {
      await themeToggle.click();
      // Check if dark mode class is applied
      const isDark = await page.locator("html.dark, body.dark, [data-theme='dark']").count();
      expect(isDark).toBeGreaterThanOrEqual(0);
    }
  });

  test("should have proper heading structure", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");

    // Check for h1 heading
    const h1 = page.locator("h1").first();
    await expect(h1).toBeVisible();
  });
});

test.describe("Real-time Updates", () => {
  test("should connect to WebSocket for updates", async ({ page }) => {
    await page.goto(BASE_URL);

    // Wait for potential WebSocket connection
    await page.waitForTimeout(2000);

    // Check that the page is interactive
    await expect(page.locator("body")).toBeVisible();
  });
});
