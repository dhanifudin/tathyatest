#import "@preview/juti:0.1.1"
#import "setup.typ": *
#import "eval-numbers.typ": *
#import "diagram.typ": tt-flow-diagram

/**
 * Contribution References
 * 0. Conceptualization
 * 1. Methodology
 * 2. Software
 * 3. Validation
 * 4. Formal analysis
 * 5. Investigation
 * 6. Resources
 * 7. Data Curation
 * 8. Writing -- Original Draft
 * 9. Writing -- Review & Editing
 * 10. Visualization
 * 11. Supervision
 * 12. Project Administration
 * 13. Funding Acquisition
 **/

// juti 0.1.1's running head (page-header, even pages) joins exactly-two-author `short`
// names via its internal inline-enum with no separator space before "and" -- e.g.
// "F. A. Nameand S. A. Name" -- because inline-enum's join-sym branch (which normally
// supplies that space) is skipped specifically when there are 2 entries. There is no
// public template option to fix this in 0.1.1. Workaround: pad the first author's
// `short` with a trailing space so the header concatenation reads correctly; this is
// undone (via .trim()) at the one other call site that reads `.short` (the CRediT
// statement below), so it doesn't leak a stray space before that colon. Re-check this
// workaround if the juti package version changes or the author count changes from 2.
#let pad-first-author-short-for-header(authors) = if authors.len() == 2 {
  (
    (..authors.at(0), short: authors.at(0).short + " "),
    authors.at(1),
  )
} else {
  authors
}

// Authors, roles, and task assignments come from the funded research proposal
// (docs/proposal.pdf, "Tim Peneliti" table, p. iii) -- contribution-refs below are this
// port's interpretation of each person's stated tasks, mapped onto the CRediT taxonomy
// above; the authors should adjust if that mapping doesn't match their own account.
// Emails and ORCID were not in the proposal (its own biodata appendix is all bracketed
// placeholders) or discoverable via SINTA/Scholar/ResearchGate/IEEE Xplore/the official
// JTI Polinema faculty directory -- confirmed directly by the corresponding author.
#let authors = pad-first-author-short-for-header(juti.init-authors((
  (
    // Ketua (lead): coordination, system design, crawler development, results
    // analysis, writing the publication.
    name: "Dian Hanifudin Subhi",
    institution-ref: 0,
    contribution-refs: (0, 1, 2, 4, 5, 8, 9, 11, 12),
    email: "dhanifudin@polinema.ac.id",
    orcid: "0009-0009-6219-7092",
  ),
  (
    // Anggota: HTML-extraction feature development, Playwright integration, system
    // testing.
    name: "Dika Rizki Yunianto",
    institution-ref: 0,
    contribution-refs: (2, 3),
    email: "dikarizkyyunianto@polinema.ac.id",
    orcid: "0009-0000-1226-1150",
  ),
  (
    // Anggota: test-case-generation algorithm development, results validation,
    // metric evaluation.
    name: "Ridwan Rismanto",
    institution-ref: 0,
    contribution-refs: (1, 2, 3, 4),
    email: "rismanto@polinema.ac.id",
    orcid: "0009-0007-5973-1552",
  ),
  (
    // Anggota: dataset preparation, system documentation, case-study application
    // testing.
    name: "Usman Nurhasan",
    institution-ref: 0,
    contribution-refs: (5, 7),
    email: "usmannurhasan@polinema.ac.id",
    orcid: "0009-0008-4842-7421",
  ),
)))

#let institutions = (
  (
    name: "Department of Information Technology, Politeknik Negeri Malang",
    address: "Malang, Indonesia",
  ),
)

#show: juti.template.with(
  title: "TathyaTest: a generator for functional, regression, and functional-availability testing of web applications",
  authors: authors,
  corresponding-ref: 0,
  corresponding-email: none, // falls back to authors.at(corresponding-ref).email, i.e. Dian's address above -- single source of truth
  institutions: institutions,
  abstract: [
    This study proposes TathyaTest, a functional test-case generation pipeline that transforms a running web application into a per-role element model, an RBAC access matrix, and executable Playwright specifications. The contribution addresses two practical problems at once: uptime monitoring cannot assess functional availability, because an endpoint that returns HTTP 200 does not guarantee that login, role authorization, form validation, and CRUD operations actually work, while hand-writing an end-to-end test suite demands high upfront cost and is brittle to DOM structure changes. The prototype performs authenticated crawling for each role, extracts a per-role crawl contract as an auditable interface, derives positive, negative, and edge data variants from HTML constraints, and then generates five categories of specifications (auth, forms, interactions, pagination, RBAC) with seedable runtime faker data. Prototype effectiveness is evaluated through an integrated evaluation module using five metric groups: model coverage, target application (system under test, SUT) code coverage (PCOV), fault detection through mutation-style fault seeding, suite quality, and reliability and efficiency. Every measurement is reported with 95% confidence intervals, the Mann--Whitney $U$ test, and Fleiss $kappa$ cross-browser agreement. The evaluation covers three subjects: two fully instrumented Laravel case studies (Blade and Inertia React) and SauceDemo as an external subject, whose baseline consists of three independent MIT-licensed Playwright suites. On both Laravel case studies, the generated suite detected all nine seeded faults, with a mutation score of #evBladeMutScore on Blade, #evInertiaMutScore on Inertia React, and cross-browser agreement of $kappa =$ #evBladeKappa. These results show that the proposed pipeline, together with its replicable evaluation framework, is a viable foundation for regression testing and functional-availability checking of web applications.
  ],
  keywords: (
    "software testing",
    "web application",
    "test generation",
    "regression testing",
    "functional availability",
    "Playwright",
    "RBAC",
  ),
  bib: bibliography("../tathyatest-references.bib"),
  ..setup,
)

= Introduction

Modern web applications require availability checks that do not stop at endpoint status. In academic systems, administrative services, e-commerce, and internal organizational applications, users judge system quality by whether login succeeds, pages are reachable, forms can be filled in, and data can be changed. Software quality standards place functional suitability, reliability, usability, security, and maintainability as characteristics that are interrelated rather than standalone dimensions @iso25010. Uptime monitoring therefore remains necessary as an indicator that a server responds to HTTP requests, but that indicator alone is insufficient to judge whether an application's functions are genuinely available to end users.

This gap exists because technical availability and functional availability answer different questions. An application can return HTTP 200 while login fails due to a session configuration change, a form submission fails due to a validation change, a regular user can reach an admin page due to an authorization bug, or a pagination control stops working due to a DOM change. Software testing standards emphasize that functional tests need to examine external behavior through an observable oracle (the mechanism that determines whether a test passes or fails), rather than through internal state or surface responses alone @iso29119. Functional availability should therefore be read as the ability to execute the main user flows on a real browser.

End-to-end (E2E) testing is relevant evidence for functional availability because tests run through a real browser. Research from the past five years shows that web fragments, usage information, and recorded scenarios can be used to construct tests from a running application @garcia2021webusage @sunman2022automated @yandrapally2023fragment. However, browser automation still requires manual decisions about scenarios, locators, test data, and oracles, while UI tests are known to be sensitive to DOM changes, asynchronous synchronization, and flakiness @romano2021uiflaky @hashemi2022jsflaky @pei2023traf. These findings indicate that an E2E generator needs to produce tests that are both executable and auditable as artifacts.

Test-driven development (TDD) and unit tests remain important, but neither replaces external behavior testing. TDD helps maintain code design, business rules, and internal logic units, whereas interface integration failures, DOM structure changes, browser-level login failures, and cross-role access errors tend to surface at the system layer. Recent studies on test automation maturity show that automation strategy, script quality, test environment, and CI integration affect the practical value of automation, not merely the number of tests written @wang2022maturity @wang2022quality. An E2E regression baseline suite is therefore needed to complement code-level testing, but that baseline must have auditable locators, oracles, and maintainability metrics.

Based on this gap, this study proposes TathyaTest, a prototype that generates a baseline test suite directly from a running web application. Concretely, TathyaTest logs into the target application as each configured user role, records everything it finds on every page it can reach, and turns that record directly into runnable browser tests, without a human writing test scripts by hand. That record-to-test path is built as an auditable chain of artifacts: a per-role crawl contract, an RBAC access matrix, tiered test-data variants, and executable Playwright specifications; @tab-terms defines each of these terms before they are used in detail. Unlike approaches that rely on recorded scripts or natural-language descriptions, TathyaTest places the element-model contract as an explicit boundary between browser observation and test generation @sunman2022automated @alian2024autoe2e @junior2025genia. The pipeline design and the derivation of a per-role access matrix are presented as artifact contributions, while the effectiveness of those artifacts is measured through a metric-based empirical evaluation on three subjects.

These measurements are formulated into three research questions, all of which are answered by the data in @sec-results.

- *RQ1 (coverage):* To what extent does a test suite generated from authenticated DOM observation cover an application's functional surface (the set of functions exposed through the interface) at both the element-model level and the target application (system under test, SUT) code level?
- *RQ2 (fault detection):* How effective is that suite, including RBAC tests derived from the per-role access matrix, at detecting seeded functional regressions?
- *RQ3 (comparison):* How does the intrinsic quality, reliability, and efficiency of the generated suite compare with a manual baseline and independent public suites?

The contributions of this study are as follows.

- Proposing the TathyaTest architecture as a pipeline of authenticated DOM observation, element modeling, test-target mapping, and Playwright specification writing for a functional regression baseline.
- Formulating a per-role crawl contract as an auditable interface between the crawler and the generator, so that test cases are derived from observation artifacts rather than from a generator's implicit assumptions.
- Designing test generation covering auth, form, interaction, pagination, and RBAC with a positive/negative/edge spectrum derived from HTML constraints and data configuration.
- Constructing a five-metric-group empirical evaluation framework, covering model coverage, SUT code coverage, fault detection via mutation score, suite quality, and reliability and efficiency, together with empirical evidence from applying it to three cross-stack subjects and statistical tests against independent baselines.

The remainder of this paper is organized as follows. Section 2 reviews related work on automated web test generation, quality-assurance standards, RBAC, and crawler-based GUI test generators. Section 3 describes the research method, including the pipeline design, prototype implementation, and evaluation design. Section 4 presents the results for each evaluation question and discusses their implications, limitations, threats to validity, and artifact availability. Section 5 concludes the paper.

= Related work

Automated test generation for web applications shows that test scenarios can be built from observable artifacts rather than manual scripts alone. In the web domain, recent studies exploit usage information, recorded test cases, fragment-based generation, combinatorial strategies, and large-model-based approaches to produce more systematic test scenarios @garcia2021webusage @sunman2022automated @yandrapally2023fragment @letraon2023combinatorial @alian2024autoe2e. This literature supports the assumption that interface observation can be a source of test cases, while also showing the need for a clear contract between observation results and the tests that are executed.

From a quality-assurance perspective, a test generator needs to be evaluated as part of the dynamic testing process. ISO/IEC/IEEE 29119 defines testing processes and techniques, including specification-based techniques relevant to testing functional behavior from a user's point of view @iso29119. ISO/IEC 25010 places functional suitability, reliability, usability, security, maintainability, and portability as software product quality characteristics @iso25010. In addition, the oracle problem remains a key reference for explaining that generated tests are only valuable if they have a trustworthy result-judging mechanism @barr2015oracle; recent work on structural testing gaps also reaffirms that coverage percentages alone do not guarantee adequate testing of a program's structures @hossain2023structuralgaps. This evidence directs TathyaTest's evaluation to not merely count test cases, but also to assess whether generated tests represent important functions, carry an executable oracle, and support repeated regression runs.

Related work on web regression also emphasizes the balance between automation and maintainability. Abadeh @abadeh2021webregression proposes an evolutionary framework for auto-regression testing of web applications, while test-automation-maturity studies show that automation success is influenced by script quality, test stability, execution environment, and CI integration @wang2022maturity @wang2022quality. Recent work on large-model-based page-object generation also shows that locator abstraction remains an important issue in modern web testing @karagoz2026pageobject. TathyaTest therefore needs to include artifact quality indicators such as assertion density, the brittle-locator ratio, and locator-strategy distribution, so that the generated suite can be scrutinized before broader effectiveness claims are made.

RBAC requires a testing strategy that separates user perspectives. The classic RBAC model places roles as an intermediary between users and permissions, so that access-right administration is not attached directly to individuals @ferraiolo1992rbac @sandhu1996rbac. Literature on authentication and authorization also reaffirms the distinction between identity verification and access decisions, and positions RBAC as one of the commonly used authorization models @margam2026auth. The implication is that a test generator needs to observe an application from multiple roles and compare the observed access coverage. This principle underlies TathyaTest's per-role crawling.

Compared with established GUI-based test-generation tools, TathyaTest's position is closest to the crawler-based generation category. Crawljax explores Ajax applications through dynamic analysis of interface state changes and builds a state-flow graph @mesbah2012crawljax, while TESTAR generates scriptless test actions from the GUI at execution time without maintained test artifacts @vos2015testar. @tab-tools compares the relevant capabilities: unlike either tool, TathyaTest executes per-role crawling to derive an RBAC access matrix, maps field constraints into tiered positive/negative/edge variants, and produces maintainable Playwright artifacts (specifications plus their manifest) with a validation-state-based oracle, rather than mere exploration or crash detection.

#figure(
  caption: [Capability comparison with GUI test-generation tools.],
  table(
    columns: (1.4fr, 1fr, 1fr, 1.3fr),
    table.header(
      table.hline(),
      [*Capability*], [*Crawljax* @mesbah2012crawljax], [*TESTAR* @vos2015testar], [*TathyaTest*],
      table.hline(),
    ),
    [Model source], [UI state-transition graph], [GUI exploration at execution time], [authenticated per-role DOM],
    [Multi-role / RBAC], [no], [no], [yes (access matrix)],
    [Negative/edge tiers from constraints], [no], [no], [yes],
    [Oracle], [generic page invariants], [application crash or hang only], [form validation state and DOM error indicators],
    [Maintained artifact], [crawl-result model], [none], [Playwright specifications + manifest],
    [Test data], [manual or plugin], [random actions], [seedable runtime faker],
    table.hline(),
  ),
) <tab-tools>

This study positions its contribution in pipeline integration, not in a claim that a single new technique solves the entire test-generation problem. Recent literature evidence shows relevant components: UI observation, test generation, regression, locator abstraction, flakiness, RBAC, and feature-based E2E generation @sunman2022automated @romano2021uiflaky @hashemi2022jsflaky @pei2023traf @alian2024autoe2e @junior2025genia. TathyaTest combines these components through per-role crawling, an element-model contract, test-data-variant generation, and Playwright specification writing. In this position, TathyaTest is treated as a foundation for a regression baseline and functional-availability check; its effectiveness is evaluated empirically on three subjects in this study, while broader generalization still requires further replication.

= Methodology

This section describes the research method in four subsections: research approach, pipeline design, prototype implementation, and evaluation design. @tab-terms defines the recurring terms used throughout, since several of them (crawl contract, element model, access matrix, tier, oracle) name specific artifacts inside the pipeline rather than generic testing concepts.

#figure(
  caption: [Key terminology used throughout this paper.],
  table(
    columns: (auto, 2.6fr),
    table.header(
      table.hline(),
      [*Term*], [*Meaning*],
      table.hline(),
    ),
    [Crawl contract], [the JSON record, written per role, of everything the crawler observed on a page: forms, fields, constraints, links, buttons, tables, and locators],
    [Element model], [the structured representation of one crawled page's UI elements inside the crawl contract (see the worked example later in this section)],
    [Access matrix], [the role$times$route table derived by comparing what each role's crawl contract can reach, used to generate RBAC allowed-route and blocked-route tests],
    [Tier], [one of three data-variant categories generated per field: positive (valid input), negative (invalid or blocked input), or edge (boundary, very long, or unusual input)],
    [Oracle], [the assertion mechanism that decides whether a generated test passes or fails, e.g. a DOM error indicator or an HTML5 validity check],
    table.hline(),
  ),
) <tab-terms>

Each of these terms is introduced again, with a concrete example, at the point in this section where it first matters operationally.

== Research approach

This study uses a prototype-engineering approach with a design-science orientation, because its main goal is to design and assess a software artifact. The artifact under study is the TathyaTest pipeline, from target configuration, authenticated crawling, the element-model contract, and test-case mapping, through to Playwright specification writing. This approach aligns with the focus of recent test-generation research that assesses artifacts based on their ability to produce tests, oracles, coverage, and execution evidence @sunman2022automated @yandrapally2023fragment @hossain2023structuralgaps @erni2024sbft. The evaluation is a metric-based empirical study that assesses artifact effectiveness through five metric groups and statistical tests, as detailed in @subsec-eval-design.

The research stages were arranged so that every design decision has a checkable, artifact-based foundation. First, system requirements were analyzed from the perspective of functional web-application testing: login, user roles, CRUD forms, validation, navigation, search/filter, pagination, and functional monitoring. Second, the architecture was designed by separating the crawling layer, the element-model contract, test-case mapping, and specification writing. Third, the prototype was implemented as a TypeScript CLI containing a Playwright crawler, a generator, and a test runner. Fourth, a metric-based empirical evaluation was carried out on all three subjects so that the three RQs are answered by measured, cross-stack data: model and code coverage for RQ1, fault detection for RQ2, and quality, reliability, and efficiency relative to a baseline for RQ3.

== Pipeline design

=== Crawl and generate flow

The TathyaTest pipeline is designed as a layered transformation from a running application into executable test artifacts. As shown in @fig-tt-flow, the user supplies the target application, role configuration, credentials, coverage setting, and data hints. The crawl stage opens a Playwright session for each role, logs in, verifies that the login form is no longer active on the login page, and then treats the post-login landing page as the first seed. The crawler expands its queue with same-origin URLs discovered from `a[href]`, `form[action]`, `formaction`, and data attributes such as `data-href`, `data-url`, `data-route`, and `data-to`. Explicit seeds in the configuration remain supported, but are treated as tester input rather than a hidden default.

#figure(
  tt-flow-diagram,
  caption: [TathyaTest's technical flow: the crawler discovers the authenticated DOM surface, the crawl contract stores the observation results, and the generator selects test targets before producing Playwright specifications.],
) <fig-tt-flow>

Every successfully visited page is extracted into an element model. Forms store `action`, `method`, a CRUD-operation indicator, `novalidate` status, fields, HTML constraints, input options, name hints, and the submit-control locator. Links and buttons are stored with their locators, while tables store headers and row counts. Locators are selected using a semantic priority order: `data-testid`, accessible role and name, label, placeholder, a stable id, the `name` attribute, and CSS as a last resort. This ordering makes generated tests traceable back to the observed DOM and also underlies the locator-strategy-distribution and brittle-locator-ratio metrics in the suite-quality evaluation.

To make this concrete, consider the login form on the Blade case study: a `POST` form to `/login` with two required fields, `email` and `password`, each carrying a `<label>` and no `novalidate` attribute. The crawler records this page as an element-model entry in the crawl contract, shown here in simplified form:

#block(fill: rgb(245, 245, 245), inset: 8pt, radius: 2pt, width: 100%, text(size: 8.5pt)[```json
{
  "action": "/login",
  "method": "POST",
  "noValidate": false,
  "fields": [
    {
      "name": "email",
      "type": "email",
      "constraints": ["required"],
      "locator": { "strategy": "label", "value": "Email" }
    },
    {
      "name": "password",
      "type": "password",
      "constraints": ["required"],
      "locator": { "strategy": "label", "value": "Password" }
    }
  ],
  "submit": {
    "locator": { "strategy": "role", "value": "button:Log in" }
  }
}
```])

The mapper reads this single entry and produces a positive login test with valid credentials from the role configuration, plus two kinds of negative test: an auth-specific wrong-password test (from the Login-target rule in @tab-target-selection), and a required-empty variant for each field (from the generic field-variant rule in the same table). Because the form carries no `novalidate` attribute, the required-empty assertion checks the password field's `validity.valid` property rather than a specific error message:

#block(fill: rgb(245, 245, 245), inset: 8pt, radius: 2pt, width: 100%, text(size: 8.5pt)[```ts
test("login admin password required-empty -> error", async ({ page }) => {
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByLabel("Password"))
    .toHaveJSProperty("validity.valid", false);
});
```])

This same path, one crawl-contract entry producing one or more generated assertions, repeats unchanged across all five specification categories (auth, forms, interactions, pagination, RBAC); only the target-selection rule and the oracle differ per category, as summarized next.

=== Selecting test targets from the DOM

The generator does not synthesize pages or actions beyond what was observed. It only reads the per-role crawl contract, forms an access matrix from the differences between roles' crawl results, and then selects test targets from elements actually recorded in the contract. Route targets come from unique paths found by the crawler. Form targets come from forms containing fields for a valid submission and validation variants, or from field-less action forms such as delete and state-toggle. Interaction targets come from links and buttons that are not form submissions and are not logically duplicated. Pagination targets are chosen from common labels such as next, previous, first, last, page numbers, or query keys such as `page`, `cursor`, and `offset`. To reduce duplication, URLs are canonicalized, query strings that only vary data do not become new tests, and forms are grouped by action, method, CRUD operation, submit text, and field shape.

#figure(
  caption: [Determining test targets from the crawl contract.],
  table(
    columns: (0.8fr, 1.1fr, 2.2fr),
    table.header(
      table.hline(),
      [*Target*], [*Source in crawl*], [*Selection rule and generated test*],
      table.hline(),
    ),
    [Login], [auth configuration and login-page DOM], [valid login per role; wrong password for negative coverage],
    [Route/RBAC], [crawl-result page URLs], [a reachable unique path becomes an allowed-route test; its absence per role becomes a blocked-route test],
    [Form], [form model], [a form with fields gets a valid submit plus validation variants; a field-less action form becomes an action test],
    [Field variant], [field constraints and data hints], [required, format, length, range, option, confirmation, and edge values become targeted cases],
    [Interaction], [links and buttons], [non-submit controls are deduplicated by canonical target or label, then checked for navigation],
    [Pagination], [link/button labels or query keys], [next, previous, first, last, and page-number controls become pagination-behavior tests],
    table.hline(),
  ),
) <tab-target-selection>

Oracle assertions are designed to check state, not brittle message text. For forms with `novalidate`, the system checks a DOM error indicator and confirms the page returns to the form context. For native HTML5 validation, the system checks the validity state or the `:invalid` selector. Interaction and pagination tests are not treated as proof of business correctness; both only check that a DOM action can be executed without a visible server error. TathyaTest's test targets are therefore the function surface exposed by the authenticated DOM, not the application's entire hidden functionality.

=== RBAC and functional availability

For RBAC, a route is considered reachable by a given role if it appears in that role's crawl result. Differences between roles' crawl contracts form candidate positive and negative authorization tests: a route visible to admin but not to user becomes a blocked-route target for user. This approach reduces the need to manually declare every permission, but remains limited to routes visible through the DOM or through the tester's explicit seeds.

In the context of functional availability, generated tests become synthetic-check candidates that are closer to the user experience than HTTP uptime. Login flows, role access, CRUD, form validation, search/filter, pagination, and state changes can all be checked through a real browser. This claim remains bounded: TathyaTest provides a baseline from the part of the application that was successfully crawled, not a guarantee of complete coverage or superior fault detection.

== Prototype implementation

The TathyaTest prototype is implemented as a single integrated TypeScript component so that crawling and test writing share one toolchain. It contains a Playwright crawler for per-role authentication, same-origin DOM crawling, configuration validation, a cross-role access comparator, a field-variant generator, an oracle, target mapping, and a specification writer. Using a single engine guarantees consistent browser behavior for both server-rendered and JavaScript-rendered targets, so evaluation results are not confounded by differences between a static crawler and a browser-based crawler.

The prototype is operated through a single command-line interface that provides commands for configuration initialization, crawling, specification generation, suite execution, and evaluation. This interface connects the pipeline design to tester practice while ensuring every stage can be repeated as a QA workflow.

Three subject applications provide variation in rendering mechanism and access control. The first subject is the Laravel Breeze Blade Todo App, representing a server-rendered application, and the second is the Laravel Breeze Inertia React Todo App, representing a JavaScript-rendered application. Both share login, admin/user roles, Todo CRUD, done/undone toggling, search, filter, pagination, form validation, and an admin-only page. This shared feature set makes result differences easier to trace to the rendering mechanism or the TathyaTest pipeline, rather than to differences in application domain.

The third subject is *SauceDemo* (`https://www.saucedemo.com`), a public React-SPA e-commerce demo application maintained by Sauce Labs. SauceDemo was chosen as an external subject not controlled by the researchers, so PCOV instrumentation and fault endpoints are unavailable. Consequently, SUT code coverage (EQ2) and fault detection (EQ3) do not apply to this subject; its evaluation is limited to three metric groups: model coverage (EQ1), suite quality (EQ4), and reliability/efficiency/baseline comparison (EQ5).

Choosing this external subject strengthens the generalizability claim, because it shows that every pipeline stage, from crawling and element modeling to test generation and Playwright emission, works on a different stack (React SPA, client-side routing, public credentials) without core-code modification.

== Evaluation design <subsec-eval-design>

=== Evaluation questions and subjects

The evaluation breaks the three research questions down into five evaluation questions (EQ): RQ1 is answered by EQ1 and EQ2, RQ2 by EQ3, and RQ3 by EQ4 and EQ5 (the full mapping is in @tab-metrics). Each EQ maps to one metric group: (EQ1) how broadly the pipeline tests the application's element model; (EQ2) how much SUT code the generated suite reaches; (EQ3) how effectively the suite detects faults through mutation-style fault seeding; (EQ4) how good the intrinsic quality of the generated tests is; and (EQ5) how reliable and efficient the pipeline is compared with a manual baseline. All metrics are computed by the evaluation module and written as a structured report in JSON and Markdown.

The evaluation uses three subjects. The first two, Blade and Inertia React, are crawled with the same Playwright engine, built with parallel features, and fully instrumented (PCOV, fault endpoints); their shared feature set enables cross-rendering comparison without application domain acting as a confound. The third subject, SauceDemo, tests generalizability on a different stack and under conditions without server control. Because it is external, EQ2 and EQ3 do not apply; this subject contributes to EQ1, EQ4, and EQ5. SauceDemo's EQ5 baseline uses three independent MIT-licensed Playwright suites from GitHub in place of a self-authored manual baseline, with a static quality analysis of the specification source so a comparison remains available even though the public suites are not executed.

=== Evaluation flow and scenarios

The evaluation flow is orchestrated by the evaluation module so every result can be traced to a clear artifact. For each stack, the evaluation module times the crawl and generate stages, runs the generated suite for $R$ repetitions (for confidence intervals and flake rate), runs the case study's manual suite, collects SUT code coverage, and then injects each fault in the catalogue. The generate stage also writes a generation manifest with one entry per test, so coverage and quality metrics are computed without parsing specification code. Separating these phases isolates the source of failure (target application, crawler, or generator) and strengthens the interpretation of each EQ. Per-test outcome data comes from Playwright's built-in JSON reporter, while metric and statistical computation is done by a pure module separate from execution orchestration.

Evaluation scenarios must reflect functions directly experienced by users. @tab-scenarios summarizes login, RBAC, CRUD, validation, search/filter, pagination, and state-change scenarios. These scenarios serve as the reference set of functional targets expected to appear in the generated test suite; if a scenario is not represented in the generated output, the gap can be traced back to the crawl model or the mapping rules.

#figure(
  caption: [Functional evaluation scenarios.],
  table(
    columns: (auto, 1.5fr, 1fr),
    table.header(
      table.hline(),
      [*ID*], [*Scenario*], [*Purpose*],
      table.hline(),
    ),
    [S1], [Admin and user login], [Validate the authentication flow],
    [S2], [Admin opens the admin page], [Positive RBAC],
    [S3], [User opens the admin page], [Negative RBAC],
    [S4], [Create and update a todo], [Positive CRUD],
    [S5], [Submit an invalid form], [Negative validation],
    [S6], [Long input, Unicode, whitespace], [Edge behavior],
    [S7], [Search and filter todos], [GET-form interaction],
    [S8], [Todo pagination], [Data navigation],
    [S9], [Toggle done/undone], [State-change action],
    [S10], [Delete a todo], [Destructive action],
    table.hline(),
  ),
) <tab-scenarios>

=== Metric groups and fault injection

Metrics are grouped into five groups, each answering one EQ, as summarized in @tab-metrics. The metric group for EQ1 (model coverage) and for EQ4 (suite quality) are static and computed from the generation manifest and the crawl contract. The metric group for EQ2 (SUT code coverage) requires PHP-side instrumentation: a PCOV-based middleware accumulates executed lines while the suite runs, then is matched against a token-based static analysis to obtain line, function, branch-proxy, and exact-route coverage. The metric group for EQ3 (fault detection) is this study's primary metric. The metric group for EQ5 (reliability, efficiency, baseline) uses controlled repetition with a fixed faker seed so that data variation does not obscure the flakiness signal.

#figure(
  caption: [TathyaTest's five evaluation metric groups.],
  table(
    columns: (auto, auto, 0.9fr, 2.2fr),
    table.header(
      table.hline(),
      [*EQ*], [*RQ*], [*Metric group*], [*Operational meaning*],
      table.hline(),
    ),
    [EQ1], [RQ1], [Model coverage], [element, route, CRUD-operation, RBAC-matrix-cell, constraint-kind, and tier-distribution coverage],
    [EQ2], [RQ1], [SUT code coverage], [line, function, branch-proxy (PCOV), and reached-route coverage],
    [EQ3], [RQ2], [Fault detection], [mutation score per fault class and fault-localization accuracy],
    [EQ4], [RQ3], [Test-suite quality], [assertion density, locator-strategy distribution, brittle-locator ratio, robustness score],
    [EQ5], [RQ3], [Reliability/efficiency], [flake rate, cross-browser agreement (Fleiss $kappa$), phase time, throughput, savings ratio, baseline comparison],
    table.hline(),
  ),
) <tab-metrics>

Fault detection (EQ3) is assessed through mutation-testing-style fault seeding @jia2011mutation @papadakis2019mutation. The fault catalogue (@tab-faults) contains faults that can be deterministically toggled on and off through a server-side fault registry without patching code; in mutation-testing terms, each active fault acts as a *mutant*, and a detected fault is called *killed*. For each fault, the evaluator activates it through a dedicated evaluation control endpoint, runs the relevant tests (filtered via the manifest), and marks the fault as *detected* if at least one relevant test fails. Mutation score is computed as the proportion of detected faults over the total, overall and per class. Localization accuracy measures the proportion of detected faults caught by a test that actually targets that fault class, distinguishing incidental detection from precisely targeted detection.

#figure(
  caption: [Catalogue of seeded faults.],
  table(
    columns: (0.6fr, 2.4fr),
    table.header(
      table.hline(),
      [*Class*], [*Example fault activated*],
      table.hline(),
    ),
    [validation], [remove the `required`/`email`/`unique`/`confirmed`/`max` rule],
    [authz], [disable the role middleware so an admin route opens up],
    [crud], [skip create/update persistence],
    [pagination], [fail requests beyond the first page],
    [auth], [accept any password at login],
    table.hline(),
  ),
) <tab-faults>

=== Statistical method and baseline

To keep claims defensible, every time and flakiness measurement is repeated $R$ times and reported as a mean with a 95% confidence interval (Student's $t$ distribution). Cross-browser status agreement (the extent to which Chromium, Firefox, and WebKit give the same pass/fail status for the same test) is measured with Fleiss $kappa$ @fleiss1971kappa; a value of 1 indicates identical verdicts across all three browsers. The generated suite is compared against a baseline using the non-parametric Mann--Whitney $U$ test @mann1947whitney with the rank-biserial effect size, following statistical-testing guidance for randomized algorithms in software engineering @arcuri2014statistical. The time-savings ratio is computed against an explicitly stated assumed manual per-case cost, together with its sensitivity range, so the assumption is not mistaken for an empirical result.

The baseline comparison is reinforced with a *static quality analysis* of the specification source: test count, assertion density, brittle-locator ratio, and locator-strategy distribution are computed both for the suite TathyaTest generates (from the generation manifest) and for the baseline. For the two Laravel case studies, the baseline is the manual Playwright suite included in the repository. For SauceDemo, the baseline is three independent GitHub suites detailed in @tab-baseline-public; all three are MIT-licensed and pinned to a specific commit so the comparison can be replicated. Using an independent third-party baseline strengthens the external validity of the EQ5 comparison, because the baseline was not written by the same researchers who designed TathyaTest.

#figure(
  caption: [SauceDemo public baseline suites.],
  [
    #table(
      columns: (1.5fr, 1.2fr, auto, auto),
      table.header(
        table.hline(),
        [*Suite*], [*Author*], [*License*], [*Commit*],
        table.hline(),
      ),
      [playwright-saucedemo#super[a] @baseline2026ashutoshfolane], [Ashutosh Folane], [MIT], [`0925c3c`],
      [portfolio-playwright saucedemo (POM)#super[b] @baseline2026aferminboada], [Alejandro Fermin Boada], [MIT], [`5b72fe5`],
      [automation sauceDemo playwright#super[c] @baseline2025renanpacheco], [Renan Pacheco], [MIT], [`51764d4`],
      table.hline(),
    )
    #text(size: 7pt)[
      #super[a] #link("https://github.com/ashutoshfolane/playwright-saucedemo") \
      #super[b] #link("https://github.com/aferminboada/portfolio-playwright-typescript-e2e-tests-pageObjetModel-saucedemo") \
      #super[c] #link("https://github.com/renanpacheco21/automation_sauceDemo_playwright")
    ]
  ],
) <tab-baseline-public>

All numeric values in @sec-results come directly from running the evaluation module on the three subjects and can be traced to the structured evaluation reports. For the two Laravel case studies, the server ran with coverage instrumentation active; for SauceDemo, the evaluation used the public `https://www.saucedemo.com` service with no server-side instrumentation.

= Result and discussion <sec-results>

This section reports evaluation results on all three subjects with $R = 5$ repetitions across three browsers (Chromium, Firefox, WebKit) and a fixed faker seed. The generated suite is unique per scenario: shape-based deduplication (route shape with numeric segments normalized, form shape, value-less query keys, and cross-role validation-variant deduplication) guarantees that no two tests represent the same scenario with different data. Consequently, all EQ1 coverage metrics are computed against the number of unique scenario shapes in the crawl model, not the number of DOM element instances. For both Laravel case studies, the generator produced #evBladeTestCount tests per stack with a tier distribution of #evBladeTiers across the five specification categories (auth, forms, interactions, pagination, RBAC).

== Overview of results

Before the metric-by-metric evidence, three headline numbers orient the discussion. For RQ1 (coverage), the generated suite reaches 100% of the observed model surface on all three subjects and #evBladeRouteExecCov of application routes at the code level (@sec-eq1, @sec-eq2). These two coverage figures answer different questions: the 100% model-coverage number (EQ1) is a completeness check against the tool's own crawl model, so it is largely guaranteed by construction, whereas the code-coverage figures (EQ2) measure how much of the target application's actual logic was exercised and are the harder, more informative evidence of depth. For RQ2 (fault detection), all nine seeded faults are detected, with a mutation score of #evBladeMutScore on Blade and #evInertiaMutScore on Inertia React (@sec-eq3); this is a substantive result, but bounded to the nine-fault catalogue used in this study rather than a claim about arbitrary regressions. For RQ3 (comparison), the generated suite leads the baselines on suite-quality metrics but trails the manual baseline on per-test execution time, with head-to-head verdicts of #evBladeVerdict on Blade, #evInertiaVerdict on Inertia React, and #evSauceVerdict on SauceDemo (@sec-eq4, @sec-eq5). The following subsections present the evidence behind each of these numbers, followed by a discussion of their implications, limitations, and threats to validity.

#figure(
  caption: [Notation used in the results tables and prose.],
  table(
    columns: (auto, 2.6fr),
    table.header(
      table.hline(),
      [*Notation*], [*Meaning*],
      table.hline(),
    ),
    [$R$], [number of repeated evaluation runs ($R = 5$ in this study)],
    [X% (a/b)], [percentage X, with the covered count a and total count b in parentheses],
    [a / b], [in EQ4, the generated suite's value followed by the baseline's value, in that order; for example, 1.06 / 1.00 means the generated suite averages 1.06 assertions per test versus 1.00 for the manual baseline],
    [$kappa$], [Fleiss' $kappa$, cross-browser pass/fail agreement across Chromium, Firefox, and WebKit; 1 indicates identical verdicts on all three],
    [$U$], [the Mann--Whitney $U$ test statistic comparing generated-suite and baseline execution durations],
    [$r$], [the rank-biserial effect size for that same Mann--Whitney comparison],
    [$p$], [the $p$-value from the Mann--Whitney test],
    [$plus.minus$], [half-width of a 95% confidence interval around the preceding mean],
    [$times$], [a multiplicative ratio (e.g. a time-savings ratio) or the RBAC role$times$route matrix product, depending on context],
    table.hline(),
  ),
) <tab-notation>

== EQ1: model coverage <sec-eq1>

The generated suite covers the entire observed model surface: element coverage reaches #evBladeElemCov on Blade, #evInertiaElemCov on Inertia React, and #evSauceElemCov on SauceDemo, with route coverage, the RBAC access matrix, and constraint-kind coverage all at 100% on the three subjects (@tab-results-eq1). As noted above, this 100% is a completeness figure against the crawl model TathyaTest itself builds, not against the application's entire functionality; concretely, it means that every unique path the crawler found is tested, every role$times$route cell in the access matrix has either a positive test (route reachable) or a negative test (route blocked), and every constraint kind that appears in the crawl contract (required, type, maxlength, option, confirmation, unique, robustness) is exercised by at least one variant.

Full CRUD operations are tested on the `todos` resource in both Laravel case studies, while SauceDemo, consistent with its nature, only exposes read operations on the catalogue and checkout pages. The external measure of how much of the application this actually reaches is provided by the code-coverage results in EQ2, presented next. Within the crawl-model boundary, the first half of RQ1 is answered: no observed surface escapes generation.

#figure(
  caption: [EQ1 results: model coverage per subject.],
  table(
    columns: (1.1fr, 1fr, 1fr, 1fr),
    table.header(
      table.hline(),
      [*Metric*], [*Blade*], [*Inertia*], [*SauceDemo*],
      table.hline(),
    ),
    [Element coverage], [#evBladeElemCov], [#evInertiaElemCov], [#evSauceElemCov],
    [Route coverage], [#evBladeRouteCov], [#evInertiaRouteCov], [#evSauceRouteCov],
    [Form coverage], [#evBladeFormCov], [#evInertiaFormCov], [#evSauceFormCov],
    [Field coverage], [#evBladeFieldCov], [#evInertiaFieldCov], [#evSauceFieldCov],
    [Navigation coverage], [#evBladeNavCov], [#evInertiaNavCov], [#evSauceNavCov],
    [RBAC matrix], [#evBladeRbacCov], [#evInertiaRbacCov], [#evSauceRbacCov],
    [Constraint kinds], [#evBladeConstraintCov], [#evInertiaConstraintCov], [#evSauceConstraintCov],
    [Pos/neg/edge tiers], [#evBladeTiers], [#evInertiaTiers], [#evSauceTiers],
    table.hline(),
  ),
) <tab-results-eq1>

== EQ2: SUT code coverage <sec-eq2>

At the code level, the same suite reaches #evBladeRouteExecCov of application routes (both Blade and Inertia React) with function coverage of #evBladeFuncCov and #evInertiaFuncCov and line coverage of #evBladeLineCov and #evInertiaLineCov (@tab-results-eq2; branch coverage is reported as a control-flow-line-based proxy, per the limitation noted under threats to validity). The gap between high route coverage and moderate line coverage is characteristic of interface-driven E2E testing: every controller, form request, and main validation path is exercised, while condition-handling branches not exposed through the DOM go untouched. SauceDemo is excluded because its external server cannot be instrumented. Together with EQ1, this finding completes the answer to RQ1: full surface coverage translates into substantial, though not exhaustive, server-side code reach.

#figure(
  caption: [EQ2 results: SUT code coverage (PCOV).],
  table(
    columns: (1.3fr, 1fr, 1fr),
    table.header(
      table.hline(),
      [*Metric*], [*Blade*], [*Inertia*],
      table.hline(),
    ),
    [Line coverage], [#evBladeLineCov], [#evInertiaLineCov],
    [Branch coverage (proxy)], [#evBladeBranchCov], [#evInertiaBranchCov],
    [Function coverage], [#evBladeFuncCov], [#evInertiaFuncCov],
    [Reached-route coverage], [#evBladeRouteExecCov], [#evInertiaRouteExecCov],
    table.hline(),
  ),
) <tab-results-eq2>

== EQ3: fault-detection effectiveness <sec-eq3>

All nine catalogue faults were detected: mutation score reaches #evBladeMutScore on Blade and #evInertiaMutScore on Inertia React, with a localization accuracy of #evBladeFaultLoc (@tab-results-eq3, from the catalogue in @tab-faults). Because every seeded fault represents a realistic functional regression (a missing validation rule, an open admin route, skipped persistence), the mutation score in this table is, operationally, the suite's regression-detection rate.

This localization-accuracy value shows that every detected fault was caught by a test that actually targets that fault class, not by an incidental failure, including the authorization fault, which was caught by RBAC tests derived from the per-role access matrix on both stacks. By contrast, the concise manual baseline detected only a small fraction of faults under the same configuration, consistent with its limited scenario coverage. Within the bounds of this nine-fault catalogue, RQ2 is answered affirmatively for all five classes of functional regression.

#figure(
  caption: [EQ3 results: mutation score per fault class.],
  table(
    columns: (1.3fr, 1fr, 1fr),
    table.header(
      table.hline(),
      [*Fault class*], [*Blade*], [*Inertia*],
      table.hline(),
    ),
    [validation ($n=5$)], [#evBladeMutValidation], [#evInertiaMutValidation],
    [authz ($n=1$)], [#evBladeMutAuthz], [#evInertiaMutAuthz],
    [crud ($n=1$)], [#evBladeMutCrud], [#evInertiaMutCrud],
    [pagination ($n=1$)], [#evBladeMutPagination], [#evInertiaMutPagination],
    [auth ($n=1$)], [#evBladeMutAuth], [#evInertiaMutAuth],
    table.hline(),
    [*Overall mutation score*], [*#evBladeMutScore*], [*#evInertiaMutScore*],
    [Localization accuracy], [#evBladeFaultLoc], [#evInertiaFaultLoc],
    table.hline(),
  ),
) <tab-results-eq3>

== EQ4: suite quality <sec-eq4>

The intrinsic quality of the generated suite matches the manual baseline and is far better maintained than the public suites: assertion density of #evBladeAssertDensity versus #evBladeBaseAssertDensity on Blade, and a brittle-locator ratio of #evSauceBrittle versus #evSauceBaseBrittle against the combined three SauceDemo public suites (@tab-results-eq4; see @tab-notation for the "/" notation). The stark difference in brittle-locator ratio on SauceDemo comes directly from the semantic locator priority chain: the generator picks role, label, and placeholder before falling back to CSS, while most public suites rely on CSS selectors.

Brittle-locator ratio is computed from the proportion of fallback CSS locators, and the robustness score summarizes locator-strategy position on the priority chain; the Blade/Inertia React baseline is the manual suite included in the repository, and the SauceDemo baseline is the three MIT-licensed public suites. This quality dimension is the first component of the RQ3 answer.

#figure(
  caption: [EQ4 results: suite quality, generated / baseline.],
  table(
    columns: (1.1fr, 1fr, 1fr, 1fr),
    table.header(
      table.hline(),
      [*Metric*], [*Blade*], [*Inertia*], [*SauceDemo*],
      table.hline(),
    ),
    [Test count], [#evBladeTestCount / #evBladeBaseTestCount], [#evInertiaTestCount / #evInertiaBaseTestCount], [#evSauceTestCount / #evSauceBaseTestCount],
    [Assertion density], [#evBladeAssertDensity / #evBladeBaseAssertDensity], [#evInertiaAssertDensity / #evInertiaBaseAssertDensity], [#evSauceAssertDensity / #evSauceBaseAssertDensity],
    [Brittle-locator ratio], [#evBladeBrittle / #evBladeBaseBrittle], [#evInertiaBrittle / #evInertiaBaseBrittle], [#evSauceBrittle / #evSauceBaseBrittle],
    [Locator robustness (gen.)], [#evBladeRobustness], [#evInertiaRobustness], [#evSauceRobustness],
    [Locator mix (gen.)], [#evBladeLocMix], [#evInertiaLocMix], [#evSauceLocMix],
    [Locator mix (baseline)], [#evBladeBaseLocMix], [#evInertiaBaseLocMix], [#evSauceBaseLocMix],
    table.hline(),
  ),
) <tab-results-eq4>

== EQ5: reliability, efficiency, and baseline comparison <sec-eq5>

Suite reliability is high on both controlled subjects: a flake rate of #evBladeFlake on Blade and #evInertiaFlake on Inertia React, with cross-browser agreement of $kappa =$ #evBladeKappa (@tab-results-eq5). On the external subject, a flake rate of #evSauceFlake is still acceptable given public-server variability.

Per-suite execution duration for the generated suite is higher than the concise baseline, and the difference is statistically significant (Blade: #evBladeMannWhitney). In exchange, the authoring time-savings ratio reaches #evBladeSavings against an explicitly stated assumed manual cost.

Methodologically, flake rate is computed from status inconsistency across the $R = 5$ repetitions, while $kappa$ is computed over pass/fail status; tests skipped due to role restrictions are not counted in either. The verdict row summarizes a head-to-head tabulation across seven comparable dimensions. The near-zero $kappa$ value on SauceDemo needs to be read in the context of Fleiss $kappa$'s prevalence paradox: under a highly skewed status distribution and external-server flakiness, small disagreements disproportionately depress $kappa$. Together with EQ4, this result completes the RQ3 answer: a higher per-test execution cost is traded for far broader scenario coverage and far shorter authoring time.

#figure(
  caption: [EQ5 results: reliability, efficiency, and baseline comparison.],
  table(
    columns: (1.1fr, 1fr, 1fr, 1fr),
    table.header(
      table.hline(),
      [*Metric*], [*Blade*], [*Inertia*], [*SauceDemo*],
      table.hline(),
    ),
    [Flake rate], [#evBladeFlake], [#evInertiaFlake], [#evSauceFlake],
    [Fleiss $kappa$], [#evBladeKappa], [#evInertiaKappa], [#evSauceKappa],
    [Pass rate], [#evBladePassRate], [#evInertiaPassRate], [#evSaucePassRate],
    [Crawl time], [#evBladeCrawlSec], [#evInertiaCrawlSec], [#evSauceCrawlSec],
    [Generate time], [#evBladeGenMs], [#evInertiaGenMs], [#evSauceGenMs],
    [Execution time (CI95)], [#evBladeExecSec], [#evInertiaExecSec], [#evSauceExecSec],
    [Duration per test], [#evBladePerTestSec], [#evInertiaPerTestSec], [#evSaucePerTestSec],
    [Savings ratio], [#evBladeSavings], [#evInertiaSavings], [#evSauceSavings],
    [Mann--Whitney $U$], [#evBladeMannWhitney], [#evInertiaMannWhitney], [#evSauceMannWhitney],
    [Head-to-head verdict], [#evBladeVerdict], [#evInertiaVerdict], [#evSauceVerdict],
    table.hline(),
  ),
) <tab-results-eq5>

== Summary of findings

*RQ1 (coverage).* The generated suite covers 100% of the observed functional surface on all three subjects, spanning elements, routes, forms, fields, navigation, the RBAC matrix, and constraint kinds (@tab-results-eq1). At the code level, the suite reaches #evBladeRouteExecCov of application routes with line coverage of #evBladeLineCov on Blade and #evInertiaLineCov on Inertia React (@tab-results-eq2). The limitation is clear: the 100% figure refers to the surface the crawler observed, so functions that never appear in the DOM are not generated.

*RQ2 (fault detection).* The suite detected all nine seeded faults, with a mutation score of #evBladeMutScore on Blade and #evInertiaMutScore on Inertia React and a localization accuracy of #evBladeFaultLoc (@tab-results-eq3). The authorization fault was also caught by RBAC tests derived from the per-role access matrix. This result applies to this study's fault catalogue and is not generalized to arbitrary regressions.

*RQ3 (comparison).* The generated suite leads on assertion density and locator robustness against every baseline, and on brittle-locator ratio against the public suites (#evSauceBrittle versus #evSauceBaseBrittle), with $kappa =$ #evBladeKappa on the controlled subjects. The manual baseline leads on duration per test. The head-to-head verdict was #evBladeVerdict on Blade, #evInertiaVerdict on Inertia React, and #evSauceVerdict on SauceDemo (@tab-results-eq4 and @tab-results-eq5).

== Implications of the results

These results place TathyaTest's main value in constructing a regression-testing baseline directly from a running application. Mutation score and localization accuracy shift the claim from artifact-based potential to measured fault-detection effectiveness, while reliability and efficiency metrics place that claim relative to a manual baseline through statistical testing. The head-to-head tabulation shows a complementary pattern: the generated suite leads on mutation score, assertion density, and locator robustness, while the concise manual baseline leads on duration per test and brittle-locator ratio. This pattern is consistent with TathyaTest's position as a provider of a broad-scale regression baseline, not a replacement for manual tests selectively written by a QA engineer.

Both constructs named in the title connect directly to the measured quantities. For regression testing, each seeded fault simulates a functional regression, so the EQ3 mutation score is understood as a regression-detection rate; a low flake rate and a high $kappa$ across $R = 5$ repetitions show the stability required of a regression suite that is run repeatedly. For functional availability, the combination of a #evBladePassRate to #evInertiaPassRate pass rate on a normal build with no active fault, and precisely targeted test failures for every fault, shows that the suite can distinguish available functions from broken ones.

Execution time of #evBladeExecSec for one full cycle (three browsers, two roles) sets a realistic upper bound on check frequency if the suite is used as a post-deployment synthetic functional check.

== Limitations

TathyaTest's main limitation still stems from its evidence source: the DOM and configuration. The crawler can only extract information visible in the DOM or derivable from HTML attributes, so complex server-side validation rules, such as closures or bespoke business rules, cannot always be extracted automatically. Locator quality also depends on the target application's markup quality.

On the evaluation side, branch coverage is reported as a control-flow-line-based proxy (not full branch coverage), the manual baseline is still small, and the fault catalogue is representative rather than exhaustive.

These limitations shape how the contribution should be read. The available evidence is sufficient to assess fault-detection effectiveness, coverage, and efficiency on two rendering mechanisms, but generalizing to every web-application context requires replication on more applications and a richer fault catalogue. This study therefore positions TathyaTest as a prototype with a replicable empirical evaluation, and as a foundation for further research.

== Threats to validity

=== Internal validity
Seeded faults are activated deterministically through a server-side fault registry without patching code, and every test begins by calling a dedicated evaluation state-reset endpoint so results are not contaminated across tests. Even so, execution against a real browser remains susceptible to environmental flakiness; this threat is mitigated with $R$ repetitions, flake-rate reporting, and a fixed faker seed so data variation is not a confound. For fault runs, restricting execution to relevant tests (filtered via the manifest) does not change the semantics of the mutation score, because only a relevant test's failure marks a fault as detected.

=== External validity
The two internal subjects are built on a single framework (Laravel), so the main generalization holds for MVC applications with a similar pattern. The third subject (SauceDemo, an external React SPA) broadens architectural coverage but introduces an asymmetry: EQ2 and EQ3 do not apply because the server cannot be instrumented, and `saucedemo.com`'s availability is not guaranteed on every run. SauceDemo's EQ5 baseline comes from three third-party suites written with varying patterns and quality. Precisely because they are independent, these suites strengthen the comparison's external validity, even though they were not designed for one-to-one comparable coverage with the generated suite.

=== Construct validity
Branch coverage is reported as a control-flow-line-based proxy, not full branch coverage; EQ2-related claims are interpreted within that boundary. Likewise, the 100% model coverage reported for EQ1 is measured against the crawl model TathyaTest itself builds, so it is a measure of internal completeness, not coverage of the application's entire functionality. Mutation score depends on the fault catalogue's representativeness. The catalogue was constructed to cover five common classes of functional regression (validation, authorization, CRUD, pagination, authentication), not as an exhaustive enumeration; it was also designed by the same authors who designed the generator and activated one at a time, so the #evBladeMutScore mutation score is understood as performance against that catalogue, not detection capability for arbitrary regressions. The time-savings ratio rests on an explicitly stated assumed manual per-case cost; this assumption is presented with a sensitivity analysis and is not treated as an empirical result.

=== Conclusion validity
The generated-versus-baseline comparison uses the non-parametric Mann--Whitney $U$ test with the rank-biserial effect size at a significance level of $alpha = 0.05$, and every mean is reported with a 95% confidence interval (Student's $t$, $n = R$). The manual baseline's small size limits the test's statistical power; effect size is therefore reported alongside exact $p$-values so readers can judge magnitude, not only significance.

== Reproducibility and artifact availability

The entire evaluation can be replicated with a single evaluation command per subject. Example configurations, including per-case-study variants, are included in the repository; runtime data is generated with a fixed faker seed (42); and the three SauceDemo public baselines are included as git submodules pinned to specific commits with recorded provenance. Both Laravel case studies, the fault catalogue, the metrics module, and the structured evaluation reports are available in the same repository, so the evidence chain from crawl to the numbers in the results tables can be fully traced.

= Conclusion

This study presents TathyaTest, a crawling-based functional test-case generator for web applications. The pipeline performs authenticated per-role crawling, extracts an element model, forms an RBAC access matrix, and then produces Playwright specifications together with their manifest, using seedable runtime faker data. Its effectiveness is measured through an evaluation module with five metric groups and statistical tests on three subjects: two fully instrumented Laravel case studies and SauceDemo as an external subject.

All three research questions are answered by the data. First, the generated suite covers the entire observed functional surface on all three subjects and reaches #evBladeRouteExecCov of application routes with line coverage from #evBladeLineCov up to #evInertiaLineCov. Second, all nine seeded faults were detected, with a mutation score of #evBladeMutScore and a localization accuracy of #evBladeFaultLoc, including an authorization fault caught by RBAC tests derived from the access matrix. Third, the generated suite's intrinsic quality matches or exceeds the baseline on assertion density, locator robustness, and brittle-locator ratio, with a trade-off of higher per-test execution duration than the concise manual baseline.

These results hold within their stated bounds. The 100% coverage figure refers to the surface observed by the crawler, and the mutation score refers to a nine-fault catalogue. Within those bounds, this study's contribution is the design of a test-generation pipeline and a replicable evaluation framework, with generalizability strengthened by cross-stack subjects and an independent third-party baseline.

Future work is directed at three areas. External validity needs to be extended through replication on production applications and non-Laravel frameworks, together with a richer fault catalogue and manual baseline. Technical directions include full branch coverage in place of the current proxy, support for complex server-side validation rules, and improved locator robustness. Integrating TathyaTest into a CI/CD pipeline would position the generated suite as post-deployment synthetic functional monitoring.

#set heading(numbering: none)

= CRediT authorship contribution statement

// .trim() undoes the header-spacing workaround's trailing space on author 0's `short`
// (see pad-first-author-short-for-header above) so it doesn't leave a stray space
// before this line's colon.
#juti.credits(authors.map(a => (..a, short: a.short.trim())))

= Declaration of competing interest

The authors declare that they have no known competing financial interests or personal relationships that could have appeared to influence the work reported in this paper.

= Acknowledgement

This research was funded by the DIPA (Daftar Isian Pelaksanaan Anggaran) internal research grant of Politeknik Negeri Malang.

= Data availability

Both Laravel case studies, the fault catalogue, the metrics module, and the structured evaluation reports referenced throughout this paper are available in the project repository; the three SauceDemo baseline suites are included as pinned git submodules with recorded provenance (@tab-baseline-public).

= Declaration of generative AI and AI-assisted technologies in the writing process

During the preparation of this work, the authors used an AI coding assistant (Claude Code, Anthropic) to help draft, translate, and format this manuscript, and to assist with preparing tables, the pipeline diagram, and the reference list. The authors reviewed and edited the AI-assisted content and take full responsibility for the accuracy and integrity of the final publication.

= ORCID

#juti.orcid(authors)
