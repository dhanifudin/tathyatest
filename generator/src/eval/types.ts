// Framework-neutral outcome of running a generated suite. A test runner adapter (today only the
// Playwright one in ./playwright.ts) produces a SuiteRun; metrics and statistics only ever read this.

export type TestStatus = 'passed' | 'failed' | 'skipped';

/** One test in one project (role and browser), identified by its leaf title as listed in the manifest. */
export type TestOutcome = { title: string; project: string; status: TestStatus; durationMs: number };

/** All outcomes of one execution of the suite. */
export type SuiteRun = { outcomes: TestOutcome[] };
