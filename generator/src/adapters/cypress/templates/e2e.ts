// TEMPLATE for the generated Cypress `support/e2e.ts`, the suite's supportFile (cypress.config.ts):
// it registers the tag filter (@cypress/grep: `--expose grepTags=-@write`, `grep=<titles>`) and the
// `cy.tt(locator)` query once per spec. Edit the code here, never in tests/generated/.
import { register as registerCypressGrep } from '@cypress/grep';
import { registerTathyaCommands } from './tathya';

registerCypressGrep();
registerTathyaCommands();
