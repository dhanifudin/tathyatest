import { resolveHrefPathAndSearch } from '../util/paths.js';
import { normalizeTitleText } from '../util/text.js';

export function paginationActionForControl(
  text: string | null,
  fallback: string,
  href: string | undefined,
  currentPageUrl: string,
  baseUrl: string,
): 'first' | 'previous' | 'next' | 'last' | 'page' | null {
  const label = normalizePaginationLabel(text || fallback);
  const target = href ? resolveHrefPathAndSearch(href, baseUrl) : null;
  const current = resolveHrefPathAndSearch(currentPageUrl, baseUrl);
  // ?page=1 is the default page: a "1" link on /todos points at the page we are already on
  // (some paginators link the current page too) and exercises nothing.
  if (target && current && stripDefaultPageQuery(target) === stripDefaultPageQuery(current)) return null;
  if (isPreviousLabel(label)) return 'previous';
  if (isNextLabel(label)) return 'next';
  if (isFirstLabel(label)) return 'first';
  if (isLastLabel(label)) return 'last';
  if (isPageLabel(label)) return 'page';
  if (target && hasPaginationQuery(target)) return 'page';
  return null;
}

export function isPaginationCandidate(text: string | null, fallback: string, href: string | undefined, currentPageUrl: string, baseUrl: string): boolean {
  return paginationActionForControl(text, fallback, href, currentPageUrl, baseUrl) !== null;
}

export function normalizePaginationLabel(text: string): string {
  // The fallback label is a locator value ("link:Next »"); drop the role prefix. Then decode
  // HTML entities — Laravel's stock paginator escapes its arrow into the aria-label, so the
  // visible desktop control is literally named "Next &raquo;" — and strip arrow decoration
  // ("Next »", "« Previous") so the action classifies, keeping pure-symbol labels ("«") intact.
  const label = decodeEntities(normalizeTitleText(text).replace(/^(link|button|menuitem|tab):/i, '')).toLowerCase();
  return /[a-z0-9]/.test(label) ? label.replace(/[«»‹›←→<>]/g, '').trim() : label;
}

export const NAMED_ENTITIES: Record<string, string> = {
  raquo: '»', laquo: '«', rsaquo: '›', lsaquo: '‹', rarr: '→', larr: '←', gt: '>', lt: '<', amp: '&', nbsp: ' ',
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

export function isPreviousLabel(label: string): boolean {
  return /^(previous|prev|older|‹|«|<|←)$/i.test(label);
}

export function isNextLabel(label: string): boolean {
  return /^(next|newer|›|»|>|→)$/i.test(label);
}

export function isFirstLabel(label: string): boolean {
  return /^(first|<<)$/i.test(label);
}

export function isLastLabel(label: string): boolean {
  return /^(last|>>)$/i.test(label);
}

export function isPageLabel(label: string): boolean {
  return /^page\s+\d+$/i.test(label) || /^\d+$/.test(label);
}

export function stripDefaultPageQuery(pathAndSearch: string): string {
  const [pathname = '/', search = ''] = pathAndSearch.split('?', 2);
  const params = new URLSearchParams(search);
  for (const key of [...params.keys()]) {
    if (/^(page|p|pageNo|pageNum|pageNumber)$/i.test(key) && params.get(key) === '1') params.delete(key);
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function hasPaginationQuery(targetPathAndSearch: string): boolean {
  const query = targetPathAndSearch.split('?', 2)[1] ?? '';
  if (!query) return false;
  const params = new URLSearchParams(query);
  return [...params.keys()].some((key) => /^(page|p|pageNo|pageNum|pageNumber|offset|start|cursor|after|before|limit)$/i.test(key));
}
