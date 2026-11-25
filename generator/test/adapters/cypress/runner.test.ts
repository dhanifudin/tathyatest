import { describe, expect, it } from 'vitest';
import { analyzeCypressSource, grepTitles, parseCypressResults } from '../../../src/adapters/cypress/runner.js';

describe('parseCypressResults', () => {
  it('keys outcomes by <role>-<browser> and reports other roles\' tests as skipped, not omitted', () => {
    const result = {
      runs: [{
        tests: [
          { title: ['admin · /todos', 'admin can open /todos'], state: 'passed', duration: 812, attempts: [{ state: 'passed' }] },
          { title: ['user · /todos', 'user can open /todos'], state: 'pending', duration: 0, attempts: [{ state: 'pending' }] },
          { title: ['admin · /todos', 'admin sees an error'], state: 'failed', duration: 4100, attempts: [{ state: 'failed' }] },
        ],
      }],
    };
    expect(parseCypressResults(result, 'admin', 'electron')).toEqual({
      outcomes: [
        { title: 'admin can open /todos', project: 'admin-electron', status: 'passed', durationMs: 812 },
        { title: 'user can open /todos', project: 'admin-electron', status: 'skipped', durationMs: 0 },
        { title: 'admin sees an error', project: 'admin-electron', status: 'failed', durationMs: 4100 },
      ],
    });
  });

  it('turns a run that could not start (missing browser) into an error, never into failures', () => {
    expect(() => parseCypressResults({ status: 'failed', failures: 1, message: 'Browser: webkit was not found' }, 'admin', 'webkit')).toThrow('webkit was not found');
  });

  it('selects fault-run titles with the grep plugin\'s OR separator', () => {
    expect(grepTitles(['a · b', 'c'])).toBe('a · b; c');
  });
});

describe('analyzeCypressSource', () => {
  it('counts tests, assertions, and locator strategies of a hand-written spec', () => {
    const source = `
      it('logs in', () => {
        cy.get('[data-cy="email"]').type('a');
        cy.get('#password').type('b');
        cy.get('button[type=submit]').click();
        cy.get('@alias');
        cy.url().should('include', '/dashboard');
        expect(true).to.equal(true);
      });`;
    expect(analyzeCypressSource(source)).toEqual({
      tests: 1,
      assertions: 2,
      locatorCounts: { testid: 1, role: 0, label: 0, placeholder: 0, id: 1, name: 0, css: 1 },
    });
  });
});
