// TEMPLATE for the generated Cypress `support/tathya.ts` (see ../support.ts). This is real TypeScript,
// typechecked against the Cypress types (generator/tsconfig.cypress.json); `tt generate` swaps the
// block between the two config markers for values pinned from the user's config and prepends a
// generated-file header. It mirrors the Playwright support module helper for helper, so a rule's
// meaning is the same in both frameworks. Edit the code here, never in tests/generated/.
import { queryAllByLabelText, queryAllByPlaceholderText, queryAllByRole, type ByRoleMatcher } from '@testing-library/dom';

// <tathya:config>
const loginPath = '/login';
const errorSelector = '[role=alert]';
const resetHook: { method: 'POST' | 'GET' | 'DELETE'; path: string } | null = null;
// </tathya:config>

// Credentials never land in generated files: cypress.config.ts reads them from TATHYA_CONFIG into
// the `env` secrets, read here with cy.env(). The current role comes from `--expose role=<name>`.
type Credentials = Record<string, { username: string; password: string }>;

// ---------------------------------------------------------------------------------------------
// Locators: the priority chain, resolved like Playwright's getBy* (one implementation, retried)
// ---------------------------------------------------------------------------------------------

export type Loc = { strategy: 'testid' | 'role' | 'label' | 'placeholder' | 'id' | 'name' | 'css'; value: string };

export const byTestId = (value: string): Loc => ({ strategy: 'testid', value });
export const byRole = (role: string, name?: string): Loc => ({ strategy: 'role', value: name === undefined ? role : `${role}:${name}` });
export const byLabel = (value: string): Loc => ({ strategy: 'label', value });
export const byPlaceholder = (value: string): Loc => ({ strategy: 'placeholder', value });
export const byId = (value: string): Loc => ({ strategy: 'id', value });
export const byName = (value: string): Loc => ({ strategy: 'name', value });
export const byCss = (value: string): Loc => ({ strategy: 'css', value });

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /** Retrying query for a TathyaTest locator, rooted at the previous subject or the page body. */
      tt(locator: Loc): Chainable<JQuery<HTMLElement>>;
    }
  }
}

/** Register the `tt` query. Called once by the generated `support/e2e.ts`. */
export function registerTathyaCommands(): void {
  Cypress.Commands.addQuery('tt', function (locator: Loc) {
    return (subject: unknown) => {
      // Without a subject, look inside the form under test (`scopeForm`) while it is on the page.
      const root = Cypress.dom.isJquery(subject) && subject.length > 0 ? subject[0] : cy.$$(SCOPED).get(0) ?? cy.$$('body')[0];
      return Cypress.$(resolveAll(root, locator));
    };
  });
}

const normalize = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** The form under test, marked by `scopeForm` until the page is replaced. */
const SCOPED = '[data-tt-form]';

/**
 * Every element `locator` matches under `root`, in document order. Names, placeholders and labels
 * match whole, as the Playwright specs match them. Role queries skip inaccessible elements, as
 * getByRole does, unless `includeHidden`.
 */
export function resolveAll(root: Element, locator: Loc, includeHidden = false): HTMLElement[] {
  const container = root as HTMLElement;
  switch (locator.strategy) {
    case 'testid':
      return [...root.querySelectorAll<HTMLElement>(`[data-testid="${attrEscape(locator.value)}"]`)];
    case 'role': {
      const [role, ...nameParts] = locator.value.split(':');
      const name = nameParts.join(':');
      const wanted = normalize(name);
      return queryAllByRole(container, role as ByRoleMatcher, { hidden: includeHidden, ...(name ? { name: (accessibleName: string) => normalize(accessibleName) === wanted } : {}) });
    }
    case 'label':
      return queryAllByLabelText(container, locator.value, { exact: true });
    case 'placeholder':
      return queryAllByPlaceholderText(container, locator.value, { exact: true });
    case 'id':
      return [...root.querySelectorAll<HTMLElement>(`#${CSS.escape(locator.value)}`)];
    case 'name':
      return [...root.querySelectorAll<HTMLElement>(`[name="${attrEscape(locator.value)}"]`)];
    case 'css':
      return [...root.querySelectorAll<HTMLElement>(locator.value)];
  }
}

function attrEscape(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function isVisible(element: HTMLElement | undefined): element is HTMLElement {
  return element !== undefined && Cypress.dom.isVisible(element);
}

/** `test.step` equivalent: the step title goes to the command log, then its commands run. */
export function step(title: string, body: () => void): void {
  cy.log(`**[step]** ${title}`);
  body();
}

/**
 * Yield whether `find` locates a visible element, polling for up to SETTLE_MS: a Cypress callback
 * runs the moment the load event fired, before a client-rendered page has drawn its controls (a
 * Playwright probe's browser round-trip gives them that time).
 */
const SETTLE_MS = 2000;
function settled(find: (body: HTMLElement) => HTMLElement | undefined, deadline: number = Date.now() + SETTLE_MS): Cypress.Chainable<boolean> {
  return cy.get('body', { log: false }).then(($body) => {
    if (isVisible(find($body[0]))) return cy.wrap(true, { log: false });
    if (Date.now() >= deadline) return cy.wrap(false, { log: false });
    return cy.wait(100, { log: false }).then(() => settled(find, deadline));
  });
}

/** Fail when the target (the `ordinal`-th match) is gone; skip when it is there but hidden. */
export function skipUnlessVisible(ctx: Mocha.Context, locator: Loc, ordinal: number, reason: string): void {
  settled((body) => resolveAll(body, locator)[ordinal]).then((visible) => {
    if (visible) return;
    cy.get('body').then(($body) => {
      if (resolveAll($body[0], locator, true)[ordinal] === undefined) throw new Error('crawled control is missing');
      cy.log(reason);
      ctx.skip();
    });
  });
}

/** The `ordinal`-th match of a locator as a chainable (`.first()` for 0, `.eq(n)` otherwise). */
export function nth(locator: Loc, ordinal: number): Cypress.Chainable<JQuery<HTMLElement>> {
  return ordinal === 0 ? cy.tt(locator).first() : cy.tt(locator).eq(ordinal);
}

// ---------------------------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------------------------

/** The role of the current run (`--expose role=<name>`), used to gate role-specific groups. */
export function seedOffset(name: string): number {
  return Array.from(name).reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 100000, 0);
}

export function currentRole(): string {
  return String(Cypress.expose('role') ?? '');
}

function withCredentials(role: string, body: (credentials: { username: string; password: string }) => void): void {
  cy.env(['tathyaRoles']).then(({ tathyaRoles }) => {
    const credentials = (tathyaRoles as Credentials | undefined)?.[role];
    if (!credentials) throw new Error(`no credentials for role "${role}" (is TATHYA_CONFIG set for cypress.config.ts?)`);
    body(credentials);
  });
}

/** Call the app's reset hook, if one is configured. */
export function resetAppData(): void {
  if (!resetHook) return;
  cy.request({ method: resetHook.method, url: resetHook.path, failOnStatusCode: false });
}

/** Reset app data (when the app has a reset hook), drop the session, and log in as `role`. */
export function loginAs(role: string): void {
  resetAppData();
  cy.clearAllCookies();
  withCredentials(role, ({ username, password }) => {
    performLogin(username, password);
    assertLoggedIn();
  });
}

/**
 * Read-only runs: reuse the role's cached session while it is still valid (the login page then
 * sends an authenticated visitor elsewhere), else log in — never reset.
 */
export function ensureLoggedIn(role: string): void {
  withCredentials(role, ({ username, password }) => {
    cy.session(role, () => {
      performLogin(username, password);
      assertLoggedIn();
    }, {
      cacheAcrossSpecs: true,
      validate() {
        cy.visit(loginPath, { failOnStatusCode: false });
        cy.location('pathname').should((pathname) => {
          expect(pathname === loginPathname() && passwordFieldVisible(), 'the login form is showing').to.equal(false);
        });
      },
    });
  });
}

export function performLogin(username: string, password: string): void {
  cy.visit(loginPath, { failOnStatusCode: false });
  // Infer from the rendered form, not the empty shell a client-rendered login page starts as.
  settled((body) => body.querySelector<HTMLInputElement>('input:not([type="hidden"])') ?? undefined);
  cy.document().then((doc) => {
    const controls = loginControlsOfDocument(doc);
    fillIn(controls.username, username);
    fillIn(controls.password, password);
    cy.tt(controls.submit).first().click();
  });
}

const PASSWORD_FIELDS = 'input[type="password"], input[autocomplete="current-password"], input[name*="password"], input[id*="password"], input[placeholder*="Password"]';

function loginPathname(): string {
  return new URL(loginPath, 'http://tathyatest.local').pathname;
}

function passwordFieldVisible(selector: string = PASSWORD_FIELDS): boolean {
  return isVisible(cy.$$(selector).get(0));
}

/** Logged in = we left the login page, or the password field is gone. */
export function assertLoggedIn(): void {
  // A slow browser may still be mid-redirect after the click; the assertion retries until it holds.
  cy.location('pathname', { timeout: 15000 }).should((pathname) => {
    expect(pathname !== loginPathname() || !passwordFieldVisible(), 'still on the login form').to.equal(true);
  });
}

/**
 * Logged out = a page that needed the session is no longer reachable: revisiting it lands on
 * the login page, shows a login form, or redirects elsewhere. (Where the app sends you right
 * after logging out — home, login, a goodbye page — is app-specific and not asserted.)
 */
export function assertLoggedOut(protectedPath: string): void {
  cy.visit(protectedPath, { failOnStatusCode: false });
  cy.location('pathname').should((landed) => {
    if (landed === loginPathname()) return;
    if (passwordFieldVisible('input[type="password"], input[autocomplete="current-password"], input[name*="password"]')) return;
    expect(landed, 'a protected page is still reachable after logging out').not.to.equal(new URL(protectedPath, 'http://tathyatest.local').pathname);
  });
}

/** A rejected login shows the app's error indicator. */
export function assertLoginRejected(): void {
  cy.get(errorSelector).first().should('be.visible');
  cy.location('pathname').should('equal', loginPathname());
  cy.get('input[type="password"]').first().should('be.visible');
}

/** End the session through the logout form; submit it directly when its control is hidden. */
export function submitLogout(formSelector: string, locator: Loc): void {
  settled((body) => submitControlOf(body, formSelector, locator));
  cy.get('body').then(($body) => {
    const form = $body[0].querySelector<HTMLFormElement>(formSelector);
    if (!form) throw new Error('crawled logout form is missing');
    const control = resolveAll(form, locator)[0];
    if (isVisible(control)) cy.wrap(control).click();
    else form.requestSubmit();
  });
}

// ---------------------------------------------------------------------------------------------
// Navigation and forms
// ---------------------------------------------------------------------------------------------

/**
 * Open `url`; with `alias`, keep the document's final HTTP status for later oracles (Cypress's
 * visit yields no response). The probe is a GET of the same page, so it changes nothing.
 */
export function openPage(url: string, alias?: string): void {
  if (alias) cy.request({ url, failOnStatusCode: false }).its('status').as(alias, { type: 'static' });
  cy.visit(url, { failOnStatusCode: false });
}

/** Type a value into a field, replacing what it holds (an empty value only clears it). */
export function fillIn(locator: Loc, value: string): void {
  cy.tt(locator).first().clear();
  if (value !== '') cy.tt(locator).first().type(value, { delay: 0, parseSpecialCharSequences: false });
}

// The app's elements live in its own iframe window: `instanceof HTMLInputElement` (the spec's
// window) is always false for them, so controls are recognised by tag and events built in their window.
function isTag<K extends keyof HTMLElementTagNameMap>(element: Element | undefined, tag: K): element is HTMLElementTagNameMap[K] {
  return element !== undefined && element.tagName.toLowerCase() === tag;
}

function dispatchInputEvents(element: HTMLElement): void {
  const EventInWindow = element.ownerDocument.defaultView?.Event ?? Event;
  element.dispatchEvent(new EventInWindow('input', { bubbles: true }));
  element.dispatchEvent(new EventInWindow('change', { bubbles: true }));
}

/** Set the value directly, bypassing `maxlength` (and typing cost for very long values). */
export function forceValue(locator: Loc, value: string): void {
  cy.tt(locator).first().then(($el) => {
    const element = $el[0];
    if (isTag(element, 'input') || isTag(element, 'textarea')) {
      element.value = value;
      dispatchInputEvents(element);
    }
  });
}

/** Select a value that is not an option, by adding a temporary `<option>`. */
export function forceOption(locator: Loc, value: string): void {
  cy.tt(locator).first().then(($el) => {
    const element = $el[0];
    if (isTag(element, 'select')) {
      const option = element.ownerDocument.createElement('option');
      option.value = value;
      option.textContent = value;
      element.appendChild(option);
      element.value = value;
      dispatchInputEvents(element);
    }
  });
}

/** Leave a select with nothing selected. */
export function clearSelect(locator: Loc): void {
  cy.tt(locator).first().then(($el) => {
    const element = $el[0];
    if (isTag(element, 'select')) {
      element.selectedIndex = -1;
      dispatchInputEvents(element);
    }
  });
}

/** Uncheck every radio of the group `name`. */
export function uncheckRadios(name: string): void {
  cy.get(`[name="${name}"]`).each(($el) => {
    const element = $el[0];
    if (isTag(element, 'input') && element.type === 'radio') {
      element.checked = false;
      dispatchInputEvents(element);
    }
  });
}

/** Check the first radio of the group `name` with a value none of its options has. */
export function forceRadio(name: string, value: string): void {
  cy.get(`input[type="radio"][name="${name}"]`).first().then(($el) => {
    const element = $el[0];
    if (isTag(element, 'input')) {
      element.value = value;
      element.checked = true;
      dispatchInputEvents(element);
    }
  });
}

/** Drop a file input's selection (selectFile cannot select nothing). */
export function clearFile(locator: Loc): void {
  cy.tt(locator).first().then(($el) => {
    const element = $el[0];
    if (isTag(element, 'input')) {
      element.value = '';
      dispatchInputEvents(element);
    }
  });
}

/** A small in-memory file of the given MIME type for `selectFile` (no fixture files on disk). */
export function uploadFixture(mimeType: string): { contents: ReturnType<typeof Cypress.Buffer.from>; fileName: string; mimeType: string } {
  const extension = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'application/pdf': 'pdf', 'text/plain': 'txt', 'text/csv': 'csv', 'application/json': 'json' } as Record<string, string>)[mimeType] ?? 'bin';
  const contents = mimeType === 'image/png'
    ? Cypress.Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
    : mimeType === 'application/pdf'
      ? Cypress.Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n')
      : Cypress.Buffer.from('TathyaTest upload fixture\n');
  return { contents, fileName: 'tathyatest-upload.' + extension, mimeType };
}

/** The selector of the form `scopeForm` chose, for the oracles that look for it again. */
let chosenForm: string | undefined;

/**
 * Find the form a test acts on and mark it, so later queries look inside it: the one matching
 * `formSelector` that holds the submit control, else (for a row action) the same action on another
 * row. A form that cannot be found fails the test.
 */
export function scopeForm(formSelector: string, actionShape: string | null, locator: Loc): void {
  settled((body) => body.querySelector<HTMLElement>(formSelector) ?? undefined);
  cy.get('body').then(($body) => {
    const body = $body[0];
    const holds = (form: Element) => resolveAll(form, locator).length > 0;
    const exact = Array.from(body.querySelectorAll<HTMLFormElement>(formSelector));
    const rows = actionShape
      ? Array.from(body.querySelectorAll<HTMLFormElement>('form[action]'))
        .filter((form) => new RegExp(actionShape).test(new URL(form.getAttribute('action') ?? '', body.baseURI).pathname) && holds(form))
      : [];
    const form = exact.find(holds) ?? exact[0] ?? rows[0];
    if (!form) throw new Error('crawled form is missing: ' + formSelector);
    form.setAttribute('data-tt-form', '');
    chosenForm = exact.includes(form) ? formSelector : 'form[action="' + attrEscape(form.getAttribute('action') ?? '') + '"]';
  });
}

function submitControlOf(body: HTMLElement, formSelector: string, locator: Loc, includeHidden = false): HTMLElement | undefined {
  const form = body.querySelector(SCOPED) ?? body.querySelector(formSelector);
  return form ? resolveAll(form, locator, includeHidden)[0] : undefined;
}

/**
 * Click the form's submit control. A control hidden behind a collapsed menu skips the test; a
 * missing one fails it.
 */
export function submitForm(ctx: Mocha.Context, formSelector: string, locator: Loc): void {
  settled((body) => submitControlOf(body, formSelector, locator)).then((visible) => {
    cy.get('body').then(($body) => {
      if (visible) cy.wrap(submitControlOf($body[0], formSelector, locator)).click();
      else if (submitControlOf($body[0], formSelector, locator, true)) ctx.skip();
      else throw new Error('crawled submit control is missing');
    });
  });
}

/** Remember the submit control's text before submitting (as alias `@<name>`). */
export function captureSubmitText(formSelector: string, locator: Loc, name: string): void {
  settled((body) => submitControlOf(body, formSelector, locator));
  cy.get('body').then(($body) => cy.wrap(submitControlOf($body[0], formSelector, locator)?.textContent ?? null)).as(name, { type: 'static' });
}

// ---------------------------------------------------------------------------------------------
// Oracles — state, never message text
// ---------------------------------------------------------------------------------------------

/** Server-side validation: an error indicator is visible and the URL is back on the form page. */
export function expectServerError(selector: string, urlPattern: string): void {
  cy.get(selector).first().should('be.visible');
  cy.url().should('match', new RegExp(urlPattern));
}

/** HTML5 constraint validation blocked the submit. */
export function expectInvalid(locator: Loc): void {
  cy.tt(locator).first().should(($el) => {
    expect(($el[0] as HTMLInputElement).validity.valid, 'validity.valid').to.equal(false);
  });
}

export function expectGraceful(): void {
  expectNoServerError();
}

/** Reopening the edit page shows the submitted value: the update was stored, not only accepted. */
export function expectValuePersisted(url: string, locator: Loc, value: string): void {
  cy.visit(url, { failOnStatusCode: false });
  // The reopened page is a new document: nothing is marked, so the field is found page-wide.
  cy.tt(locator).first().should('have.value', value);
}

/** The app accepted the submission: no form shows an invalid field or error. */
export function expectNoValidationError(): void {
  cy.get('body').should(($body) => {
    expect(countValidationErrors({ selector: errorSelector, root: $body[0].ownerDocument }), 'a form shows a validation error').to.equal(0);
  });
}

/**
 * Invalid fields and error indicators shown inside forms. Messages outside forms (a success flash
 * with `role=alert`) and styled controls (a red "Delete" button) are not validation errors.
 */
function countValidationErrors({ selector, root }: { selector: string; root?: Document }): number {
  const doc = root ?? document;
  const controls = 'button, a, input, select, textarea, [role="button"]';
  const shown = (el: Element): boolean => el.getClientRects().length > 0 && doc.defaultView?.getComputedStyle(el).visibility !== 'hidden';
  return Array.from(doc.querySelectorAll('form')).flatMap((form) => [
    ...Array.from(form.querySelectorAll('[aria-invalid="true"], :user-invalid')),
    ...Array.from(form.querySelectorAll(selector)).filter((el) => !el.closest(controls) && (el.textContent ?? '').trim() !== ''),
  ]).filter(shown).length;
}


export function expectGone(selector: string): void {
  cy.then(() => cy.get(chosenForm ?? selector).should('not.exist'));
}

export function expectAbsent(locator: Loc): void {
  cy.tt(locator).should('not.exist');
}

export function expectTextVisible(text: string): void {
  cy.contains(text, { matchCase: false }).should('be.visible');
}

export function expectLanded(path: string, withSearch: boolean): void {
  cy.location().should((location) => {
    expect(withSearch ? location.pathname + location.search : location.pathname).to.equal(path);
  });
}

export function expectLandedShape(pattern: string): void {
  cy.location('pathname').should('match', new RegExp(pattern));
}

/**
 * A GET (search/filter) form round-trips its fields into the URL: every submitted value must
 * come back in the query string (an empty value may be omitted by the app).
 */
export function expectQueryEcho(params: Record<string, string>, path: string): void {
  cy.location('pathname').should('equal', path);
  cy.location('search').should((search) => {
    const query = new URLSearchParams(search);
    for (const [key, value] of Object.entries(params)) {
      const actual = query.get(key);
      if (value === '') expect(actual === null || actual === '').to.equal(true);
      else expect(actual, 'query parameter ' + key).to.equal(value);
    }
  });
  expectNoServerError();
}

/** A fieldless state-change form proves it worked by its own form reading differently afterwards. */
export function expectStateFlipped(formSelector: string, beforeAlias: `@${string}`): void {
  cy.get<string | null>(beforeAlias).then((before) => {
    expect(before, 'the submit control had no text to compare').to.be.a('string').and.not.equal('');
    cy.then(() => cy.get(chosenForm ?? formSelector).first().should(($form) => {
      expect($form.text()).not.to.contain(before);
    }));
    expectNoServerError();
  });
}

/**
 * The page settled and is not a server-error page. The status (when captured) is the primary
 * signal; the text check only looks at error-page shapes (the title, or an explicit "server error"
 * phrase), so a healthy page that merely mentions "500" or "exception" does not fail.
 */
export function expectNoServerError(statusAlias?: `@${string}`): void {
  if (statusAlias) cy.get<number>(statusAlias).should((status) => expect(status, 'server answered ' + status).to.be.lessThan(500));
  cy.title().should('not.match', /^\s*5\d\d\b|server error|\b[A-Z]\w*Exception\b/);
  cy.get('body').invoke('text').should('not.match', /(internal )?server error|whoops, looks like something went wrong/i);
}

/**
 * Allowed = a healthy (< 400) document response, OR — because SPA hosts serve deep links with an
 * error status while the client router still renders the page — staying on the route with
 * interactive content rendered. A genuine error page fails both arms.
 */
export function expectRouteAllowed(statusAlias: `@${string}`, routePath: string): void {
  cy.get<number>(statusAlias).then((status) => {
    if (status >= 400) {
      // Only a 404 can be an app shell served for a deep link; a denial stays a denial.
      expect(status, 'server answered ' + status).to.equal(404);
      cy.location('pathname').should('equal', routePath);
      cy.get('a, button, form, select, input').should('have.length.greaterThan', 0);
    }
    expectNoServerError(statusAlias);
  });
}

/**
 * A route inferred from REST conventions (`/todos/7/edit` ⇒ `/todos/7`): a 404/405 with no app
 * content behind it means the convention does not hold for this app — skip. A 5xx fails.
 */
export function expectInferredRouteOpens(ctx: Mocha.Context, statusAlias: `@${string}`, routePath: string): void {
  cy.get<number>(statusAlias).then((status) => {
    if (status === 405) ctx.skip();
    if (status === 404) {
      cy.get('body').then(($body) => {
        const anchors = [...$body[0].querySelectorAll<HTMLAnchorElement>('a[href]')];
        const sameOriginLinks = anchors.filter((anchor) => anchor.origin === anchor.ownerDocument.location.origin).length;
        if (sameOriginLinks + $body[0].querySelectorAll('form, select').length === 0) ctx.skip();
      });
    }
    expectRouteAllowed(statusAlias, routePath);
  });
}

/** Blocked = a direct denial status, or a healthy response on a DIFFERENT path (a redirect). */
export function expectRouteBlocked(statusAlias: `@${string}`, blockedPath: string): void {
  cy.get<number>(statusAlias).then((status) => {
    if (status < 400) cy.location('pathname').should('not.equal', blockedPath);
    else expect([401, 403, 404]).to.include(status);
    expectNoServerError(statusAlias);
  });
}

// ---------------------------------------------------------------------------------------------
// Login-control inference (the same rule as the crawler and the Playwright support module)
// ---------------------------------------------------------------------------------------------

// <tathya:login-infer>
export type LoginLocator = { strategy: 'testid' | 'role' | 'label' | 'placeholder' | 'id' | 'name' | 'css'; value: string };
export type LoginControls = { username: LoginLocator; password: LoginLocator; submit: LoginLocator };

/** `root` is the login page's document; pass null to use the document the code runs in. */
export function loginControlsOfDocument(root: Document | null): LoginControls {
  type Candidate = {
    tag: 'input' | 'button';
    type: string;
    name: string;
    id: string;
    placeholder: string;
    autocomplete: string;
    ariaLabel: string;
    dataAttr: string;
    dataValue: string;
    text: string;
  };
  const doc = root ?? document;
  const attr = (el: Element, name: string): string => el.getAttribute(name) ?? '';
  const visible = (el: Element): boolean =>
    el.getClientRects().length > 0 && doc.defaultView?.getComputedStyle(el).visibility !== 'hidden';
  const candidate = (el: Element): Candidate => {
    const tag = el.tagName.toLowerCase() === 'button' ? 'button' : 'input';
    const dataAttr = attr(el, 'data-test') ? 'data-test' : attr(el, 'data-testid') ? 'data-testid' : '';
    return {
      tag,
      // A <button> without a type submits its form.
      type: (attr(el, 'type') || (tag === 'button' ? 'submit' : 'text')).toLowerCase(),
      name: attr(el, 'name'),
      id: attr(el, 'id'),
      placeholder: attr(el, 'placeholder'),
      autocomplete: attr(el, 'autocomplete').toLowerCase(),
      ariaLabel: attr(el, 'aria-label'),
      dataAttr,
      dataValue: dataAttr ? attr(el, dataAttr) : '',
      text: tag === 'button' ? (el.textContent ?? '').replace(/\s+/g, ' ').trim() : attr(el, 'value'),
    };
  };
  const haystack = (c: Candidate): string =>
    [c.type, c.name, c.id, c.placeholder, c.autocomplete, c.ariaLabel, c.dataValue, c.text].join(' ').toLowerCase();
  const best = (candidates: Candidate[], score: (c: Candidate) => number): Candidate | undefined =>
    candidates
      .map((c) => ({ c, points: score(c) }))
      .filter(({ points }) => points > 0)
      .sort((a, b) => b.points - a.points)[0]?.c;
  /** Prefer what a user can see; a page that shows nothing yet still yields its elements. */
  const shown = (elements: Element[]): Candidate[] => {
    const onScreen = elements.filter(visible);
    return (onScreen.length > 0 ? onScreen : elements).map(candidate);
  };

  const skipped = ['hidden', 'submit', 'button', 'reset', 'image', 'file'];
  const inputs = shown(Array.from(doc.querySelectorAll('input')).filter((el) => !skipped.includes(attr(el, 'type').toLowerCase()) && !el.disabled));
  const buttons = shown(Array.from(doc.querySelectorAll('button, input[type="submit"], input[type="button"]')));

  const password = best(inputs, (c) => (c.type === 'password' ? 100 : 0) + (/(password|passcode|pin)/.test(haystack(c)) ? 50 : 0));
  const others = inputs.filter((c) => c !== password);
  const username = best(others, (c) =>
    (c.type === 'email' ? 100 : 0)
    + (c.autocomplete === 'username' ? 90 : 0)
    + (c.autocomplete === 'email' ? 80 : 0)
    + (/(email|username|user|account|identifier|handle)/.test(haystack(c)) ? 50 : 0))
    ?? others.find((c) => ['text', 'tel', 'number', 'search'].includes(c.type));
  const submit = best(buttons, (c) =>
    (c.dataValue ? 100 : 0)
    + (c.tag === 'button' ? 20 : 0)
    + (/(log in|login|sign in|sign-in)/.test(haystack(c)) ? 50 : 0)
    + (c.type === 'submit' ? 10 : 0)) ?? buttons[0];

  const locatorFor = (c: Candidate | undefined, fallback: string): LoginLocator => {
    if (!c) return { strategy: 'css', value: fallback };
    if (c.dataValue) {
      const escaped = c.dataValue.replace(/["\\]/g, '\\$&');
      return { strategy: 'css', value: '[' + c.dataAttr + '="' + escaped + '"]' };
    }
    if (c.placeholder) return { strategy: 'placeholder', value: c.placeholder };
    if (c.id && !/[0-9a-f]{8,}|:/.test(c.id)) return { strategy: 'id', value: c.id };
    if (c.name) return { strategy: 'name', value: c.name };
    if (c.tag === 'button' && c.text) return { strategy: 'role', value: 'button:' + c.text };
    return { strategy: 'css', value: fallback };
  };

  return {
    username: locatorFor(username, 'input:not([type="hidden"]):not([type="password"])'),
    password: locatorFor(password, 'input[type="password"]'),
    submit: locatorFor(submit, 'button[type="submit"], input[type="submit"], button:not([type])'),
  };
}
// </tathya:login-infer>
