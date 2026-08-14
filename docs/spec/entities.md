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
| `format` | a **named input-format preset** over `pattern` (today: `email`) — supplies the canonical regex and the matching input control, enforced server-side like an authored `pattern`; mutually exclusive with `pattern` |
| `defaultValue` | the field's default: the column default, the reason a `required` field is not demanded from the caller, and the value a **new** row is seeded with in the UI (see [Field defaults](#defaultvalue-field-defaults)) |
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

## defaultValue — field defaults

`defaultValue` states what a field holds when nobody supplies a value:

```yaml
fields:
  - { name: hours,    type: decimal, required: true, defaultValue: 8 }
  - { name: billable, type: boolean, defaultValue: true }
```

It has three effects at once, which are deliberately one key rather than three:

- it is the **column default**, so a row inserted without the column gets it;
- it **satisfies `required`**, so the caller is not asked for a value the model already guarantees;
- it **seeds a new row in the UI**, so an editor opens on the default instead of on a blank.

::: info Normative
A generator MUST apply the default when creating a new record and MUST NOT re-apply it to an
existing one: a value the user cleared is a value the user chose, and re-defaulting it on the next
edit would silently undo an intentional change.
The default is a *starting value*, not a constraint — the user may replace it, and nothing
revalidates a stored row against it.
On a to-one relation the equivalent key is [`init`](/spec/relations#relation-attributes), which names a seeded record.
:::
A default is what makes a bulk affordance one action rather than several: a dialog that creates one
line per working day is only useful if the line it creates already carries the usual values.

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

`number:` turns a string field into a platform-numbered document field. The intent references a **series by name only** — the number's shape and counter live **outside the model**, and the platform stamps the field automatically; no hand-written number generator.

```yaml
# stamped on create (the number exists the moment the record is saved):
- { name: Number, type: string, number: { series: Proforma, stampOn: create } }

# stamped at a modeled issue step (a placeholder holds the field until then):
- name: Number
  type: string
  number:
    series: Sales Invoice         # documents sharing a sequence pass the same series
    per: Company                  # optional: a to-one relation whose value partitions the series
    stampOn: issue                # create | issue
```

- **`series`** (mandatory) — the sequence identity. Give several document types the **same series** to share one running number (a sales invoice, credit note and debit note drawing one legal range).
- **`per`** — the name of a to-one relation of the same entity whose value **partitions** the series: each distinct value gets its own sequence (the canonical case is `per: Company` — two legal entities never share a counter). The value never appears *in* the number; it only selects which sequence to draw from.
- **`stampOn`** — `create` stamps the real number on insert; `issue` puts a placeholder on the field at create and stamps the real number when the process reaches the wired step. Stamping is **idempotent** - re-issuing after an amend keeps the same number.

**The shape is not the model's to declare.** A number's rendering — a literal prefix plus the sequence zero-padded to a total width — is declared once per module in a **numbering declaration artefact** (a requirement declaration, like roles) and configured per deployment/tenant afterwards, where an operator can adjust prefix, width and the next value. Baking a format into the model was rejected deliberately: it forced a country or customer that wants a different prefix to fork and regenerate the application, when the number's shape is configuration, not intent. Sequences are **continuous and never auto-reset**; allocating from an undeclared series fails loudly rather than minting an unconfigured number.

The field is read-only in the UI. Counters are visible and adjustable in the generated application's document-numbering settings, including seeding a partition's starting number before its first allocation.

::: info Normative
`number.series` is mandatory; `per` must name a to-one relation of the declaring entity. The removed keys of earlier drafts — `format`, `scope`, `resetOn` — MUST be **rejected at parse** with a message naming the numbering declaration as the new home of the shape: accepting and ignoring them would quietly lose an authored format. Two modules re-declaring the same series differently MUST fail the declaration naming both.
:::

## label — a stored display name

A stored, read-only `Name` recomputed on every write, so lookups and dropdowns show a meaningful label instead of a raw id:

```yaml
- name: SalesInvoice
  label: "{Number} - {Date|yyyy MMMM} - {Customer.name}"
```

Tokens are the entity's own fields or **one-hop** to-one relation properties (`{Customer.name}`); `|format` is a date pattern for temporal values — a `month` field's `YYYY-MM` value formats through it too (`{period|yyyy MMMM}` renders "2026 July"). Deeper paths are rejected — compose by referencing the related entity's own label (`{Parent.Name}`). It is not allowed next to an authored `name` field, and a token must never reference a `sensitive` field.

## function — the presentation role

Optional, and authoritative when set; inferred from structure otherwise.

```yaml
- name: SalesInvoice
  function: Document        # header + line items + status pill + totals
- name: SalesInvoiceItem
  function: DocumentItem    # its line items (no "*Item" naming needed)
```

Entity roles: `Document`, `DocumentItem`, `Master`, `Detail`, `List`, `Setting`, `Calendar`, `Attachment`, `Snapshot`. Field role: `DocumentTitle`. Relation role: `EntityStatus` (a managed status badge). `Board`, `Gantt` and `Timeline` are reserved and rejected until those presentations are supported.

**A `DocumentTitle` is not necessarily platform-assigned.** Paired with [`number`](/spec/entities#document-numbering) the platform assigns the value and presents the field read-only. WITHOUT a `number` the title is authored by the user — the counterparty's own reference on an incoming document, for instance — and the create page must offer it as an editable control like any other field. Treating every title as assigned leaves a required field with no way to fill it, and the record cannot be created at all.

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

## locksWithMaster — a child collection that outlives its master's lock

An entity's immutability covers **that entity**. A composition child is a different entity, so a
master that locks says nothing about whether its child collections should:

```yaml
- name: Invoice
  immutableWhen: "Status == 3"        # ISSUED: the document's own content freezes
- name: InvoiceAllocation
  locksWithMaster: false              # ...but money keeps being recorded against it
  relations:
    - { name: Invoice, kind: manyToOne, to: Invoice, composition: true, required: true }
```

The canonical case is settlement: an issued invoice's lines are frozen — that is the audit trail —
while payment allocations against it go on being recorded for months. Content and settlement are
different lifecycles on the same document.

::: info Normative
`locksWithMaster` defaults to **true**, so a child that says nothing keeps freezing with its
master.
A generator MUST NOT extend a master's user-write immutability to a child collection declared
`locksWithMaster: false` — including the affordances it renders for that collection, not merely
the writes it accepts. A read-only rendering that the server would have permitted is the same
defect as a refused write.
The declaration is only meaningful on a composition child whose master actually declares
immutability; a generator MUST reject it elsewhere rather than ignore it, since an inert
declaration is indistinguishable from a working one until someone needs it.
It does not apply to a document's own line items, which ARE the document's content.
:::

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
