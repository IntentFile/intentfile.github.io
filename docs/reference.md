---
title: DSL reference
description: A one-line-per-construct index of the Intent File DSL, with a minimal snippet each and links into the full specification.
---

# DSL reference

The quick lookup surface: one line and a minimal snippet per construct. For rules, edge cases and worked examples, follow the links into the [specification](/spec/).

| Construct | What it gives you |
| --- | --- |
| [`entities`](/spec/entities) | tables + CRUD UI + a generated data layer & API |
| [field / relation attributes](/spec/entities#fields) | uniqueness, layout, read-only, dropdown filtering, cascades |
| [`function`](/spec/entities#function-the-presentation-role) | an explicit presentation role (Document, Setting, ...) |
| [`label`](/spec/entities#label-a-stored-display-name) | a stored, read-only display name for lookups |
| [`number`](/spec/entities#document-numbering) | a platform-numbered, gap-free document field |
| [`checks`](/spec/entities#checks-declarative-validations) | cross-field / cross-line validations |
| [`checks: kind: guard`](/spec/entities#kind-guard-a-precondition-over-an-aggregate) | a precondition over an aggregate: block, mark for a task, or reject |
| [`immutableWhen` / `immutable`](/spec/entities#immutablewhen-immutable-user-write-immutability) | reject user writes in a status / append-only |
| [`hierarchy` / `leafOnly`](/spec/entities#hierarchy-leafonly-tree-entities) | tree entities, leaf-only references |
| [calculated fields](/spec/entities#calculated-fields) | server + UI-evaluated expressions, date helpers, call-outs |
| [`relations` / `composition`](/spec/relations#relations) | associations and master-detail compositions |
| [`uses`](/spec/relations#multi-model-applications) | reuse entities owned by another intent model |
| [`processes`](/spec/processes#processes) | workflows: user tasks, decisions, waits, boundary timers |
| [`abortOn`](/spec/processes#aborton-cancel-the-instance-on-a-terminal-status) | cancel the running instance when the document reaches a terminal status |
| [`function: Attachment` / `Snapshot`](/spec/entities#attachments-and-snapshots) | a Files panel / immutable versioned printed copies |
| [`forms`](/spec/processes#forms) | task data-entry pages |
| [`actions`](/spec/processes#actions-custom-buttons) | developer-defined buttons opening custom pages |
| [`view`](/spec/presentation#view-calendar-range-slots) | calendar / range / slot-booking pages |
| [`documentItemsLayout: chat`](/spec/presentation#documentitemslayout-chat-conversation-threads) | render a document's items as a chat thread |
| [`reports`](/spec/presentation#reports) | aggregations, charts, dashboard KPI tiles, balance reports |
| [`widgets`](/spec/presentation#widgets-custom-dashboard-tiles) | custom KPI / embedded-page dashboard tiles |
| [`notifications`](/spec/glue#notifications) | email on create / update / delete |
| [the notify block / `attach: print`](/spec/glue#the-notify-block-and-attach-print) | send a message about a record - with the record's own document attached - from a process step, a transition or a schedule |
| [`schedules`](/spec/glue#schedules) | cron: notify or generate records per matching row |
| [`integrations`](/spec/glue#integrations-outbound-http) | outbound HTTP on a data change |
| [`inbound`](/spec/glue#inbound-webhooks) | a webhook that creates records |
| [`rollups`](/spec/glue#rollups-denormalised-parent-totals) | counts, sums, balance + status maintenance |
| [`settlements`](/spec/glue#settlements-payment-allocation) | auto-allocation of payments across open invoices |
| [`expansions`](/spec/glue#expansions-child-rows-from-a-date-span) | generated child rows per day / week / month |
| [`generates`](/spec/glue#generates-create-from) | one-click document-from-document cloning |
| [`transitions`](/spec/glue#transitions-guarded-status-flips) | guarded on-demand status flips (void / cancel / reopen) |
| [`postings`](/spec/glue#postings-source-document-to-ledger) | declarative source-document to balanced-document posting |
| [`aggregates`](/spec/glue#aggregates-keyed-cross-entity-totals) | keyed cross-entity totals materialised into their own entity |
| [`posts`](/spec/glue#posts-derived-rows-on-an-event) | derived ledger rows emitted idempotently on an event |
| [`personal` / `partner`](/spec/surfaces#personal-and-partner-surfaces) | per-user and per-partner row-scoped surfaces |
| [`seeds`](/spec/data#seeds) | initial data, CSV-backed sets, translations |
| [`multilingual` / `languages`](/spec/data#multilingual-data) | translation tables + read-time translation overlay |
| [`permissions`](/spec/surfaces#permissions) | roles |

## Snippets

### entities

```yaml
entities:
  - name: Member
    icon: user
    group: master-data
    audit: true
    fields:
      - { name: id,   type: integer, primaryKey: true, generated: true }
      - { name: name, type: string,  required: true, length: 200 }
    relations:
      - { name: loans, kind: oneToMany, to: Loan }
```

### field / relation attributes

```yaml
- { name: code,    type: string, unique: true, length: 30 }
- { name: total,   type: decimal, precision: 18, scale: 2, readOnly: true }
- { name: period,  type: month }
- { name: Number,  type: string, number: { series: SalesInvoice, format: "SI-{seq:06}" } }
- { name: Status,  kind: manyToOne, to: OrderStatus, function: EntityStatus, init: 1 }
- { name: City,    kind: manyToOne, to: City, dependsOn: { relation: Country, filterBy: Country } }
- { name: Product, kind: manyToOne, to: Product, where: { Type: 1 } }
```

### function

```yaml
- name: ProjectTimesheet
  function: Document           # header + line items + status pill + totals
- name: EmployeeTimesheet
  function: DocumentItem
```

### checks

```yaml
- name: JournalEntry
  checks:
    - { kind: itemsMin,      count: 1, status: 2, message: "An entry needs at least one line" }
    - { kind: itemsSumEqual, over: [debit, credit], status: 2, message: "Debits must equal credits" }
- name: JournalEntryItem
  checks:
    - { kind: exactlyOne, fields: [debit, credit], message: "Exactly one of debit / credit" }
```

### processes

```yaml
processes:
  - name: OrderApproval
    trigger: { onCreate: Order }
    steps:
      - { name: review,   kind: userTask,    args: { assignee: manager, form: ApproveOrder } }
      - { name: decide,   kind: decision,    args: { if: "action == 'approve'", then: activate, else: cancel } }
      - { name: activate, kind: serviceTask, args: { setRelationField: Status, value: 2, next: end } }
      - { name: cancel,   kind: serviceTask, args: { setRelationField: Status, value: 3, next: end } }
      - { name: end,      kind: end }
```

### reports

```yaml
reports:
  - name: OrdersByMonth
    source: Order
    dimensions: ["month(orderDate)"]
    measures: ["count(*)", "sum(total)"]
    filter: "total > 0"
    chart: bar
    widget: { value: "sum(total)", at: { "month(orderDate)": now }, label: Revenue (this month) }
```

### generates / transitions

```yaml
generates:
  - { name: invoice-from-order, from: Order, to: Invoice, map: { Customer: Customer }, sourceStatus: 3 }

transitions:
  - { name: VoidInvoice, forEntity: Invoice, from: [3, 4], setStatus: 8, when: "Paid == 0", label: Void, icon: ban }
```

### seeds

```yaml
seeds:
  - name: statuses
    entity: OrderStatus
    rows:
      - { id: 1, name: DRAFT }
      - { id: 2, name: POSTED }
  - name: countries
    entity: Country
    file: data/countries.csv
```

## Planned — recognised but not yet implemented

The following are parsed (or reserved) but not yet materialised by a generator; a conforming tool rejects or ignores them with a clear message rather than failing obscurely:

- Reserved `function` values for upcoming presentations (`Board`, `Gantt`, `Timeline`).
- **`manyToMany`** — parsed but never materialised; the supported shape is the [explicit intermediate entity](/spec/relations#many-to-many).
- **Cross-model schedule source** — a schedule's `entity` must be local (the generate target may be cross-model).
- Event-driven document generation (produce a document on an event), a declarative state machine, and shadow audit-history entities (audit *columns* via `audit: true` ship today).
- Arbitrary resolver-path task assignment beyond `assignee: personal`.
