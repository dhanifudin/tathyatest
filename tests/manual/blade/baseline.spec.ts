import { test, expect } from '@playwright/test';

/**
 * Hand-written reference suite for the Blade case study. It is the human baseline that
 * `tt eval` compares the generated suite against (Family E / RQ5 — Mann-Whitney U on per-test
 * duration, plus test-count and coverage deltas). Kept deliberately small and idiomatic, the way
 * a developer writes E2E tests by hand. Runs against the same playwright.config (baseURL +
 * browser projects) as the generated suite.
 */

const admin = { email: 'admin@example.com', password: 'password' };
const user = { email: 'user@example.com', password: 'password' };

async function login(page: import('@playwright/test').Page, creds: { email: string; password: string }) {
  await page.request.post('/__testing/reset');
  await page.goto('/login');
  await page.fill('input[name="email"]', creds.email);
  await page.fill('input[name="password"]', creds.password);
  await Promise.all([page.waitForURL((url) => !url.pathname.endsWith('/login')), page.click('button[type="submit"]')]);
}

test('admin can log in and reach the dashboard', async ({ page }) => {
  await login(page, admin);
  await expect(page.locator('input[name="password"]')).toHaveCount(0);
});

test('login rejects a wrong password', async ({ page }) => {
  await page.request.post('/__testing/reset');
  await page.goto('/login');
  await page.fill('input[name="email"]', admin.email);
  await page.fill('input[name="password"]', 'not-the-password');
  await page.click('button[type="submit"]');
  await expect(page.locator('.text-red-600, [role=alert]').first()).toBeVisible();
});

test('admin can create a todo', async ({ page }) => {
  await login(page, admin);
  await page.goto('/todos/create');
  const title = `Manual baseline ${Date.now()}`;
  await page.fill('input[name="title"]', title);
  await page.fill('input[name="contact_email"]', `manual.${Date.now()}@example.com`);
  await page.fill('input[name="contact_email_confirmation"]', `manual.${Date.now()}@example.com`);
  await page.selectOption('select[name="status"]', 'open');
  await page.click('button[type="submit"]');
  await expect(page.getByText(title).first()).toBeVisible();
});

test('creating a todo with an empty title shows an error', async ({ page }) => {
  await login(page, admin);
  await page.goto('/todos/create');
  await page.fill('input[name="contact_email"]', `manual.${Date.now()}@example.com`);
  await page.click('button[type="submit"]');
  await expect(page.locator('.text-red-600, [role=alert]').first()).toBeVisible();
});

test('a non-admin user cannot reach the admin module', async ({ page }) => {
  await login(page, user);
  const response = await page.goto('/admin/users');
  expect([401, 403, 404, 302]).toContain(response?.status() ?? 302);
});
