import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from '@playwright/test';
import { extractPage, type DomPageModel } from '../../src/crawl/dom-extract.js';
import { parseAriaNode } from '../../src/crawl/a11y-merge.js';
import { chromiumAvailable, launchBrowser, serveRoutes, type FixtureApp } from '../helpers/browser.js';

describe('parseAriaNode', () => {
  it('reads leaf nodes, attributes, values and quoted names', () => {
    expect(parseAriaNode('- button "Save"')).toEqual({ role: 'button', name: 'Save' });
    expect(parseAriaNode('- checkbox "Done" [checked]')).toEqual({ role: 'checkbox', name: 'Done' });
    expect(parseAriaNode('- textbox "Title": Buy milk')).toEqual({ role: 'textbox', name: 'Title' });
    expect(parseAriaNode('- link "Say \\"hi\\"":')).toEqual({ role: 'link', name: 'Say "hi"' });
    expect(parseAriaNode('- textbox')).toBeNull();
    expect(parseAriaNode('- generic "x"')).toBeNull();
  });
});

const html = `<!doctype html><title>fixture</title>
<nav style="display:none"><a href="#">All Items</a></nav>
<aside aria-hidden="true"><a href="#" id="reset">Reset state</a><a href="#" id="off" role="button">Sign off</a></aside>
<a href="javascript:void(0)">Toggle</a>
<a href="/posts/1" data-method="delete">Remove post</a>
<a href="/help">Help</a>
<form id="filters">
  <label>Status <select name="status"><option value="">Any</option><option value="open">Open</option></select></label>
  <input type="text" name="q" aria-label="Search posts">
  <input type="radio" name="size" value="s" id="s" required><label for="s">Small</label>
  <input type="radio" name="size" value="l" id="l"><label for="l">Large</label>
  <input type="text" name="locked" readonly value="x">
  <input type="text" name="off" disabled>
  <fieldset disabled><input type="text" name="inside"></fieldset>
  <button type="submit">Apply <span style="display:none">now</span></button>
</form>
<form method="post" action="/posts/1"><input type="text" name="title" value="Hello"><button>Save</button></form>
<form hx-delete="/posts/2"><button>Delete</button></form>
<form><input type="text" name="note"><button>Add note</button></form>
<div id="bar"><button><svg width="8" height="8"></svg></button><button><svg width="8" height="8"></svg></button></div>
<button><img alt="Open menu" src="data:,"></button>`;

describe.skipIf(!chromiumAvailable)('extractPage (in a browser)', () => {
  let browser: Browser;
  let fixture: FixtureApp;
  let model: DomPageModel;
  let leftovers = -1;

  beforeAll(async () => {
    browser = await launchBrowser();
    fixture = await serveRoutes({ '/posts': { body: html } });
    const page = await browser.newPage();
    await page.goto(`${fixture.baseUrl}/posts`);
    model = await extractPage(page);
    leftovers = await page.locator('[data-tt-probe]').count();
    await page.close();
  }, 60_000);
  afterAll(async () => {
    await browser.close();
    await fixture.close();
  });

  const link = (text: string) => model.links.find((item) => item.text === text);

  it('marks in-page links and script verbs', () => {
    expect(link('All Items')).toMatchObject({ inPage: true, method: null, visible: false });
    expect(link('Toggle')).toMatchObject({ inPage: true, href: '/posts' });
    expect(link('Remove post')).toMatchObject({ inPage: false, method: 'DELETE' });
    expect(link('Help')).toMatchObject({ inPage: false, method: null, locator: { strategy: 'role', value: 'link:Help' } });
  });

  it('keeps the role name of a link that is only hidden from assistive technology or from view', () => {
    expect(link('All Items')?.locator).toEqual({ strategy: 'role', value: 'link:All Items' });
    expect(link('Reset state')?.locator).toEqual({ strategy: 'role', value: 'link:Reset state' });
    // An anchor that declares another role is found by that role.
    expect(link('Sign off')?.locator).toEqual({ strategy: 'role', value: 'button:Sign off' });
  });

  it('records one field per radio group and skips controls a test cannot fill', () => {
    const fields = model.forms[0].fields;
    expect(fields.map((field) => field.name)).toEqual(['status', 'q', 'size']);
    expect(fields[2]).toMatchObject({ type: 'radio', required: true, options: [{ value: 's', label: 'Small' }, { value: 'l', label: 'Large' }], locator: { strategy: 'name', value: 'size' } });
  });

  it('names a wrapped select by its own label, through its accessible role', () => {
    expect(model.forms[0].fields[0]).toMatchObject({ label: 'Status', locator: { strategy: 'role', value: 'combobox:Status' } });
  });

  it('uses the accessible name, not the text content', () => {
    expect(model.forms[0].submit.locator).toEqual({ strategy: 'role', value: 'button:Apply' });
    expect(model.buttons.some((button) => button.locator.value === 'button:Open menu')).toBe(true);
  });

  it('drops buttons that no locator can single out', () => {
    expect(model.buttons.filter((button) => button.locator.strategy === 'css')).toEqual([]);
  });

  it('records what each form really sends', () => {
    const [filters, update, remove, script] = model.forms;
    expect(filters).toMatchObject({ method: 'GET', declaresTarget: false, hasActionAttribute: false, crudOp: 'unknown' });
    expect(update).toMatchObject({ method: 'POST', hasActionAttribute: true });
    expect(update.fields[0].prefilled).toBe(true);
    expect(remove).toMatchObject({ method: 'POST', crudOp: 'delete' });
    expect(script).toMatchObject({ method: 'GET', crudOp: 'create' });
  });

  it('leaves no probe attributes behind', () => {
    expect(leftovers).toBe(0);
  });
});
