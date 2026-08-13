---
title: The Intent-Driven Development Manifesto
description: Business intent, captured as a canonical model, regenerated deterministically into running software - the AI-native successor to Model-Driven Development.
---

# The Intent-Driven Development Manifesto

*Business intent, captured as a canonical model, regenerated deterministically into running software.*

> Looking for the format, not the philosophy? See the [specification](/spec/) — the `.intent` file, its blocks, and the generation contract.

---

## Preamble

Model-Driven Development was never the wrong idea. It was the right idea with the wrong front door.

For three decades the industry chased the same promise: describe a system once, at a high level of abstraction, and let a machine generate the running application from that description. The promise is sound. Where it repeatedly failed is not in the generation — generation has always worked — but in the act of **authoring the models by hand**. The modellers were too heavy, the configuration too deep, the learning curve too steep. So the abstraction that was supposed to save time became the thing developers routed around.

This manifesto keeps everything that made Model-Driven Development correct, and replaces the one part that made it fail. The result is **Intent-Driven Development** — the AI-native successor to MDD, not a revival of it. Artificial intelligence is not bolted on as a feature; it is the **authoring layer** the discipline was always missing.

---

## I. What Model-Driven Development got right

Strip away the tooling and MDD rests on three claims that are simply true:

1. **Two altitudes of model are enough to describe most business software.** An *abstract* model says *what* the system is (entities, relationships, processes, permissions, the data it shows and the actions it permits). A *specific* model says *how* a given platform realises it. The abstract model is portable intent; the specific model is a platform's deterministic interpretation of it.

2. **Generation from a model is deterministic and repeatable.** Given the same specific model, a generator produces the same application, every time, byte for byte. There is no creativity in this step and there should not be. Determinism is the entire value.

3. **The full stack, and its extensions, are derivable.** Schema, persistence, APIs, UI, dashboards, scheduled jobs, listeners, process flows, security — all of it follows from the models.

The models were not the problem. They never were.

---

## II. Why Model-Driven Development failed

The failure was always at the keyboard, not in the pipeline.

- **Too many configurations.** Every entity needs a perspective, a layout, widget types, icons, relationship cardinalities, dropdown sources. Each is a correct and necessary detail of the *specific* model. Asked of a human, for every field of every entity, they become a tax that dwarfs the problem being solved.

- **Too many clicks and tweaks.** A graphical modeller turns a five-second thought ("add a country field to Customer") into a sequence of dialogs, property panels and save steps. The cost of *expressing* an intent came to exceed the cost of the intent itself.

- **Too steep a learning curve.** Driving each modeller *correctly* is a specialist skill. The promise of MDD was *less* expertise required; the modellers demanded *more*.

- **The escape hatch always won.** Because authoring the model was so costly, developers dropped to hand-written code at the first sign of friction — and once code and model diverge, the model is dead.

The common thread: **the abstraction was sound, but the only way to reach it was through a surface humans found hostile.** MDD asked people to think like a generator. Most would not.

---

## III. The diagnosis: the models were never the problem

::: tip The pivot
The specific models and their deterministic generators are an asset, not a liability. The defect was the **authoring surface** — the human-operated modeller standing between a person's intent and the model.
:::

So the fix is not to throw away MDD, nor to replace deterministic generation with a model that writes code directly (that trades a solved problem — reliable generation — for an unsolved one — reliable code synthesis). The fix is to **remove the hostile authoring surface and put a better one in its place**: natural language in, a structured abstract model out, deterministic specific models and a full application after that. The graphical modellers remain as the precise, read-only-by-default view and the power-user's escape — but they stop being the *only* door.

---

## IV. The shift: AI as the authoring layer

AI is good at exactly the thing MDD was bad at, and bad at exactly the thing MDD was good at. They are complementary, not competing.

- AI is excellent at **turning ambiguous human language into a structured abstract model**. "I need a small lending library: members, books, loans, and a loan needs approval over thirty days" becomes a precise declaration of entities, relations, a process and its gateway.

- AI is **not** asked to generate the application. Code generation stays where it belongs: in deterministic generators. The model is the contract; the application is a pure function of the model.

| Concern | Owner | Property |
|---|---|---|
| Natural language → abstract model | **AI** | helpful, fallible, supervised |
| Abstract model → specific models | **Deterministic generator** | pure function |
| Specific models → full-stack app | **Platform templates** | pure function |

AI lives only in the first row, and even there it **proposes**; a human **accepts**. The abstract model is structured and human-authorable, so AI is an accelerator, never a single point of failure. Turn the AI off and the surface is still a structured editor a person can drive directly.

::: info The thesis
**AI helps a human define an easy, high-level abstract model that is provably compliant with the specific models and generators a platform already implements.**
:::

---

## V. Prompts are not the source of truth

The fastest way to get an application from an AI today is to prompt for code directly. It demos beautifully and fails in the organisation:

- **A prompt is not a system of record.** It is a transient instruction, phrased differently by every person, gone the moment the conversation scrolls away. You cannot version it, review it as the authoritative specification, or regenerate from it reliably.

- **Generated code is not a stable abstraction.** It is the *output*, not the *intent*. It is voluminous, it drifts the instant a human edits it, and it bakes in a thousand incidental decisions the prompt never expressed.

So "AI writes the code" leaves an organisation holding two artefacts it cannot govern — a disposable prompt and an unstable mass of code — with nothing canonical in between.

The intent model is that missing canonical thing: **a versionable, reviewable, diffable representation of what the business actually asked for** — small enough to read, structured enough to validate, stable enough to regenerate from deterministically. The prompt becomes disposable: a convenient way to *edit* the intent model, and nothing more.

::: tip
**Prompts are not the source of truth. Intent models are.**
:::

---

## VI. The three altitudes

The discipline is three layers, each strictly above the next, each the deterministic input to the one below.

| Altitude | Layer | Authored / produced by |
|---|---|---|
| **1 — Intent** | one file, human + AI authored; structured, diff-stable, portable | a person, with an optional AI assistant |
| **2 — Models** | the platform's native, openable model artefacts | deterministic generation from the intent |
| **3 — Application** | schema, persistence, APIs, UI, jobs, listeners, processes, security | the platform's template engine, brought live by the runtime |

The abstract model is **one altitude above** the models a platform already generates from. It does not replace them — it *authors* them. Critically, it emits **specific models, never code**. The platform's own template engine takes it from there, and the intent layer is deliberately ignorant of which template consumes its output, so it can never couple to one generator's choices. Wrong altitude is the cardinal sin: the moment an abstract-model generator emits application code, the layering has collapsed.

---

## VII. Principles

1. **The specific models stay canonical.** The deterministic generators are the contract. AI authors *toward* them; it does not bypass them.

2. **Generation is deterministic, top to bottom.** Identical abstract model → identical specific models → identical application.

3. **AI proposes; the human disposes.** Every AI contribution is a *patch* to the abstract model, previewed and accepted by a person. The AI is replaceable and optional.

4. **Edit the shape of intent, not the shape of files.** "Add a country field" is a one-line change, not a re-emitted, re-ordered file. The on-disk form is diff-stable.

5. **One abstract model, whole-picture.** The entire application's intent lives in one place, so the AI always diffs against full context and the human always sees the whole system at once.

6. **Structured intent, not free text.** Natural language is the *input*; the artefact is structured. The transform below it is a pure function, not a second act of interpretation.

7. **Honour the escape hatch.** Real applications always have one weird requirement no model expresses. The discipline provides a first-class place for hand-written code that survives regeneration — declared as hook points, implemented alongside the generated output, never overwritten. When something cannot be expressed, *extend the abstract model* (and teach a generator to consume it); never leak hand-edits into generated folders. What deliberately lives outside the model — and why that line is a feature — is [the scope boundary](/boundary).

8. **Visualisation is read-only.** Diagrams render the abstract model for a fast human read. Authoring is the prompt plus the structured editor; the graphical view confirms, it does not capture.

9. **Authoring artefacts get an editor and an explicit generate step; only runtime artefacts get reconciled automatically.** The abstract model is generated in the workspace, reviewed, and published as inert source alongside what it produced — never silently materialised behind the developer's back.

---

## VIII. The role of the platform

Intent-Driven Development is not possible without a platform underneath it. The AI can only propose an abstract model that is *compliant* because the platform has already defined, in code and proven by tests, exactly what a valid specific model is and exactly how it becomes an application. The generators are the grammar the AI writes against.

So the platform contributes the two things AI cannot:

- **A fixed, deterministic target.** The set of specific models and their generators is finite, versioned and tested. The AI has a closed world to be correct about, not an open-ended code-writing task to be plausibly-wrong about.

- **A complete runtime.** Once the models exist, the platform supplies the database, persistence, services, security, scheduling, messaging and UI runtime. The AI never touches any of this.

Intent-Driven Development is the *composition* of the two: a new top authoring layer over a proven generation-and-runtime factory.

---

## IX. What this is not

- **Not "AI writes the code."** Code is generated deterministically from models, as it always was. AI operates one or two altitudes above the code and never emits it.

- **Not a replacement for the platform.** The generators, runtime and models are the foundation, not legacy to be superseded.

- **Not a black box.** Every step is inspectable. The abstract model is human-readable; the specific models open in the existing editors; the generated code is ordinary code. A developer can stop at any layer and take over.

- **Not pure MDD reborn.** The escape hatch is first-class and designed in from the start, because the lesson of thirty years is that the escape hatch always wins.

- **Not non-deterministic generation.** The only fallible step is natural-language-to-abstract-model, and it is always supervised and always optional.

---

## X. The dream, stated plainly

::: info
**No code. No modelling. Just intent.**
:::

A person says what the system should do. AI shapes that into a precise, compliant abstract model. The platform deterministically turns the abstract model into specific models, and the specific models into a complete, running, extensible application. Each layer is inspectable, each transform below the top is a pure function, and a human is in the loop at the only point where judgement is required.

Model-Driven Development was right all along. It was waiting for an authoring layer worth using. That layer is here, and the discipline it unlocks is Intent-Driven Development.
