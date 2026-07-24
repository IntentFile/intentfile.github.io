---
title: Specification - Overview
description: What the .intent file is, the three altitudes it sits above, the generation workflow, project layout, and the YAML authoring rules.
---

# The Intent File Specification

Version 1 · vendor-neutral · normative source: [IntentFile/intent-specification](https://github.com/IntentFile/intent-specification)

A single `.intent` file at a project root is the source of truth for a whole application. It is authored one **altitude above** the models a platform generates from: instead of hand-authoring a data model, process definitions, forms, reports, roles and seed data separately, you author **all of them** from one YAML document, and a conforming generator produces them for you.

The intent **never emits application code**. It stops at the model layer. Schema, persistence, APIs, user interface, jobs, listeners, processes and security are produced from those models by the platform's own generation step. That boundary is non-negotiable.

## The three altitudes

| Altitude | Artefact | Authored by | Transform below it |
| --- | --- | --- | --- |
| 1 — Intent | one `*.intent` per project | a human, or an AI assistant proposing patches | deterministic generation |
| 2 — Models | the platform's model artefacts (data model, processes, forms, reports, roles, seed data) | the intent generators | the platform's template engine |
| 3 — Application | schema, persistence, APIs, UI, jobs, listeners, processes, security | the platform's application templates | brought live by the runtime |

Each layer is the deterministic input to the one below it. The only fallible, supervised step is turning natural language into an Intent File; every transform below the top layer is a pure function.

## Editor-first, not a runtime artefact

The Intent File is an **authoring** artefact, not a runtime one. It gets an editor and an explicit *Generate* step; it is not silently reconciled from a repository behind your back.

- Generation happens **in your workspace project**, visible immediately, before anything is published.
- A published Intent File is inert source, exactly like any other authored model. The generated models and code are what run.
- There is no intent daemon, no intent database table - the file is read only when you ask the generator to run.

## The workflow

```
1. Create a project.
2. Author app.intent (any *.intent) at the project root - by hand or with an
   AI assistant that proposes reviewable patches.
3. Open it in the intent editor: structured YAML, a live read-only diagram, and
   inline validation.
4. Generate. The generators write the derived model artefacts NEXT TO app.intent:
       the data model            entities + relations + UI metadata
       process definitions        workflows
       forms                      task data-entry pages
       reports                    aggregations, charts, dashboard tiles
       roles                      permissions
       glue                       triggers, notifications, schedules, roll-ups, ...
       seed data                  initial / reference rows
       custom-action descriptors  actions, generates, transitions (buttons)
       document templates         printable documents
       a test manifest            UI-test descriptor
5. Generate once more, one level down: the template engine turns the models into
   the full-stack application.
6. Publish. The runtime brings it live exactly as for any hand-modelled project.
```

## Project layout

The folders layer cleanly, each owned by exactly one tool:

| Folder | Owned by | Lifecycle |
| --- | --- | --- |
| `app.intent` | you (and the AI assistant) | the only hand-authored artefact |
| project-root model files | the intent generators' *Generate* | re-emitted and scrubbed on every *Generate* |
| the generated code folder | the template engine | wiped wholesale on every regeneration |
| the custom folder | you | the escape hatch - touched by nobody |

**Do not hand-edit the generated model files.** Changes are overwritten, and a file no longer backed by the intent is scrubbed on the next *Generate*. Adding an `app.intent` to a classic project hands ownership of its root-level model files to the intent generators; migrate them into the intent first.

## The file is YAML, not JSON

Comments, multi-line strings and friendly diffs matter for an artefact a human reviews and an AI patches. The parser loads the document safely - type tags (`!!type`) are blocked, because an Intent File often arrives from generated output or paste and must never be a code-execution surface.

Every top-level collection defaults to empty, so a partial file (entities only) is valid. Field names are camelCase; entity names are PascalCase.

## A minimal complete file

```yaml
name: orders
description: Order management with an approval workflow
version: 1

entities:
  - name: Customer
    fields:
      - { name: id,   type: integer, primaryKey: true, generated: true }
      - { name: name, type: string,  required: true, length: 200 }
    relations:
      - { name: orders, kind: oneToMany, to: Order }

  - name: Order
    fields:
      - { name: id,        type: integer, primaryKey: true, generated: true }
      - { name: orderDate, type: date,    required: true }
      - { name: total,     type: decimal }
    relations:
      - { name: customer, kind: manyToOne, to: Customer }
      - { name: items,    kind: oneToMany, to: OrderItem }

  - name: OrderItem
    fields:
      - { name: id,       type: integer, primaryKey: true, generated: true }
      - { name: quantity, type: integer, required: true }
    relations:
      - { name: order, kind: manyToOne, to: Order, composition: true }

processes:
  - name: OrderApproval
    trigger: { onCreate: Order }
    steps:
      - { name: managerReview, kind: userTask, args: { assignee: manager, form: ApproveOrder } }
      - { name: done,          kind: end }

forms:
  - name: ApproveOrder
    forEntity: Order
    fields: [orderDate, total]
    actions: [approve, reject]

reports:
  - name: OrdersByCustomer
    source: Order
    dimensions: [customer]
    measures: ["count(*)", "sum(total)"]

permissions:
  - { role: Sales,   can: [Customer:read, Order:create] }
  - { role: Manager, can: [Order:approve] }

seeds:
  - name: order-statuses
    entity: OrderStatus
    rows:
      - { id: 1, name: DRAFT }
      - { id: 2, name: ISSUED }
```

## Authoring rules

::: info Normative
These rules keep the file diff-stable, safe to parse, and friendly for both human review and AI patching.
:::

- **Comments are encouraged.** No tool rewrites the file, so developer comments stay put; an AI patch path is expected to preserve them.
- **No anchors or aliases** (`&foo` / `*foo`). They make diffs harder to read and harder for an AI to patch minimally. Prefer a `defaults:` block if duplication hurts.
- **No multi-document YAML** (`---`). One file, one document.
- **No type tags.** Blocked by the safe parser.
- **Quote unquoted braces in scalars.** `to: {member.email}` is parsed by YAML as an object, not a string - write `to: member.email`. Braces are only for `{...}` interpolation inside `subject` / `body` text.
- **An event-binding key is `event:`, never `on:`** - YAML 1.1 resolves a bare `on` (and `off` / `yes` / `no`) to a boolean. An action key is `do:`.

## In this section

- [Entities & fields](/spec/entities) — the data model: fields, types, calculated values, document numbering, labels, checks, immutability, hierarchies, attachments and snapshots.
- [Relations & multi-model](/spec/relations) — relations, composition, many-to-many, and referencing entities owned by another model.
- [Processes & forms](/spec/processes) — workflows with user tasks, decisions, waits, boundary timers and abort-on-status; task forms and custom action buttons.
- [Presentation](/spec/presentation) — reports, charts, dashboard widgets, calendar/range/slot views, chat-threaded documents, and printable documents.
- [Declarative glue](/spec/glue) — notifications, schedules, integrations, webhooks, roll-ups, settlements, expansions, generates, transitions and postings.
- [Scoped surfaces & roles](/spec/surfaces) — per-user and per-partner row-scoped surfaces, sensitive-field stripping, and permissions.
- [Data, seeds & naming](/spec/data) — seed data, multilingual data and UI, and the physical naming rules.

For a one-line-per-construct lookup, see the [DSL reference](/reference).
