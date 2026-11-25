import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

/** The support modules cannot import generator code, so each carries a copy of the login rule. */
const source = (path: string) => readFile(new URL(`../../src/${path}`, import.meta.url), 'utf8');
const block = (text: string) => /\/\/ <tathya:login-infer>\n[\s\S]*?\/\/ <\/tathya:login-infer>/.exec(text)?.[0];

describe('login inference copies', () => {
  it.each(['adapters/playwright/templates/support.ts', 'adapters/cypress/templates/tathya.ts'])('%s matches auth/login-dom.ts', async (template) => {
    const canonical = block(await source('auth/login-dom.ts'));
    expect(canonical).toBeDefined();
    expect(block(await source(template))).toBe(canonical);
  });
});
