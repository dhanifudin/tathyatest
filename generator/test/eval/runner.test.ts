import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseConfig } from '../../src/config.js';
import { detectCapabilities, resolveStacks, stackNameFor } from '../../src/eval/runner.js';

const config = parseConfig({
  baseUrl: 'http://127.0.0.1:8000',
  auth: { roles: [{ name: 'admin', username: 'admin@example.com', password: 'password' }] },
  evaluation: {
    stacks: [
      { name: 'blade', config: 'tathya.blade.config.yaml', baseUrl: 'http://127.0.0.1:8000', coverage: 'pcov' },
      { name: 'inertia', config: 'tathya.inertia-react.config.yaml', baseUrl: 'http://127.0.0.1:8001' },
    ],
  },
});

describe('resolveStacks', () => {
  it('defaults to the current config as a single stack, never the whole study', () => {
    const stacks = resolveStacks(config, { configPath: 'tathya.config.yaml' });

    expect(stacks).toEqual([{ name: 'default', dir: '.', config: 'tathya.config.yaml', baseUrl: 'http://127.0.0.1:8000' }]);
  });

  it('names the default stack after a non-default config file', () => {
    expect(resolveStacks(config, { configPath: 'tathya.shop.config.yaml' })[0].name).toBe('shop');
  });

  it('picks one configured stack by name', () => {
    expect(resolveStacks(config, { stack: 'inertia' }).map((stack) => stack.name)).toEqual(['inertia']);
  });

  it('rejects an unknown stack name and lists the configured ones', () => {
    expect(() => resolveStacks(config, { stack: 'rails' })).toThrow('Unknown stack "rails"; evaluation.stacks has: blade, inertia');
  });

  it('runs every configured stack only with allStacks', () => {
    expect(resolveStacks(config, { allStacks: true }).map((stack) => stack.name)).toEqual(['blade', 'inertia']);
  });

  it('falls back to the current config when allStacks is set but nothing is configured', () => {
    const single = parseConfig({ baseUrl: 'http://127.0.0.1:9000', auth: config.auth });

    expect(resolveStacks(single, { allStacks: true, configPath: 'tathya.config.yaml' }).map((stack) => stack.baseUrl)).toEqual(['http://127.0.0.1:9000']);
  });
});

describe('stackNameFor', () => {
  it('derives a stack name from the config file name', () => {
    expect(stackNameFor('tathya.config.yaml')).toBe('default');
    expect(stackNameFor('tathya.blade.config.yaml')).toBe('blade');
    expect(stackNameFor('/srv/app/tathya.inertia-react.config.yml')).toBe('inertia-react');
    expect(stackNameFor('shop.yaml')).toBe('shop');
  });
});

describe('detectCapabilities', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('honours explicit stack overrides without touching the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(detectCapabilities({ baseUrl: 'http://127.0.0.1:8000', coverage: 'none', faults: false })).resolves.toEqual({ coverage: false, faults: false });
    await expect(detectCapabilities({ baseUrl: 'http://127.0.0.1:8000', coverage: 'pcov', faults: true })).resolves.toEqual({ coverage: true, faults: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('probes the control-plane endpoints when the stack leaves them unset', async () => {
    const fetchMock = vi.fn(async (url: URL | string) => ({ ok: String(url).endsWith('/__testing/coverage') }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(detectCapabilities({ baseUrl: 'http://127.0.0.1:8000' })).resolves.toEqual({ coverage: true, faults: false });
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      'http://127.0.0.1:8000/__testing/coverage',
      'http://127.0.0.1:8000/__testing/fault/clear',
    ]);
  });

  it('treats an unreachable app as having no control plane', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));

    await expect(detectCapabilities({ baseUrl: 'http://127.0.0.1:1' })).resolves.toEqual({ coverage: false, faults: false });
  });
});

describe('loadStackReports', () => {
  it('rebuilds stack reports from per-stack folders, ordered by name, ignoring folders without a report', async () => {
    const { mkdir, mkdtemp, rm, writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { loadStackReports } = await import('../../src/eval/runner.js');
    const dir = await mkdtemp(join(tmpdir(), 'tt-reports-'));
    try {
      for (const name of ['inertia', 'blade']) {
        await mkdir(join(dir, name));
        await writeFile(join(dir, name, 'report.json'), JSON.stringify({ stacks: [{ name, provenance: { gitCommit: 'abc' }, quality: { testCount: 1 } }] }));
      }
      await mkdir(join(dir, 'stale'));
      const stacks = await loadStackReports(dir);
      expect(stacks.map((stack) => stack.name)).toEqual(['blade', 'inertia']);
      expect((stacks[0]?.report as unknown as { quality: { testCount: number } }).quality.testCount).toBe(1);
      expect((stacks[0]?.provenance as unknown as { gitCommit: string }).gitCommit).toBe('abc');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
