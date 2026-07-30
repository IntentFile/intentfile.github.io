---
title: Entities & fields
description: The data model - entities, fields, logical types, calculated values, document numbering, labels, presentation roles, attachments and snapshots, checks, immutability and tree hierarchies.
---

# Entities & fields

Every entity becomes a table, a generated data-access layer + API, and a UI page. Primary keys are integers; composition is opt-in.

```yaml
entities:
  - name: Customer          # PascalCase entity name
    description: Buyer account
    icon: user              # an icon name for the generated navigation
    group: master-data      # navigation group in a shared shell
    audit: true             # adds CreatedAt / CreatedBy / UpdatedAt / UpdatedBy
    fields: [ ... ]
    relations: [ ... ]
```

## fields

```yaml
fields:
  - { name: id,     type: integer, primaryKey: true, generated: true }
  - { name: name,   type: string,  required: true, length: 200 }
  - { name: total,  type: decimal }
  - { name: active, type: boolean, defaultValue: "true" }
```

| Key | Meaning |
| --- | --- |
| `name` | field name, camelCase (PascalCased in the generated model) |
| `type` | logical type (see below) |
| `primaryKey` | marks the PK; must be an integer type |
| `generated` | auto-increment (integer PKs only) |
| `required` | NOT NULL; the generated required-value validation keys on this. A field that also carries a default (`defaultValue`, or `init` on a relation) is NOT demanded from the caller - the default satisfies it |
| `length` | column length for string types |
| `pattern` | an input-format regular expression the value must match (string / text fields only) |
| `defaultValue` | column default |
| `unique` | a UNIQUE constraint (e.g. a code or business key) |
| `precision` / `scale` | override the decimal default (16, 2) |
| `readOnly` | rendered read-only in the UI (e.g. a calculated total) |
| `major: false` | keep the column off the compact list table (still on the detail page) |
| `size` | form control width on a 12-column grid |
| `calculatedOnCreate` / `calculatedOnUpdate` | an expression assigned to the property on insert / update |
| `calculatedActionOnCreate` / `calculatedActionOnUpdate` | a server-side action call-out (see [Calculated fields](#calculated-fields)) |
| `number` | turn a string field into a platform-numbered document field (see [Document numbering](#document-numbering)) |
| `sensitive` | strip this field from scoped (personal / partner) surfaces (see [Scoped surfaces](/spec/surfaces)) |

### Logical types

`string`, `text`, `integer`, `int`, `long`, `decimal`, `double`, `boolean`, `date`, `timestamp`, `uuid`, `month`, `week`.

Generators map each logical type to a physical column type. `text` is a large-object column; `uuid` is a 36-character string. `month` (a `YYYY-MM` value) and `week` (a `YYYY-Www` ISO-week value) are stored as short strings and render as month / week pickers.

::: info Normative
**Primary keys must be an integer type** (`integer` / `int` / `long`). A non-integer auto-increment column is invalid, so a `uuid` or string primary key is rejected. `uuid` is valid for non-PK fields.
:::

### Entity-level attributes

| Attribute | Effect |
| --- | --- |
| `audit: true` | adds the four standard audit columns, populated automatically |
| `multilingual: true` | makes string properties translatable (see [multilingual data](/spec/data#multilingual-data)) |
| `label:` | a stored, read-only display name (see [label](#label-a-stored-display-name)) |
| `function:` | an explicit presentation role (see [function](#function-the-presentation-role)) |
| `order:` | sequences form controls and list columns |
| `duplicable: true` | adds a *Duplicate* button that clones a document through the normal create path |
| `imports:` | injects import lines into the generated data-access layer (pairs with calculated actions) |
| `aggregate: true` | on a document master's numeric field, keeps it equal to the sum of the items' same-named field |
| `kind: setting` | marks the entity as nomenclature / configuration (see [Setting entities](#setting-entities)) |

### Control order

By default the generated UI controls follow declaration order - all fields first, then to-one relations last. Give an entity an `order:` list of property names to sequence them explicitly, interleaving fields and relations for a better layout:

```yaml
- name: OrderItem
  order: [Id, Order, Product, Name, Quantity, UoM, Price, Total]
  fields: [ ... ]
  relations: [ ... ]
```

Names match field / relation names (case-insensitive). A partial order is fine - any property not listed keeps its default position and is appended after the listed ones.

## Calculated fields

A field value can be derived instead of entered:

- **`calculatedOnCreate` / `calculatedOnUpdate`** — an expression assigned to the property. Prefer a **neutral arithmetic expression** for numeric totals (`"Quantity * Price"`, `"round(Net * 0.2, 2)"`): the server evaluates it and the UI previews it live with the same evaluator. Date helpers such as `daysBetween`, `businessDaysBetween` and `monthsBetween` are available.

```yaml
- { name: net,  type: decimal, calculatedOnCreate: "Quantity * Price", calculatedOnUpdate: "Quantity * Price" }
- { name: days, type: decimal, readOnly: true, calculatedOnCreate: "businessDaysBetween(FromDate, ToDate)" }
```

- **`calculatedActionOnCreate` / `calculatedActionOnUpdate`** — a server-side call-out for logic beyond an expression. The value names a hand-written component; the intent emits no code for it. It runs server-side only (no live preview) and takes precedence over an expression on the same slot. To reference it by simple name, declare `imports:` on the entity:

```yaml
entities:
  - name: Invoice
    imports: |
      import example.invoices.InvoiceBarcodeAction;
    fields:
      - { name: barcode, type: string, calculatedActionOnCreate: InvoiceBarcodeAction }
```

The implementation lives in the project's **custom** (escape-hatch) folder, never in the generated folder. For document numbers, use the first-class [`number`](#document-numbering) attribute instead of a calculated action.

## Document numbering

`number:` turns a string field into a platform-numbered document field. The platform owns a **gap-free sequence per series**, renders it through a `format`, and stamps the field automatically - no hand-written number generator.

```yaml
# stamped on create (the number exists the moment the record is saved):
- { name: Number, type: string, number: { series: Proforma, format: "PF{seq:08}", stampOn: create } }

# stamped at a modeled issue step (a placeholder holds the field until then):
- name: Number
  type: string
  number:
    series: SalesInvoice          # documents sharing a sequence pass the same series
    format: "SI-{year}-{seq:05}"  # {seq} / {seq:0N} / {series} / scope tokens {year}, {<Field>}
    scope: [year]                 # partitions the counter; omit for one continuous sequence
    stampOn: issue                # create | issue
```

- **`series`** (default: the entity name) — the sequence identity. Give several document types the **same series** to share one running number.
- **`format`** (default `{series}-{seq:06}`) — `{seq}`, `{seq:0N}` (zero-padded), `{series}`, and scope tokens `{year}` / `{<Field>}`.
- **`scope`** — `year` and/or sibling field names; partitions the counter and supplies the format's scope tokens.
- **`stampOn`** — `create` stamps the real number on insert; `issue` puts a placeholder on the field at create and stamps the real number when the process reaches the wired step. Stamping is **idempotent** - re-issuing after an amend keeps the same number.

The field is read-only in the UI. Counters are visible and adjustable in the generated application's document-numbering settings.

## label — a stored display name

A stored, read-only `Name` recomputed on every write, so lookups and dropdowns show a meaningful label instead of a raw id:

```yaml
- name: SalesInvoice
  label: "{Number} - {Date|yyyy MMMM} - {Customer.name}"
```

Tokens are the entity's own fields or **one-hop** to-one relation properties (`{Customer.name}`); `|format` is a date pattern for temporal values. Deeper paths are rejected — compose by referencing the related entity's own label (`{Parent.Name}`). It is not allowed next to an authored `name` field, and a token must never reference a `sensitive` field.

## function — the presentation role

Optional, and authoritative when set; inferred from structure otherwise.

```yaml
- name: SalesInvoice
  function: Document        # header + line items + status pill + totals
- name: SalesInvoiceItem
  function: DocumentItem    # its line items (no "*Item" naming needed)
```

Entity roles: `Document`, `DocumentItem`, `Master`, `Detail`, `List`, `Setting`, `Calendar`, `Attachment`, `Snapshot`. Field role: `DocumentTitle`. Relation role: `EntityStatus` (a managed status badge). `Board`, `Gantt` and `Timeline` are reserved and rejected until those presentations are supported.

## Attachments and snapshots

Two `function` roles attach **files** to a record. Both are composition children of the record they belong to.

**`function: Attachment`** gives the master a *Files* panel — upload, download, delete. The entity's rows carry the file metadata; the binary content lives in the platform's document store:

```yaml
- name: CaseAttachment
  function: Attachment
  relations:
    - { name: Case, kind: manyToOne, to: Case, composition: true, required: true }
```

**`function: Snapshot`** is the immutable, **versioned printed copy** of a document master — the frozen artefact regulations and audits want. Each generation renders the master through its [print template](/spec/presentation#printable-documents) and stores the result as the next version; the copies appear in the same panel, download-only (never uploaded or deleted by the user):

```yaml
- name: SalesInvoiceCopy
  function: Snapshot
  relations:
    - { name: SalesInvoice, kind: manyToOne, to: SalesInvoice, composition: true, required: true }
```

A snapshot requires a **document** master (only a document has a print template to render from). Minting a copy is wired into the workflow: bind the generated snapshot handler (named `<Master>SnapshotGenerator`) as the `delegate:` of a [service task](/spec/processes#service-tasks) at the step that finalises the document — typically right after *issue*. Re-issuing after an amendment keeps the document's number and mints the next version, which pairs naturally with [`immutableWhen`](#immutablewhen-immutable-user-write-immutability) and an issue-stamped [document number](#document-numbering).

## Setting entities

```yaml
- name: Country
  kind: setting
```

`kind: setting` marks an entity as nomenclature / configuration. It is placed under a global **Settings** area instead of getting its own top-level perspective, and any relation targeting it resolves its dropdown there. Settings are still real entities (own table, seeds, FK columns) — only their UI placement differs.

## checks — declarative validations

Row-level and document-level validations, enforced on write / on a status transition, with an authored message:

```yaml
- name: JournalEntry
  checks:
    - { kind: itemsMin,      count: 1, status: 2, message: "An entry needs at least one line" }
    - { kind: itemsSumEqual, over: [debit, credit], status: 2, message: "Debits must equal credits" }
- name: JournalEntryItem
  checks:
    - { kind: exactlyOne, fields: [debit, credit], message: "Exactly one of debit / credit" }
```

`exactlyOne` runs on every user write; `itemsMin` / `itemsSumEqual` are gated on a status transition, so drafting stays unconstrained and a failing transition aborts with the message.

### kind: guard — a precondition over an aggregate

A guard compares a keyed [aggregate](/spec/glue#aggregates-keyed-cross-entity-totals) against a minimum and decides what a violating write does:

```yaml
- name: StockMovement
  checks:
    - kind: guard
      aggregate: onHand                 # an `aggregates` entry whose `of` is THIS entity
      minimum: 0                        # recomputed total (prior rows + this row) must stay >= minimum
      message: "Insufficient stock"
      enabledBy: BLOCK_NEGATIVE_STOCK   # optional: enforced only while this configuration key is "true"
- name: SalesOrder
  checks:
    - kind: guard
      aggregate: openExposure
      minimum: 0
      outcome: task                     # accept the write, mark it for a human step
      marker: withinCredit
- name: LeaveRequest
  checks:
    - kind: guard
      aggregate: remaining
      minimum: 0
      outcome: reject                   # accept the write, file it already rejected
      setStatus: 4
```

| `outcome` | Companion attribute | A violating write |
| --- | --- | --- |
| `block` (default) | - | is rejected with `message`; nothing is stored |
| `task` | `marker:` a boolean field | is stored; `marker` is set `false` (and `true` whenever the guard holds) |
| `reject` | `setStatus:` a status seed id | is stored; the record's status relation is set to that value |

One outcome would have fitted exactly one real rule. Negative stock wants the write refused; a credit-limit breach wants the order accepted and parked for a human; an over-allowance leave request wants to be filed already rejected.

The total is recomputed from the guarded entity's own rows for the incoming record's key-tuple - excluding the record being updated - rather than read from the materialised aggregate, so the decision cannot race the aggregate's maintenance. The guarded entity must be the aggregate's own source.

`outcome: task` stamps a flag; it does not create or route to a task. A workflow [decision](/spec/processes#decision-steps) reads the marker and routes the record - the two constructs compose, and the guard is the part that computes.

## immutableWhen / immutable — user-write immutability

```yaml
- name: JournalEntry
  immutableWhen: "Status == 2"   # while POSTED, user update / delete are rejected (join terms with ||)
- name: InvoiceSnapshot
  immutable: true                # append-only: a frozen copy stored when a record is finalised
```

`immutableWhen` requires a `function: EntityStatus` relation; `immutable: true` needs none and is mutually exclusive with it. System / workflow writes stay possible — corrections to an immutable record are flow-generated reversals, never edits.

## hierarchy / leafOnly — tree entities

```yaml
- name: Account
  hierarchy: Parent                                     # the tree edge (a self-relation)
  relations:
    - { name: Parent, kind: manyToOne, to: Account }
# elsewhere - only leaf accounts are referenceable (server-enforced):
- { name: Account, kind: manyToOne, to: Account, model: accounts, leafOnly: true }
```

The list renders as an expandable tree; the server rejects cycles and leaf-only references to a node that has children.

## See also

- [Relations & multi-model](/spec/relations) — how entities reference one another, within and across models.
- [Data, seeds & naming](/spec/data) — how the physical table and column names are derived.
- [DSL reference](/reference) — one-line lookup for every construct.
