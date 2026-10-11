# Analysis plan: updating the JUTI manuscript for the revised implementation

Status: plan (2026-10-10). Manuscript: `tathyatest-laporan/paper/juti/main.typ` (669 lines,
18 pp., JUTI Typst template). Implementation baseline for the update: `tt` commit `65d1590`
(the Phase 12 series, see `docs/implementation-plan.md` § Phase 12).

## Why

The article was written against the July implementation and the 2026-07-04 evaluation
(`metrics/report.md`). Since then the generator changed in ways the prose describes
incorrectly (readable Playwright output, framework-neutral classification, read-only mode,
corrected variants, deeper oracles, logout / inferred-route / RBAC-affordance cases), every
evaluation number in `paper/juti/eval-numbers.typ` is stale, and the fault-detection
evaluation (EQ3, "mutation score 9/9 = 100 %") is the paper's methodologically weakest claim.

## 1. Scope

Update the manuscript so that (a) every description of how the generator works matches the
current code, (b) every number comes from a fresh `tt eval`, and (c) the fault-detection
evaluation is defensible. Keep the page budget flat (≤ 18 pp.), keep the EQ1–EQ5 structure,
keep JUTI house style (`.claude/skills/juti` in the laporan repo).

Ground truth for "how it works" is the code and its documentation, not the old prose:
`README.md` (keyword rules, read-only section), `CLAUDE.md`, `docs/implementation-plan.md`.

## 2. Experiment re-run protocol (before touching prose)

Measured cost on this host (July run): both Laravel stacks ≈ 1 h 50 m; SauceDemo ≈ 30 min.

1. Decide the fault catalogue first (§ 5) — the eval must run against the final catalogue.
2. Start both apps with coverage: `cd case-study/todo-blade && nix-shell --run "COVERAGE=1 php artisan serve"`
   (`:8000`) and the Inertia app on `:8001` (`npm run build` first). Both route files now carry
   `->except(['show'])`; run `php artisan route:clear` if a route cache exists.
3. In `tt/`: `tt eval --all-stacks` with `evaluation.repeat: 5` and faker seed 42 (as in the
   paper), `faultProject: null`. Then `tt eval -c tathya.saucedemo.config.yaml` (its own
   `metrics-saucedemo/` outDir). The report's coverage/fault lines now say "(probed)".
4. In `tathyatest-laporan/`: `make paper-juti-numbers` (runs `scripts/report-to-typst.mjs`
   with `TT_DIR=../tt`, then compiles). Also `cp ../tt/docs/diagrams/constraint-variants.svg paper/diagrams/`
   — that diagram gained `step` and `accept` rows and dropped "number" from the type-format
   row; the other two diagrams are unchanged.
5. Record in the paper: `R = 5`, seed 42, tool commit, case-study commit, run date.

Expected movement vs July — verify, do not assume: test count 103 → 104 per Laravel stack
(logout becomes an auth case, inferred show route, one affordance negative, more GET-form
variants, no number-format variant); assertion density 1.06 → ≈ 1.2; navigation coverage
denominator changes (the "next" paginator control is now recognised); route coverage
7/8 → 7/7 (the phantom show route is gone); CRUD-per-resource no longer lists `logout: create`;
execution time changes.

## 3. Section-by-section edits (line numbers refer to the current `main.typ`)

**Abstract (l. 102).** Keep "five categories of specifications", add "tagged, scenario-titled";
replace "all nine seeded faults" by the new catalogue size and score; one clause on the
read-only monitoring mode.

**Introduction, contributions (l. 139).** Add framework-neutral classification and the
read-only mode; cite the two case-study defects (§ 6) as evidence of bug-finding beyond the
seeded catalogue.

**Methodology — pipeline (l. 209–269).**
- Worked example (l. 260–266): replace the old listing
  (`test("login admin password required-empty -> error", ...)`) with a current emitted test:
  scenario title `admin · /todos/create · "Create" form → POST /todos · title rejects an empty value`,
  `{ tag: [...] }`, `app.loginAs("admin")`, `test.step` phases, import from
  `../support/tathya.js`. Keep it ≤ 15 lines.
- l. 223: after "a CRUD-operation indicator", one sentence on its derivation (`crud.ts`
  precedence: logout → explicit verb (`_method`, Turbo, HTMX) → GET = search → action-path
  keywords → submit-text keywords → POST = create), framework-neutral.
- l. 269: "five specification categories" + "emitted as one file per category and route
  shape, importing a generated support module (fixtures `role`/`app`, login, oracle helpers)".
- l. 273 / 289 (pagination): labels are matched after decoding HTML entities (Laravel's stock
  paginator escapes `»` into the arrow's accessible name).
- l. 287 (`tab-target-selection`, field-variant row): "required, format (email/url/tel only),
  pattern, length, range in the field's own format (±1, ±1 day/minute/month/week), step,
  option, accept, confirmation, unique, and edge values". Add a row: "Inferred route —
  `/r/:id/edit` or `DELETE /r/:id` — allowed-route case for `/r/:id`, self-skipping on 404/405".
- l. 299 (oracles): rewrite the last sentence — link clicks assert the landing path; GET search
  forms assert their values round-trip into the URL query; fieldless state-change forms assert
  their control reads differently afterwards; logout asserts a protected page needs login
  again; everything else asserts the absence of a server error.
- l. 303 / 461 (RBAC): add UI-level affordance negatives derived from the per-role link diff.
- Prototype (l. 309): drop the "static crawler" framing; state: one Playwright crawler, crawl
  contract versioned by `schemaVersion`, configurable app hooks (`hooks.reset`) and eval
  control plane, nothing framework-specific in the generator; Laravel is the case study.
- New short paragraph at the end of § Prototype: read-only mode — `@read`/`@write` tags,
  `tt all --read-only` as a session-reusing status sweep, the CI/monitoring use.

**Evaluation design (l. 319–427).**
- l. 323 / 358 / 371 / 378: terminology per § 5 ("seeded-fault detection"; "mutation-style"
  once, with the existing citations).
- `tab-faults` (l. 380–396): replace with the new catalogue table (§ 5), including the
  negative-control faults and an "expected outcome" column.
- l. 329: tags/annotations as a second, human-facing carrier of the manifest classification.

**Results (l. 429–612).** Regenerate all `ev*` variables, then fix the hard-coded prose:
"nine" faults (l. 102, 435, 509, 594, 636, 638); per-class `n =` in `tab-results-eq3`
(l. 522–526); the "1.06 / 1.00" example in `tab-notation` (l. 448); "seven comparable
dimensions" (l. 565); every "100 %" sentence (l. 435, 461, 592, 623, 638) only if still true;
l. 488's explanation of the uncovered route becomes a finding (§ 6); l. 604 add the read-only
cycle time.

**Threats to validity (l. 614–626).** Internal: the reset is a configured hook, absent in
read-only mode. External: framework-neutral rules reduce, but do not remove, the Laravel
bound. Construct: rewrite the catalogue paragraph per § 5 (author-built catalogue mitigated by
code-derived construction, negative controls, and real defects found).

**Conclusion / future work (l. 632–640).** Monitoring is delivered (read-only mode): move it
from future work to results. Future work: operator-based mutation analysis, non-Laravel
replication.

**Reproducibility (l. 630).** Scripts live in `tathyatest-laporan/scripts/`; name the
generator commit and both case-study route fixes.

## 4. Figures and tables checklist

`fig-constraint-variants` (recopy the SVG; caption mentions step/accept); `tab-faults` (new);
`tab-results-eq3` (per-class n; an "expected to survive" row if negative controls are used);
`tab-terms` oracle entry (broaden); `tab-metrics` EQ3 wording.

## 5. Fault-detection evaluation: recommendation

What the paper does today is **fault seeding** — nine hand-written, toggleable faults — not
mutation analysis. In the literature, mutation analysis means *automatically* generating many
small syntactic mutants with fixed operators (negate a condition, shift a boundary, delete a
statement), running the suite against each, and reporting killed / non-equivalent mutants
(DeMillo et al. 1978; Jia & Harman 2011; Papadakis et al. 2019 — the latter two are already
cited). A nine-fault, author-built catalogue scoring 100 % invites three reviewer objections:

- **ceiling effect** — nothing survives, so the metric cannot discriminate between suites;
- **catalogue bias** — the faults mirror the generator's own variant classes;
- **vocabulary overclaim** — "mutation score" promises operator-generated mutants.

Recommended path, in order of value per hour:

**A. Rename and reframe (mandatory, zero cost).** Say "seeded-fault detection rate"
everywhere; keep one sentence "measured mutation-style" with the citations; state the
catalogue size in every claim; put the manual baseline's rate (33.3 %) beside the generated
suite's in the same sentence.

**B. Make the catalogue discriminating (recommended, about one day including the re-run).**
Grow it from 9 to roughly 18 faults, derived *from the code* rather than from the generator:
one fault per Laravel validation rule present (`required`, `email`, `max`, `unique`,
`confirmed`, `date`, `in:` on status), per middleware (`EnsureRole`, auth), per controller
outcome (persist, redirect, toggle, delete, paginate), per auth path (login, logout). Add three
or four **negative controls** the generator is known not to target — a server-only closure
rule on `due_date`, a cross-field rule, a changed message text, an ownership check on
`/todos/{id}/edit` for another user's row — and report them as *expected to survive*. A score
such as 14/18 with the survivors explained is far more credible than 9/9. Implementation:
toggles at `FaultRegistry::is(...)` sites in both case studies, ids and relevance matchers in
`generator/src/eval/faults.ts` (or a JSON catalogue via `evaluation.faults.catalogue`),
`tab-faults` rows with class, description, relevant tests, expected outcome.

**C. Operator-based mutation analysis (optional, strongest).** Infection (PHP) only drives
PHPUnit, so use it as a mutant *generator* (its dry-run/JSON log lists mutants per file),
apply each mutant to the Request / Middleware / Controller files, run the manifest-relevant
Playwright tests (reuse the `tt eval` fault loop), restore, repeat: roughly 60–100 mutants ×
10–20 relevant tests × 3 s ≈ 1–2 h per stack; review survivors for equivalence. Report it as a
separate sub-table ("operator-based mutants") next to the seeded faults, citing Andrews et al.
(ICSE 2005) and Just et al. (FSE 2014) on mutants versus real faults. Only if the deadline
allows; A + B already answer the objections.

Recommendation: do A and B now; present C as future work unless at least two spare days exist.

## 6. New findings to report (one paragraph in Results, one line in Conclusion)

1. Laravel's stock Tailwind paginator escapes the arrow into `aria-label` (`Next &raquo;`), so
   the accessible name differs from the visible label; the earlier crawl silently skipped the
   "next" scenario. Found by the runtime "target not visible" guard and fixed by entity
   decoding in the label normaliser.
2. `Route::resource('todos')` declared a show route with no controller action (HTTP 500 on
   `GET /todos/{id}`); found by the inferred-route check, fixed with `except(['show'])` in both
   case studies.

Both are real defects detected outside the seeded catalogue — the strongest available answer
to the "internal completeness only" caveat in Construct validity.

## 7. Verification before resubmission

- `make paper-juti` compiles; page count ≤ 18; `grep -c evalTBD paper/juti/*.typ` is 0.
- `grep -nE "nine|9/9|1\.06|seven comparable|static crawler|only check that a DOM action" paper/juti/main.typ`
  returns nothing stale.
- `grep -noE "[A-Za-z]*[0-9]'s" paper/juti/main.typ` is empty (Typst renders a digit followed
  by `'s` as a prime symbol).
- Every `ev*` number quoted in prose matches the regenerated `eval-numbers.typ`.
- Re-read EQ3 as a hostile reviewer: catalogue size stated, construction procedure stated,
  survivors explained, baseline rate beside the generated rate.
