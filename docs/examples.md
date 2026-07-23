---
title: Examples
description: A complete single-file example exercising every block, and a multi-model example splitting a domain into several intent projects that reference each other.
---

# Examples

## A complete single-file application

One `orders.intent` exercising every top-level block — entities with a setting and a composition, a workflow with a decision, a form, a report, roles and seed data:

```yaml
name: orders
description: Order management with an approval workflow
version: 1

entities:
  - name: Country
    kind: setting
    description: Country reference data
    fields:
      - { name: id,    type: integer, primaryKey: true, generated: true }
      - { name: name,  type: string,  required: true, length: 100 }
      - { name: code2, type: string,  length: 2 }

  - name: Customer
    fields:
      - { name: id,          type: integer, primaryKey: true, generated: true }
      - { name: name,        type: string,  required: true, length: 200 }
      - { name: active,      type: boolean, defaultValue: "true" }
      - { name: creditLimit, type: decimal }
      - { name: orderCount,  type: integer }
    relations:
      - { name: country, kind: manyToOne, to: Country }
      - { name: orders,  kind: oneToMany, to: Order }

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
      - { name: managerReview,  kind: userTask, args: { assignee: manager, form: ApproveOrder } }
      - { name: bigOrder,       kind: decision, args: { if: "customer.creditLimit > 10000", then: cfoReview, else: notifyCustomer } }
      - { name: cfoReview,      kind: userTask, args: { assignee: cfo, form: ApproveOrder } }
      - { name: notifyCustomer, kind: serviceTask }
      - { name: done,           kind: end }

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
  - name: countries
    entity: Country
    rows:
      - { id: 1, name: Afghanistan, code2: AF }
      - { id: 2, name: Albania,     code2: AL }
```

## A multi-model domain

A billing domain split across several intent projects. Master-data modules are owned once and reused by the others through cross-model `uses:`; every module contributes its screens to one shared shell.

| Project | Owns | References (cross-model) |
| --- | --- | --- |
| `uoms` | UoM | — |
| `countries` | Country | — |
| `currencies` | Currency, CurrencyRate | — |
| `customers` | Customer | Country, Currency |
| `customer-payments` | CustomerPayment | Customer, Currency |
| `sales-invoices` | SalesInvoice, SalesInvoiceItem, settings | Customer, Currency, UoM, CustomerPayment |
| `navigation` | (no entities) the shared-shell groups | — |

The `customers` module reuses `Country` and `Currency` rather than redefining them:

```yaml
name: customers
uses:
  - { model: countries }
  - { model: currencies }
entities:
  - name: Customer
    group: partners
    fields:
      - { name: id,   type: integer, primaryKey: true, generated: true }
      - { name: name, type: string,  required: true, length: 200 }
    relations:
      - { name: Country,  kind: manyToOne, to: Country,  model: countries }
      - { name: Currency, kind: manyToOne, to: Currency, model: currencies }
```

A payment settling many invoices (and an invoice settled by many payments) is modelled as an explicit intermediate entity carrying the allocation amount:

```yaml
- name: SalesInvoiceCustomerPayment
  fields:
    - { name: id,     type: integer, primaryKey: true, generated: true }
    - { name: amount, type: decimal, precision: 18, scale: 2, required: true }
  relations:
    - { name: SalesInvoice,    kind: manyToOne, to: SalesInvoice,    composition: true, required: true }
    - { name: CustomerPayment, kind: manyToOne, to: CustomerPayment, model: customer-payments, required: true }
```

Generate the owners (leaves) first — `uoms`, `countries`, `currencies` — then `customers`, `customer-payments`, and finally `sales-invoices`; publish everything; open the shared shell. Because tables are [intent-prefixed](/spec/data#naming-and-tables), the projects share one schema without colliding.

See [Relations & multi-model](/spec/relations#multi-model-applications) for the full rules.
