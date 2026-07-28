---
title: Declarative glue
description: notifications, schedules, integrations, inbound webhooks, roll-ups, keyed aggregates, settlements, expansions, generates, transitions, postings and event-driven row posting - declared in the intent, generated as integration code, never hand-written.
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

## The notify block — and `attach: print`

`to` / `subject` / `body` is one reusable **notify block**, not a shape peculiar to `notifications`. The same block is authored at every place an intent can act on a record:

| Where | The record it is about | It sends |
| --- | --- | --- |
| `notifications[]` | the event record | on create / update / delete |
| `schedules[].notify` | each matched row | on every cron tick, per row |
| `transitions[].notify` | the transitioned record | after the status flip commits |
| a `serviceTask`'s `args.notify` | the process's trigger record | when the flow reaches that step |

Add **`attach: print`** and the message carries the record's **own document** — the record rendered through its [print template](/spec/presentation#printable-documents) and attached. This is the declarative form of the most common outbound action a business document has: the invoice to its customer, the payslip to its employee, a reminder that carries the invoice it is about.

```yaml
    notify:
      to: Customer.email                 # literal / direct field / one-hop relation.field
      subject: "Invoice {number}"        # {field} and {relation.field} interpolation
      body: "Dear {Customer.name}, please find invoice {number} attached."
      attach: print                      # render THIS record's print template and attach it
      language: bg                       # optional print-template language
```

`attach`'s only value is `print`, and the entity must be a **document** (a header with a line-items child) — that is the shape a print template exists for. Attaching the print of a plain entity is rejected up front rather than silently sending a message without the document it promised. The attachment comes from the record's own data through the same path the interactive print takes, so a document mailed and a document printed are the same document.

::: tip Failure semantics, per call site
A recipient that resolves to no address is a **no-op** — recorded and skipped, so a record with nobody to notify never stalls a flow. A `transitions[].notify` can never fail its transition: the status flip is the contract and is already applied when the message is attempted, so a delivery failure is recorded and the transition still succeeds. A sending process step, whose whole purpose *is* the message, fails instead — so the platform's own retry applies.
:::

### One message per related row: `forEach`

Some sends are per-row rather than per-record — a payroll run mails every payslip to its own employee. `forEach:` names a related entity and the block sends one message per row of it; every path (recipient, placeholders, `attach`) then resolves against the **row**.

```yaml
    notify:
      forEach: Payslip                              # rows whose to-one FK points at this record
      to: Employee.email                            # the ROW's employee
      subject: "Payslip {PayrollRun.month}"         # one hop from the ROW
      body: "Dear {Employee.name}, net pay {net}."  # the ROW's own field
      attach: print                                 # the ROW's own document
```

The named entity must have exactly **one** to-one relation back to the record: none means the rows are unrelated, several make the intended set ambiguous, and both are rejected rather than mailing a silently wrong set of recipients.

::: warning A fan-out never fails its activity
It is fail-soft per row at every call site, including the ones that otherwise fail: a row with no recipient is skipped, a delivery failure is recorded, and the activity completes with a per-row summary. Retrying would resend to every recipient already served — a partial fan-out cannot be made idempotent, so the summary is the report.
:::

A sending `serviceTask` stands alone: `notify` cannot be combined with another action (`setField`, `setRelationField`, `call`, `delegate`) on the same step — give the send its own step and route to it.

```yaml
processes:
  - name: InvoiceIssue
    trigger: { onCreate: Invoice }
    steps:
      - { name: issue, kind: userTask, args: { assignee: issuer, setRelationField: Status, value: 3, next: mailIt } }
      - name: mailIt
        kind: serviceTask
        args:
          notify: { to: Customer.email, subject: "Invoice {number}", body: "Attached.", attach: print }
          next: end
      - { name: end, kind: end }
```

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

The parent may be owned by **another model**. When the roll-up's `via` relation is a cross-model reference, the child stays local - it owns the event that drives the recompute - while the parent's coordinates come from the owner's model, so a time-tracking model can maintain an `actualHours` total on a project the projects model owns. The referenced model must be declared in `uses`, and the parent field is validated against the owner's model at generation time; an unresolvable roll-up is reported rather than dropped silently. The `capacity` / `balance` / `status` variants stay local-only, since they read the parent's own limit and status values.

## aggregates — keyed cross-entity totals

A running total over one entity's rows, grouped by one or more of its to-one relations and materialised into a **separate entity** keyed by the same relations:

```yaml
aggregates:
  - name: onHand
    of: StockMovement           # the source rows
    op: sum                     # sum (default) | count
    sum: quantity               # the summed field
    by: [Product, Store]        # the grouping keys
    into: ProductAvailability   # the target entity, keyed by the same relations
    field: onHand               # the target field holding the total
```

Where [`rollups`](#rollups-denormalised-parent-totals) denormalise a total onto the *parent* of a composition - one key, the child's own parent relation - an aggregate is keyed by **several** relations and lands in **its own entity**. That makes the result a first-class row: other records can reference it, lists can show it, and a picker can point at it. On-hand stock per product and store, open exposure per customer, remaining allowance per employee and year.

Every name in `by` must be a to-one relation of both the source and the target. On each create, update and delete of a source row the target row for that row's key-tuple is upserted and the total recomputed from every source row sharing the tuple, so a re-delivered event converges instead of accumulating. A source row with a grouping key unset belongs to no tuple and is ignored.

Aggregates are recompute-on-event, so like roll-ups they are **eventually consistent, not transactionally exact**. The recompute writes only the aggregate column, so it never reverts a concurrent edit to another column of the target row. An aggregate of a `sensitive` field is itself sensitive wherever its target carries a personal surface - hiding a value and publishing its total would be a distinction without a difference.

Changing a grouping key MOVES a source row between tuples, and both sides are repaired: the tuple it joined is recomputed from the row's own change, and the tuple it left is recomputed too, so no tuple keeps a contribution from a row that is no longer in it. The previous keys cannot be recovered after the write, so a conforming generator observes them before it. A tuple whose last contributing row leaves keeps its target row with a zero total rather than disappearing.

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

## posts — derived rows on an event

Emit rows into a ledger or journal when a document reaches a status, mapped from the document and its line items:

```yaml
posts:
  - name: goodsReceiptLedger
    event: POSTED               # a status value of the source, or `create`
    forEach: items              # the composition child to iterate (omit for one row per record)
    into: StockMovement         # the target entity
    idempotentBy: GoodsReceipt  # the target's back-reference to the source
    set:
      Date:         Receipt.Date
      Store:        Receipt.Store
      Product:      item.Product
      Quantity:     item.Quantity
      Direction:    1
      GoodsReceipt: Receipt.Id
```

A `set` value is a constant, `<Source>.<field>`, `item.<field>`, or an expression over those - so a sign flip (`-item.Quantity`) or a derived amount needs no code. Several entries under one event emit several rows per item: a stock transfer posts an outgoing and an incoming movement from one document.

`idempotentBy` names the target's to-one relation back to the source. It is both written and used as the skip condition, so a re-delivered event does not double-post. Rows go through the target's ordinary write path, so the target's own numbering, validations and derived fields still apply.

Compare with [`generates`](#generates-create-from): that creates ONE document from a user action, while `posts` emits N mapped rows automatically and idempotently on an event.

## Guardrails

- **Curated vocabulary, not a general DSL.** Real logic is a `script` step or a hand-written hook — the escape hatch is non-negotiable.
- **Every generated glue artefact has an override switch**, so a hand-written class can replace any single generated one.
- **Secrets and endpoints via `@config:`**, never inline.
- **Bindings validated at parse** — a dangling `customer.namez` fails fast, not at runtime.

## See also

- [Processes & forms](/spec/processes) — triggers, `wait`, and boundary timers are the process-side glue.
- [Relations & multi-model](/spec/relations) — the relations roll-ups, settlements and postings flow along.
- [DSL reference](/reference) — the full glue index.
