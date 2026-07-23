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
      - { id: 1, name: DRAFT }
      - { id: 2, name: ISSUED }
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
