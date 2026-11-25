import type { CrudOp } from './model.js';
import { stripQuery } from '../util/paths.js';

/**
 * Raw signals the crawler reads off a `<form>` so the CRUD classification can run in Node
 * (pure, unit-tested) instead of inside the browser `page.evaluate` closure.
 */
export type CrudSignals = {
  /** The verb a submission really sends. */
  method: 'GET' | 'POST';
  /** False when the `<form>` has neither `method` nor `action`: script handles it. Absent means true. */
  declaresTarget?: boolean;
  /** Value of a hidden `_method` input — Laravel, Rails, Symfony, Spring method spoofing. */
  spoofedMethod: string | null;
  /** `data-turbo-method` on the form or its submit control (Rails Turbo). */
  turboMethod: string | null;
  /** The verb of an `hx-post|hx-put|hx-patch|hx-delete` attribute on the form or submit (HTMX). */
  hxMethod: string | null;
  /** Resolved action path (+ query). */
  action: string;
  /** Visible text of the submit control. */
  submitText: string | null;
};

/**
 * Classify what a form does, framework-neutrally. Precedence, documented in README § "Keyword
 * rules" → CRUD-operation classification:
 *   1. an explicit non-POST verb (`_method`, `data-turbo-method`, `hx-*`): PUT/PATCH → update,
 *      DELETE → delete;
 *   2. GET forms are searches/filters → `unknown`; a script-handled form (no `method`, no `action`)
 *      never navigates, so only its submit text classifies it, else `unknown`;
 *   3. action-path keywords: delete|destroy|remove → delete, update|edit → update,
 *      create|store|new|add → create;
 *   4. submit-text keywords with the same mapping;
 *   5. any other POST → create.
 */
export function classifyCrudOp(signals: CrudSignals): CrudOp {
  // A logout form is an auth scenario whatever verb it carries.
  if (isLogoutPath(signals.action) || /^(log ?out|sign ?out)$/i.test((signals.submitText ?? '').trim())) return 'logout';
  const explicit = verbToOp(signals.spoofedMethod) ?? verbToOp(signals.turboMethod) ?? verbToOp(signals.hxMethod);
  if (explicit) return explicit;
  const text = (signals.submitText ?? '').trim().toLowerCase();
  if (signals.method === 'GET') return signals.declaresTarget === false ? opFromText(text) ?? 'unknown' : 'unknown';

  const path = stripQuery(signals.action).toLowerCase();
  if (/(^|\/)(delete|destroy|remove)(\/|$)/.test(path)) return 'delete';
  if (/(^|\/)(update|edit)(\/|$)/.test(path)) return 'update';
  if (/(^|\/)(create|store|new|add)(\/|$)/.test(path)) return 'create';

  return opFromText(text) ?? 'create';
}

function opFromText(text: string): CrudOp | null {
  if (/^(delete|remove|destroy)\b/.test(text)) return 'delete';
  if (/^(update|save changes|edit)\b/.test(text)) return 'update';
  if (/^(create|add|save|submit)\b/.test(text)) return 'create';
  return null;
}

function verbToOp(verb: string | null): CrudOp | null {
  const upper = verb?.trim().toUpperCase() ?? '';
  if (upper === 'PUT' || upper === 'PATCH') return 'update';
  if (upper === 'DELETE') return 'delete';
  return null;
}


/** `/logout`, `/auth/sign-out`, `/users/signout/` — the path alone marks a session-ending target. */
export function isLogoutPath(hrefOrAction: string): boolean {
  return /(^|\/)(logout|log-out|signout|sign-out)(\/|$)/i.test(stripQuery(hrefOrAction));
}
