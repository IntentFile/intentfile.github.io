# Contributing

Thank you for your interest in the Intent File Specification!

**This repository is the website** (intentfile.org). The **normative specification lives
in [IntentFile/intent-specification](https://github.com/IntentFile/intent-specification)**
— propose changes to the format itself there (issue or proposal first, then a PR; see its
CONTRIBUTING). Once a specification change merges, the rendered chapters here are updated
to match.

Website changes — wording, examples, navigation, theme — are pull requests against this
repository.

By participating you agree to our [Code of Conduct](CODE_OF_CONDUCT.md).
Contributions are accepted under the repository's [Apache 2.0 license](LICENSE).

## What lives where

| Content | Where |
| --- | --- |
| The specification chapters | `docs/spec/*.md` |
| The one-line-per-construct DSL reference | `docs/reference.md` |
| Worked examples | `docs/examples.md` |
| The Intent-Driven Development manifesto | `docs/manifesto.md` |
| Site shell (theme, nav, home page) | `docs/.vitepress/`, `docs/index.md` |

## Two kinds of change

### 1. Editorial changes — just open a PR

Typos, wording, broken links, clearer examples, better cross-references —
anything that does **not** change what a conforming file or generator must do.
Open a pull request directly; no prior issue needed.

### 2. Specification changes — go to the spec repository

Anything that changes the meaning of the format: a new construct or attribute, new
allowed values, changed semantics, deprecations. These are proposed and merged in
[IntentFile/intent-specification](https://github.com/IntentFile/intent-specification);
the chapters here render the current version and follow it.

## Ground rules for spec text

- **Vendor-neutral, always.** The specification describes the format and the
  observable behaviour of a conforming generator — never a particular product,
  runtime, or package layout. If a sentence only makes sense for one
  implementation, it does not belong here.
- **Normative vs. informative.** Rules a conforming file or generator MUST
  follow go in a `::: info Normative` block; everything else is guidance.
- **Every construct earns its place** with a realistic YAML snippet, its
  attributes, and its edge rules — mirror the structure of the existing
  chapters.
- **Keep the reference in sync.** A new construct gets a row in
  `docs/reference.md`; changed semantics update the linked chapter and the row
  together.

## Working on the site locally

```
npm install
npm run docs:dev        # http://localhost:7070/
npm run docs:build      # verify the site builds before pushing
```

A PR must build cleanly (`npm run docs:build`) — the deploy workflow runs the
same build on merge.

## Review and merging

Maintainers review every PR; website changes merge on one approval. Chapters under
`docs/spec/` track the normative specification — a PR here that would change the format's
meaning is redirected to the specification repository.
