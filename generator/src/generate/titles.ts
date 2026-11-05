import type { Field, Form } from '../crawl/model.js';
import { canonicalPath } from '../util/paths.js';
import type { FieldVariant } from './fieldgen.js';
import { normalizePaginationLabel } from './pagination-labels.js';
import { normalizeTitleText } from '../util/text.js';

export function formTitleSignature(form: Form): string {
  const parts = [`action ${canonicalPath(form.action)}`, `method ${form.method}`];
  const submitText = normalizeTitleText(form.submit.text);
  if (submitText) parts.push(`submit ${submitText}`);
  if (form.fields.length > 0) parts.push(`fields ${form.fields.map((field) => field.name).join(',')}`);
  return `form [${parts.join('; ')}]`;
}

export function paginationTitle(role: string, canonicalPageUrl: string, action: 'first' | 'previous' | 'next' | 'last' | 'page', label: string): string {
  // Numbered labels come as "2", "Page 2", or an accessible name like "Go to page 2".
  const number = normalizePaginationLabel(label).match(/\d+/)?.[0] ?? normalizeTitleText(label);
  const move = action === 'page' ? `goes to page ${number}` : `goes to the ${action} page`;
  return `${role} · ${canonicalPageUrl} · ${move}`;
}

/**
 * `"Create" form → POST /todos`, with ` #n` when the same page repeats an identical form (two
 * logout forms in a header and a drawer, say). Titles stay unique because the role, the page,
 * this label, and the field/variant phrase are all part of them.
 */
export function formLabel(form: Form, ordinal: number | null): string {
  const submitText = normalizeTitleText(form.submit.text);
  const label = `${submitText ? `"${submitText}" form` : 'form'} → ${form.method} ${canonicalPath(form.action)}`;
  return ordinal === null ? label : `${label} #${ordinal}`;
}

/** The scenario phrase for one field variant, e.g. `title rejects an empty value`. */
export function humanVariant(field: Pick<Field, 'name' | 'type'>, variant: Pick<FieldVariant, 'name' | 'outcome'>): string {
  const name = field.name;
  switch (variant.name) {
    case 'valid': return `${name} accepts a valid value`;
    case 'required-empty': return `${name} rejects an empty value`;
    case 'pattern-fail': return `${name} rejects a value that breaks its pattern`;
    case 'minlength-minus-one': return `${name} rejects a value one character short of the minimum length`;
    case 'maxlength-plus-one': return `${name} rejects a value one character over the maximum length`;
    case 'maxlength-exact': return `${name} accepts a value at exactly the maximum length`;
    case 'very-long': return `${name} survives a very long value`;
    case 'min-minus-one': return `${name} rejects a value below the minimum`;
    case 'max-plus-one': return `${name} rejects a value above the maximum`;
    case 'step-misaligned': return `${name} rejects a value off the step grid`;
    case 'accept-mismatch': return `${name} rejects a file of a type it does not accept`;
    case 'unicode': return `${name} survives unicode input`;
    case 'whitespace': return `${name} survives surrounding whitespace`;
    case 'invalid-option': return `${name} rejects an option that is not offered`;
    case 'duplicate': return `${name} rejects a duplicate value`;
    case 'confirmation-mismatch': return `${name} rejects a mismatched confirmation`;
    case 'optional-omitted': return `${name} can be left out`;
    default:
      if (variant.name.endsWith('-format')) return `${name} rejects a malformed ${variant.name.slice(0, -'-format'.length)}`;
      return `${name} ${variant.name} (expects ${variant.outcome})`;
  }
}

export function controlLabel(text: string | null, fallback: string): string {
  return normalizeTitleText(text) || fallback;
}
