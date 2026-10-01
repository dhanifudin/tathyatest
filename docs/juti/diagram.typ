// TathyaTest pipeline diagram, recreated natively in Typst with fletcher
// (mirrors the TikZ figure in docs/tathyatest-ieee.tex, fig:tt-flow) rather than
// rendering the LaTeX source to an image, so it stays editable and font-consistent
// with the rest of the JUTI article.
#import "@preview/fletcher:0.5.5": diagram, node, edge

#let tt-blue = rgb(37, 99, 160)
#let tt-light = rgb(232, 241, 250)
#let tt-gray = rgb(245, 245, 245)
#let tt-border = rgb(90, 90, 90)
#let node-w = 32mm

#let stage(pos, body, ..args) = node(
  pos, align(center, body),
  fill: tt-gray, stroke: tt-border + 0.6pt, corner-radius: 2pt, width: node-w,
  ..args,
)
#let op(pos, body, ..args) = node(
  pos, align(center, body),
  fill: tt-light, stroke: tt-border + 0.6pt, corner-radius: 2pt, width: node-w,
  ..args,
)
#let data(pos, body, ..args) = node(
  pos, align(center, body),
  fill: white, stroke: tt-blue + 1.1pt, corner-radius: 2pt, width: node-w,
  ..args,
)
#let output(pos, body, ..args) = node(
  pos, align(center, body),
  fill: white, stroke: tt-border + 0.6pt, corner-radius: 2pt, width: node-w,
  ..args,
)

#let tt-flow-diagram = text(size: 7.3pt)[#diagram(
  node-stroke: 0.6pt,
  spacing: (6mm, 9mm),
  edge-stroke: tt-blue + 0.9pt,
  node-corner-radius: 2pt,

  stage((0, 0), [Config \ roles, credentials, \ coverage, data], name: <config>),
  op((1, 0), [Authenticated Playwright \ session per role], name: <login>),
  op((2, 0), [Crawl queue \ landing path, explicit \ seeds, \ same-origin DOM URLs], name: <queue>),
  op((3, 0), [DOM extraction \ forms, fields, links, \ buttons, tables, locators], name: <extract>),
  data((3, 1), [Crawl contract \ (JSON per role)], name: <json>),
  op((2, 1), [Target selection \ route, form, field, \ interaction, pagination, \ RBAC], name: <select>),
  op((1, 1), [Oracle mapping \ error state, no 500, \ redirect/403], name: <oracle>),
  output((1, 2), [Playwright specs \ auth, forms, interactions, \ pagination, RBAC], name: <specs>),
  output((2, 2), [Execution evidence \ pass, fail, skip, runtime], name: <run>),

  edge(<config>, <login>, "->"),
  edge(<login>, <queue>, "->"),
  edge(<queue>, <extract>, "->"),
  edge(<extract>, <json>, "->"),
  edge(<json>, <select>, "->"),
  edge(<select>, <oracle>, "->"),
  edge(<oracle>, <specs>, "->"),
  edge(<specs>, <run>, "->"),
  edge(<run>, <json>, "->", bend: 35deg, stroke: (dash: "dashed", paint: tt-border, thickness: 0.9pt)),
)]
