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

## See also

- [Entities & fields](/spec/entities) — the fields and attributes a relation connects.
- [Data, seeds & naming](/spec/data) — the physical naming that lets many models share a schema.
- [Declarative glue](/spec/glue) — roll-ups, settlements and postings that flow data along relations.
