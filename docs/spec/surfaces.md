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
- **`personalReadOnly: true`** makes a personal surface see-only: create / update / delete are refused and the scoped pages render without new / edit / delete. Declared **with `personal: true`** it closes the declaring entity's own surface — use it for records an owner may see but never author, a balance or a payslip. Declared on a **composition relation** it closes only that child's inherited surface while the parent stays writable: the scope still comes from the parent, the writes do not. That is the shape of a header the owner authors whose lines a generator writes — a leave request whose day rows an approval flow charges against an entitlement — where closing the parent would close the header the person must author. The child's scoped pages, the parent page's items panel and its child panels all render without a write affordance. It is an authoring error to declare it on a relation that is neither `personal: true` nor a composition, on a second composition of the same entity, or on a child whose master has no personal surface to inherit.
- **`sensitive: true`** on a field (never the PK, the identity field, or the owner FK) strips it from the scoped responses and ignores it on scoped writes — use it for billing rates and amounts the owner must not see. It is enforced server-side, not just hidden.

::: info Normative
A scope's safety is by **construction, not by a filter**: the scoped controller only ever queries the caller's own rows, and a sensitive field is on an allow-list the scoped serialiser never includes. A field hidden only in the UI is cosmetic; `sensitive` is a server-side guarantee.
:::

A user task can also be routed to the record owner's inbox with the literal `assignee: personal`, which resolves the owner through the `personal:` relation, or to whoever a relation walk off the record names — `assignee: { path, fallback }`, whose walk likewise ends at an `identity`-declaring entity (see [processes](/spec/processes#task-assignment)).

## permissions

```yaml
permissions:
  - { role: Sales,   can: [Customer:read, Order:create] }
  - { role: Manager, can: [Order:approve] }
```

Generates a deduplicated set of **roles**. It deliberately does **not** emit URL-shaped access rules — those belong to whichever downstream template materialises the UI, because only that template knows the paths it publishes. The `can: [Resource:action]` tokens are an authoring hint to those downstream generators about which actions each role may invoke.

The roles a file authors are the roles its people are given. The roles a downstream generator derives for a resource that no grant names are not.

::: info Normative
A conforming generator MUST declare every role a `permissions:` entry authors as one a person may be given, with its `description`, and MUST NOT mark so a role it derives for a resource that no grant names. A deployment that manages the roles of its people MUST offer the marked roles, MAY add roles of its own, and MUST refuse any other role it is asked to give. The mark grants nothing: what a role may reach is still decided by its `can:` tokens. A role of the deployment itself is never offered to a person through the application.
:::

A resource a grant names is gated by the roles the file authors for it, in place of the roles a generator derives for a resource that no grant names. A grant that only adds a role, and leaves the gate otherwise as it is, is declared `additive`:

```yaml
permissions:
  - { role: Employee, can: [LeaveType:read], additive: true }
```

`LeaveType` is then read by its derived read and write roles and by `Employee`, and written by its derived write role. Only `Employee` is a role the file authors, so only it is offered to a person; the derived roles keep working for the machine clients that hold them. Without the key the file would have to author the derived role names itself to keep them, which turns them into roles offered to people.

An additive entry never removes a role from a gate: whether a resource keeps its derived roles, and whether it takes the roles a deployment adds to every gate (an entry declaring `exclusive: true` keeps those off the resources it binds), is decided by the other entries alone. A resource a generator derives no role for (an export) has nothing to keep, so the roles of the entries naming it are its gate, additive or not.

::: info Normative
A `permissions` entry declaring `additive: true` MUST add its role to the gates of every resource it binds - the read gate for a read action, the write gate and the read gate for a write action - and MUST NOT remove a role from them. A resource that only additive entries bind MUST keep the roles a generator derives for it as its gate, declared and not marked as roles a person may be given. A resource that another entry also binds is gated by that entry's roles and the additive role; a resource an `exclusive` entry binds stays closed to the roles a deployment adds to every gate. A composition child with no grants of its own follows its master's gate, the added roles included, and an additive entry binding the child itself adds to that gate. Every generated surface that reads the resource's gate MUST admit the added role. An entry declaring both `additive: true` and `exclusive: true` MUST be reported as an authoring error.
:::

## See also

- [Entities & fields](/spec/entities) — `sensitive` as a field attribute, and the entity a scope attaches to.
- [Processes & forms](/spec/processes) — `assignee: personal` and resolver-path task routing.
- [Relations & multi-model](/spec/relations) — the to-one relation a scope is declared on.
