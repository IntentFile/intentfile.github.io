---
title: The Scope Boundary
description: What the Intent File deliberately does not model - protocol, algorithm and statutory form - why that is a feature, and where each of them goes instead.
---

# The Scope Boundary

*Can it do everything? No. Here is exactly where the line is — and what carries the rest.*

> This page is the honest half of the pitch. The case **for** intent-driven development is the
> [manifesto](/manifesto); the format itself is the [specification](/spec/). What follows is what
> neither a `.intent` file nor a conforming generator will ever do for you, and why that is by
> design.

---

## The line

The Intent File models **what** an application means: its entities, relations, processes, forms,
reports, permissions, glue and seed data. Three kinds of requirement recur in every real
application and are **how**, not *what*. They live below the model layer on purpose, and each one
has a designated hand-off point that the intent wires in rather than describes:

| Beyond the boundary | Why it is not intent | Where it goes |
| --- | --- | --- |
| **Protocol adaptation** — talking to an external system with a conversation shape: certificates, acknowledgments, retries and their backoff, batch and file transports | [`integrations`](/spec/glue#integrations-outbound-http) and [`inbound`](/spec/glue#inbound-webhooks) are one-line call-outs by design; a protocol has state and failure semantics no declaration should pretend to carry | an integration route in the platform's integration technology, feeding the entity's ordinary write path |
| **Algorithms** — checksums, fuzzy matching, scoring, policy-driven tie-breaking | the format draws this line for [`pattern`](/spec/entities#fields) already: a format check, not a semantic one | a [calculated-field call-out](/spec/entities#calculated-fields) or a [service-task `delegate`](/spec/processes#service-tasks), hand-written in the project's custom folder |
| **Statutory and designed form** — the exact mandated layout of a printed document | the [print template](/spec/presentation#printable-documents) is written create-if-absent *by design*: a formatted, audited artefact you adapt by hand and generation never overwrites | the authored template itself |

The pattern behind all three: the intent captures the **decision** (notify this party, derive this
value, print this document), and hands off the **mechanics** (which wire format, which formula,
which typography) at a first-class, documented extension point.

## Why the boundary is a feature

A car that cannot reach 300 km/h is not a broken car. At 150 it still gets you everywhere the road
network goes — what would actually make it dangerous is a speedometer that *claims* 300.

The same holds here. The value of the Intent File is not total coverage; it is that **everything
inside the line is deterministic, regenerable and reviewable**, and everything outside it enters
through an explicit hand-off instead of a workaround. The moment a format pretends to model
protocol conversations, algorithms and statutory typography, its "generation" stops being a pure
function — and determinism was the entire point.

So the boundary is stated, not discovered:

- **Inside**: the whole model layer, end to end — one YAML file to a running application, byte-for-byte repeatable.
- **At the line**: extension points, hooks and call-outs — [`delegate`](/spec/processes#service-tasks) service tasks, [calculated-field call-outs](/spec/entities#calculated-fields), custom [action pages](/spec/processes#actions-custom-buttons) and [dashboard widgets](/spec/presentation#widgets-custom-dashboard-tiles), the authored [print template](/spec/presentation#printable-documents), an integration route. All of them are wired *by* the intent and survive regeneration; none of them are *described* by it.
- **Outside**: the hand-written content of those hand-offs — the developer's code, on the developer's side of the contract.

Not fully intent-driven, in other words — intent-wired. That distinction is the [Guardrails](/spec/glue#guardrails)
in one sentence: curated vocabulary, non-negotiable escape hatch.

## Honest today, more tomorrow

AI assistants author the **intent**: they propose reviewable patches to the one file at the top of
the altitude stack. They do not write the custom delegates, the calculated-field components or the
integration routes. One day the same assistance may well extend across the line — generating the
hand-off code too, under the same review discipline. That is a plausible trajectory, not a shipped
capability, and this site describes what ships.

Until then, honesty at the boundary is part of the format's contract, not a courtesy. The
specification holds an authoring assistant to the same standard it holds generators to: a
requirement the format cannot express **must be reported, never silently reinterpreted**. A manual
step proposed where automation was requested is a changed contract, not a smaller change — and an
assistant must say which part of a proposal is the developer's to write, rather than imply it will
be generated.

## Report what falls outside

A requirement that crosses the line is not a defect in your model — it is the most valuable signal
the format can receive, because it is how the vocabulary decides which construct to grow next.
Recent constructs entered exactly this way: requirements that used to be hand-written delegates in
every project (keyed running totals, guard preconditions, event-driven row posting) became
[`aggregates`](/spec/glue#aggregates-keyed-cross-entity-totals),
[`checks: kind: guard`](/spec/entities#kind-guard-a-precondition-over-an-aggregate) and
[`posts`](/spec/glue#posts-derived-rows-on-an-event) — and the next candidates (event-driven
document generation, effective-dated register lookup) are under discussion now.

So when your requirement lands in the custom folder, tell the maintainers what it was:
[open an issue](https://github.com/IntentFile/intent-specification/issues/new/choose) on the
specification. The boundary is honest, but it is not fixed.
