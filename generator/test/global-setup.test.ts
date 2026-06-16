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
            usernameField: 'email',
            passwordField: 'password',
            roles: [{ name: 'admin', username: 'admin@example.com', password: 'password' }],
          },
        }),
      );

      chdir(dir);
      const config = loadConfig();

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
