# Contributing

Thank you for your interest in the Intent File Specification! The specification
evolves in the open: every change — from a typo fix to a new DSL construct — is
proposed, discussed and merged as a **pull request** against this repository.

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

### 2. Specification changes — open an issue first

Anything that changes the meaning of the format: a new construct or attribute,
new allowed values, changed semantics, deprecations. For these, **open an issue
first** describing:

- **The problem** — what cannot be expressed today, with a concrete scenario.
- **The proposed shape** — the YAML an author would write.
- **The expected behaviour** — what a conforming generator must produce, stated
  platform-neutrally.
- **Prior art** — how the scenario is handled today (hand-written code, a
  workaround, another format).

Once the direction is agreed in the issue, open a PR that updates the relevant
chapter **and** the DSL reference (and an example, if the construct benefits
from one). A construct without at least one implementation proving it out is
normally marked *planned* in the reference rather than specified as required.

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

Maintainers review every PR. Editorial changes merge on one approval;
specification changes merge when the discussion in the linked issue has
converged and a maintainer approves. Substantial semantic changes are batched
into a version bump of the specification rather than applied silently to the
current version.
