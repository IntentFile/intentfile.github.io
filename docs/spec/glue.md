---
title: Declarative glue
description: notifications, schedules, integrations, inbound webhooks, roll-ups, settlements, expansions, generates, transitions and postings - declared in the intent, generated as integration code, never hand-written.
---

# Declarative glue

Beyond the model artefacts, the intent declares **glue**: the common integrations and background activities that would otherwise be hand-written code. The abstraction is one line:

> glue = **on** `<event>` **do** `<action>`, with action parameters bound by resolver paths.

Three axes:

- **Event** — an entity `onCreate` / `onUpdate` / `onDelete` (with an optional `when:` guard), a schedule (`cron`), or an inbound webhook.
- **Action** — notify (email), call out (HTTP), ingest into an entity, recompute a counter, start a process, create a document.
- **Binding** — the **resolver-path grammar** (`customer.name`, `member.email`): one-hop relation walks off the triggering entity, validated at parse time.

## Glue is generated integration code

Unlike the model generators, each glue activity is generated as an annotated **integration class** against the platform's SDK, placed in the generated events folder. The annotated class *is* the artefact: the runtime synchronises and runs it, it is deterministic and regenerated with the app, and it is replaceable by a hand-written override.

::: warning Event-key gotcha
An event-binding key is `event:`, never `on:` — YAML 1.1 resolves a bare `on` (also `off` / `yes` / `no`) to a boolean, so an `on:` key is silently swallowed. An action key is `do:`.
:::

## notifications

Email on an entity lifecycle event.

```yaml
notifications:
  - name: orderUpdated
    event: { onUpdate: Order }     # exactly one of onCreate / onUpdate / onDelete
    to: ops@example.com            # a literal, a direct field, or a one-hop relation.field
    subject: "Order {id} for {customer.name}, total {total}"
    body: "The order changed."
```

`to` and every `{placeholder}` resolve a literal, a direct field, or a one-hop `relation.field` of a to-one relation. `when:` supports a single `field ==|!= literal` guard. Multi-hop paths (`a.b.c`) are rejected with a clear message.

## schedules

Cron reminders / cleanups — query an entity and act per matching row. Exactly one of `notify` or `generate` per row.

```yaml
schedules:
  - name: staleOrders
    cron: "0 0 9 * * ?"
    entity: Order                                           # the schedule's SOURCE must be local
    where:
      - { field: orderDate, op: lt, value: CURRENT_DATE }   # eq / ne / gt / ge / lt / le / like
    notify:
      to: ops@example.com
      subject: "Stale order {id} for {customer.name}"
      body: "This order is stale."
```

The `generate` variant creates a record through the **target's** own layer (so numbering, status init and calculated fields fire); the target may be cross-model via a `uses:` alias, and it may fan out `children`:

```yaml
schedules:
  - name: monthlyTimesheets
    cron: "0 0 1 1 * ?"
    entity: Employee
    where:
      - { field: status, op: eq, value: ACTIVE }
    generate:
      to: EmployeeTimesheet          # cross-model target via a uses: alias
      map: { Employee: id }
      defaults: { Period: now }
      children:
        - to: DayAllocation
          parent: EmployeeTimesheet
          forEach: { days: workingDays }   # one child per working day
          dayField: day
```

## integrations — outbound HTTP

Tell another system on an event.

```yaml
integrations:
  - { name: pushNewOrder, event: { onCreate: Order }, method: POST, url: "@config:WAREHOUSE_URL" }
```

The `@config:KEY` sugar resolves to a configuration lookup, so endpoints and secrets stay out of the source.

## inbound — webhooks

Another system tells us — a webhook that ingests a JSON payload into an entity.

```yaml
inbound:
  - { name: leadHook, path: /webhooks/lead, create: Lead }
```

Generates an endpoint that deserialises the request body into the entity and saves it. The v1 action is `create` (ingest).

## rollups — denormalised parent totals

```yaml
rollups:
  - { name: memberLoanCount, entity: Loan, via: member, field: loanCount }        # count
  - { name: invoicePaid, entity: Allocation, via: SalesInvoice, field: paid,      # sum + balance + status
      op: sum, of: amount, capacity: total, balance: balance,
      status: Status, statusWhenFull: 7, statusWhenPartial: 6 }
```

A count roll-up keeps a counter on a parent current on the child's create / delete. With `op: sum` the roll-up keeps `field` equal to the sum of the children's `of` field, can maintain a `balance` (= `capacity - sum`), and can flip a `status` relation to `statusWhenFull` / `statusWhenPartial`. Sum roll-ups **compose transitively** across a multi-level composition (a leaf edit updates the mid total, then the top total); recomputation stops when values stop changing.

Roll-ups are recompute-on-event (self-healing), so they are **eventually consistent, not transactionally exact** under heavy concurrency.

## settlements — payment allocation

Auto-allocate payments across open invoices — the accounts-receivable pattern. Pair it with a `rollups` sum entry that maintains `paid` / `balance` / status.

```yaml
settlements:
  - name: autoAllocate
    junction: SalesInvoiceCustomerPayment
    invoice: SalesInvoice
    payment: CustomerPayment
    amount: amount
    total: total
    paid: paid
    pot: amount
    order: date                       # allocate oldest first
    match: [Customer, Currency]
    status: Status
    payableStatuses: [3, 4, 6]
```

## expansions — child rows from a date span

Generate one child row per day / week / month of a span on the parent:

```yaml
expansions:
  - name: installments
    from: Loan
    into: LoanInstallment
    unit: month                                       # day (default) | week | month
    between: { start: startDate, end: endDate }
    map: { dueDate: period }
    spread: { total: principal, into: amount, round: 2 }   # last row absorbs the remainder
    count: periods
```

A span change replaces the generated child set — never mix hand-entered rows into an expanded child.

## generates — create-from

One-click "create a document from this document":

```yaml
generates:
  - name: invoice-from-timesheet
    from: ProjectTimesheet
    to: SalesInvoice
    uses: sales                       # model alias when the target is cross-model
    map: { Customer: Customer }
    defaults: { InvoiceDate: now }
    items: { from: ProjectTimesheetItem, to: SalesInvoiceItem, map: { Description: Description } }
    sourceStatus: 3                   # optional: flip the source's status after the target is created
```

Adds a button on the source view; the clone saves through the target's own layer, so numbering, status init and calculated fields fire. An optional `sourceStatus` flips the source record's status once the target exists.

## transitions — guarded status flips

A per-record button that flips an entity's `function: EntityStatus` relation on demand — void, cancel, close, reopen — guarded by allowed source statuses and an optional condition. A flip from any other status (or a failing guard) is rejected; a successful flip publishes a `-transitioned` event that `postings` and integrations can observe.

```yaml
transitions:
  - name: VoidInvoice
    forEntity: Invoice            # must declare a function: EntityStatus relation
    from: [3, 4]                  # allowed source status ids
    setStatus: 8                  # the target status id (not one of `from`)
    when: "Paid == 0"             # optional guard: <Field> ==|!= <number>
    label: Void
    icon: ban
```

## postings — source document to ledger

When a (usually cross-model) source document reaches a status, create one local document with computed multi-line content. Idempotent via the back-reference; a missing rule or account skips (an unposted worklist), never throws.

```yaml
postings:
  - name: salesInvoicePosting
    event: { onTransition: SalesInvoice, model: sales-invoices, when: "Status == 3" }
    creates: JournalEntry
    backReference: SalesInvoice
    map: { entryDate: date, reason: "Sales invoice {number}" }
    rule: { entity: PostingRule, match: { documentType: "Sales Invoice" } }
    items:
      - { Account: rule(receivableAccount), debit: "Net + Vat" }
      - { Account: rule(revenueAccount),    credit: "Net" }
      - { Account: rule(vatAccount),        credit: "Vat", when: "Vat != 0" }
```

A second posting can **reverse** the first (a reversal / credit) when the source is voided — pair it with the `transitions` void that flips the source into its void status. The reversal inherits `creates` / `backReference` / `rule` / `map` / `items` from the sibling it names, negates every item amount on the **same** side, links back to the original through a `storno` self-relation, and is fail-soft:

```yaml
postings:
  - name: docPosting
    event: { onTransition: Doc, when: "Status == 2" }   # posted
    creates: Entry
    backReference: Doc
    items:
      - { debit: "Amount" }
      - { credit: "Amount" }
  - name: docStorno
    event: { onTransition: Doc, when: "Status == 3" }   # voided
    reverses: docPosting                                 # inherit + negate the sibling's items
    storno: Storno                                       # the self-link field on the created Entry
```

## Guardrails

- **Curated vocabulary, not a general DSL.** Real logic is a `script` step or a hand-written hook — the escape hatch is non-negotiable.
- **Every generated glue artefact has an override switch**, so a hand-written class can replace any single generated one.
- **Secrets and endpoints via `@config:`**, never inline.
- **Bindings validated at parse** — a dangling `customer.namez` fails fast, not at runtime.

## See also

- [Processes & forms](/spec/processes) — triggers, `wait`, and boundary timers are the process-side glue.
- [Relations & multi-model](/spec/relations) — the relations roll-ups, settlements and postings flow along.
- [DSL reference](/reference) — the full glue index.
