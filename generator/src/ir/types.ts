import type { Locator } from '../crawl/model.js';
import type { TestCase } from '../generate/test-case.js';

/**
 * The Intermediate Representation (IR) of one generated test: plain data that says WHAT the test
 * does — steps, fills, oracles — with every rule decision already taken by `ir/build.ts`. Adapters
 * (`adapters/<framework>/emitter.ts`) only decide HOW to write it in their framework's syntax.
 *
 * Each union below is rendered with an exhaustive `switch` + `assertNever` in every adapter, so a
 * new member fails `tsc` until every adapter renders it.
 */
export type TestPlan = {
  kind: TestCase['kind'];
  /** Spec file stem inside `output.dir`, without extension: `forms/todos-create`. */
  file: string;
  role: string;
  /** Title of the per-role `describe` group (the first plan of a role in a file names the group). */
  describe: string;
  /** Title of the per-form `describe` subgroup (form plans only). */
  formGroup?: string;
  /** Exact leaf test title — the manifest join key. */
  title: string;
  tags: string[];
  annotations: { type: string; description: string }[];
  steps: Step[];
};

/** A value written into a field: a runtime variable (`f_title`) or a literal string. */
export type ValueRef = { kind: 'var'; name: string } | { kind: 'literal'; value: string };

/** A crawled locator plus which match to take (`first()` for 0, `nth(n)` otherwise). */
export type Target = { locator: Locator; ordinal: number };

/** A form's submit control: scoped to the form found by `formSelector`, else the first match. */
export type SubmitTarget = { formSelector: string; locator: Locator };

/** Named navigation captures; oracles read them back (`response`, `opened`). */
export type Capture = 'response' | 'opened';

export type Step =
  /** Log in as a role: `reset` resets app data and logs in fresh; `reuse` keeps a valid session. */
  | { kind: 'login'; title: string; role: string; mode: 'reset' | 'reuse' }
  /** Log in through the login form with explicit credentials (auth scenarios). */
  | { kind: 'login-with'; title: string; username: string; password: string }
  /** Navigate to `url`; with `capture` the response status is kept for later oracles. */
  | { kind: 'open'; title: string; url: string; capture?: Capture }
  /** Declare a runtime value: `const <name> = <expr>` (a faker expression, emitted verbatim). */
  | { kind: 'declare'; name: string; expr: string }
  | { kind: 'fill'; title: string; fills: Fill[] }
  /** Remember the submit control's text before submitting (state-change forms). */
  | { kind: 'capture-text'; name: 'before'; submit: SubmitTarget }
  /** Click the form's submit control; skip the test when it is not visible. */
  | { kind: 'submit'; title: string; submit: SubmitTarget; acceptDialog: boolean }
  /** End the session through the logout form, submitting it directly when its control is hidden. */
  | { kind: 'logout'; title: string; submit: SubmitTarget }
  /** Act on a crawled control; skip the test with `skipReason` when the target is absent or hidden. */
  | { kind: 'act'; title: string; target: Target; action: { type: 'click' } | { type: 'select'; value: string }; skipReason: string }
  | { kind: 'assert'; title: string; oracles: Oracle[] };

/** One field fill; one member per way the emitter can put a value into a control. */
export type Fill =
  | { kind: 'type'; target: Locator; value: ValueRef }
  /** Upload a small in-memory fixture of `mimeType` (file inputs are never typed into). */
  | { kind: 'upload'; target: Locator; mimeType: string }
  | { kind: 'clear-file'; target: Locator }
  | { kind: 'check'; target: Locator }
  | { kind: 'set-checked'; target: Locator; checked: boolean }
  | { kind: 'select-option'; target: Locator; value: string }
  /** Uncheck every radio of the group `name` (required-empty on a radio group). */
  | { kind: 'uncheck-radios'; name: string }
  /** Check the first radio of the group `name` after giving it a value no option has (invalid-option). */
  | { kind: 'force-radio'; name: string; value: string }
  /** Select a value that is not an option, by adding a temporary `<option>` (invalid-option). */
  | { kind: 'force-option'; target: Locator; value: string }
  /** Leave a select with nothing selected (required-empty on a select). */
  | { kind: 'clear-select'; target: Locator }
  /** Set the value directly, bypassing `maxlength` and typing cost (maxlength-plus-one, very-long). */
  | { kind: 'force-value'; target: Locator; value: string };

/** One assertion. None of them checks message text — only state. */
export type Oracle =
  /** Server-side validation: the error indicator is visible and the URL is back on the form page. */
  | { type: 'server-error'; errorSelector: string; urlPattern: string }
  /** Native validation blocked the submit: the field's `validity.valid` is false. */
  | { type: 'native-invalid'; target: Locator }
  /** The page body shows no server-error wording. */
  | { type: 'body-graceful' }
  /** The deleted record's form (unique action per row) is gone from the page. */
  | { type: 'record-gone'; formSelector: string }
  /** The submit control of `formSelector` reads differently than the `before` capture. */
  | { type: 'state-flipped'; formSelector: string }
  /** A GET form echoed its submitted values into the query string. */
  | { type: 'query-echo'; params: { name: string; value: ValueRef }[] }
  /** The submitted value is rendered on the page (persistence proof). */
  | { type: 'text-visible'; value: ValueRef }
  /** The browser landed on `path` (pathname, or pathname + search when `withSearch`). */
  | { type: 'landed'; path: string; withSearch: boolean }
  | { type: 'no-server-error' }
  | { type: 'route-allowed'; path: string; capture: Capture }
  | { type: 'route-blocked'; path: string; capture: Capture }
  /** A REST-inferred route opens; a clean 404/405 without app content skips the test instead. */
  | { type: 'route-inferred'; path: string; capture: Capture }
  /** The locator has zero matches (an RBAC affordance this role must not see). */
  | { type: 'absent'; target: Locator }
  | { type: 'logged-in' }
  | { type: 'login-rejected' }
  /** A page that needed the session (`path`) is no longer reachable. */
  | { type: 'logged-out'; path: string };

/** Exhaustiveness guard for the IR unions. */
export function assertNever(value: never): never {
  throw new Error(`unhandled IR member: ${JSON.stringify(value)}`);
}
