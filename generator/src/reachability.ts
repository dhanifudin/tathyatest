/**
 * Preflight check shared by `tt crawl`, `tt generate` (when it re-crawls), `tt all`, and
 * `tt eval`: fail fast with a plain message when the target app is not up, instead of letting
 * Playwright time out page by page.
 */
export async function isReachable(baseUrl: string, timeoutMs = 5000): Promise<boolean> {
  try {
    // Any HTTP answer — even a 500 or a redirect — means a server is listening; only connection
    // failures and timeouts count as unreachable.
    await fetch(baseUrl, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    return true;
  } catch {
    return false;
  }
}

export async function assertReachable(baseUrl: string): Promise<void> {
  if (await isReachable(baseUrl)) return;
  throw new Error(`App at ${baseUrl} is not reachable — start it first (see README › Setup), then re-run.`);
}
