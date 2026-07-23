---
title: Scoped surfaces & roles
description: Per-user and per-partner row-scoped surfaces, sensitive-field stripping, read-only scoping, and the permissions block that declares roles.
---

# Scoped surfaces & roles

## Personal and partner surfaces

On top of the regular screen (which is unaffected), an entity's records can be scoped to the **logged-in user** or to an **external business partner**. Each scope adds a second generated controller that filters rows server-side — never merely hiding them in the UI.

```yaml
entities:
  - name: Employee
    identity: email                       # the field matched against the login username
  - name: Timesheet
    relations:
      - { name: Employee, kind: manyToOne, to: Employee, personal: true }   # the record owner
      - { name: Customer, kind: manyToOne, to: Customer, partner:  true }   # an external-partner owner
    fields:
      - { name: rate, type: decimal, sensitive: true }   # hidden + ignored on the scoped surfaces
```

- **`identity: <field>`** on the owner entity names the string field (conventionally a unique e-mail) matched against the login username. With no matching record, the scoped surface is simply empty — never an error.
- **`personal: true`** on a record-owning to-one relation generates a personal controller: reads are filtered to the caller's mapped record, the owner FK is forced server-side on writes, and a foreign record is not found. At most one `personal:` relation per entity; the target must declare `identity`; never put it on a composition parent — composition children inherit the owner's scope through their parent.
- **`partner: true`** is the exact mirror for **external** parties (customers, suppliers) on a partner surface, gated by the corresponding partner roles. An entity may carry both a `personal:` (staff) owner and a `partner:` (external) owner at once.
- **`personalReadOnly: true`** (with `personal: true`) makes the personal surface see-only: create / update / delete are refused and the scoped pages render without new / edit / delete. Use it for records an owner may see but never author — a balance, a payslip. Composition children inherit it through the parent.
- **`sensitive: true`** on a field (never the PK, the identity field, or the owner FK) strips it from the scoped responses and ignores it on scoped writes — use it for billing rates and amounts the owner must not see. It is enforced server-side, not just hidden.

::: info Normative
A scope's safety is by **construction, not by a filter**: the scoped controller only ever queries the caller's own rows, and a sensitive field is on an allow-list the scoped serialiser never includes. A field hidden only in the UI is cosmetic; `sensitive` is a server-side guarantee.
:::

A user task can also be routed to the record owner's inbox with the literal `assignee: personal`, which resolves the owner through the `personal:` relation (see [processes](/spec/processes#task-assignment)).

## permissions

```yaml
permissions:
  - { role: Sales,   can: [Customer:read, Order:create] }
  - { role: Manager, can: [Order:approve] }
```

Generates a deduplicated set of **roles**. It deliberately does **not** emit URL-shaped access rules — those belong to whichever downstream template materialises the UI, because only that template knows the paths it publishes. The `can: [Resource:action]` tokens are an authoring hint to those downstream generators about which actions each role may invoke.

## See also

- [Entities & fields](/spec/entities) — `sensitive` as a field attribute, and the entity a scope attaches to.
- [Processes & forms](/spec/processes) — `assignee: personal` task routing.
- [Relations & multi-model](/spec/relations) — the to-one relation a scope is declared on.
