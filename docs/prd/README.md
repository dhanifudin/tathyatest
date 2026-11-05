# Product requirements: test-framework adapters

TathyaTest generates, runs, and evaluates Playwright specs. These documents specify how to support
other frameworks, starting with **Cypress**, through an adapter pattern, so that a developer who did
not write the original code can implement it.

**Target for the first Cypress release: full parity with Playwright.** That means the same five
spec categories and three coverage tiers, read-only mode, per-role sessions, the `tt eval` metric
families (coverage, SUT coverage, fault detection, quality, reliability), cross-browser agreement
including WebKit, and the baseline comparison. The crawler stays on Playwright for every adapter by
design (`generator/src/config.ts` already warns "the crawler is always Playwright"); only the
emitted specs and the execution/evaluation path become pluggable.

## Reading order

| # | Document | Read it to learn |
|---|----------|------------------|
| 1 | [01-framework-adapters-architecture.md](01-framework-adapters-architecture.md) | What is coupled to Playwright today, the target architecture, the adapter registry |
| 2 | [02-scenario-plan-and-emitter-interface.md](02-scenario-plan-and-emitter-interface.md) | How to split `emit/ts.ts` into a neutral scenario plan plus a `SpecEmitter` |
| 3 | [03-runner-adapter-and-eval-integration.md](03-runner-adapter-and-eval-integration.md) | The `TestRunner` interface and how `tt run` and `tt eval` use it |
| 4 | [04-cypress-adapter.md](04-cypress-adapter.md) | The Cypress implementation: capability mapping, generated files, workarounds |
| 5 | [05-config-cli-and-init.md](05-config-cli-and-init.md) | Config schema, CLI, `tt init`, backward compatibility |
| 6 | [06-testing-quality-and-rollout.md](06-testing-quality-and-rollout.md) | Conformance suite, golden tests, parity matrix, CI |
| 7 | [07-implementation-roadmap.md](07-implementation-roadmap.md) | Milestones M0 to M7, exit criteria, decision log |

## Glossary

- **Adapter**: one framework implementation, made of an emitter, a scaffold, and a runner.
- **Scenario plan**: the framework-neutral description of one test (steps, values, oracle choice, skip conditions) derived from a `TestCase`.
- **Emitter**: turns scenario plans into spec source text for one framework.
- **Scaffold**: files an adapter writes next to the specs so they run (support module, framework config, global setup).
- **Runner**: starts the framework, filters tests, and returns outcomes as `SuiteRun`.
- **Conformance suite**: tests every adapter must pass (PRD 6).
- **Manifest**: `tests/generated/manifest.json`, one entry per test; the join key for `tt eval` is the leaf test title plus project name.

## Status

| PRD | Status | Owner |
|-----|--------|-------|
| 01 Architecture | Draft | unassigned |
| 02 Scenario plan and emitter | Draft | unassigned |
| 03 Runner and eval | Draft | unassigned |
| 04 Cypress adapter | Draft | unassigned |
| 05 Config and CLI | Draft | unassigned |
| 06 Testing and rollout | Draft | unassigned |
| 07 Roadmap | Draft | unassigned |

## Rules that apply to every PRD

- Requirements are numbered `R<prd>.<n>` and use MUST, SHOULD, MAY in the RFC 2119 sense.
- Paths and symbols refer to the repository at the time of writing; verify with `grep` before relying on a line number.
- The invariants in `AGENTS.md` and `CLAUDE.md` always win over a PRD; if a PRD needs to change one, change that file in the same pull request.
