# JUTI house style (derived from Vol 24 No 2, July 2026)

## Software-engineering / testing-topic archive (scope-fit and domain conventions)

JUTI has published papers in this specific sub-topic (automated testing / test-generation
tools) across multiple eras, confirming scope fit for a testing-tool paper like
TathyaTest's. Found via `site:juti.if.its.ac.id "software engineering" OR "software
testing"` and read directly (not just abstracts) where noted:

- **"Automatic Testing Framework Based on Serenity and Jenkins Automated Build"**
  (Vol 19 No 2, July 2021, pp. 102–110, DOI `10.12962/j24068535.v19i2.a1017`) — full text
  read. A Serenity BDD + Jenkins CI automation-testing framework, evaluated on a real
  POS application (API/Web/Android), comparing manual vs. automated step counts and
  execution time (5 repeated trials, plain seconds, no significance testing).
- **"Selenium Framework for Web Automation Testing: A Systematic Literature Review"**
  (Vol 19 No 2, July 2021, pp. 65–76, DOI `10.12962/j24068535.v19i2.a1021`) — abstract
  and structure read (PDF blocked by the site's bot-check on repeated fetches; retry via
  `WebFetch` on the `/article/view/<id>` landing page, not `/article/download/`, if
  needed again — the landing page rendered fine while the raw download endpoint hit a
  Cloudflare-style challenge on this id).

**Important: do not copy this era's formatting into a new manuscript.** These 2021
papers use the old two-column IEEEtran-style template (bilingual Indonesian/English
title+abstract on the front page, Roman-numeral top-level sections like "I. PENDAHULUAN",
lettered subsections A/B/C/D, no CRediT statement, no competing-interest/data-availability/
generative-AI declarations, informal reference lists including Wikipedia and vendor blog
posts as citations). All of that was superseded by the single-column Typst/Word template
and the mandatory back-matter sections documented elsewhere in this file — those changes
are confirmed from the *current* (2026) issue and the *current* submission guidelines,
which take precedence over anything inferred from a 2021 paper's formatting.

**What does transfer — domain-content conventions for a testing-tool paper, independent
of template era:**
- A concrete, itemized case-study application (real feature names, real module/scenario
  counts) grounds an abstract "N tests generated" headline number for the reader — the
  2021 paper does this with a features-per-module table (14/8/6 features, 40/103/37
  scenarios across API/Web/Android). TathyaTest's manuscript already does the equivalent
  via its worked login-form example (`docs/juti/main.typ`, §3.2.1) and the target-selection
  table — keep that pattern; don't drop it in favor of only abstract metrics.
- A dead-simple, statistics-free comparison (e.g. step counts, seconds-per-run) sits
  well alongside heavier statistical treatment — it gives readers unfamiliar with
  Mann-Whitney U or Fleiss κ an intuitive anchor before the harder numbers. TathyaTest's
  EQ4 test-count row (generated vs. baseline, e.g. 103/5) already serves this role.
- **Statistical rigor at this venue has risen over time.** The 2021 testing paper reports
  raw times from 5 runs with no confidence intervals or significance test; the two 2026
  papers sampled elsewhere in this file (and TathyaTest's own manuscript) report 95% CIs,
  Mann-Whitney U with effect sizes, and formal research-variable/equation treatment. Do
  not use a 2021-era paper's informality as license to under-report statistics in a 2026
  submission — the current bar is materially higher.
- Cross-check any worked example's negative-test claims against the target-selection
  table it's illustrating (e.g. TathyaTest's login worked example must mention *both* the
  auth-specific wrong-password test the Login row promises *and* the generic
  required-empty variant the Field-variant row promises — an early draft of the worked
  example only showed the latter, which silently contradicted the table).

## Official policy (from the journal site — authoritative, check this first)

Confirmed by fetching `https://juti.if.its.ac.id/index.php/juti` and its `/about` and
`/about/submissions` pages directly — these override any inference from reading papers
alone when the two disagree (see the Results/Discussion structure note below for a case
where paper-reading alone got it wrong).

- **Scope**: information technology, computer science, information systems, networks,
  software engineering, computer vision. Accepts both research papers and review articles.
- **Frequency**: biannual (January, July), ~8 articles/issue, published by Institut
  Teknologi Sepuluh Nopember (ITS).
- **Open access**: fully open access, no submission or publication fees. CC BY-SA 4.0.
- **Indexing**: DOAJ, Crossref, Google Scholar, SINTA, Garuda, Dimensions, Scilit.
- **Acceptance rate**: ~7% — this is a competitive venue, not a pay-to-publish or
  low-bar outlet; the substance bar (novelty, rigor, threats-to-validity discipline) is
  real and worth taking seriously when reviewing a draft.
- **Plagiarism**: iThenticate similarity screening before publication; self-plagiarism
  is also prohibited.
- **Timeline**: initial screening 2–3 weeks, peer review 3–4 weeks (2 independent
  reviewers), author revisions 2–5 weeks, copy-editing/proofs 4–5 weeks.
- **File formats accepted**: Word (.docx) or Typst (submit both the compiled PDF and the
  Typst source); figures as PNG/JPG at minimum 300 dpi if submitted separately; a BibTeX
  (.bib) file is an optional accompanying format for references.
- **Page/margin spec** (matches what the Typst template already produces, don't override
  it): A4 paper, margins 0.65in left/right, 1in top/bottom.
- **Citation requirement**: IEEE numeric style, `[1]`, `[2]`, … in numerical order of
  first appearance (not alphabetical) — matches what `bibliography(style: "ieee")`
  produces automatically; also states authors should use Mendeley Reference Manager,
  which is a workflow requirement for Word submissions, not something a Typst/bibliography
  pipeline needs to additionally satisfy.
- **Pre-submission checklist** authors must confirm: template compliance, English
  language, originality, reference accuracy, correct table/figure numbering, permission
  for all reused media, and that every required section is present.

Derived by downloading and reading two full accepted papers (article IDs 1516 "Tail
latency, throughput, and memory overhead of monolithic and microservices architectures…"
and 1539 "Evaluating deterministic asynchronous disk benchmarking…") plus scanning the
issue table of contents (9 articles, `https://juti.if.its.ac.id/index.php/juti/issue/view/83`).
Re-check against the current issue if this drifts — journal style can change between volumes.

## Language

**All 9 articles in the checked issue are English.** Write JUTI submissions in English
even if a companion version exists in another language.

## Page layout

Single-column (NOT IEEE two-column), A4, generous margins. This is exactly what the
`@preview/juti:0.1.1` Typst template produces out of the box — do not fight it into a
two-column layout.

Page 1 structure, top to bottom:
1. Running head: JUTI logo + `JUTI: Jurnal Ilmiah Teknologi Informasi -- Volume V, Number
   N, Month YYYY: start -- end`.
2. Bold title (sentence case as actually used — e.g. "Tail latency, throughput, and memory
   overhead of…" — NOT the all-caps the template's own placeholder abstract text asks for;
   go by what's actually published).
3. Bold author names, comma-separated, ORCID icons inline, superscript affiliation
   numbers + `*` on the corresponding author.
4. Italic 8pt affiliation lines (superscript-numbered if >1 institution).
5. A ruled two-column info grid: **left** cell "ARTICLE INFO" — Keywords (one per line),
   blank line, `* Corresponding author:` + email, blank line, "Article history:" with
   Received/Revised/Accepted/Available online dates (each `Mon DDth, YYYY`); **right**
   cell "ABSTRACT" — one dense paragraph.
6. Footer on page 1: `© YYYY The Authors. This is an open access article under the CC
   BY-SA license (https://creativecommons.org/licenses/by-sa/4.0/)` + `DOI:
   https://doi.org/10.12962/j24068535.vXXXX.aXXXX`.

Later pages: running head alternates — even pages show `Author et al. -- Title` (italic
title), odd pages repeat the volume/number/date line; page number centered in the footer.

## Headings and numbering

- `1. Introduction`, `2. Related work`, … — numbered, roman weight, bold.
- `2.1. Subsection title` — numbered, *italic* (not bold).
- `2.1.1. Sub-subsection` if needed — same italic style, one level deeper.
- Unnumbered back-matter headings (see below) use the same bold top-level style but no
  number — in Typst this is `#set heading(numbering: none)` before the back-matter block.

## Structure (IMRaD with Results and Discussion COMBINED into one section)

**Confirmed from two sources, not just paper-reading**: both fully-read accepted papers
(`pdftotext`-verified heading list) use exactly 5 top-level numbered sections —
`1. Introduction`, `2. Related work`, `3. Methodology`, `4. Result and discussion`,
`5. Conclusion` — and the official author guidelines
(`https://juti.if.its.ac.id/index.php/juti/about/submissions`) list the required sections
as "Introduction, Related work, Methodology, Result and discussion, Conclusion, CRediT…"
verbatim, confirming this is house policy, not a one-off choice by those two authors.
**Do not split Results and Discussion into separate top-level sections** — an earlier
version of this file got this wrong from reading paper prose alone; the heading list
(extracted with `pdftotext -layout … | grep -nE '^[0-9]\. [A-Z]'`) is the reliable check,
not scanning for the words "results" and "discussion" in running text.

1. **Introduction** — motivation → literature gaps (2–4 short paragraphs citing prior
   work) → explicit objectives ("this study has N objectives: (i) …, (ii) …") → a closing
   paragraph that maps out the rest of the paper ("The remainder of this paper is
   organized as follows. Section 2 reviews… Section 3 describes… Section 4 presents…
   Section 5 concludes…" — 5 sections, matching the structure below).
2. **Related work** — subsections by theme, each ending with how it motivates this
   study's design choices. Use this exact heading text, not "Literature review".
3. **Methodology** — use this exact heading text, not "Method". Subsections for
   system/tooling, experimental design, metrics with an operational-definition table,
   statistical analysis approach. Includes at least one figure (e.g. a flowchart of the
   testing procedure) and defines every metric in a table before using it.
4. **Result and discussion** — use this exact heading text (singular "Result", "and
   discussion" lowercase). One `=` top-level section containing BOTH: (a) subsections
   presenting results per metric family or research question, each with a table of
   numbers (mean ± SD or CI) and a short descriptive paragraph, and (b) subsections
   discussing them — restating key findings, explaining *why* (mechanism), stating
   practical implications, explicitly listing limitations/threats to validity, and
   reproducibility/artifact availability. All of these are `==` subsections under the
   one `4.` heading (e.g. 4.1 EQ1 results … 4.5 EQ5 results, 4.6 Summary of findings …
   4.10 Reproducibility), not separate numbered sections.
5. **Conclusion** — short, restates contribution and headline numbers, no new material.

Then unnumbered back matter, in this exact order and exact section titles:
1. `CRediT authorship contribution statement` — one line per author:
   `**Initials Last:** Contribution, Contribution, …` (CRediT taxonomy terms verbatim,
   e.g. "Conceptualization", "Methodology", "Software", "Validation", "Formal analysis",
   "Investigation", "Resources", "Data Curation", "Writing – Original Draft", "Writing –
   Review & Editing", "Visualization", "Supervision", "Project Administration", "Funding
   Acquisition").
2. `Declaration of competing interest` — boilerplate "The author(s) declare that they
   have no known competing financial interests or personal relationships that could have
   appeared to influence the work reported in this paper."
3. `Acknowledgement` — funding/support statement, or "This research was conducted
   independently without external funding…" if none.
4. `Data availability` — pick the applicable canned statement (the template lists 8
   options — availability on request, within manuscript, openly provided + link, not
   applicable, etc.).
5. `Declaration of generative AI and AI-assisted technologies in the writing process` —
   state which tools were used, for what (literature search, translation, statistics
   assistance, formatting suggestions, etc.), and that the author(s) reviewed/take
   responsibility. (Both read papers disclose Elicit.ai and/or Claude usage — disclosure
   is normal and expected, not a red flag.)
6. `ORCID` — one line per author, `Name: https://orcid.org/XXXX-XXXX-XXXX-XXXX` (or N/A).
7. `References` — see below.

## Figures and tables

- Caption position: **table captions above the table**, **figure captions below the
  figure**. Format: `**Table N.** Caption text.` / `**Fig. N.** Caption text.` (bold
  supplement + number + period + two spaces, matches the template's caption show rule).
- Tables: booktabs look (top rule, header rule, bottom rule; no vertical rules), small
  font (~8pt), left-aligned text columns, right/center-aligned numeric columns. Small
  italic note line(s) below a table for footnote-style clarifications (e.g. "Mean ± SD;
  n=20 for monolith, n=16 for S1 MS…").
- Figures: diagrams and flowcharts are common (boxes/diamonds/arrows for pipelines or
  procedures); placed top-of-page/top-of-column by the template.
- Reference a table/figure in prose as "Table N." / "Fig. N." (not "Tabel"/"Gambar" —
  English).

## Abstract

One paragraph, dense, ~150–300 words in practice (template asks for 150–250 but observed
abstracts run slightly longer). Recipe: 1 sentence motivation → 1 sentence what this study
does/compares → 1–2 sentences method (tools, sample sizes, conditions) → 3–5 sentences of
concrete quantitative results with statistics (percentages, means ± SD, p-values, effect
sizes) → 1 closing sentence of practical implication/scope caveat. No citations in the
abstract.

## Citations and references

- In-text: IEEE numeric, e.g. `[1]`, multiple as `[1], [2], [3]`. In Typst this is
  automatic from `@key @key2` with `bibliography(style: "ieee")` (the template sets this).
- Reference list: numbered `[N]`, full IEEE-style entries with DOIs where available
  (`doi: 10.xxxx/…`), journal names italicized, conference proceedings named in full.
  Roughly 15–26 references observed across the two read papers, a mix of journal
  articles, conference papers, and a few web/dataset `[Online]` citations with access
  dates.

## Length and register

Observed page counts: 18 and 22 pages (PDF, single column, includes references and back
matter). Register is formal academic English, past tense for what was done, present tense
for general claims; avoid first person plural outside the CRediT/AI-declaration sections
where "the author(s)" is used.
