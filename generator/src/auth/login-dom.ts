/**
 * Which controls of a login page take the username, take the password, and submit. This is the one
 * definition: the crawler and global setup evaluate it in the page, and both support-module
 * templates carry a byte-identical copy of the marked block (`test/auth/login-parity.test.ts`).
 * It must stay self-contained — it is serialised into the browser, so it may use nothing outside
 * its own body.
 */
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
