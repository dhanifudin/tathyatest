import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { fileURLToPath } from 'node:url';

/** Where and how an evaluation ran: enough to rerun it, and to explain differences between runs. */
export type Provenance = {
  generatedAt: string;
  /** `git rev-parse HEAD` of the working directory, `dirty` when tracked files have uncommitted changes. */
  gitCommit: string | null;
  gitDirty: boolean | null;
  toolVersion: string;
  node: string;
  playwright: string | null;
  host: { platform: string; release: string; arch: string; cpus: number; cpuModel: string; memoryGiB: number };
  protocol: {
    configPath: string;
    repeat: number;
    fakerSeed: number | null;
    comparisonBrowser: string | null;
    faultProject: string | null;
    coverage: boolean;
    faultInjection: boolean;
    baseline: boolean;
    serverMode: string;
  };
};

export type ProtocolInput = Provenance['protocol'];

function git(args: string[]): string | null {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function packageVersion(specifier: string): string | null {
  try {
    const require = createRequire(import.meta.url);
    const manifest = JSON.parse(readFileSync(require.resolve(specifier), 'utf8')) as { version?: string };
    return manifest.version ?? null;
  } catch {
    return null;
  }
}

function toolVersion(): string {
  try {
    const path = fileURLToPath(new URL('../../package.json', import.meta.url));
    return (JSON.parse(readFileSync(path, 'utf8')) as { version?: string }).version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export function collectProvenance(protocol: ProtocolInput): Provenance {
  const status = git(['status', '--porcelain', '--untracked-files=no']);
  const cpuList = cpus();
  return {
    generatedAt: new Date().toISOString(),
    gitCommit: git(['rev-parse', 'HEAD']),
    gitDirty: status === null ? null : status.length > 0,
    toolVersion: toolVersion(),
    node: process.version,
    playwright: packageVersion('@playwright/test/package.json'),
    host: {
      platform: platform(),
      release: release(),
      arch: arch(),
      cpus: cpuList.length,
      cpuModel: cpuList[0]?.model ?? 'unknown',
      memoryGiB: Math.round((totalmem() / 1024 ** 3) * 10) / 10,
    },
    protocol,
  };
}
