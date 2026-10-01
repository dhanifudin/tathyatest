# `@preview/juti:0.1.1` Typst template — API reference

Ground truth taken directly from the package source at
`~/.cache/typst/packages/preview/juti/0.1.1/juti.typ` (fetched via `typst init`), not from
the Typst Universe web page (which is abbreviated and can drift). Re-derive this file by
re-scaffolding (`typst init @preview/juti:0.1.1 <dir>`) if the pinned version changes.

## Requirements

Typst is not installed on this host by default — run everything through
`nix-shell -p typst --run "typst …"`. Tested with `typst 0.13.1`.

## Scaffold

```bash
nix-shell -p typst --run "typst init @preview/juti:0.1.1 <target-dir>"
```

Produces `main.typ`, `setup.typ` (`#let setup = (start-page: 1)`), `references.bib`
(example), `figure1.jpg` (example image), and downloads the package + its `numbly`
dependency into `~/.cache/typst/packages`. **Do not** scaffold directly into a non-empty
target dir — `typst init` requires it empty; scaffold into a scratch dir first and copy
the learned API into the real project.

Compile:

```bash
nix-shell -p typst --run "typst compile --root <root> <dir>/main.typ <dir>/out.pdf"
```

## `juti.init-authors(authors)`

Fills in `short` (initials form, e.g. "Y. A. Tofan") for any author missing it. Input is
an array of records:

```typst
(
  name: "First Alpha Author",
  institution-ref: (0, 1),           // int or array of ints, 0-indexed into institutions
  contribution-refs: (0, 1, 2, 5, 6, 7, 8, 10, 13),  // CRediT indices, see below
  orcid: "XXXX-XXXX-XXXX-XXXX",       // optional; omit or "" -> renders "N/A" / no icon
  email: "author@example.ac.id",      // optional; used only if this author is corresponding
  short: "F. A. Author",              // optional; auto-derived from `name` if omitted
)
```

## CRediT contribution indices (0–13)

```
0  Conceptualization        7  Data Curation
1  Methodology              8  Writing -- Original Draft
2  Software                 9  Writing -- Review & Editing
3  Validation                10 Visualization
4  Formal analysis          11 Supervision
5  Investigation            12 Project Administration
6  Resources                13 Funding Acquisition
```

## `juti.template.with(...)` parameters

All have defaults (see the scaffold) except you should always set at least `title`,
`authors`, `institutions`, `abstract`, `keywords`, `bib`:

| Param | Type | Notes |
|---|---|---|
| `title` | string | Plain text; used in running heads too — keep it one line logically (embedded `\n` allowed and stripped in headers). |
| `title-content` | content | Override rendering of the title block only (rarely needed — leave default `[]`, which falls back to `title`). |
| `authors` | array (see above) | Pass through `juti.init-authors(...)` first. |
| `corresponding-ref` | int | Index into `authors` of the corresponding author. |
| `corresponding-email` | string or `none` | If `none`, falls back to that author's `email` field (errors visibly in the PDF if neither is set). |
| `institutions` | array of `(name:, address:)` | Only institutions actually referenced by some author's `institution-ref` are rendered (auto-filtered + renumbered). |
| `abstract` | content | One paragraph, no citations. |
| `keywords` | array of strings | Rendered sorted alphabetically, one per line. |
| `meta` | record | `received`, `revised`, `accepted`, `online` (each a `datetime(year:, month:, day:)`), `doi` (string). Defaults to `9999-12-31` placeholders and a placeholder DOI — leave as-is for a pre-acceptance manuscript draft. |
| `start-page` | int or `none` | Sets the page counter's starting value (for compiling as part of a bound issue). Leave `1` for a standalone draft. |
| `bib` | `bibliography(...)` result or `none` | e.g. `bibliography("references.bib")`; the template forces `style: "ieee"` and hides the auto title. |

Volume/number/month/year for the running head come from an internal `book-state` with no
public setter in 0.1.1 (defaults: volume `-`, number `-`, month 2, year 2025) — this is
expected for a standalone pre-submission draft; JUTI's editorial board fills in the real
volume/number/page range at typesetting time, matching the scaffold's own comment ("The
electronic file of your paper will be formatted further by JUTI editorial board").

## Helper functions

- `#juti.credits(authors)` — renders the CRediT statement body from
  `contribution-refs`; call inside the `CRediT authorship contribution statement` section.
- `#juti.orcid(authors)` — renders the ORCID back-matter list.

## Show-rule behavior baked into the template (don't fight these)

- Font: `("Liberation Serif", "Segoe UI Symbol")`, `fallback: false` — do not override
  unless you've confirmed the alternative font is installed in the compile environment.
- `set page(paper: "a4", margin: (x: 0.65in, y: 1in))` — single column.
- Headings numbered `1.`, `1.1.` via `numbly`; subsections rendered italic.
- Equations numbered `(1)` via `math.equation`, referenced with `@label` resolving to the
  bare number in a link (not "Eq. (1)" — write "Eq. (1)" or "(1)" literally in prose if
  wanted, `@label` alone renders as `(1)` only).
- Figures: `supplement: [Fig.]`, `placement: top`; tables: `supplement: [Table]`,
  `placement: top`, `breakable: true`, caption **above** (`position: top`), 0.8em text.
- Caption separator is `[. ]` and the whole caption prefix is bolded
  (`*#supplement #number.*`) — do not manually bold captions again.
- `#set heading(numbering: none)` before the back-matter block turns off numbering for
  all subsequent headings — put ALL back-matter sections after this one call, and do not
  add further numbered sections afterward in the same document.

## Known gaps in this version (workarounds)

- **Two-author running head has no space before "and" — FIXED, see below.** The
  even-page header path (`authors.len() <= 2` branch) joins author `short` names via the
  internal `inline-enum(prefix-fn: none, ..names)`, whose default `join-sym-on-two: false`
  skips *all* separator content — including the space baked into `[#join-sym ]` —
  specifically when there are exactly two entries. `last-join` still fires for the final
  entry, so the output concatenates as `"Firstand Second"` with no space before "and"
  (the space after "and" is fine). This only affects the even-page running head with
  exactly 2 authors (1 or ≥3 authors, or the byline itself, are unaffected — the byline
  uses `last-join: none` and separates authors via their superscript affiliation markers
  instead). No public template option controls this in 0.1.1, and the buggy function is
  not reachable for external override (it's a plain top-level `#let`, resolved lexically
  inside the template's own closure, not something an importer can rebind).
  **Workaround** (applied in `docs/juti/main.typ`, functions
  `pad-first-author-short-for-header` and the `.trim()` at the `juti.credits(...)` call
  site): when `authors.len() == 2`, append a trailing space to `authors.at(0).short`
  after `juti.init-authors(...)` runs. This fixes the header concatenation (verified by
  `pdftotext`-extracting the running head and checking for `"Name and"` vs `"Nameand"`).
  `.short` is also read by `juti.credits(...)` for the CRediT statement, so pass
  `authors.map(a => (..a, short: a.short.trim()))` there to strip the padding back out —
  otherwise the CRediT line gets a stray space before its colon. The workaround is
  conditioned on exactly 2 authors so it's a no-op (and does not need removing) if the
  real author count changes to 1 or ≥3 — but re-verify with `pdftotext` if it stays at 2
  once real names are filled in, and re-check this whole gap if the pinned `juti` version
  changes (a future release may fix `inline-enum` upstream, making the workaround inert
  but harmless, or may change `inline-enum`'s signature, which would need re-testing).

- No native "table note" / footnote-inside-figure mechanism (no tabularray-`talltblr`
  equivalent) — render footnote markers with `#super[a]` in cells and put the note text as
  a small (`#text(size: 7pt)`) paragraph inside the same `#figure(...)` body, below the
  `table(...)` call, so it travels with the caption.
- No multi-column / two-column mode — don't attempt `#place(scope: "parent", float:
  true)` two-column tricks; JUTI is single-column by design, so wide tables/figures just
  need small enough font/column widths to fit the ~6.7in text width (a4 minus 0.65in
  margins ×2).
