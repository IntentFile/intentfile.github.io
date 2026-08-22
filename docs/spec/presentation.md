---
title: Presentation
description: Reports and charts, dashboard KPI widgets, calendar / range / slot views, chat-threaded documents, and the printable document template every document master gets.
---

# Presentation

Beyond the CRUD screen every entity gets, the intent declares richer read surfaces: aggregating reports, dashboard tiles, time-based views, conversation-threaded documents, and printable documents.

## reports

```yaml
reports:
  - name: OrdersByCustomer
    source: Order
    dimensions: [customer]                  # a bare to-one shows the target's label, not the FK id
    measures: ["count(*)", "sum(total)"]
  - name: BigOrderItems
    source: OrderItem
    dimensions: [order.orderDate, quantity] # a relation.field path adds a join
    filter: "quantity > 1"                   # becomes the WHERE
```

Generates one report per `reports[]` entry, rooted at `source`, with a fully materialised query:

- a plain field resolves to a source column;
- a `relation.field` path (`order.orderDate`) joins the related entity and adds a column on it;
- a **bare to-one relation** (`customer`) joins and shows the target's label field, not the raw FK id — use `customer.id` for the id. A cross-model relation joins the owning model's table, so a report can group by an entity another module owns;
- a time bucket `month(field)` (a sortable `YYYYMM` integer) or `year(field)`;
- a measure `count(*)` / `sum(...)` / `avg` / `min` / `max` becomes an aggregate, and the dimensions become the grouping.

`filter` becomes the `WHERE`, with field names rewritten to qualified physical columns. Report names, descriptions and column labels are emitted into the translation catalogue, so they localise alongside the rest of the UI.

### Lifecycle scope

An aggregation over an entity that carries a lifecycle (`function: EntityStatus`) is **wrong by default**: drafts nobody has issued, cancelled documents and voided ones all land in the sum. `scope` states which lifecycle rows the report counts, in terms of the [stages](/spec/data#stage-what-a-status-means-to-the-lifecycle) the nomenclature declares — not a predicate over positional ids:

```yaml
reports:
  - name: RevenueByMonth
    source: Invoice
    # no scope: an aggregation over a stage-classified lifecycle counts the live rows
    dimensions: ["month(date)"]
    measures: ["sum(total)"]

  - name: InvoicesByStatus
    source: Invoice
    scope: all                  # the explicit opt-out: this report is ABOUT the lifecycle
    dimensions: [Status]
    measures: ["count(*)"]

  - name: VoidedInvoices
    source: Invoice
    scope: void                 # a stage name selects the statuses classified with it
    measures: ["count(*)", "sum(total)"]
```

::: info Normative
`scope` is `all` or a single stage name, and is only meaningful over a source declaring a `function: EntityStatus` relation. A stage scope restricts the query to the statuses that stage classifies; `all` adds no restriction.

With no `scope`, a report counts every row **except** when all of the following hold, in which case it counts the `live` rows: it aggregates (declares measures, or is a balance report); its source's nomenclature is stage-classified; and neither its dimensions nor its `filter` reference the status. The last condition keeps a breakdown **by** status complete and leaves an authored predicate authoritative — a generator MUST NOT combine an implicit scope with either.

A report that aggregates over a lifecycle-carrying source while declaring no `scope`, filtering on no status, and resolving no stage classification is the case this construct exists to eliminate: a generator MUST report it as a diagnostic naming the report and its status relation. Emitting the unrestricted aggregation silently is non-conforming.
:::

### Chart

`chart:` renders the report page as a chart instead of a table (the page keeps a table / chart toggle, so filters, export and print still work). A chart wants exactly one dimension and one or more measures — the dimension labels the axis and each measure becomes a series:

```yaml
reports:
  - name: MonthlyRevenue
    source: Order
    dimensions: ["month(orderDate)"]
    measures: ["sum(net)", "sum(vat)", "sum(total)"]
    chart: bar          # bar | line | pie | doughnut | polarArea | radar
```

### balance reports

`kind: balance` produces an opening / period / closing debit + credit report per dimension, with runtime From/To date pickers:

```yaml
reports:
  - name: TrialBalance
    kind: balance
    source: JournalEntryItem
    date: journalEntry.entryDate        # the date the runtime pickers apply to
    debit: debit
    credit: credit
    dimensions: [account.code, account.name]
    filter: "journalEntry.status == 2"
```

### Dashboard KPI widgets

A report may declare a `widget` block that turns it into a KPI tile on the generated home dashboard — a meaningful business number instead of a raw record count:

```yaml
reports:
  - name: OverdueInvoices
    source: Invoice
    dimensions: [number, customer.name, due, total]
    filter: "due <= CURRENT_DATE AND balance > 0"
    widget: { kind: count, label: Overdue Invoices, icon: alert-triangle }

  - name: RevenueByMonth
    source: Invoice
    dimensions: ["month(date)"]
    measures: ["sum(total)"]
    widget:
      value: "sum(total)"          # names a declared measure => kind: value
      at: { "month(date)": now }   # pin dimensions: the `now` token, or a literal
      label: Revenue (this month)
      icon: banknote

  - name: SalesByProduct
    source: SalesInvoiceItem
    dimensions: [Product]
    measures: ["sum(quantity)", "sum(total)"]
    widget: { kind: list, limit: 5, label: Sales by Product }
```

- `kind: count` (default) — the number of records the report yields.
- `kind: value` — one aggregate cell: `value` names a measure; `at` pins dimension columns. The `now` token resolves at view time, type-aware (current `YYYYMM` on a `month(x)` dimension, current year on `year(x)`, today on a date column).
- `kind: list` — the report's first `limit` rows (default 5) as a compact table tile.

Declaring any widget replaces the automatic per-entity count tiles; `dashboard: false` hides both tiles for a report.

## widgets — custom dashboard tiles

The dashboard's escape hatch, when the report machinery cannot express the content:

```yaml
widgets:
  - { name: SystemHealth, kind: kpi,  url: /custom/health.js,          icon: activity }  # a number from a REST endpoint
  - { name: SalesFunnel,  kind: page, url: /custom/funnel/index.html }                   # an embedded HTML page
```

`kind: kpi` (default) renders a number tile whose value comes from the developer's REST endpoint; `kind: page` embeds the page in a tile. The `url` must be a same-origin path.

## view — calendar, range, slots

`view:` (with a `calendar:` / `slots:` descriptor) places an entity's records on a time surface:

```yaml
- name: DayAllocation
  view: calendar                          # a month / week calendar of records
  calendar: { start: day, title: note }   # start (date/timestamp) required; end/title/color optional
- name: VacationRequest
  view: range                             # from-to bars (a leave calendar)
  calendar: { start: fromDate, end: toDate }
- name: Appointment
  view: slots                             # a slot-picker booking page
  slots: { start: startTime }
```

`view: calendar` is also expressible as the role alias `function: Calendar`.

### A view adds a page

`view: calendar`, `view: range` and `view: slots` **add** a page; they never take one away. The entity keeps the page family its structure already implies — a list, a master-detail, or a document editor — and the view joins it:

| Route | Page |
|---|---|
| `/<Entity>` | the calendar, or the slot picker |
| `/<Entity>/list` | the entity's own browse page (list / master / document list) |
| `/<Entity>/create`, `/<Entity>/<id>/edit` | the entity's own editor |

Both browse pages offer a switch to the other, and choosing a day, an event or a free slot opens the entity's own editor. So a document master may be browsed on a calendar — or booked from a slot picker — and still be edited as a document, with its line items, printing and workflow tasks intact: declaring a view never costs an entity its editing surface. A picker is how a record is *created*; the list or document page is how it is worked with afterwards, and an author needs both.

### A document's line items on a calendar

When the entity declaring `view: calendar` is a document's **line-items** child, the document's items pane *is* the calendar instead of the row grid — the shape for a day-grained line, such as a booked day or an allocated hour:

```yaml
- name: Roster
  function: Document
- name: RosterItem
  function: DocumentItem
  view: calendar
  calendar: { start: day, title: Person }
  fields:
    - { name: day,   type: date, required: true }
    - { name: hours, type: decimal, precision: 18, scale: 2 }
```

The document keeps its header, totals and printing; only the items pane changes. Clicking an event edits that line, clicking an empty day adds one with that date filled in. It cannot be combined with `documentItemsLayout: chat`, which claims the same pane.

## documentItemsLayout: chat — conversation threads

A document master can render its line-items child as a chat thread (message bubbles + a composer) instead of an editable items table — support cases, tickets, comment threads. The header, status pill, workflow tasks and print stay as in a normal document:

```yaml
- name: Case
  function: Document
  documentItemsLayout: chat
- name: CaseMessage
  function: DocumentItem
  audit: true                                    # the bubble author + timestamp come from audit
  fields:
    - { name: body,     type: text,    messageBody: true }      # the bubble text (exactly one)
    - { name: internal, type: boolean, messageInternal: true }  # an internal memo (hidden from partners)
```

## Printable documents

Every document (header-items) master — one with an `*Item` composition child — gets a **printable document template** on *Generate*, written in a small layout language and rendered to a document on demand from the entity's own data.

```
doc/Templates/<Entity>/Print/en/standard.print
```

The template is a tree of layout tags (`page`, `header` / `footer`, `section` / `stack`, `row`, `field`, `text`, a `table` bound to the items, `total`, `line`, and `if`), with values as placeholders:

```text
{{document.<Property>}}            the document's own field
{{document.<Relation>}}            a to-one relation's display label
{{document.<Relation>.<Field>}}    a field of a related record
{{<Property>}}                     a line-item field (inside a table bound to the items)
```

A `table` (or a row-expanding `for`) can **filter** the collection it renders — a declarative value match, never an expression: `filter="<path>"` keeps the rows whose path (resolved per row) is truthy, and adding `match="A | B"` keeps only the rows whose value equals one of the `|`-separated literals. The same `match` on an `if` compares its resolved `source` against the listed values instead of testing truthiness. One bound collection can this way render into several purpose-grouped tables — the two-column payslip (earnings left, deductions right), a journal entry's debit and credit sides, a VAT summary per rate:

```text
<row gap="16">
    <stack>
        <text style="subtitle">Earnings</text>
        <table source="items" filter="Kind" match="BASE | ENTRY">
            <column width="3*" label="Earning">{{Name}}</column>
            <column width="*" align="right" label="Amount">{{Amount}}</column>
        </table>
    </stack>
    <stack>
        <text style="subtitle">Deductions</text>
        <table source="items" filter="Kind" match="CONTRIBUTION | TAX">
            <column width="3*" label="Deduction">{{Name}}</column>
            <column width="*" align="right" label="Amount">{{Amount}}</column>
        </table>
    </stack>
</row>
```

A generator that predates the attributes ignores them and renders all rows — a filtered template never fails on an older platform.

::: info Normative
The print template is written **create-if-absent** and never regenerated over. A printed document is a formatted, audited artefact you adapt by hand, and a newly added model field must not silently appear on an already-designed document.
:::

To add a language, add a file under a sibling language folder (`.../Print/bg/standard.print`); the print action asks which to use when several exist.

### Naming the rendered file - `fileName`

A document is rendered to a file in two places - the versioned copy a [`function: Snapshot`](/spec/entities#attachments-and-snapshots) child mints, and the copy a [notify block](/spec/glue#the-notify-block-and-attach-print) attaches. Both accept a `fileName` pattern: literal text and `{token}` interpolations over the record being rendered.

```yaml
entities:
  - name: SalesInvoiceCopy
    function: Snapshot
    fileName: "{number}_{date:yyyyMMdd}_{company.shortName|company.name}"
    relations:
      - { name: salesInvoice, kind: manyToOne, to: SalesInvoice, composition: true, required: true }
```

| Token | Renders |
| --- | --- |
| `{field}` | a field of the rendered record |
| `{relation.field}` | a field of a one-hop to-one relation of it |
| `{field:pattern}` | a date or timestamp field in the given date-format pattern |
| `{A\|B}` | the first non-blank of the listed operands, left to right |
| `{Version}` | the copy's version (a snapshot only) |

Paths use the authored field and relation names - the same vocabulary a notify `subject` interpolates. A snapshot's pattern resolves against its **document master** (the copy row itself holds only the stored file's coordinates); a notify block's against the record that block renders.

The name is the only thing a file carries once it leaves the application: an archive is browsed and searched by it, an attachment arrives in a mailbox with no application around it, and a hand-off to an accountant or an auditor is a folder plus a naming convention agreed in advance. A folder of `Order 42 v1.pdf`, `Order 43 v1.pdf` is unusable at the exact moment it matters.

::: info Normative
An interpolated value is sanitized before it enters the name: trimmed, internal whitespace collapsed to a single separator, and characters the storage or transport cannot carry removed. Non-ASCII characters are preserved - whether a name is transliterated is an application's data convention, not the format's. Literal text between tokens is emitted verbatim: the author owns the separators.

A token whose value is blank renders empty. A token naming a field or relation the entity does not have is rejected at authoring time, not rendered empty - a silently dropped token produces exactly the indistinguishable names this construct removes. Also rejected: a pattern that interpolates nothing, unbalanced or nested braces, a date format on a field that is not a date or timestamp, a format the formatter does not accept, and a multi-hop path.

`{Version}` is rejected where no version exists; a snapshot pattern that does not place it has the version appended, because two versions of one copy must never share a name. On a notify block `fileName` requires an `attach`, and where the attached document is rendered once for a whole fan-out only fields of that record are readable.

Absent a pattern, an implementation supplies a default - and the same default for both renders; a document's own number is used where it declares one.
:::

## See also

- [Entities & fields](/spec/entities) — `function`, `label` and the status relation these surfaces read.
- [Declarative glue](/spec/glue) — `transitions` add the on-demand status buttons a document view shows.
- [Data, seeds & naming](/spec/data) — how report queries qualify physical column names.
