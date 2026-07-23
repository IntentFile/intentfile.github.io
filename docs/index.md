---
layout: home
title: The Intent File
titleTemplate: Business knowledge, made executable

hero:
  name: Intent File
  text: Make Intent Your Source of Code.
  tagline: The vendor-neutral blueprint format that turns business knowledge into running software.
  image:
    src: /logo.svg
    alt: Intent File
  actions:
    - theme: brand
      text: Read the specification
      link: /spec/
    - theme: alt
      text: DSL reference
      link: /reference
    - theme: alt
      text: See an example
      link: /examples

features:
  - icon:
      src: /icons/file-text.svg
    title: One file, whole picture
    details: Entities, relations, processes, forms, reports, permissions and seed data - the entire application's intent lives in one readable YAML document at the project root.
  - icon:
      src: /icons/layers.svg
    title: One altitude above models
    details: The intent never emits code. It authors the model artefacts a platform already generates from; those, in turn, become the running application.
  - icon:
      src: /icons/repeat.svg
    title: Deterministic generation
    details: Identical intent yields identical output, byte for byte. The file is the source of truth; everything below it is a pure function of the file.
  - icon:
      src: /icons/blocks.svg
    title: Composable across models
    details: Split a domain into several intent modules that reference each other's master data across models and contribute their screens to one shared shell.
  - icon:
      src: /icons/webhook.svg
    title: Declarative glue, first-class escape hatch
    details: Notifications, schedules, integrations, webhooks, roll-ups, postings and workflow triggers are declared, not coded - and a designated escape hatch survives every regeneration.
  - icon:
      src: /icons/sparkles.svg
    title: Authorable by hand or by AI
    details: The format is structured enough to hand-author and small enough for an AI assistant to propose reviewable patches against. AI is an accelerator, never a single point of failure.
---

<div style="max-width: 960px; margin: 4rem auto 0; padding: 0 24px;">

## What is an Intent File?

An **Intent File** (`*.intent`) is a single YAML document, one per project, that is the source of truth for a whole application. It describes *what* the system is - its data, its rules, its workflows and its screens - without describing *how* any particular platform realises it.

A conforming **generator** reads the Intent File and deterministically produces the derived model artefacts (a data model, process definitions, forms, reports, roles, seed data) and, from those, a complete running application: schema, persistence, APIs, user interface, background jobs, listeners, processes and security. The Intent File stops at the model layer; it never emits application code itself.

That single boundary is what makes the format valuable: the file is small enough to read in one sitting, structured enough to validate, stable enough to diff and version, and portable enough that any conforming generator can consume it.

```yaml
name: orders
description: Order management with an approval workflow

entities:
  - name: Customer
    fields:
      - { name: id,          type: integer, primaryKey: true, generated: true }
      - { name: name,        type: string,  required: true, length: 200 }
      - { name: creditLimit, type: decimal }
    relations:
      - { name: orders, kind: oneToMany, to: Order }

  - name: Order
    fields:
      - { name: id,        type: integer, primaryKey: true, generated: true }
      - { name: orderDate, type: date,    required: true }
      - { name: total,     type: decimal }
    relations:
      - { name: customer, kind: manyToOne, to: Customer }

processes:
  - name: OrderApproval
    trigger: { onCreate: Order }
    steps:
      - { name: review, kind: userTask, args: { assignee: manager, form: ApproveOrder } }
      - { name: done,   kind: end }
```

<p style="text-align:center; margin-top: 2.5rem;">
  <a href="/spec/">Start with the specification &rarr;</a>
</p>

</div>
