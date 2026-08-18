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
| `defaultValue` | the field's default: the column default, the reason a `required` field is not demanded from the caller, and the value a **new** row is seeded with in the UI (see [Field defaults](#defaultvalue-field-defaults)) |
| `unique` | a UNIQUE constraint (e.g. a code or business key) |
| `visibleTo` | an allow-list of roles that may read the field, enforced where the data leaves the server (see [Role-scoped field visibility](#role-scoped-field-visibility-visibleto)) |
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
| `history: true` | records every write as field-level deltas in a shadow history table (see [history](#history-the-change-trail)) |
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

## unique — a business key over more than one field

`unique: true` on a field constrains one column. When what makes a row unique spans several,
declare it on the entity instead:

```yaml
entities:
  - name: TenantApplication
    unique:
      - { fields: [tenant, application], message: "This application is already provisioned for the tenant" }
```

`fields` names fields or to-one relations of the same entity; a to-one relation contributes its
foreign-key column. The key is the combination of those columns - the declared order is how it
reads, and a conforming implementation is not required to give it any physical meaning. `message` is what a caller is told when a
write collides; omitted, an implementation derives one from the names.

::: info Normative
The key MUST be enforced by the data store, so that it holds for every writer — a form, an import,
an arriving message, a scheduled creation — and not only for the ones that route through the
application.
A colliding write MUST be reported as a conflict that a caller can distinguish from a generic
failure, carrying the authored `message` when one was given.
Every name MUST resolve to a field or a to-one relation of the same entity; a to-many MUST be
rejected, having no column on this side to constrain.
A key naming a single field MUST be rejected, naming the field-level `unique` it duplicates.
A name repeated within one key, and a key declared twice on one entity, MUST be rejected.
An implementation is NOT required to add the constraint to a table that already exists.
:::

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
A generator MUST apply the default when creating a new record and MUST NOT re-apply it to an existing one: a value the user cleared is a value the user chose, and re-defaulting it on the next edit would silently undo an intentional change. The default is a *starting value*, not a constraint — the user may replace it, and nothing revalidates a stored row against it. On a to-one relation the equivalent key is [`init`](/spec/relations), which names a seeded record.
:::

A default is what makes a bulk affordance one action rather than several: a dialog that creates one line per working day is only useful if the line it creates already carries the usual values.

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

`number:` turns a string field into a platform-numbered document field. The platform owns a **gap-free sequence per series** and stamps the field automatically - no hand-written number generator. The intent declares only a **reference to a series** - never how the number looks.

```yaml
# stamped on create (the number exists the moment the record is saved):
- { name: Number, type: string, number: { series: Proforma, stampOn: create } }

# partitioned per company, stamped at a modeled issue step:
- name: Number
  type: string
  number:
    series: Sales Invoice   # documents sharing one legal range pass the same series
    per: Company            # optional: a to-one relation whose value partitions the sequence
    stampOn: issue          # create | issue
```

- **`series`** (mandatory) — the sequence identity. Give several document types the **same series** to share one running number (a sales invoice, a credit note and a debit note drawing from one legal range).
- **`per`** (optional) — a to-one relation of the entity whose value **partitions** the series: each partition value owns its sequence, prefix and width. The canonical use is `per: Company` — two legal entities in one deployment each owe their own sequential range and must never share a counter. Identical numbers across partitions are correct (a number must be unique within a company's book, not across companies). The partition selects which sequence to draw from; its value never appears in the number. A status relation cannot partition a series.
- **`stampOn`** — `create` stamps the real number on insert; `issue` puts a placeholder on the field at create and stamps the real number when the process reaches the wired step. Stamping is **idempotent** - re-issuing after an amend keeps the same number.

### The series is configuration, not model

A number series is a **deployment-level business object**, not a module asset. A number renders as **a literal prefix plus the sequence zero-padded to a total width** (`SI00000042`) — there is no token grammar. Neither the prefix nor the width is authored in the intent: baking a format into the model would force a market that numbers documents differently to fork and regenerate the application.

Instead, a module ships a **series declaration** — a requirement, exactly as it declares the roles it needs: "I need series X; if this deployment has none yet, provision it with this default prefix and width" (in the reference implementation a `.numbers` file at the project root):

```json
{"series": [{"name": "Sales Invoice", "prefix": "SI", "size": 10}]}
```

Declaring never overwrites: an existing series keeps its live counter and whatever shape its administrators configured. Two modules may declare the same series only **identically** (a shared range provisions once); a differing re-declaration is an error naming both declarations. Removing a module never removes a series or its counter — allocated ranges are business history.

Sequences are **continuous and never auto-reset**. A jurisdiction that restarts numbering each year does it by an administrator setting the prefix and the next value (e.g. prefix `2027-`, next `1`, in January) — visible and auditable, rather than a hidden reset rule that could mint the same number twice. Allocating from a series no declaration provisioned is an error — a document must never carry a number in a shape nobody chose.

The field is read-only in the UI. Each series' prefix, total width and next value are visible and adjustable per deployment in the generated application's document-numbering settings.

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

The **language** a copy is minted in is a knob on the snapshot child — `language: <code>` fixes the print-template language, or `languageFrom: <relation>.<field>` reads it per record from a one-hop path on the document master (a to-one relation and a string field of its target holding the code — the customer decides the language their invoice is issued in; the path may cross model boundaries like any other reference):

```yaml
- name: SalesInvoiceCopy
  function: Snapshot
  languageFrom: customer.language
  relations:
    - { name: SalesInvoice, kind: manyToOne, to: SalesInvoice, composition: true, required: true }
```

The two knobs are mutually exclusive. Absent both — or when the resolved value is blank — the mint falls back to the first entry of the application's configured language set, resolved at mint time. An unresolvable `languageFrom` path is a generation error, never a silent wrong-language copy. Interactive printing is a separate concern: the print action always renders **live** current data in the language the user picks, while the snapshot panel serves the frozen issued copies — the two coexist on the document's page.

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

## Role-scoped field visibility — `visibleTo`

A field is normally as visible as its entity. `visibleTo` narrows one field to the callers holding
**any one** of the listed roles — the salary on an employee, the cost price on an order line, the
credit limit on a customer — without splitting the record into a satellite entity:

```yaml
permissions:
  - { role: Payroll }
  - { role: Administrator }

entities:
  - name: Employee
    fields:
      - { name: id,        type: integer, primaryKey: true, generated: true }
      - { name: name,      type: string,  required: true }
      - { name: dailyRate, type: decimal, visibleTo: [Payroll, Administrator] }
```

Absent (the default), nothing changes: the field is visible to every caller who may read the
entity. The inverse spelling (`hiddenFor:`) is deliberately not part of the format — a deny-list
fails open (a role added later, or misspelled, would see the value); an allow-list fails closed.

::: info Normative
A conforming generator MUST enforce the list where the data leaves the server, never only in the
presentation layer. On a **read**, the property is absent (or null) in every response of every
generated surface — the main one and the scoped ones — unless the caller holds one of the roles;
owning the record, or being the partner it belongs to, grants nothing. On a **write**, a create
ignores the submitted value and an update keeps the stored one — the rest of the write is
legitimate and MUST NOT be refused for carrying a field that is not the caller's to set. Where
the format records a field-level [history](/spec/entities#history-the-change-trail), a restricted property's
entries are withheld from a caller who may not read it. A derived value fed by a restricted field
(a [roll-up](/spec/glue#rollups-denormalised-parent-totals), an aggregated master total, a
[keyed aggregate](/spec/glue#aggregates-keyed-cross-entity-totals)) inherits the same allow-list unless it
declares its own — a sum of hidden figures is that figure one entity out. The generated UI SHOULD
omit the column or input for a caller who cannot read the field, and MUST derive that from what
the server actually withheld, not from a role list evaluated in the client.
:::

Edge rules: every listed role must be granted by the file's [`permissions`](/spec/surfaces#permissions) (a role
nothing grants hides the field from everybody, which is a typo far more often than an intention);
an empty list is rejected rather than read as "no restriction"; the primary key, the entity's
`identity` field and a document-title field cannot be restricted (hiding them breaks the page, not
the figure); a restricted field cannot be a [`label`](/spec/entities#label-a-stored-display-name) token. A
**report** over a restricted field is a warning, not a rejection — a report carries no field-level
scoping, so the author is told which report re-serves which figure and scopes the report's own
roles accordingly. `sensitive` and `visibleTo` are independent and compose: the first is about a
surface, the second about a role. A relation (a foreign key) cannot be restricted this way.

## immutableWhen / immutable — user-write immutability

```yaml
- name: JournalEntry
  immutableWhen: "Status == 2"   # while POSTED, user update / delete are rejected (join terms with ||)
- name: InvoiceSnapshot
  immutable: true                # append-only: a frozen copy stored when a record is finalised
```

`immutableWhen` requires a `function: EntityStatus` relation; `immutable: true` needs none and is mutually exclusive with it. System / workflow writes stay possible — corrections to an immutable record are flow-generated reversals, never edits.

The lock also covers the entity's **composition children**. A child declares no immutability of its own, but its writes maintain the master's derived values — a line resums the document's totals — so a line write on a locked document reaches exactly what the lock protects: the totals a stamped number, a frozen copy and a posted ledger entry were all taken from. [`locksWithMaster`](#lockswithmaster-a-child-collection-that-outlives-its-masters-lock) is how a collection opts out.

::: info Normative
A generator MUST refuse a user create, update or delete of a composition child whose master is currently immutable, unless that child declares `locksWithMaster: false`. The refusal MUST cover every user surface it generates, not only the affordances it renders — permitting the write through a different door undoes the lock as surely as removing it. It MUST NOT extend to system / workflow writes, which are what corrects an immutable record.
:::
## lifecycle — the legal status graph

Everything else about statuses is stated one edge at a time: `init:` says where a record starts, a [`transitions`](/spec/glue#transitions-guarded-status-flips) button guards the flips a user performs *through that button*, a workflow step sets a status, a [check](#checks-declarative-validations) files a rejected record in another. Nowhere does the file say which moves are legal *at all* — so any writer that is not a transition button (a workflow branch, a glue action, an API call) can move a document from any status to any other, and nothing notices.

`lifecycle:` states the whole graph, once:

```yaml
- name: SalesInvoice
  lifecycle:
    edges:
      - { from: DRAFT,  to: [ISSUED, CANCELLED] }
      - { from: ISSUED, to: [PAID, VOIDED] }
```

- One entry per **source** status, listing every status reachable from it. Both sides accept a [seeded status name or its id](/spec/data#status-references-name-not-number).
- The graph is always over the entity's `function: EntityStatus` relation, so it names no column; the nomenclature must be seeded in the same file (a status entity owned by another model is seeded there, and so is its lifecycle).
- A status not listed as any `from` is **terminal**; a status listed nowhere is simply unreachable through this entity.

::: info Normative
A conforming generator MUST validate every status write against the graph — user, workflow, glue, transition button alike — and reject a move no edge declares, with a message naming both statuses. Enforcement therefore belongs to the layer every writer passes through (the generated persistence layer), never to the transition endpoints alone, which would leave every other writer unguarded. Where the status relation declares `init:`, a record MUST also be *created* in that status: entering the lifecycle anywhere else skips the graph rather than travelling it.
:::

::: info Normative
With a lifecycle declared, `transitions` become **presentation over its edges**: each `from` status of a transition MUST reach its `setStatus` along a declared edge, and a status written by a workflow step or forced by a check's rejection MUST be one that some edge reaches. A conforming generator reports the disagreement when the file is read, not when the button is pressed — a reject path transiting through an approved status is exactly the mistake the graph exists to catch.
:::

It composes with the [`stage:` classification](/spec/data#stage-what-a-status-means-to-the-lifecycle): a stage says what a status *means* (draft, live, cancelled, void) and scopes reports by it; the lifecycle says how a record may *move* between statuses.

## locksWithMaster — a child collection that outlives its master's lock

An entity's immutability covers that entity **and the collections composed into it**. For some children that is wrong — a master that freezes its content says nothing about a collection recording what happens to the document afterwards:

```yaml
- name: Invoice
  immutableWhen: "Status == 3"        # ISSUED: the document's own content freezes
- name: InvoiceAllocation
  locksWithMaster: false              # ...but money keeps being recorded against it
  relations:
    - { name: Invoice, kind: manyToOne, to: Invoice, composition: true, required: true }
```

The canonical case is settlement: an issued invoice's lines are frozen — that is the audit trail — while payment allocations against it go on being recorded for months. Content and settlement are different lifecycles on the same document.

::: info Normative
`locksWithMaster` defaults to **true**, so a child that says nothing keeps freezing with its master — in the affordances a generator renders for that collection AND in the writes it accepts for it.

A generator MUST NOT extend a master's user-write immutability to a child collection declared `locksWithMaster: false` — including the **affordances it renders** for that collection, not merely the writes it accepts. A read-only rendering that the server would have permitted is the same defect as a refused write. One declaration governs both halves, so a generator's screen and its server can never disagree about a given collection.

The declaration is only meaningful on a composition child whose master actually declares immutability; a generator MUST reject it elsewhere rather than ignore it, since an inert declaration is indistinguishable from a working one until someone needs it. It does not apply to a document's own line items, which ARE the document's content.
:::

## history — the change trail

`audit: true` records only the **last** writer and time, in four columns of the row itself. Where a domain has to answer *what changed, from what to what, by whom, when* — for every write, for years — declare a history:

```yaml
- name: Contract
  audit: true
  history: true                  # every write is recorded as field-level deltas
  fields:
    - { name: id,     type: integer, primaryKey: true }
    - { name: amount, type: decimal }
```

The entity gains a **shadow history table** — a sibling of its own table, like the [multilingual](/spec/data#multilingual-data) language table — carrying one entry per property whose value actually changed on a write: the property, its old value, its new value, who wrote it, when, and whether the write came from a **user** or from the **system** (a roll-up total, a workflow write-back, a recomputed document total). A create is recorded as `null -> value` and a delete as `value -> null`, so the trail alone reconstructs the row at any point in its life. The record's own form shows it as a read-only **History** panel.

The source matters as much as the delta. Once a total the application recomputed and an amount a person typed sit in the same column, nothing downstream can tell them apart — and "who changed this" is the first question asked of a trail.

::: info Normative
The shadow table is **append-only by construction**: a generator MUST NOT emit any create, update or delete path to it — not a service, not an endpoint, not a UI affordance. Append-only enforced by policy is not append-only.

Every write path the generated data-access layer offers MUST append, including the targeted single-column and multi-column writes the system uses; a path that writes silently is worse than no trail, because the trail then reads as complete.

An entry MUST record whether the write was a user write or a system write.

Only properties whose value actually changed are recorded. Values that differ solely in representation (a decimal of a different scale, a translated overlay of a stored value) are NOT changes, and a generator MUST NOT record them as such.

The primary key and the audit columns are NOT tracked — the key never changes and the audit columns restate what the entry already carries.

A [scoped surface](/spec/surfaces#personal-and-partner-surfaces) that hides `sensitive:` fields MUST NOT be given a history it cannot filter: either the trail it exposes excludes those properties, or it exposes none. Leaking a hidden field's old and new values defeats the scoping exactly.

Rows written outside the generated data-access layer — [seeds](/spec/data#seeds), direct database writes — have no history, and a conforming tool documents that rather than implying completeness.
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
