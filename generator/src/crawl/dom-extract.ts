import type { Page } from '@playwright/test';
import type { FieldConstraints, Form, PageModel } from './model.js';
import { classifyCrudOp, type CrudSignals } from './crud.js';
import { enrichAccessibility, type RawLocator } from './a11y-merge.js';

/** One page as read from the live DOM: the crawl-contract page model without its URL. */
export type DomPageModel = Omit<PageModel, 'url'>;

/** Read forms, fields, links, buttons, tables and controls from the rendered page, then verify and upgrade locators. */
export async function extractPage(page: Page): Promise<DomPageModel> {
  const model = await page.evaluate(() => {
    type RawField = Omit<Form['fields'][number], 'locator'> & { locator: RawLocator };
    const text = (node: Element | null): string => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const attr = (el: Element, name: string): string | null => el.getAttribute(name);
    const stableId = (value: string | null): string | null => value && !/[0-9a-f]{8,}|:/.test(value) ? value : null;
    const cssEscape = (value: string): string => {
      const escaper = (globalThis as typeof globalThis & { CSS?: { escape?: (v: string) => string } }).CSS?.escape;
      return escaper ? escaper(value) : value.replace(/["\\]/g, '\\$&');
    };
    const inferredRole = (el: Element): string => {
      switch (el.tagName.toLowerCase()) {
        case 'button':
          return 'button';
        case 'textarea':
          return 'textbox';
        case 'select':
          return 'combobox';
        case 'a':
          return attr(el, 'href') ? 'link' : '';
        case 'input': {
          switch ((attr(el, 'type') ?? 'text').toLowerCase()) {
            case 'button':
            case 'submit':
            case 'reset':
            case 'image':
              return 'button';
            case 'checkbox':
              return 'checkbox';
            case 'radio':
              return 'radio';
            case 'number':
              return 'spinbutton';
            default:
              return 'textbox';
          }
        }
        default:
          return '';
      }
    };
    const cssFallback = (el: Element): string => {
      const tag = el.tagName.toLowerCase();
      const id = attr(el, 'id');
      if (stableId(id)) return `#${cssEscape(id ?? '')}`;
      for (let parent = el.parentElement; parent; parent = parent.parentElement) {
        const parentId = attr(parent, 'id');
        if (stableId(parentId)) return `#${cssEscape(parentId ?? '')} ${tag}`;
        const parentTestId = attr(parent, 'data-testid');
        if (parentTestId) return `[data-testid="${parentTestId.replace(/["\\]/g, '\\$&')}"] ${tag}`;
        if (parent.tagName.toLowerCase() === 'html') break;
      }
      return tag;
    };
    // Elements whose locator the accessibility pass has to look at again are tagged for the
    // duration of the extraction (a11y-merge.ts removes the attribute).
    let probes = 0;
    const probeOf = (el: Element): number => {
      const known = el.getAttribute('data-tt-probe');
      if (known !== null) return Number(known);
      el.setAttribute('data-tt-probe', String(probes));
      probes += 1;
      return probes - 1;
    };
    const cssLocator = (el: Element): RawLocator => {
      const value = cssFallback(el);
      return { strategy: 'css', value, unique: document.querySelectorAll(value).length === 1 };
    };
    const labelOf = (el: Element): Element | null => {
      const id = attr(el, 'id');
      return (id ? document.querySelector(`label[for="${cssEscape(id)}"]`) : null) ?? el.closest('label');
    };
    /** The label's own wording, without the text of controls nested inside it. */
    const labelText = (label: Element | null): string => {
      if (!label) return '';
      const copy = label.cloneNode(true) as Element;
      copy.querySelectorAll('select, option, textarea, button, input').forEach((node) => node.remove());
      return text(copy);
    };
    const locatorFor = (el: Element, fallbackRole?: string): RawLocator => {
      const testid = attr(el, 'data-testid');
      if (testid) return { strategy: 'testid', value: testid };
      const name = attr(el, 'aria-label') ?? text(el);
      const role = fallbackRole ?? inferredRole(el);
      if (role && name) {
        const explicitRole = role === 'button' || role === 'link' || attr(el, 'aria-label') !== null;
        if (explicitRole) return { strategy: 'role', value: `${role}:${name}`, probe: probeOf(el), fallback: cssLocator(el) };
      }
      // `getByLabel` matches the label's whole text content, so a label that also contains the
      // control's own text (options, a textarea's value) cannot be used as a locator.
      const label = labelOf(el);
      if (label && text(label) && text(label) === labelText(label)) return { strategy: 'label', value: text(label) };
      const placeholder = attr(el, 'placeholder');
      if (placeholder) return { strategy: 'placeholder', value: placeholder };
      const sid = stableId(attr(el, 'id'));
      if (sid) return { strategy: 'id', value: sid };
      const nameAttr = attr(el, 'name');
      if (nameAttr) return { strategy: 'name', value: nameAttr, probe: probeOf(el) };
      return { ...cssLocator(el), probe: probeOf(el) };
    };
    const constraintsFor = (el: Element): FieldConstraints => ({
      minlength: el.getAttribute('minlength') === null ? null : Number(el.getAttribute('minlength')),
      maxlength: el.getAttribute('maxlength') === null ? null : Number(el.getAttribute('maxlength')),
      min: el.getAttribute('min'),
      max: el.getAttribute('max'),
      step: el.getAttribute('step'),
      pattern: el.getAttribute('pattern'),
      inputmode: el.getAttribute('inputmode'),
      accept: el.getAttribute('accept'),
    });
    const normalizeHref = (href: string): string => {
      const url = new URL(href, location.href);
      return url.origin === location.origin ? `${url.pathname}${url.search}` : '';
    };
    // Only the raw signals are read here; `classifyCrudOp` (src/crud.ts) turns them into a crudOp
    // back in Node, where the rules are unit-tested.
    const hxVerb = (el: Element | null): string | null => {
      if (!el) return null;
      for (const name of ['hx-delete', 'hx-put', 'hx-patch', 'hx-post']) {
        if (el.hasAttribute(name)) return name.slice(3);
      }
      return null;
    };
    /** A non-GET verb that script (Turbo, rails-ujs, HTMX) sends instead of the native one. */
    const scriptVerb = (el: Element | null): string | null => {
      if (!el) return null;
      const verb = (attr(el, 'data-method') ?? attr(el, 'data-turbo-method') ?? hxVerb(el))?.trim().toUpperCase();
      return verb && verb !== 'GET' ? verb : null;
    };
    const crudSignalsFor = (form: HTMLFormElement, submit: Element | null, action: string, submitText: string | null, method: 'GET' | 'POST', declaresTarget: boolean) => ({
      method,
      declaresTarget,
      spoofedMethod: form.querySelector<HTMLInputElement>('input[name="_method"]')?.value ?? null,
      turboMethod: attr(form, 'data-turbo-method') ?? (submit ? attr(submit, 'data-turbo-method') : null),
      hxMethod: hxVerb(form) ?? hxVerb(submit),
      action,
      submitText,
    });
    // CSS visibility at the crawl viewport: responsive layouts ship duplicates (a mobile
    // paginator plus a desktop one) and the mapper must prefer the control a desktop test
    // can actually click.
    const visibleOf = (el: Element): boolean => {
      const html = el as HTMLElement;
      if (typeof html.checkVisibility === 'function') return html.checkVisibility();
      const rect = html.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && window.getComputedStyle(html).visibility !== 'hidden';
    };
    return {
      title: document.title,
      forms: Array.from(document.querySelectorAll('form')).map((form) => {
        const controls = Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea'))
          .filter((field) => field.name && !['hidden', 'submit', 'button', 'reset', 'image'].includes(field.type))
          // A test cannot put a value into a disabled or read-only control.
          .filter((field) => !field.matches(':disabled') && !('readOnly' in field && field.readOnly));
        const fields: RawField[] = [];
        const radioGroups = new Map<string, RawField>();
        for (const field of controls) {
          const type = field instanceof HTMLTextAreaElement ? 'textarea' : field instanceof HTMLSelectElement ? 'select' : field.type || 'text';
          const nameHints = field.name.endsWith('_confirmation') ? ['confirmation'] : [];
          if (type === 'radio') {
            // One field per group: its radios are the options.
            const option = { value: field.value, label: labelText(labelOf(field)) || field.value };
            const group = radioGroups.get(field.name);
            if (group) {
              group.options?.push(option);
              group.required = group.required || field.required;
            } else {
              const first: RawField = { name: field.name, type, label: null, required: field.required, constraints: constraintsFor(field), options: [option], nameHints, locator: { strategy: 'name', value: field.name }, prefilled: false };
              radioGroups.set(field.name, first);
              fields.push(first);
            }
            continue;
          }
          const options = field instanceof HTMLSelectElement
            ? Array.from(field.options).map((option) => ({ value: option.value, label: text(option) }))
            : null;
          const locator = locatorFor(field);
          fields.push({
            name: field.name,
            type,
            label: locator.strategy === 'label' ? locator.value : labelText(labelOf(field)) || null,
            required: field.required,
            constraints: constraintsFor(field),
            options,
            nameHints,
            locator,
            prefilled: !['checkbox', 'file', 'select', 'password'].includes(type) && field.value !== '',
          });
        }
        // Prefer explicitly-typed submit controls; a typeless <button> is implicitly a submit but
        // is often a cancel/back control (e.g. SauceDemo checkout), so it is only a fallback.
        const submit = form.querySelector<HTMLButtonElement | HTMLInputElement>('button[type="submit"], input[type="submit"]')
          ?? form.querySelector<HTMLButtonElement>('button:not([type])');
        const action = new URL(form.action || location.href, location.href);
        const actionPath = `${action.pathname}${action.search}`;
        const submitText = submit ? (submit instanceof HTMLInputElement ? submit.value : text(submit)) || null : null;
        // The verb a submission really sends: script verbs win over the native GET default.
        const method: 'GET' | 'POST' = (scriptVerb(form) ?? scriptVerb(submit)) === null && (form.getAttribute('method') ?? 'get').toLowerCase() === 'get' ? 'GET' : 'POST';
        const declaresTarget = form.hasAttribute('method') || form.hasAttribute('action');
        return {
          action: actionPath,
          method,
          crudSignals: crudSignalsFor(form, submit, actionPath, submitText, method, declaresTarget),
          noValidate: form.noValidate,
          declaresTarget,
          hasActionAttribute: form.hasAttribute('action'),
          fields,
          submit: {
            text: submitText,
            locator: submit ? locatorFor(submit, 'button') : { strategy: 'css' as const, value: 'button[type="submit"]' },
          },
        };
      }),
      links: Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
        .map((link) => {
          const raw = (link.getAttribute('href') ?? '').trim();
          const scripted = /^javascript:/i.test(raw);
          return {
            // A `javascript:` URL has no path of its own: it acts on the page it is on.
            href: scripted ? `${location.pathname}${location.search}` : normalizeHref(link.href),
            text: text(link),
            locator: locatorFor(link, 'link'),
            visible: visibleOf(link),
            inPage: scripted || raw.startsWith('#'),
            method: scriptVerb(link),
          };
        })
        .filter((link) => link.href),
      // Capture all button-like controls: <button>, <input type=button|submit|reset|image>,
      // and elements with role=button|menuitem|tab that aren't already a button/input/a.
      // We do NOT exclude form-descendant controls here — the mapper deduplicates form-submit
      // locators via formSubmitLocators so these are harmless duplicates that get filtered out.
      buttons: (() => {
        const seen = new Set<Element>();
        const result: { text: string; locator: RawLocator; visible: boolean }[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLButtonElement>('button'))) {
          seen.add(el);
          result.push({ text: text(el), locator: locatorFor(el, 'button'), visible: visibleOf(el) });
        }
        for (const el of Array.from(document.querySelectorAll<HTMLInputElement>('input[type=button],input[type=submit],input[type=reset],input[type=image]'))) {
          if (seen.has(el)) continue;
          seen.add(el);
          const label = attr(el, 'value') ?? attr(el, 'aria-label') ?? '';
          result.push({ text: label, locator: locatorFor(el, 'button'), visible: visibleOf(el) });
        }
        for (const el of Array.from(document.querySelectorAll<Element>('[role=button],[role=menuitem],[role=tab]'))) {
          if (seen.has(el) || el.tagName === 'A' || el.tagName === 'BUTTON' || el.tagName === 'INPUT') continue;
          seen.add(el);
          result.push({ text: text(el), locator: locatorFor(el, 'button'), visible: visibleOf(el) });
        }
        return result;
      })(),
      tables: Array.from(document.querySelectorAll('table')).map((table) => ({
        headers: Array.from(table.querySelectorAll('th')).map((th) => text(th)),
        rowCount: table.querySelectorAll('tbody tr').length,
      })),
      // Orphan selects: <select> elements that are NOT inside any <form>. Form-descendant
      // selects are already captured as fields. These capture SPA sort/filter dropdowns.
      controls: Array.from(document.querySelectorAll<HTMLSelectElement>('select'))
        .filter((el) => !el.closest('form'))
        .map((el) => ({
          kind: 'select' as const,
          text: text(el) || null,
          options: Array.from(el.options).map((option) => ({ value: option.value, label: text(option) })),
          locator: locatorFor(el, 'combobox'),
        })),
    };
  });
  const raw = model as Omit<DomPageModel, 'forms'> & { forms: (Omit<Form, 'crudOp'> & { crudSignals: CrudSignals })[] };
  const classified: DomPageModel = {
    ...raw,
    forms: raw.forms.map(({ crudSignals, ...form }) => ({ ...form, crudOp: classifyCrudOp(crudSignals) })),
  };
  return enrichAccessibility(page, classified);
}
