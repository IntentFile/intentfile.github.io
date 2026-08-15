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

An n:m is always an **intermediate (link) entity** — one row per link, holding a `composition` to one side and a `manyToOne` to the other (which may be cross-model via `model:`). It is a real entity: it has a table, it appears as a detail grid with a dropdown under the declaring entity, and it can be seeded, reported on and referenced like any other — which is what a real n:m relationship needs anyway.

You either let `manyToMany` write that entity, or you write it yourself when the link carries data of its own.

### `manyToMany` — the link written for you

```yaml
- name: Order
  relations:
    - { name: products, kind: manyToMany, to: Product }                  # link entity OrderProduct
    - { name: tags,     kind: manyToMany, to: Tag, through: OrderTag }   # named link entity
    - { name: parts,    kind: manyToMany, to: Part, model: parts }       # cross-model target
```

`Order.products` materialises, before validation and generation:

```yaml
- name: OrderProduct                    # <Declaring><Target>, or the name given by `through:`
  fields:
    - { name: id, type: integer, primaryKey: true, generated: true }
  relations:
    - { name: Order,   kind: manyToOne, to: Order, composition: true, required: true }
    - { name: Product, kind: manyToOne, to: Product, required: true }
```

and the authored relation becomes the navigation-only `oneToMany` to the link entity, so the model holds exactly one representation of the n:m.

Rules:

- Declare an n:m on **one** side only — it is one link table, not two. Declaring it from both sides is an error naming the pair.
- The attributes that describe the **target picker** — `where`, `show`, `major`, `size`, `leafOnly` — are allowed and travel onto the link's target relation.
- The attributes that describe a hand-authored to-one — `composition`, `function`, `init`, `dependsOn`, calculated actions, `personal`, `partner` — are **rejected** on a `manyToMany` (they belong on the relations of an explicit intermediate entity), rather than accepted and ignored.
- `through:` is valid on `manyToMany` only. Use it to give the link a domain name (`Enrollment` rather than `StudentCourse`) or to keep two n:m relations between the same pair apart. A generated name that collides with a declared entity is an error, not a silent merge.
- A self-referencing n:m (both ends the same entity) is legitimate; the link's two ends are named apart.

### An explicit intermediate entity — a link with data

When the link carries **bridge fields** — a quantity, a partial amount, a valid-from date — or a lifecycle of its own, write the entity out and drop the `manyToMany`:

```yaml
- name: SalesInvoiceCustomerPayment
  fields:
    - { name: id,     type: integer, primaryKey: true, generated: true }
    - { name: amount, type: decimal, precision: 18, scale: 2, required: true }  # partial allocation
  relations:
    - { name: SalesInvoice,    kind: manyToOne, to: SalesInvoice,    composition: true, required: true }
    - { name: CustomerPayment, kind: manyToOne, to: CustomerPayment, model: customer-payments, required: true }
```

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
