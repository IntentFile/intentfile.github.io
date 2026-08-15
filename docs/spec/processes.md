---
title: Processes & forms
description: Workflows with user tasks, decisions, service tasks, waits, boundary timers and abort-on-status; the triggers that start them; task forms; and custom action buttons.
---

# Processes & forms

## processes

```yaml
processes:
  - name: OrderApproval
    trigger: { onCreate: Order, when: "total > 0" }
    steps:
      - { name: managerReview, kind: userTask,    args: { assignee: manager, form: ApproveOrder } }
      - { name: bigOrder,      kind: decision,    args: { if: "customer.creditLimit > 10000", then: cfoReview, else: activate } }
      - { name: cfoReview,     kind: userTask,    args: { assignee: cfo, form: ApproveOrder } }
      - { name: activate,      kind: serviceTask, args: { setRelationField: Status, value: 2, next: done } }
      - { name: done,          kind: end }
```

Generates one process definition per `processes[]` entry (a standard workflow model plus its diagram layout, so a modeller renders it).

Step kinds: `userTask`, `serviceTask`, `decision`, `script`, `wait`, `parallel`, `end`.

### Step routing — the linear chain and `next:`

Steps flow **linearly in declaration order**. Any step may override its successor with `args: { next: <step | end> }` — this is how two decision branches **converge** instead of the first falling through into the second (an `activate` branch routes to `done` so it never falls into the `cancel` branch declared after it). `next` must name a declared step or the literal `end`.

### Service tasks

Service-task shapes: `setField` / `setRelationField` (generated handlers that write a field or flip a status relation on a branch), `notify` (the step's work IS an outbound message — see [the notify block](/spec/glue#the-notify-block-and-attach-print)), and `delegate` (a handler referenced by name with injected `fields` — hand-written, or a generated one such as a [snapshot generator](/spec/entities#attachments-and-snapshots)). Set a status on the *branch* that reaches it, never on the shared task, so a reject path does not transit through the approved status.

A `notify` service task stands alone: it cannot carry another action (`setField`, `setRelationField`, `call`, `delegate`) on the same step. Sending is the step's whole purpose, and a step that both writes and sends hides which of the two failed.

### Decision steps

`if` + `then` are mandatory, `else` optional. `then` / `else` must name a declared step or the literal `end`; the parser validates this, so a typo fails at parse time rather than producing an invalid workflow. Without `else`, the gateway default falls through to the next step.

A decision condition may walk **one hop** off the trigger entity (`customer.creditLimit > 10000`): a resolver step is generated before the gateway to load the related entity and rewrite the condition.

### parallel — concurrent branches (fork/join)

A `parallel` step runs several branch steps **at the same time** and rejoins before the next step — two independent reviews of one order, say, instead of one after the other. It declares the `branches` to run concurrently and the `next` step to continue at once every branch is done:

```yaml
  - { name: reviews, kind: parallel, args: { branches: [techReview, commercialReview], next: consolidate } }
  - { name: techReview,       kind: userTask, args: { assignee: engineer, form: ReviewOrder } }
  - { name: commercialReview, kind: userTask, args: { assignee: sales,    form: ReviewOrder } }
  - { name: consolidate,      kind: serviceTask, args: { setRelationField: Status, value: 2, next: done } }
```

It is a **parallel-gateway fork/join**: a diverging gateway fans an unconditioned flow to each branch, and a converging gateway waits for **all** branches before continuing.

A branch is a **chain**, not a single step. It starts at the declared branch step and continues through that step's own routing — its `next`, a decision's `then` / `else`, a boundary `timeout` / `expire` branch — and it may itself be a nested `parallel`, which contributes its own fork/join pair. Everything reachable that way belongs to the branch and runs concurrently with the sibling branches:

```yaml
  - { name: reviews, kind: parallel, args: { branches: [techReview, commercial], next: consolidate } }
  # a two-step chain: the second step declares no routing, so it joins
  - { name: techReview,  kind: userTask,    args: { assignee: engineer, form: ReviewOrder, next: techSignoff } }
  - { name: techSignoff, kind: serviceTask, args: { setRelationField: TechStatus, value: 2 } }
  # a nested fork: it declares no `next`, so its join flows into the enclosing one
  - { name: commercial,  kind: parallel,    args: { branches: [pricing, legal] } }
  - { name: pricing,     kind: decision,    args: { if: "amount > 1000", then: escalate, else: join } }
  - { name: escalate,    kind: userTask,    args: { assignee: manager, form: ReviewOrder } }
  - { name: legal,       kind: userTask,    args: { assignee: legal,   form: ReviewOrder } }
```

A branch and everything it reaches are off the linear chain (like decision targets), so their declaration order carries no meaning — and inside a branch there is **no positional fall-through**. A step routes explicitly, or, declaring no routing at all, is a branch **terminal** and flows into the join. The routing literal **`join`** converges on the innermost enclosing join gateway, which is how a decision inside a branch rejoins from both arms.

Rules: at least two distinct `branches`, each a declared step other than the fork itself. `join` is valid only inside a branch, and no step may be named `join`. A branch must never route to `end` — the join would wait forever for a token that ended; end the process after the fork instead. A step may belong to only one branch: a step two concurrent tokens reach runs twice and still leaves the join waiting. A branch is entered through its fork only, so a branch converges on `join`, never on the fork's own `next` directly. A top-level fork declares `next` (a declared step or `end`); a **nested** fork may omit it, and then joins into its own enclosing join.

### wait — park the process on a data event

A `wait` step parks the process until an entity lifecycle event resumes it — a case waiting for a reply, a flow waiting for a payment, an order waiting for its goods receipt:

```yaml
steps:
  - { name: requestInfo, kind: serviceTask, args: { setRelationField: Status, value: 4, next: awaitReply } }
  - { name: awaitReply,  kind: wait, args: { onCreate: CaseMessage, via: case, when: "internal == false", next: work } }
  - { name: work,        kind: userTask, args: { assignee: agent, form: WorkCase } }
```

- `onCreate | onUpdate: <Entity>` (exactly one; `onDelete` is rejected — a deleted record cannot resume a wait) names the resuming event.
- `via: <relation>` — when the event entity is not the trigger entity itself: the event entity's to-one relation that walks back to the trigger entity (here `CaseMessage.case`). Omitted when the event entity *is* the trigger entity; same-model relations only.
- `when:` — a single-comparison guard over the **event record** (`field ==|!= literal`), so e.g. an internal note does not resume the wait.

Correlation rides an identifier the trigger listener already writes back, so a `wait` requires the process to declare a `trigger:`. It is **fail-soft**: no parked instance, or an instance already past the wait, is a no-op — never an error.

### timeout / expire — boundary timers on a user task

Two optional attributes on a `userTask`'s args give a flow a notion of time. Both route `then` like a decision branch:

```yaml
steps:
  - name: approve
    kind: userTask
    args:
      assignee: approver
      form: ApproveQuotation
      timeout: { after: P3D, then: remind }              # non-cancelling: the task STAYS claimable
      expire:  { until: validUntil, then: markExpired }  # cancelling: the task is WITHDRAWN
      next: done
```

- **`timeout: { after: <ISO-8601 duration>, then: <step> }`** — a non-cancelling boundary timer (`PT4H`, `P3D`): after the duration the `then` branch runs (a reminder / escalation) while the task stays claimable.
- **`expire: { until: <field>, then: <step> }`** — a cancelling boundary timer driven by a `date` / `timestamp` field of the trigger entity: when the moment passes, the task is withdrawn and the flow continues at `then`. The date is **re-read at task entry**, so editing it mid-flow moves the timer. A `date` names the last valid day (the timer fires at the start of the next day); a `null` arms a far-future date so the timer never effectively fires.

### abortOn — cancel the instance on a terminal status

A running process should not outlive its document. `abortOn:` on the process cancels the **whole in-flight instance** — pending user tasks withdrawn, parked waits and armed boundary timers cancelled — the moment the trigger entity **transitions into** any of the listed status ids (the same transition event a [`transitions`](/spec/glue#transitions-guarded-status-flips) button or a workflow status set publishes):

```yaml
processes:
  - name: QuotationFollowUp
    trigger: { onCreate: Quotation }
    abortOn: { status: [3, 4, 6], then: markVoid }   # accepted / rejected / expired
    steps:
      - { name: followUp, kind: userTask, args: { assignee: sales, form: FollowUp } }
      - { name: done,     kind: end }
      # abort-only cleanup - never routed to from the main flow:
      - { name: markVoid, kind: serviceTask, args: { setRelationField: Status, value: 6 } }
```

- `status:` — one or more status ids of the trigger entity's `function: EntityStatus` relation; reaching any of them aborts.
- `then:` (optional) — a single cleanup `serviceTask` (`setField` / `setRelationField`) that runs **only** on the abort path; it must not be reachable from the main flow. Omitted (or `end`) means terminate with no cleanup.

Like `wait`, `abortOn` requires the process to declare a `trigger:` (correlation rides the instance identifier stamped on the record) and is **fail-soft** — no running instance is a no-op. This is the structural answer to orphaned inbox tasks: cancel a review the moment its document is voided elsewhere.

### trigger

`trigger: { onCreate | onUpdate | onDelete: <Entity>, when: "<expr>" }` starts the process on that entity's lifecycle event:

- the parser validates at most one event kind, and that the target is a declared entity;
- the entity gains a back-reference column so the process starts at most once;
- a generated listener loads the entity, applies the `when` guard (a single `field ==|!= literal`), starts the process, and writes the instance identifier back.

The business key defaults to the entity PK but is configurable:

```yaml
trigger: { onCreate: Order, businessKey: orderNo, businessKeyStrategy: timestamp }
```

`businessKey` names which field becomes the started instance's business key; `businessKeyStrategy: timestamp` mints a `yyyyMMddHHmmss` value into that field when it is blank (the field must be `string` / `text`).

### Task assignment

A user task's `assignee` is a role / candidate-group name, or the literal **`assignee: personal`** to route the task to the **record owner's** inbox (requires the trigger entity to declare a `personal:` relation — see [scoped surfaces](/spec/surfaces)), or a **relation walk** off the trigger record:

```yaml
- name: approve
  kind: userTask
  args:
    assignee: { path: employee.manager, fallback: manager }
    form: ApproveRequest
```

Every segment of `path` is a **to-one relation** — the first of the trigger entity, each further one of the previous target — and the walk ends at an entity that declares `identity`, which is what maps a record to a login. A **cross-model** relation may only be the **last** segment: a projection carries the target's own properties but not its relations, so there is nothing to walk on from there. A conforming generator validates every hop when the file is read, so a dangling segment is reported then rather than when the process runs.

`fallback` is **required** and names the candidate group. The walk is resolved when the task is reached, not when the process starts — so a relation an earlier step of the same process set is visible — and when it resolves to nobody (a null hop, a missing record, a blank identity) the task is created **unassigned** and the fallback group can still claim it. That is what makes the unresolvable case total: a resolver path can never mint a task nobody can see.

## forms

```yaml
forms:
  - name: ApproveOrder
    forEntity: Order
    fields: [orderDate, total, customer.name]   # fields or one-hop relation.field
    actions: [approve, reject]                  # complete the task
```

Generates one form per `forms[]` entry. Controls are typed by looking each field up against the bound entity (string to a text input, integer / decimal to a number input, boolean to a checkbox, date to a date picker, and so on). Actions become buttons, coloured by name (approve to positive; reject / decline / delete / cancel to negative; save / submit to emphasised).

## actions — custom buttons

Developer-defined buttons that open a custom page — the escape hatch when a workflow or a generated screen is not enough:

```yaml
actions:
  - name: OpenPortal
    forEntity: Order
    scope: entity            # per-record; 'page' = a whole-view toolbar button
    page: /custom/portal.html
```

## See also

- [Declarative glue](/spec/glue) — event-driven glue (`wait`, `timeout`, triggers) is generated as integration code alongside the process.
- [Presentation](/spec/presentation) — the document view a process's status pill and inline task list appear on.
- [Scoped surfaces & roles](/spec/surfaces) — `assignee: personal`, the `identity` a walk ends at, and the roles a candidate group maps to.
