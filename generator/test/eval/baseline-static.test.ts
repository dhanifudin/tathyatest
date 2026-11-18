import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { analyzeBaselineDir, analyzeSpecSource, classifySelector } from '../../src/eval/baseline-static.js';

// Minimal fixture spec — typical Playwright test with semantic locators.
const FIXTURE_SEMANTIC = `
import { test, expect } from '@playwright/test';

test.describe('Login', () => {
  test('valid login', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Username').fill('standard_user');
    await page.getByLabel('Password').fill('secret_sauce');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible();
  });

  test('invalid login', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Username').fill('wrong');
    await page.getByLabel('Password').fill('wrong');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.getByTestId('error')).toBeVisible();
    expect(await page.getByTestId('error').textContent()).toContain('Epic sadface');
  });
});
`;

// CSS-heavy fixture — baseline with low-quality locators.
const FIXTURE_CSS = `
import { test, expect } from '@playwright/test';

test('add to cart', async ({ page }) => {
  await page.goto('/inventory.html');
  await page.locator('.inventory_item button').first().click();
  await page.locator('.shopping_cart_link').click();
  await expect(page.locator('.cart_item')).toHaveCount(1);
});

it('checkout flow', async ({ page }) => {
  await page.goto('/cart.html');
  await page.locator('[data-test="checkout"]').click();
  await page.locator('#first-name').fill('Jane');
  await page.locator('.cart_button').click();
  await expect(page.locator('.summary_info')).toBeVisible();
});
`;

describe('analyzeSpecSource', () => {
  it('counts tests correctly in describe block', () => {
    const result = analyzeSpecSource(FIXTURE_SEMANTIC);
    expect(result.tests).toBe(2);
  });

  it('counts assertions correctly', () => {
    const result = analyzeSpecSource(FIXTURE_SEMANTIC);
    // 2x toBeVisible + 1x textContent expect = 3 total expect() calls
    expect(result.assertions).toBeGreaterThanOrEqual(3);
  });

  it('classifies semantic locators correctly', () => {
    const result = analyzeSpecSource(FIXTURE_SEMANTIC);
    // test 1: 2x getByLabel; test 2: 2x getByLabel → 4 total
    expect(result.locatorCounts.label).toBe(4);
    // test 1: getByRole(button) + getByRole(heading) = 2; test 2: getByRole(button) = 1 → 3 total
    expect(result.locatorCounts.role).toBe(3);
    // test 2: 2x getByTestId('error') → 2 total
    expect(result.locatorCounts.testid).toBe(2);
    // no raw CSS locator() calls
    expect(result.locatorCounts.css).toBe(0);
  });

  it('classifies CSS locators in brittle fixture', () => {
    const result = analyzeSpecSource(FIXTURE_CSS);
    expect(result.tests).toBe(2);
    // .inventory_item button, .shopping_cart_link, .cart_item, .cart_button, .summary_info are CSS
    expect(result.locatorCounts.css).toBeGreaterThanOrEqual(3);
    // [data-test="checkout"] → testid
    expect(result.locatorCounts.testid).toBeGreaterThanOrEqual(1);
    // #first-name → id
    expect(result.locatorCounts.id).toBeGreaterThanOrEqual(1);
  });

  it('computes brittleLocatorRatio via totals', () => {
    const result = analyzeSpecSource(FIXTURE_CSS);
    const total = Object.values(result.locatorCounts).reduce((sum, n) => sum + n, 0);
    expect(total).toBeGreaterThan(0);
    // CSS locators dominate in the brittle fixture
    expect(result.locatorCounts.css / total).toBeGreaterThan(0.3);
  });

  it('returns zero counts for an empty file', () => {
    const result = analyzeSpecSource('');
    expect(result.tests).toBe(0);
    expect(result.assertions).toBe(0);
    expect(Object.values(result.locatorCounts).every((n) => n === 0)).toBe(true);
  });

  it('computes assertionDensity via aggregate', () => {
    const sem = analyzeSpecSource(FIXTURE_SEMANTIC);
    const density = sem.tests === 0 ? 0 : sem.assertions / sem.tests;
    expect(density).toBeGreaterThanOrEqual(1);
  });
});

describe('analyzer details', () => {
  it('classifies selector strings by the priority chain', () => {
    expect(classifySelector('[data-test="login-button"]')).toBe('testid');
    expect(classifySelector('[data-testid=\'x\']')).toBe('testid');
    expect(classifySelector('#user-name')).toBe('id');
    expect(classifySelector('input[name="email"]')).toBe('name');
    expect(classifySelector('.cart_item > button')).toBe('css');
  });

  it('does not mistake inherited object members for locator APIs', () => {
    const result = analyzeSpecSource("test('x', async () => { const s = String(1).toString(); });");
    expect(Object.keys(result.locatorCounts).sort()).toEqual(['css', 'id', 'label', 'name', 'placeholder', 'role', 'testid']);
  });

  it('counts string selectors passed to page methods, not locator values', () => {
    const src = `
      test('x', async ({ page }) => {
        await page.click('button[type="submit"]');
        await page.fill('input[name="email"]', 'a@b.c');
        await page.getByLabel('Email').fill('a@b.c');
        await page.locator('#go').click({ force: true });
      });`;
    const { locatorCounts } = analyzeSpecSource(src);
    expect(locatorCounts).toMatchObject({ css: 1, name: 1, label: 1, id: 1 });
  });

  it('counts expect helpers as one assertion at the call site and ignores test.skip(cond, reason)', () => {
    const src = `
      test('a', async ({ page, app }) => {
        test.skip(!(await page.isVisible('#x')), 'not visible');
        await expectRouteAllowed(page, null, '/x');
        await app.expectLoggedIn();
        await expect(page.getByRole('heading')).toBeVisible();
        expect.soft(1).toBe(1);
      });
      test.skip('b', async () => {});`;
    const result = analyzeSpecSource(src);
    expect(result.tests).toBe(2);
    expect(result.assertions).toBe(4);
  });

  it('analyses page objects and ignores node_modules', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tt-static-'));
    try {
      await mkdir(join(dir, 'pages'));
      await mkdir(join(dir, 'node_modules', 'dep'), { recursive: true });
      await writeFile(join(dir, 'a.spec.ts'), "test('a', async ({ page }) => { await new Cart(page).open(); });\n");
      await writeFile(join(dir, 'pages', 'cart.ts'), "export class Cart { async open() { await this.page.click('.cart'); await expect(this.page).toHaveURL('/cart'); } }\n");
      await writeFile(join(dir, 'node_modules', 'dep', 'index.spec.js'), "it('noise', () => { assert(1); assert(2); });\n");
      const result = await analyzeBaselineDir(dir);
      expect(result).not.toBeNull();
      expect(result?.testCount).toBe(1);
      expect(result?.sourceFiles).toBe(2);
      expect(result?.totals.assertions).toBe(1);
      expect(result?.locatorDistribution.css).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
