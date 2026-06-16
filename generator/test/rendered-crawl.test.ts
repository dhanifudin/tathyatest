import { describe, expect, it } from 'vitest';
import { assertRenderedLoginSucceeded, normalizeInternalURL, renderedCrawlSeeds, shouldExtractCrawlPage } from '../src/extract/rendered.js';

const baseConfig = {
  auth: {
    loginPath: '/',
    roles: [{ name: 'standard', username: 'standard_user', password: 'secret_sauce' }],
  },
  crawl: { maxDepth: 3, maxPages: 100, include: [], exclude: [] },
};

describe('rendered crawl URL normalization', () => {
  it('preserves same-origin paths and queries while dropping hashes', () => {
    expect(normalizeInternalURL('/inventory.html?sort=az#items', 'https://www.saucedemo.com/', 'https://www.saucedemo.com/')).toBe('/inventory.html?sort=az');
    expect(normalizeInternalURL('cart.html', 'https://www.saucedemo.com/inventory.html', 'https://www.saucedemo.com/')).toBe('/cart.html');
  });

  it('rejects external and non-navigational URLs', () => {
    expect(normalizeInternalURL('https://example.com/inventory.html', 'https://www.saucedemo.com/', 'https://www.saucedemo.com/')).toBe('');
    expect(normalizeInternalURL('mailto:test@example.com', 'https://www.saucedemo.com/', 'https://www.saucedemo.com/')).toBe('');
    expect(normalizeInternalURL('javascript:void(0)', 'https://www.saucedemo.com/', 'https://www.saucedemo.com/')).toBe('');
  });

  it('seeds rendered crawl from post-login landing and does not invent case-study paths', () => {
    expect(renderedCrawlSeeds(baseConfig, '/inventory.html')).toEqual(['/inventory.html']);
    expect(renderedCrawlSeeds({ ...baseConfig, auth: { ...baseConfig.auth, loginPath: '/login' } }, '/inventory.html')).toEqual(['/inventory.html', '/']);
    expect(renderedCrawlSeeds({ ...baseConfig, crawl: { ...baseConfig.crawl, include: ['/reports'] } }, '/inventory.html')).toEqual(['/inventory.html', '/reports']);

    const seeds = renderedCrawlSeeds(baseConfig, '/inventory.html');
    expect(seeds).not.toContain('/todos');
    expect(seeds).not.toContain('/dashboard');
    expect(seeds).not.toContain('/admin');
  });

  it('extracts an already-loaded rendered landing page without requiring a navigation response', () => {
    expect(shouldExtractCrawlPage(null, '/inventory.html', '/inventory.html')).toBe(true);
    expect(shouldExtractCrawlPage(false, '/inventory.html', '/inventory.html')).toBe(false);
    expect(shouldExtractCrawlPage(true, '/inventory.html', '/redirected.html')).toBe(true);
  });

  it('fails clearly when login remains on the login page with controls visible', async () => {
    const page = {
      locator: () => ({
        first: () => ({
          isVisible: async () => true,
        }),
      }),
    };

    await expect(assertRenderedLoginSucceeded(page as never, baseConfig, 'standard', '/')).rejects.toThrow(
      /role "standard".*credentials may be invalid.*login page/,
    );
  });

  it('allows login-path landing when login controls are no longer visible', async () => {
    const page = {
      locator: () => ({
        first: () => ({
          isVisible: async () => false,
        }),
      }),
    };

    await expect(assertRenderedLoginSucceeded(page as never, baseConfig, 'standard', '/')).resolves.toBeUndefined();
  });
});
