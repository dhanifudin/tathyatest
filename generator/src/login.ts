export type LoginLocatorStrategy = 'testid' | 'role' | 'label' | 'placeholder' | 'id' | 'name' | 'css';
export type LoginLocator = { strategy: LoginLocatorStrategy; value: string };
export type LoginControls = { username: LoginLocator; password: LoginLocator; submit: LoginLocator };
type LoginCandidate = {
  tag: 'input' | 'button';
  type: string;
  name: string;
  id: string;
  placeholder: string;
  autocomplete: string;
  ariaLabel: string;
  dataTest: string;
  text: string;
  value: string;
  labelText: string;
  index: number;
};

export function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  if (/^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0)(:\d+)?(\/.*)?$/i.test(trimmed)) return `http://${trimmed}`;
  return `https://${trimmed}`;
}

export function inferLoginControlsFromHtml(html: string): LoginControls {
  const candidates = extractCandidatesFromHtml(html);
  return selectLoginControls(candidates.inputs, candidates.buttons);
}

function extractCandidatesFromHtml(html: string): { inputs: LoginCandidate[]; buttons: LoginCandidate[] } {
  const inputs = [...html.matchAll(/<input\b[^>]*>/gi)].map((match, index) => parseCandidate(match[0], index, 'input'));
  const buttons = [
    ...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi),
    ...html.matchAll(/<input\b([^>]*)>/gi),
  ]
    .map((match, index) => parseCandidate(match[0], index, match[0].toLowerCase().startsWith('<button') ? 'button' : 'input'))
    .filter((candidate) => candidate.tag === 'button' || ['submit', 'button'].includes(candidate.type));
  return { inputs, buttons };
}

function parseCandidate(tag: string, index: number, fallbackTag: 'input' | 'button'): LoginCandidate {
  const type = attrValue(tag, 'type').toLowerCase();
  const tagName = tag.trim().toLowerCase().startsWith('<button') ? 'button' : fallbackTag;
  return {
    tag: tagName,
    type,
    name: attrValue(tag, 'name'),
    id: attrValue(tag, 'id'),
    placeholder: attrValue(tag, 'placeholder'),
    autocomplete: attrValue(tag, 'autocomplete'),
    ariaLabel: attrValue(tag, 'aria-label'),
    dataTest: attrValue(tag, 'data-test') || attrValue(tag, 'data-testid'),
    text: tagName === 'button' ? stripHtml(tag.replace(/^<button\b[^>]*>|<\/button>$/gi, '')) : '',
    value: attrValue(tag, 'value'),
    labelText: '',
    index,
  };
}

function selectLoginControls(inputs: LoginCandidate[], buttons: LoginCandidate[]): LoginControls {
  const username = pickUsernameCandidate(inputs) ?? inputs[0];
  const password = pickPasswordCandidate(inputs) ?? inputs.find((candidate) => candidate !== username) ?? inputs[1] ?? inputs[0];
  const submit = pickSubmitCandidate(buttons) ?? buttons[0];

  return {
    username: locatorForCandidate(username, 'username'),
    password: locatorForCandidate(password, 'password'),
    submit: locatorForCandidate(submit, 'submit'),
  };
}

function pickUsernameCandidate(inputs: LoginCandidate[]): LoginCandidate | null {
  const ranked = inputs
    .filter((input) => isLoginCandidate(input))
    .map((input) => ({ input, score: scoreUsername(input) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.input ?? null;
}

function pickPasswordCandidate(inputs: LoginCandidate[]): LoginCandidate | null {
  const ranked = inputs
    .filter((input) => isLoginCandidate(input))
    .map((input) => ({ input, score: scorePassword(input) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.input ?? null;
}

function pickSubmitCandidate(buttons: LoginCandidate[]): LoginCandidate | null {
  const ranked = buttons
    .filter((button) => button.tag === 'button' || button.type === 'submit' || button.type === 'button')
    .map((button) => ({ button, score: scoreSubmit(button) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.button ?? null;
}

function scoreUsername(input: LoginCandidate): number {
  const text = candidateText(input);
  let score = 0;
  if (input.type === 'email') score += 100;
  if (input.autocomplete.toLowerCase() === 'username') score += 90;
  if (input.autocomplete.toLowerCase() === 'email') score += 80;
  if (/(email|username|user|account|identifier|handle)/.test(text)) score += 50;
  return score;
}

function scorePassword(input: LoginCandidate): number {
  const text = candidateText(input);
  let score = 0;
  if (input.type === 'password') score += 100;
  if (/(password|passcode|pin)/.test(text)) score += 50;
  return score;
}

function scoreSubmit(button: LoginCandidate): number {
  const text = candidateText(button);
  let score = 0;
  if (button.dataTest) score += 100;
  if (button.tag === 'button') score += 20;
  if (/(log in|login|sign in|sign-in)/.test(text)) score += 50;
  if (button.type === 'submit') score += 10;
  return score;
}

function locatorForCandidate(candidate: LoginCandidate | undefined, kind: 'username' | 'password' | 'submit'): LoginLocator {
  if (!candidate) {
    if (kind === 'submit') return { strategy: 'css', value: 'button[type="submit"], input[type="submit"], button:not([type])' };
    return { strategy: 'name', value: kind === 'username' ? 'email' : 'password' };
  }
  if (candidate.dataTest) return { strategy: 'css', value: `[data-test="${cssEscape(candidate.dataTest)}"]` };
  if (candidate.labelText) return { strategy: 'label', value: candidate.labelText };
  if (candidate.placeholder) return { strategy: 'placeholder', value: candidate.placeholder };
  if (stableId(candidate.id)) return { strategy: 'id', value: candidate.id };
  if (candidate.name) return { strategy: 'name', value: candidate.name };
  if (candidate.tag === 'button') {
    const buttonText = candidate.text || candidate.value;
    if (buttonText) return { strategy: 'role', value: `button:${buttonText}` };
  }
  return { strategy: 'css', value: fallbackCss(candidate) };
}

function isLoginCandidate(input: LoginCandidate): boolean {
  return !['hidden', 'submit', 'button', 'reset', 'image', 'file'].includes(input.type);
}

function candidateText(candidate: LoginCandidate): string {
  return [candidate.type, candidate.name, candidate.id, candidate.placeholder, candidate.autocomplete, candidate.ariaLabel, candidate.dataTest, candidate.labelText, candidate.text, candidate.value]
    .join(' ')
    .toLowerCase();
}

function fallbackCss(candidate: LoginCandidate): string {
  const tag = candidate.tag === 'button' ? 'button' : 'input';
  if (candidate.name) return `${tag}[name="${cssEscape(candidate.name)}"]`;
  if (candidate.placeholder) return `${tag}[placeholder="${cssEscape(candidate.placeholder)}"]`;
  return tag;
}

function stableId(value: string): boolean {
  return value.length > 0 && !/[0-9a-f]{8,}|:/.test(value);
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function attrValue(tag: string, attr: string): string {
  const pattern = new RegExp(`${attr}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i');
  const match = tag.match(pattern);
  return match?.[2] ?? match?.[3] ?? '';
}

function cssEscape(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}
