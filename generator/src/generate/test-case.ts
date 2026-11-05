import type { Field, Form, Locator, PageModel } from '../crawl/model.js';
import { isLogoutPath } from '../crawl/crud.js';
import type { FieldValue, FieldVariant } from './fieldgen.js';

export type TestCase =
  | {
      kind: 'auth';
      tier: 'positive' | 'negative';
      title: string;
      role: string;
      username: string;
      password: string;
      expectSuccess: boolean;
      /** Present for a logout scenario: the page and form whose submit ends the session. */
      logout?: { page: PageModel; form: Form };
    }
  | {
      kind: 'form';
      tier: 'positive' | 'negative' | 'edge';
      title: string;
      role: string;
      page: PageModel;
      form: Form;
      targetField: Field | null;
      variant: FieldVariant;
      values: Record<string, FieldValue>;
    }
  | {
      kind: 'interaction';
      tier: 'positive';
      title: string;
      role: string;
      page: PageModel;
      interaction: {
        type: 'link' | 'button' | 'select';
        label: string;
        locator: Locator;
        ordinal: number;
        href?: string;
        /** For type === 'select': the option value to select (a representative non-empty option). */
        optionValue?: string;
      };
    }
  | {
      kind: 'pagination';
      tier: 'positive';
      title: string;
      role: string;
      page: PageModel;
      pagination: {
        type: 'link' | 'button';
        label: string;
        locator: Locator;
        ordinal: number;
        href?: string;
        action: 'first' | 'previous' | 'next' | 'last' | 'page';
      };
    }
  | {
      kind: 'rbac';
      tier: 'positive' | 'negative';
      title: string;
      role: string;
      route: string;
      expectAllowed: boolean;
      /** UI-level denial: a link another role gets on this page must be absent for this role. */
      affordance?: { label: string; locator: Locator; href: string; page: PageModel };
      /** Route inferred from REST conventions rather than crawled: a clean 404 skips, a 5xx fails. */
      inferred?: boolean;
    };

/**
 * Whether running the case can change app data. Everything a GET can do is read-only; every
 * POST/PUT/PATCH/DELETE form (and all its validation variants), a wrong-password login (it leaves
 * auth-failure noise), and generic button clicks (they may trigger writes) are mutating.
 */
export function isMutating(testCase: TestCase): boolean {
  switch (testCase.kind) {
    case 'auth':
      return !testCase.expectSuccess || testCase.logout !== undefined;
    case 'form':
      return testCase.form.method !== 'GET';
    case 'interaction':
      if (testCase.interaction.type === 'button') return true;
      // A logout link ends the session (Breeze renders one that submits the POST logout form).
      return testCase.interaction.type === 'link' && isLogoutPath(testCase.interaction.href ?? '');
    case 'pagination':
    case 'rbac':
      return false;
  }
}
