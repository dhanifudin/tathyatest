import { existsSync } from 'node:fs';
import { createServer, type IncomingMessage } from 'node:http';
import { chromium, type Browser } from '@playwright/test';

/** Browser tests are skipped where Playwright's Chromium is not installed. */
export const chromiumAvailable = existsSync(chromium.executablePath());

export type Reply = { status?: number; body?: string; headers?: Record<string, string> };
export type Route = Reply | ((request: IncomingMessage, form: URLSearchParams) => Reply);

export type FixtureApp = { baseUrl: string; requests: string[]; close(): Promise<void> };

/** A local app serving a route table; unknown paths answer an empty 404. */
export async function serveRoutes(routes: Record<string, Route>): Promise<FixtureApp> {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const path = new URL(request.url ?? '/', 'http://fixture.test').pathname;
      requests.push(`${request.method ?? 'GET'} ${path}`);
      const route = routes[path] ?? { status: 404 };
      const reply = typeof route === 'function' ? route(request, new URLSearchParams(Buffer.concat(chunks).toString())) : route;
      response.writeHead(reply.status ?? 200, { 'content-type': 'text/html; charset=utf-8', ...reply.headers });
      response.end(reply.body ?? '');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('fixture server has no port');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  };
}

export function launchBrowser(): Promise<Browser> {
  return chromium.launch();
}
