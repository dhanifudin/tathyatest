import { createHash } from 'node:crypto';
import type { TathyaConfig } from '../config.js';

/**
 * A hash of everything in the config that changes what a crawl sees. Passwords are left out: the
 * fingerprint is written into crawl files.
 */
export function crawlFingerprint(config: Pick<TathyaConfig, 'baseUrl' | 'auth' | 'crawl'>): string {
  const shape = {
    baseUrl: config.baseUrl,
    loginPath: config.auth.loginPath,
    roles: config.auth.roles.map((role) => ({ name: role.name, username: role.username })),
    crawl: config.crawl,
  };
  return createHash('sha256').update(JSON.stringify(shape)).digest('hex');
}
