import { test, expect } from "@playwright/test";

test.describe("Dashboard Page", () => {
  test("should display page title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/AI Orchestration Dashboard/);
  });

  test("should show header with dashboard title", async ({ page }) => {
    await page.goto("/");
    const header = page.locator("h1");
    await expect(header).toContainText("AI Orchestration Dashboard");
  });

  test("should display status cards", async ({ page }) => {
    await page.goto("/");
    // Wait for page to load
    await page.waitForLoadState("networkidle");

    // Check for status card elements
    const activeSessionsCard = page.getByText("Active Sessions");
    await expect(activeSessionsCard).toBeVisible({ timeout: 10000 });
  });

  test("should have settings button", async ({ page }) => {
    await page.goto("/");
    const settingsButton = page.locator('button[title="Settings"]');
    await expect(settingsButton).toBeVisible();
  });

  test("should open settings modal", async ({ page }) => {
    await page.goto("/");
    const settingsButton = page.locator('button[title="Settings"]');
    await settingsButton.click();

    // Modal should appear - look for Settings heading in modal
    const modal = page.getByRole("heading", { name: "Settings", exact: true });
    await expect(modal).toBeVisible();
  });

  test("should display footer", async ({ page }) => {
    await page.goto("/");
    const footer = page.getByText(/AI Orchestration Dashboard v/);
    await expect(footer).toBeVisible();
  });
});
