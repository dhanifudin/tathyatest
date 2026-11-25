/// <reference types="cypress" />
/**
 * Hand-written Cypress reference suite for the React/Inertia case study: the human baseline
 * `tt eval` compares the generated Cypress suite against (`--framework cypress`). A line-for-line
 * port of baseline.spec.ts that asserts against the SPA's rendered DOM. Runs under the root
 * cypress.config.ts like the generated suite.
 */

const admin = { email: 'admin@example.com', password: 'password' };
const user = { email: 'user@example.com', password: 'password' };

function login(creds: { email: string; password: string }) {
  cy.request('POST', '/__testing/reset');
  cy.clearAllCookies();
  cy.visit('/login');
  cy.get('input[name="email"]').type(creds.email);
  cy.get('input[name="password"]').type(creds.password);
  // Breeze React buttons carry no explicit type attribute, so target them by their text.
  cy.contains('button', /log in/i).click();
  cy.location('pathname').should('not.match', /\/login$/);
}

it('admin can log in and reach the dashboard', () => {
  login(admin);
  cy.get('input[name="password"]').should('not.exist');
});

it('login rejects a wrong password', () => {
  cy.request('POST', '/__testing/reset');
  cy.clearAllCookies();
  cy.visit('/login');
  cy.get('input[name="email"]').type(admin.email);
  cy.get('input[name="password"]').type('not-the-password');
  cy.contains('button', /log in/i).click();
  cy.get('.text-red-600, [role=alert]').first().should('be.visible');
});

it('admin can create a todo', () => {
  login(admin);
  cy.visit('/todos/create');
  const title = `Manual baseline ${Date.now()}`;
  const email = `manual.${Date.now()}@example.com`;
  cy.get('input[name="title"]').type(title);
  cy.get('input[name="contact_email"]').type(email);
  cy.get('input[name="contact_email_confirmation"]').type(email);
  cy.get('select[name="status"]').select('open');
  cy.contains('button', /create/i).click();
  cy.contains(title).should('be.visible');
});

it('creating a todo with an empty title shows an error', () => {
  login(admin);
  cy.visit('/todos/create');
  cy.get('input[name="contact_email"]').type(`manual.${Date.now()}@example.com`);
  cy.contains('button', /create/i).click();
  cy.get('.text-red-600, [role=alert]').first().should('be.visible');
});

it('a non-admin user cannot reach the admin module', () => {
  login(user);
  cy.request({ url: '/admin/users', failOnStatusCode: false }).then((response) => {
    expect([401, 403, 404, 302]).to.include(response.status);
  });
});

export {};
