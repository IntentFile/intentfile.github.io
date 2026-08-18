---
title: Declarative glue
description: notifications, schedules, integrations, inbound arrivals (webhook, message, file), roll-ups, keyed aggregates, settlements, expansions, generates, transitions, postings and event-driven row posting - declared in the intent, generated as integration code, never hand-written.
---

# Declarative glue

Beyond the model artefacts, the intent declares **glue**: the common integrations and background activities that would otherwise be hand-written code. The abstraction is one line:

> glue = **on** `<event>` **do** `<action>`, with action parameters bound by resolver paths.

Three axes:

- **Event** — an entity `onCreate` / `onUpdate` / `onDelete` (with an optional `when:` guard), a process step reached or completed, a schedule (`cron`), or an inbound arrival (a webhook, a message, a dropped file).
- **Action** — notify (email), call out (HTTP), ingest into an entity, recompute a counter, start a process, create a document.
- **Binding** — the **resolver-path grammar** (`customer.name`, `member.email`): one-hop relation walks off the triggering entity, validated at parse time.

## Glue is generated integration code

Unlike the model generators, each glue activity is generated as an annotated **integration class** against the platform's SDK, placed in the generated events folder. The annotated class *is* the artefact: the runtime synchronises and runs it, it is deterministic and regenerated with the app, and it is replaceable by a hand-written override.

::: warning Event-key gotcha
An event-binding key is `event:`, never `on:` — YAML 1.1 resolves a bare `on` (also `off` / `yes` / `no`) to a boolean, so an `on:` key is silently swallowed. An action key is `do:`.
:::

## The event axis — lifecycle and process-step events

A glue entry that reacts (`notifications`, `integrations`) declares **exactly one** `event:`, on one of two axes:

| Axis | Shape | Fires when |
| --- | --- | --- |
| entity lifecycle | `{ onCreate\|onUpdate\|onDelete: <Entity> }` | a record is created / updated / deleted |
| process step | `{ onStepReached\|onStepCompleted: { process, step } }` | a running process arrives at that step / has just finished it |

```yaml
processes:
  - name: LoanApproval
    trigger: { onCreate: Loan }
    steps:
      - { name: librarianReview, kind: userTask,    args: { assignee: librarian, next: activate } }
      - { name: activate,        kind: serviceTask, args: { setField: status, value: ACTIVE } }

notifications:
  # "when the review task becomes available, tell the member's branch manager"
  - name: reviewPending
    event: { onStepReached: { process: LoanApproval, step: librarianReview } }
    to: member.branch.managerEmail
    subject: "Loan {id} is waiting for review"
    body: "A librarian must approve it."

integrations:
  # "when the loan has been activated, tell the partner system"
  - name: pushActivation
    event: { onStepCompleted: { process: LoanApproval, step: activate } }
    method: POST
    url: "@config:PARTNER_URL"
```

A step event is an event **about the record the process runs on** — the process's `trigger` entity — so every action parameter resolves exactly as it does for a lifecycle event: the same recipient rule, the same `{placeholder}` interpolation, the same `when:` guard, the same forwarded body. No action needs to know which axis fired it.

::: tip What is rejected at parse
An undeclared process or step; a step that occupies no observable moment (only a `userTask` or a `serviceTask` does — not a decision, a wait or the end); a process with no `trigger`, since there is then no record the event could be about.
:::

`onStepReached` fires before the step's own work begins — the moment a task becomes available in the inbox. `onStepCompleted` fires after the step finished **and** after its writes are persisted (a task's edits, a `setField`), so an observer never sees a stale record. Any number of entries may observe the same moment: the record is published once. A branch that jumps back into an observed step re-enters it, so its `onStepReached` observers fire again.

## notifications

Email on an event of the axis above.

```yaml
notifications:
  - name: orderUpdated
    event: { onUpdate: Order }     # one event of the event axis
    to: ops@example.com            # a literal, a direct field, or a one-hop relation.field
    subject: "Order {id} for {customer.name}, total {total}"
    body: "The order changed."
```

`to` and every `{placeholder}` resolve a literal, a direct field, or a one-hop `relation.field` of a to-one relation. `when:` supports a single `field ==|!= literal` guard. Multi-hop paths (`a.b.c`) are rejected with a clear message. Everything below about the shared notify block — `attach: print`, `forEach`, the failure semantics — applies to a `notifications[]` entry too.

## The notify block — and `attach: print`

`to` / `subject` / `body` (+ `channel`) is one reusable **notify block**, not a shape peculiar to `notifications`. The same block is authored at every place an intent can act on a record:

| Where | The record it is about | It sends |
| --- | --- | --- |
| `notifications[]` | the event record | on create / update / delete |
| `schedules[].notify` | each matched row | on every cron tick, per row |
| `transitions[].notify` | the transitioned record | after the status flip commits |
| a `serviceTask`'s `args.notify` | the process's trigger record | when the flow reaches that step |

Add **`attach: print`** and the message carries the record's **own document** — the record rendered through its [print template](/spec/presentation#printable-documents) and attached. This is the declarative form of the most common outbound action a business document has: the invoice to its customer, the payslip to its employee, a reminder that carries the invoice it is about.

The **render language**: `language:` fixes the print-template language; `languageFrom: <relation>.<field>` reads it per record from a one-hop to-one path of the entity the message is about (mutually exclusive with `language:`). Absent both — or when the resolved value is blank — the render falls back to the first entry of the application's configured language set at send time.

```yaml
    notify:
      to: Customer.email                 # literal / direct field / one-hop relation.field
      subject: "Invoice {number}"        # {field} and {relation.field} interpolation
      body: "Dear {Customer.name}, please find invoice {number} attached."
      attach: print                      # render THIS record's print template and attach it
      language: bg                       # optional FIXED print-template language
      # or per record: languageFrom: Customer.locale  (a one-hop relation.field holding the code)
```

`attach` is `print` — the record the block is about — or, inside a fan-out, [`recordPrint`](#one-document-many-recipients-attach-recordprint). With `print` the entity must be a **document** (a header with a line-items child) — that is the shape a print template exists for. Attaching the print of a plain entity is rejected up front rather than silently sending a message without the document it promised. The attachment comes from the record's own data through the same path the interactive print takes, so a document mailed and a document printed are the same document.

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

A fan-out is authored on a `transitions[].notify` or a `serviceTask`'s `args.notify`. A `schedules[].notify` already runs once per matched row and a `notifications[]` entry is about the event record, so a `forEach` on either is rejected rather than ignored — an accepted declaration that changes nothing sends a different message than the one that was written down.

### One document, many recipients: `attach: recordPrint`

The mirror shape: the related rows are only the **recipient list**, and the document belongs to the record they hang off — a request for quotation mailed to each invited supplier, an agenda mailed to each participant. `attach: print` cannot express it (it renders the row, which is nobody's document); `attach: recordPrint` renders the fan-out's **anchor record** — the record the block is about — once, for everybody.

```yaml
    notify:
      forEach: InvitedSupplier                      # the rows: the recipient list
      to: Supplier.email                            # the ROW's supplier - the rows ARE the recipients
      subject: "RFQ {record.number}"                # {record.<field>} = the ANCHOR RECORD's field
      body: "Dear {Supplier.name}, please quote by {record.deadline}."   # bare = the ROW
      attach: recordPrint                           # the RECORD's document, rendered once
```

`recordPrint` is only meaningful inside a fan-out and is rejected without one — outside a fan-out `attach: print` already renders that very record. It is the **anchor** that must be a document (the row need not be), and `language` / `languageFrom` then select the anchor's render language, read off the anchor: there is exactly one render for the whole fan-out, and the same result is attached to every message.

::: info Which record a path reads is written down, never inferred
Inside a fan-out a **bare** path — the recipient, `{field}`, `{Relation.field}` — resolves against the **ROW**, and the reserved prefix `record.` is the only way to address the anchor: `{record.<field>}` names one field of it, and a longer path is rejected. The recipient can never be record-scoped: the rows *are* the recipients, so a record-scoped address would send the same message to the same address once per row. `record.` outside a fan-out is rejected too, since there every bare path already resolves against the record. Nothing in a rendered message would reveal that the wrong record had been read — so the scope is authored, not guessed.
:::

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
    entity: Order                                           # SOURCE - local by default (see model: below)
    where:
      - { field: orderDate, op: lt, value: CURRENT_DATE }   # eq / ne / gt / ge / lt / le / like
    notify:
      to: ops@example.com
      subject: "Stale order {id} for {customer.name}"
      body: "This order is stale."
      # the full notify block applies here: attach: print for the row's document, forEach to fan out
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

### Cross-model source (`model:`)

The source `entity` is local by default. Add `model: <uses alias>` to read it from another (owner) model, so a schedule can live with the module that owns the CREATED rows instead of being forced into the source's module. The source is **read-only** (a schedule never writes it); a `forEach` collection may likewise be cross-model with its own `model:` alias. Both aliases must be declared under `uses:`.

```yaml
uses:
  - { model: projects }

schedules:
  - name: monthlyProjectTimesheets
    cron: "0 0 2 1 * ?"
    entity: Project
    model: projects                    # the source Project lives in the projects model
    where:
      - { field: Status, op: eq, value: 2 }
    generate:
      to: ProjectTimesheet             # LOCAL - owned by this model
      map: { Project: id, Customer: Customer }
      defaults: { Period: now }
      children:
        - to: EmployeeTimesheet
          parent: ProjectTimesheet
          forEach:
            entity: EmployeeProjectAssignment
            model: projects            # the forEach collection is also cross-model
            match: { Project: id }
          map: { Employee: Employee }
```

- A cross-model source supports the **`generate`** action only. `notify` needs the source's relation metadata, which only a local entity carries, and is rejected.
- Validation splits the same way relations do: that `model:` names a declared `uses:` alias is checked when the intent is parsed; the source entity's existence and every `where` / `map` / `match` field reference are checked when the model is generated, against the owner model. An unresolvable owner or a mistyped field drops that schedule with a warning — never generated code that cannot compile.

## integrations — outbound HTTP

Tell another system on an event.

```yaml
integrations:
  - { name: pushNewOrder, event: { onCreate: Order }, method: POST, url: "@config:WAREHOUSE_URL" }
```

The `@config:KEY` sugar resolves to a configuration lookup, so endpoints and secrets stay out of the source.

### payload — the declared envelope

Without a `payload`, the request body is the record as stored. That is only right when the receiver accepts the entity, and it has a cost even then: every column becomes part of a public contract, so adding a field silently changes what the outside world receives. A real integration contract is usually an *envelope* — a type, a version, an idempotency key, a timestamp, an identifier of the sender — which no arrangement of entity columns can produce.

`payload` declares that envelope, key by key:

```yaml
integrations:
  - name: requestUserAssignment
    event: { onCreate: UserInvitation }
    method: POST
    url: "@config:ASSIGNMENT_URL"
    payload:
      type: "user.assignment.requested"     # literal
      version: 1
      messageId: "{uuid}"                   # minted per message
      tenantId: "{tenant}"                  # execution context
      appId: "@config:APP_ID"               # configuration
      email: email                          # a field of the record
      role: role.name                       # one hop off a to-one relation
      requestedAt: "{now}"
```

The value forms are the ones [`notify`](#notifications) already resolves, deliberately borrowed rather than invented: a **literal**, a **direct field**, or a **one-hop `relation.field`** of a to-one relation, which the generated sender reads from the related record it loads once. `@config:KEY` reads the configuration, as it does in `url`.

The **context tokens** are a closed set of four:

| token | value |
|---|---|
| `{uuid}` | a fresh identifier, minted per message — the idempotency key a receiver deduplicates on |
| `{now}` | the send time, as an ISO-8601 instant |
| `{tenant}` | the tenant the send runs for |
| `{user}` | the user behind the change that raised the event |

::: info Normative
A `payload` value MUST be one whole value in one of the declared forms. Interpolated text (`"Order {id} placed"`), a nested object and a list are NOT payload values and MUST be reported as authoring errors — a payload is a contract, not a template.

A path MUST resolve at most one hop; `a.b.c` MUST be rejected.

An unknown context token MUST be an authoring error, never an empty value in a sent message.

A `payload` MUST be rejected on a method that carries no request body.

Keys MUST be sent in the order they were declared.

A bare word that names no field and no to-one relation of the record is a **literal** — the only way to carry a one-word constant. A value braced as `"{name}"` is a reference and MUST resolve.
:::

Three value forms and four tokens is the cap, and the cap is the point: it expresses a frozen contract without the construct becoming a transformation language. A payload that needs more than this is an algorithm, and belongs in a hand-written handler — the honest hand-off.

## inbound — webhooks
## inbound — arrivals from outside

Another system tells us — a JSON record shaped like the entity, ingested into it. What differs between the three forms is only **where the record arrives**; the action is the same `create`.

```yaml
inbound:
  # HTTP — an endpoint the other system posts to
  - { name: leadHook,  path: /webhooks/lead, create: Lead }
  # message — every record arriving on a queue (point-to-point) or a topic (broadcast)
  - { name: leadQueue, source: { queue: leads.inbound }, create: Lead }
  - { name: leadFeed,  source: { topic: crm.leads }, create: Lead }
  # file — every file dropped into a folder, polled on the cron
  - { name: leadDrop,  source: { folder: /data/inbox/leads, cron: "0 */5 * * * ?" }, create: Lead }
```

An entry declares **exactly one arrival**: a `path`, or a `source` naming exactly one of `queue` / `topic` / `folder` — both, neither, or two channels is an error. Whichever it is, the record is saved through the entity's **ordinary write path**, so validations, translations and the create event behave exactly as for any other write: the arrival is a transport, not a second data path.

::: warning A folder is polled, not watched
That is why a `folder` source requires its `cron` (and why a `cron` is an error on the others). A file holds one record or an array of them, is not read while it is still being written, and leaves the drop folder once read — ingested and rejected files kept apart — so nothing is ingested twice and a rejection stays inspectable.
:::

Conversation-shaped transports — acknowledgements, retries with backoff, certificates — stay [beyond the boundary](/spec/#the-scope-boundary): they have state and failure semantics no one-line declaration should pretend to carry.

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

### Event-driven creation — `event:`

A create-from may declare an `event:` instead of relying on the button — the follow-up document is minted the moment the source reaches a state, with nobody clicking. The canonical case is a document that arrives from the outside and is completed by an earlier step: a fine ingested by a webhook, whose responsible person is identified by a transition, must produce a declaration document from the fine and that person.

```yaml
generates:
  - name: declaration-from-fine
    from: Fine
    to: Declaration
    event: { onTransition: Fine, when: "Status == IDENTIFIED" }   # or { onCreate: Fine }
    map:
      Fine: id                       # REQUIRED with an event — the back-reference, i.e. the guard
      Vehicle: Vehicle
    defaults: { declaredAt: now }
    items:                           # a whole document — header AND items
      - { name: "Fine {number}", amount: Amount }
```

::: info Normative
Exactly one trigger must be declared: `onTransition` (a status write — a `when: "<StatusRelation> == <status>"` guard is mandatory, the status named or numbered) or `onCreate` (the source's insert — the guard is optional, for a source with no status lifecycle). The entity named there must be the entity `from:` declares; the owning model is never repeated (`fromUses:` declares it). The guard must be evaluated against the source as re-read at delivery, not against the event payload, which is as-of the event and lacks anything a later step wrote.
:::

::: info Normative
An event-driven create-from is **at-most-once**: `map` must copy the source's primary key onto a to-one relation of the target back to the source, and the generated creation must return the already existing target instead of creating a second one. A file declaring an `event` without that back-reference must be rejected — a redelivery would otherwise mint a duplicate document. A create-from with no `event` carries no such guard: producing several targets from one source by clicking twice is a legitimate manual act.
:::

::: info Normative
Declaring an `event` drops the button unless `button: true` is declared as well; `button: false` without an `event` must be rejected (the action would have no trigger at all). When both triggers are declared they must share one creation path, and therefore one at-most-once guard.
:::

`sourceStatus:` composes unchanged: the flip happens once the target exists, and cannot re-trigger the create-from because the guard has already claimed the source.

Prefer this over [`posts`](#posts-derived-rows-on-an-event) when the result is a document with line items — `posts` emits flat mapped rows and cannot reference the freshly created header. Prefer it over a button plus a [`wait`](/spec/processes#wait-park-the-process-on-a-data-event) step when the step is really waiting for a person to remember to click: an unclicked record parks its process instance indefinitely.

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
    notify:                       # optional: tell the counterparty once the flip has committed
      to: Customer.email
      subject: "Invoice {number} was voided"
      body: "The invoice has been cancelled."
```

When the entity declares a [`lifecycle`](/spec/entities#lifecycle-the-legal-status-graph), a transition is presentation over its edges: its `from`/`setStatus` pair must be one, and the graph — not the button — is what every other writer is held to as well.

A transition may carry a [notify block](#the-notify-block-and-attach-print) — "on Void, tell the customer" — attempted after the flip has committed, and unable to fail it.

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

The trigger is `onTransition` — a status write, with the `when` status guard mandatory — or **`onCreate`**, for a source document with **no status lifecycle at all**: a booked payment's only event is being created, and it is exactly the document an accountant expects posted. `when` stays optional there as a plain `<Property> == <number>` guard; an `onCreate` posting reacts to the source's create event.

```yaml
postings:
  - name: customerPaymentPosting
    event: { onCreate: CustomerPayment, model: customer-payments }   # no status, no guard
    creates: JournalEntry
    backReference: CustomerPayment
    map: { entryDate: date, reason: "Payment {number}" }
    rule: { entity: PostingRule, match: { documentType: "Customer Payment" } }
    items:
      - { Account: rule(bankAccount),       debit: "Amount" }
      - { Account: rule(receivableAccount), credit: "Amount" }
```

### Conditional rule column

When the account column must be chosen by a **source value** — a payment posts to the bank account for a transfer, the cash account for cash — a single item row selects the rule column by a classifier instead of duplicating the row per case (the same `by` / `cases` / `default` shape a conditional value-copy uses). Quote it, since it carries colons and braces:

```yaml
    items:
      - { Account: "rule(by: Method, cases: { 1: BankAccount, 2: CashAccount }, default: SuspenseAccount)", debit: "Amount" }
```

`by` is a source field or to-one relation, compared as a number (like a `when` guard); `cases` keys are the classifier's ids and values are columns of the rule entity; `default` (optional) is the fallback column. When no case matches and there is no default — or the selected column is null — the posting skips to the unposted worklist, exactly as a null `rule(<column>)` does. A conditional cell already branches the account, so it cannot also carry a row `when`.

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
- **The boundary is stated, not discovered.** What deliberately lives outside the format — protocol, algorithm, statutory form — and the hand-off each one takes is specified in [the scope boundary](/spec/#the-scope-boundary), and an authoring assistant is required to say when a requirement crosses it.

## See also

- [Processes & forms](/spec/processes) — triggers, `wait`, and boundary timers are the process-side glue.
- [Relations & multi-model](/spec/relations) — the relations roll-ups, settlements and postings flow along.
- [DSL reference](/reference) — the full glue index.
