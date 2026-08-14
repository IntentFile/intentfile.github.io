---
title: Data, seeds & naming
description: Seed data (inline rows, CSV-backed sets and translation seeds), multilingual data and UI, and the physical table / column naming rules.
---

# Data, seeds & naming

## seeds

```yaml
seeds:
  - name: order-statuses
    entity: OrderStatus
    rows:                                   # inline rows: small nomenclatures
      - { id: 1, name: DRAFT, stage: draft } # what the status MEANS to the lifecycle
      - { id: 2, name: ISSUED, stage: live }
      - { id: 8, name: CANCELLED, stage: cancelled }
      - { id: 9, name: VOIDED, stage: void }
  - name: cities
    entity: City
    rows:
      - { id: 1, name: Sofia, Country: 34 } # a foreign key by the relation's authored name (case-sensitive)
  - name: countries
    entity: Country
    file: data/countries.csv                # large sets: a developer-owned CSV in a subfolder
  - name: uoms-bg
    entity: UoM
    language: bg                            # a translation seed for a multilingual entity
    rows:
      - { id: 8, name: "Килограм" }
```

Generates a seed-import descriptor + CSV per seed. Two shapes:

- **`rows:`** — inline seed data, right for small nomenclatures whose values are part of the flow (statuses, methods).
- **`file: data/<name>.csv`** — an authored CSV under a `data/` subfolder, right for bulk nomenclatures and prepopulated demo data. A foreign key is set by the relation name (`Country: 34`).

::: info Normative
Row keys must match a field or relation name **exactly** (case-sensitive). A key matching neither is an authoring error — a silently dropped column becomes a NOT NULL failure at import time.
:::

A seed with `language: <code>` is a **translation** seed: it fills the per-language values of a `multilingual: true` entity, carrying the base row's `id` plus the translatable fields only.

### stage — what a status means to the lifecycle

A seed row of a **status nomenclature** (the target of a `function: EntityStatus` relation) may classify itself with `stage`, a closed vocabulary:

| Stage | Meaning |
| --- | --- |
| `draft` | Nobody has issued it yet — visible to its author, not yet economically real. |
| `live` | It counts: issued, sent, paid — anything in normal circulation. |
| `cancelled` | Withdrawn before it ever became live. |
| `void` | Deliberately retired while keeping its number — out of circulation by design. |

The classification exists because a status **id is data, but its meaning is not**: without it, "the rows that count" can only be expressed as a predicate over positional ids, repeated in every report and guard that needs it. With it, the meaning is declared once, where the nomenclature is defined, and consumers resolve it — chiefly a [report's `scope`](/spec/presentation#lifecycle-scope).

::: info Normative
`stage` is **metadata, not data**: it MUST NOT be emitted as a column of the seeded table. A row carrying `stage` MUST also carry the entity's primary key (the stage classifies that id). A value outside the vocabulary is an authoring error. An entity that declares its own `stage` property cannot be classified this way — the collision MUST be reported rather than resolved by guessing.
:::

### Status references — name, not number

Everywhere the file names a status — a [transition's](/spec/glue#transitions-guarded-status-flips) `from` and `setStatus`, a relation's `init`, a status-setting step's `value`, [`abortOn`](/spec/processes#aborton-cancel-the-instance-on-a-terminal-status)'s `status`, a [check's](/spec/entities#checks-declarative-validations) `status` / `setStatus`, [`immutableWhen`](/spec/entities#immutablewhen-immutable-user-write-immutability), a [posting's](/spec/glue#postings-source-document-to-ledger) event guard, a [report's](/spec/presentation#reports) `filter` — the seeded **name** may be written instead of the id:

```yaml
transitions:
  - { name: VoidInvoice, forEntity: Invoice, from: [ISSUED, SENT], setStatus: VOIDED, when: "Paid == 0" }
reports:
  - { name: OverdueInvoices, source: Invoice, filter: "balance > 0 AND Status != VOIDED", measures: ["sum(total)"] }
```

A status id is **positional**. Inserting a status into the middle of a nomenclature shifts every later id, and every guard authored against the old numbering keeps producing well-formed output that now means a different status — a defect no downstream check can see, because the emitted constant is valid. A name cannot be silently retargeted.

::: info Normative
A status name is resolved against the seed rows of the nomenclature it belongs to, and the resolution happens before any other validation, so every later rule sees the resolved id. An unresolvable name is an authoring error naming the known statuses — never a silently-kept token. Numeric ids remain valid everywhere. A name has no ordering, so an ordering comparison against one (`Status >= ISSUED`) is an authoring error; express "the rows that count" as a [`scope`](/spec/presentation#lifecycle-scope). A nomenclature owned by another model is seeded there, so a name cannot be resolved against it — such a reference is an authoring error directing the author to the numeric id.
:::

## Multilingual data

Two independent things get translated: the **data** in multilingual entities, and the generated **UI labels**.

### Data

Mark an entity `multilingual: true` and its string-typed properties gain per-language values in a sibling translation table. Every read overlays the translated values for the caller's requested language; untranslated content falls back to the default language. Author the translations as [seeds](#seeds) with a `language:` code.

```yaml
languages: [en, bg]        # top level: the languages THIS module provides translations for
entities:
  - name: UoM
    kind: setting
    multilingual: true
    fields:
      - { name: id,   type: integer, primaryKey: true, generated: true }
      - { name: name, type: string,  required: true, length: 100 }
```

The set of languages the whole stack supports is a platform concern, never defined per module. The top-level `languages:` only declares which languages this module provides.

### UI labels

Generation also emits a per-project translation catalogue for every generated label: entity names (a humanised singular plus a plural form), field labels, form and report names, and report column headers. The default locale is generated for you; a translator adds a sibling locale folder with the same keys. The UI renders through these keys, falling back to the baked default label for any key a locale has not translated.

## Naming and tables

- The top-level `name:` is the intent's identity. Single-file outputs are named after it; the physical table prefix is its upper-snake form.
- **Physical table names are intent-prefixed**: `<INTENT>_<ENTITY>` in upper-snake (`ORDERS_ORDER`), applied consistently across the data model, reports and seed imports. This dodges reserved words and cross-project collisions in a shared schema.
- Property names are PascalCase in the generated model (`loanedOn` → `LoanedOn`); physical columns stay `UPPER_SNAKE`. You author in lower camelCase.
- A multilingual entity's translations land in a sibling `<TABLE>_LANG` table.

Because every table is intent-prefixed, many independent intent models share one schema without colliding — the foundation of a [multi-model application](/spec/relations#multi-model-applications).

## See also

- [Entities & fields](/spec/entities) — the fields a seed populates and the `multilingual` attribute.
- [Relations & multi-model](/spec/relations) — why intent-prefixing lets many models coexist.
- [Presentation](/spec/presentation) — reports and labels that localise through the catalogue.
