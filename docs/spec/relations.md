---
title: Relations & multi-model
description: Relations and composition, field/relation attributes, many-to-many as an intermediate entity, and referencing entities owned by another intent model across a multi-model application.
---

# Relations & multi-model

## relations

```yaml
relations:
  - { name: customer, kind: manyToOne, to: Customer }
  - { name: orders,   kind: oneToMany, to: Order }
  - { name: order,    kind: manyToOne, to: Order, composition: true }
```

Relation kinds: `oneToMany`, `manyToOne`, `oneToOne`, `manyToMany`. The foreign key lives on the to-one side; the `oneToMany` / `manyToMany` sides are navigation-only (the column is on the child).

- **`required: true` on a to-one** makes the FK NOT NULL but keeps the entity top-level with its own perspective (a plain dropdown).
- **`composition: true` on a to-one** makes it a master-detail composition: the owning entity becomes **dependent** (managed as details under its parent's perspective), and the FK is NOT NULL. Only a `manyToOne` / `oneToOne` can be a composition; an entity's first composition to-one is its composition parent. Declare the inverse `oneToMany` on the master so the child is managed as its detail.

Composition is **opt-in** — most required FKs are plain associations, and composition is explicit.

### Relation attributes

```yaml
- { name: Currency, kind: manyToOne, to: Currency, size: 4 }              # form control width
- { name: Payment,  kind: manyToOne, to: Payment,  show: [date, number] } # extra read-only lookup columns
- { name: Status,   kind: manyToOne, to: OrderStatus, function: EntityStatus, init: 1 }  # managed badge, seeded default

# Depends-on - cascade, narrow-to-referenced, or auto-populate:
- { name: City,  kind: manyToOne, to: City,    dependsOn: { relation: Country, filterBy: Country } }
- { name: UoM,   kind: manyToOne, to: UoM,     dependsOn: { relation: Product, valueFrom: UoM } }
- { name: price, type: decimal,                dependsOn: { relation: Product, valueFrom: price } }

# Static option filter - e.g. only stock-tracked products:
- { name: Product, kind: manyToOne, to: Product, where: { Type: 1 } }
```

- **`function: EntityStatus`** marks the relation as the entity's managed status badge; `init:` seeds its default at the database level (a race-free start). This relation is what [`immutableWhen`](/spec/entities#immutablewhen-immutable-user-write-immutability), [`transitions`](/spec/glue#transitions-guarded-status-flips) and [`postings`](/spec/glue#postings-source-document-to-ledger) key on.
- **`dependsOn`** links one dropdown to another: `filterBy` narrows the options to those matching the parent selection; `valueFrom` copies a value from the referenced record (a snapshot).
- **Conditional source** (field only): `valueFrom` may be `{ by: <path>, cases: { <literal>: <property> }, default: <property>? }` — the copied property is picked by a classifier resolved from the `by` path: an own property, a one-hop `<Relation>.<property>` (the related record is fetched), or — on a document item — a path starting at the composition parent relation, i.e. the open document header. No matching case and no `default` = no copy.

```yaml
- name: price
  type: decimal
  dependsOn:
    relation: Product
    valueFrom:
      by: SalesOrder.Customer.priceLevel     # the open document's customer carries the classifier
      cases: { 1: wholesalePrice, 2: retailPrice }
      default: retailPrice
```

- **Header-mediated source** (field on a document item): `relation` may be a two-segment path `<Parent>.<Relation>` — the first segment is the item's composition parent, the second a to-one relation of that parent. The value is copied from the record the OPEN DOCUMENT HEADER points at, so a line defaults from the document's counterparty rather than from a relation of its own:

```yaml
- name: discount
  type: decimal
  dependsOn: { relation: SalesOrder.Customer, valueFrom: standardDiscount }
```

  Fields only, and `valueFrom` is required (there is no option list to `filterBy`). The copy happens when a NEW line is opened; an existing line is never re-copied, so a later change to the header leaves already-entered lines untouched.

- **`where`** filters the dropdown to options matching a static condition.

## Many-to-many

There is no `manyToMany` materialisation - the kind is parsed but never turned into a join table. Model n:m as an **explicit intermediate entity** holding a `composition` to one side, a `manyToOne` to the other (which may be cross-model via `model:`), plus any bridge fields:

```yaml
- name: SalesInvoiceCustomerPayment
  fields:
    - { name: id,     type: integer, primaryKey: true, generated: true }
    - { name: amount, type: decimal, precision: 18, scale: 2, required: true }  # partial allocation
  relations:
    - { name: SalesInvoice,    kind: manyToOne, to: SalesInvoice,    composition: true, required: true }
    - { name: CustomerPayment, kind: manyToOne, to: CustomerPayment, model: customer-payments, required: true }
```

The intermediate entity is a real entity you can read, seed and report on — which is usually what a real n:m relationship needs anyway.

## Multi-model applications

A non-trivial domain is rarely one project. The intent layer lets you split it into **several intent projects** — one `*.intent` each — that reference each other across models, **reuse** single master-data entities instead of redefining them, and contribute their screens to one **shared shell**.

Each module can be its own repository, versioned and shipped independently as a build artefact and consumed by others as a dependency — so a `currencies` or `customers` module is published once and reused across many applications.

### Reuse, don't redefine — `uses`

Master / reference data (`Customer`, `Country`, `Currency`, `UoM`) is owned by **one** project. Every other project that needs it stores an **integer FK** and renders a dropdown sourced from the owner's service — it does **not** generate the owner's table or API.

Declare the dependencies in a top-level `uses:` block, then point a `manyToOne` / `oneToOne` relation at the alias with `model:`:

```yaml
name: customers
uses:
  - { model: countries }                        # project defaults to the model alias
  - { model: currencies, project: currencies }  # set project only when it differs from the alias
entities:
  - name: Customer
    fields:
      - { name: id,   type: integer, primaryKey: true, generated: true }
      - { name: name, type: string,  required: true }
    relations:
      - { name: Country,  kind: manyToOne, to: Country,  model: countries }
      - { name: Currency, kind: manyToOne, to: Currency, model: currencies }
```

::: info Normative
A cross-model relation must be `manyToOne` / `oneToOne`, its `model:` must be listed in `uses:`, and it **cannot** be `composition: true` — a detail cannot be owned across models. The consumer stores a projection of the owner entity so the FK dropdown resolves against the owner's live service.
:::

### One shared shell — contributions, not app-hopping

Each project generates its own standalone shell (handy to run one domain in isolation). They **also** contribute their entities as grouped perspectives to a single **shared shell**, so the user never jumps between per-project UIs. Two pieces drive this:

**1. `group:` on an entity** places its perspective under a named navigation group:

```yaml
entities:
  - name: Customer
    group: partners        # appears under the "Partners" group in the shared shell
```

The entity references the group **id** only.

**2. A navigation project defines each group once.** Group ids are declared in one dedicated project so they are not redeclared per domain (the shell drops duplicate group ids). The domain entities then reference these ids (`group: sales`, `group: settings`, ...), and the shared shell aggregates every contributed perspective into its sidebar, ordered by each group's declared order.

### Generate leaf-first, then publish everything

Cross-model dropdowns read the **owner's already-generated model** at generation time and call the **owner's live service** at runtime, so order matters:

1. **Generate the owners (leaves) first**, then their consumers.
2. **Publish everything** — every owner must be live for a consumer's cross-model dropdown to resolve.
3. **Open the shared shell** — one grouped sidebar over every module.

Because table names are [intent-prefixed](/spec/data#naming-and-tables), the projects share one schema without colliding.

## related

An entity page shows its own fields, and a document shows its composition items. An entity that is the **target** of associations has no way to show the records pointing at it — a project-month and its per-employee timesheet lines, a customer and its invoices, an account and its journal entries, a supplier and its purchase orders. `related:` declares that register, on the referenced entity:

```yaml
- name: ProjectTimesheet
  related:
    - entity: EmployeeTimesheet          # the referencing entity
      model: employee-timesheets         # omit when it is declared in this model
      via: projectTimesheet              # omit when it points here exactly once
      label: Employee Timesheets         # omit for the pluralised entity name
      show: [number, employee, totalHours, status]   # omit for the source's own list columns
```

The register renders on the referenced record's page, filtered to that record, and each row opens the referencing record's own page.

It is a **window, not an owner**. The listed records belong to their own entity — their own lifecycle, their own pages, their own processes — so the register lists them and stops there. That is what separates it from a composition child, which *is* edited in place as a detail or document-items collection.

**Why the referenced side declares it.** Generation is per model and leaf-first: the model being referenced is generated before, and generally knows nothing about, the models that reference it. A declaration on the referencing side could therefore never reach the page it wants to appear on.

::: info Normative
`entity` is required; a `model:` must be listed in `uses:`.

`via:` is required when — and only when — the referencing entity reaches this one through more than one relation (an invoice naming the same company as both issuer and recipient). A generator MUST reject an ambiguous register rather than choose a relation for it.

Every `show:` name MUST be a field or relation of the referencing entity.

A generator MUST NOT offer create, update or delete affordances in a register — the referencing entity's own pages own those.

A composition child MUST be rejected rather than listed: it is already rendered as an editable collection, and a second read-only rendering of the same rows is two panels over one collection.

A generator MUST resolve a cross-model register against the owner model, and MUST fail loudly when that model cannot be found, rather than emitting a register with no columns.

Field visibility rules (a role-scoped or otherwise withheld property) apply to a register's columns exactly as they apply to the referencing entity's own lists.
:::


## See also

- [Entities & fields](/spec/entities) — the fields and attributes a relation connects.
- [Data, seeds & naming](/spec/data) — the physical naming that lets many models share a schema.
- [Declarative glue](/spec/glue) — roll-ups, settlements and postings that flow data along relations.
