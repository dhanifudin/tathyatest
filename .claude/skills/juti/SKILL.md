---
name: juti
description: Write or port an academic article into JUTI (Jurnal Ilmiah Teknologi Informasi) house style using the Typst @preview/juti template. Use when the user asks to prepare, format, translate, or convert a paper "for JUTI", "in JUTI format", or "using the juti Typst template".
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
---

# JUTI article authoring

Produces a JUTI-house-style manuscript in Typst using `@preview/juti:0.1.1`. Read both
reference files fully before writing content:

- `references/house-style.md` — everything derived from studying the current accepted
  issue: language, layout, section structure, back-matter requirements, caption/heading
  conventions, abstract recipe, citation style. This is what makes a manuscript *read
  like* an accepted JUTI paper, not just compile.
- `references/template-api.md` — the exact `juti.template.with(...)` / `juti.init-authors`
  / CRediT-index / `juti.credits` / `juti.orcid` API, taken from the real package source
  (not the abbreviated web docs), plus workarounds for gaps (table footnotes, no
  multi-column).

If asked to re-verify either file (template updated, new issue published), re-scaffold
with `typst init @preview/juti:0.1.1 <scratch-dir>` and re-read the generated `main.typ` /
the cached `juti.typ` source under `~/.cache/typst/packages/preview/juti/<version>/`, and
re-check `https://juti.if.its.ac.id/index.php/juti/issue/view/current` (or the latest
issue) for style drift — journal conventions change between volumes.

## Workflow

1. **Locate the source material** — an existing paper (LaTeX, Word, Markdown, prior
   Typst draft) to port, or notes/results to write up fresh. Read it fully before
   drafting; don't paraphrase from a summary.
2. **Scaffold once per target directory** (skip if `main.typ` already exists and you're
   just editing): `nix-shell -p typst --run "typst init @preview/juti:0.1.1 <dir>"`. If
   the target directory must contain other project files already, scaffold into a scratch
   dir and copy `main.typ`'s structure in by hand rather than fighting `typst init`'s
   empty-directory requirement.
3. **Translate/write to English** if the source is in another language — JUTI's current
   issue is 100% English; match that unless the user explicitly asks for another journal
   language track.
4. **Map content into the JUTI structure** per `house-style.md`: Introduction (with
   closing paper-organization paragraph) → Related work → Method → Results → Discussion
   (separate from Results) → Conclusion → the seven fixed back-matter sections in order
   (CRediT, competing interest, acknowledgement, data availability, generative-AI
   declaration, ORCID, references).
5. **Wire the front matter** via `juti.template.with(...)` — title, `juti.init-authors`
   authors with CRediT `contribution-refs`, institutions, translated abstract (150–300
   words, no citations), keywords, `bibliography(...)`. Keep author/institution
   placeholders if the user hasn't supplied real ones yet — do not invent names,
   affiliations, or ORCIDs.
6. **Tables and figures**: caption above for tables / below for figures, bold
   `Supplement N.` prefix (the template does this automatically — don't re-bold), booktabs
   look, small font for dense tables. Recreate diagrams natively (e.g.
   `@preview/fletcher`) rather than embedding rasterized LaTeX/PowerPoint output, unless
   the user asks to keep an existing image asset as-is.
7. **Compile and verify**:
   `nix-shell -p typst --run "typst compile --root <root> <dir>/main.typ <dir>/out.pdf"`.
   Zero tolerance for unresolved-citation or unresolved-label warnings — Typst prints
   these to stderr; treat any as a blocking error, not a warning to ignore.
8. **QA against house style** before calling it done:
   - All 7 back-matter sections present, in the fixed order, unnumbered.
   - Abstract has no citations and is one paragraph.
   - Every table/figure is referenced in prose and captioned correctly.
   - Language is consistently English (or the journal's current language, if re-verified).
   - Bibliography entries resolve and render with the IEEE numeric style.

## Non-goals

- Do not fabricate volume/issue numbers, page ranges, DOIs, or acceptance dates — leave
  the template's placeholder `meta` values; JUTI's editorial board assigns these at
  typesetting time.
- Do not invent author names, affiliations, ORCIDs, or funding sources not supplied by
  the user.
- Do not silently drop numeric results — if a value isn't available yet, carry an explicit
  placeholder (e.g. an `evalTBD`-style marker) rather than inventing a number or omitting
  the sentence.
