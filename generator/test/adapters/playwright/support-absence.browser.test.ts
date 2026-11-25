import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from '@playwright/test';
import { expectAbsent, expectRecordGone } from '../../../src/adapters/playwright/templates/support.js';
import { chromiumAvailable, launchBrowser, serveRoutes, type FixtureApp } from '../../helpers/browser.js';

/** A client-rendered list: an empty shell first, its rows drawn a moment after the load event. */
const lateList = (rows: string) => `<!doctype html><div id="app"></div><script>
setTimeout(() => { document.getElementById('app').innerHTML = '<a href="/x">x</a>${rows}'; }, 600);
</script>`;

describe.skipIf(!chromiumAvailable)('absence checks on a client-rendered page', () => {
  let browser: Browser;
  let fixture: FixtureApp;
  beforeAll(async () => {
    browser = await launchBrowser();
    fixture = await serveRoutes({
      '/kept': { body: lateList('<form action="/todos/1"><button>Delete</button></form><a href="/admin">Users</a>') },
      '/deleted': { body: lateList('<form action="/todos/2"></form>') },
    });
  });
  afterAll(async () => {
    await browser.close();
    await fixture.close();
  });

  async function on<T>(path: string, check: (page: Awaited<ReturnType<Browser['newPage']>>) => Promise<T>): Promise<T> {
    const page = await browser.newPage();
    try {
      await page.goto(`${fixture.baseUrl}${path}`);
      return await check(page);
    } finally {
      await page.close();
    }
  }

  it('does not read the empty shell as a deleted record', { timeout: 60_000 }, async () => {
    await expect(on('/kept', (page) => expectRecordGone(page, 'form[action="/todos/1"]'))).rejects.toThrow(/still listed/);
    await expect(on('/deleted', (page) => expectRecordGone(page, 'form[action="/todos/1"]'))).resolves.toBeUndefined();
  });

  it('does not read the empty shell as an absent link', { timeout: 60_000 }, async () => {
    await expect(on('/kept', (page) => expectAbsent(page, page.getByRole('link', { name: 'Users', exact: true })))).rejects.toThrow();
    await expect(on('/deleted', (page) => expectAbsent(page, page.getByRole('link', { name: 'Users', exact: true })))).resolves.toBeUndefined();
  });
});
