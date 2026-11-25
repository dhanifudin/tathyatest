import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cwd, chdir } from 'node:process';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { loadConfig } from '../../playwright.global-setup.js';

describe('playwright global setup config parsing', () => {
  it('reads role credentials from tathya.config.yaml', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tt-config-'));
    const previousCwd = cwd();
    try {
      await writeFile(
        join(dir, 'tathya.config.yaml'),
        YAML.stringify({
          baseUrl: 'http://127.0.0.1:8000',
          auth: {
            loginPath: '/login',
            roles: [{ name: 'admin', username: 'admin@example.com', password: 'password' }],
          },
        }),
      );

      chdir(dir);
      const config = loadConfig();
      await writeFile(join(dir, 'short.yaml'), YAML.stringify({ baseUrl: '127.0.0.1:8000', auth: { roles: [{ name: 'admin', username: 'a', password: 'b' }] } }));
      await writeFile(join(dir, 'broken.yaml'), YAML.stringify({ baseUrl: 'http://127.0.0.1:8000' }));
      process.env.TATHYA_CONFIG = 'short.yaml';
      // Defaults and URL normalisation come from the same validator the CLI uses.
      expect(loadConfig()).toMatchObject({ baseUrl: 'http://127.0.0.1:8000', auth: { loginPath: '/login' } });
      process.env.TATHYA_CONFIG = 'broken.yaml';
      expect(() => loadConfig()).toThrow(/Invalid config broken\.yaml/);
      delete process.env.TATHYA_CONFIG;

      expect(config).not.toBeNull();
      expect(config?.auth.roles).toHaveLength(1);
      expect(config?.auth.roles[0]).toMatchObject({
        name: 'admin',
        username: 'admin@example.com',
        password: 'password',
      });
    } finally {
      chdir(previousCwd);
      await rm(dir, { recursive: true, force: true });
    }
  });
});
