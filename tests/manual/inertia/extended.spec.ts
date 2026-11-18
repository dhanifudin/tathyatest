import { test, expect, type Page } from '@playwright/test';

/**
 * Scope-matched extension of the hand-written React/Inertia baseline. `baseline.spec.ts` holds the original five
 * tests; these twelve cover the rest of the case study's feature list (listing, search, filter,
 * pagination, edit, delete, toggle, validation, duplicate, admin access, nav affordance, logout) the way a
 * developer would write them by hand. Written by the tool authors, so the evaluation reports this
 * baseline as author-written.
 */

const admin = { email: 'admin@example.com', password: 'password' };
const user = { email: 'user@example.com', password: 'password' };

async function login(page: Page, creds: { email: string; password: string }) {
  await page.request.post('/__testing/reset');
  await page.context().clearCookies();
  await page.goto('/login');
  await page.fill('input[name="email"]', creds.email);
  await page.fill('input[name="password"]', creds.password);
  // Breeze React buttons carry no explicit type attribute, so target them by accessible name.
  await Promise.all([page.waitForURL((url) => !url.pathname.endsWith('/login')), page.getByRole('button', { name: /log in/i }).click()]);
}

const row = (page: Page, title: string) => page.locator('tbody tr', { hasText: title });

test('admin sees the seeded todo list', async ({ page }) => {
  await login(page, admin);
  await page.goto('/todos');
  await expect(row(page, 'Review reports')).toBeVisible();
});

test('searching by title narrows the list', async ({ page }) => {
  await login(page, admin);
  await page.goto('/todos');
  await page.fill('input[name="search"]', 'Review reports');
  await page.getByRole('button', { name: /apply/i }).click();
  await expect(page).toHaveURL(/search=Review/);
  await expect(row(page, 'Review reports')).toBeVisible();
  await expect(row(page, 'Verify backups')).toHaveCount(0);
});

test('the done filter lists only completed todos', async ({ page }) => {
  await login(page, admin);
  await page.goto('/todos');
  await page.selectOption('select[name="status"]', 'done');
  await page.getByRole('button', { name: /apply/i }).click();
  await expect(row(page, 'Archive old exports')).toBeVisible();
  await expect(row(page, 'Review reports')).toHaveCount(0);
});

test('the next page link shows the remaining todos', async ({ page }) => {
  await login(page, admin);
  await page.goto('/todos');
  await page.getByRole('link', { name: 'Next' }).first().click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator('tbody tr')).not.toHaveCount(0);
});

test('marking a todo done updates its row', async ({ page }) => {
  await login(page, admin);
  await page.goto('/todos');
  await row(page, 'Review reports').getByRole('button', { name: 'Mark done' }).click();
  await expect(row(page, 'Review reports')).toContainText('Yes');
});

test('admin can edit a todo title', async ({ page }) => {
  await login(page, admin);
  await page.goto('/todos');
  await row(page, 'Review reports').getByRole('link', { name: 'Edit' }).click();
  await page.fill('input[name="title"]', 'Review reports (edited)');
  await page.getByRole('button', { name: /update/i }).click();
  await expect(row(page, 'Review reports (edited)')).toBeVisible();
});

test('admin can delete a todo', async ({ page }) => {
  await login(page, admin);
  await page.goto('/todos');
  await row(page, 'Clean demo data').getByRole('button', { name: 'Delete' }).click();
  await expect(row(page, 'Clean demo data')).toHaveCount(0);
});

test('an invalid contact email is rejected', async ({ page }) => {
  await login(page, admin);
  await page.goto('/todos/create');
  await page.fill('input[name="title"]', 'Invalid email todo');
  await page.fill('input[name="contact_email"]', 'not-an-email');
  await page.fill('input[name="contact_email_confirmation"]', 'not-an-email');
  await page.getByRole('button', { name: /create/i }).click();
  await expect(page.locator('.text-red-600, [role=alert]').first()).toBeVisible();
});

test('a duplicate contact email is rejected', async ({ page }) => {
  await login(page, admin);
  await page.goto('/todos/create');
  await page.fill('input[name="title"]', 'Duplicate email todo');
  await page.fill('input[name="contact_email"]', 'admin.todo.01@example.com');
  await page.fill('input[name="contact_email_confirmation"]', 'admin.todo.01@example.com');
  await page.getByRole('button', { name: /create/i }).click();
  await expect(page.locator('.text-red-600, [role=alert]').first()).toBeVisible();
});

test('admin can open the admin users page', async ({ page }) => {
  await login(page, admin);
  await page.goto('/admin/users');
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(page.getByText('Admin Users')).toBeVisible();
});

test('a regular user does not see the Users link', async ({ page }) => {
  await login(page, user);
  await page.goto('/dashboard');
  await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0);
});

test('logging out requires a new login', async ({ page }) => {
  await login(page, admin);
  await page.goto('/dashboard');
  await page.locator('nav button', { hasText: 'Admin' }).first().click();
  await page.getByRole('button', { name: 'Log Out' }).first().click();
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
});
