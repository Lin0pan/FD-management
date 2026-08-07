# Chapter guides

One entry per arc42 chapter: the question it answers, what belongs in it, what does not, the
smallest useful version, the pitfalls that show up in practice, and a done-when checklist.

Read only the entries you are working on.

| #                                  | Chapter                  | Answers                                               |
| ---------------------------------- | ------------------------ | ----------------------------------------------------- |
| [1](#1-introduction-and-goals)     | Introduction and goals   | Why does this system exist, and for whom?             |
| [2](#2-architecture-constraints)   | Architecture constraints | What is not up to us?                                 |
| [3](#3-context-and-scope)          | Context and scope        | Where are the system's edges?                         |
| [4](#4-solution-strategy)          | Solution strategy        | What is our approach, in a few sentences?             |
| [5](#5-building-block-view)        | Building block view      | What are the parts, and what is each responsible for? |
| [6](#6-runtime-view)               | Runtime view             | What happens when…?                                   |
| [7](#7-deployment-view)            | Deployment view          | Where does it run, and what must be configured?       |
| [8](#8-crosscutting-concepts)      | Cross-cutting concepts   | How do we do X consistently everywhere?               |
| [9](#9-architectural-decisions)    | Architectural decisions  | Why is it like this?                                  |
| [10](#10-quality-requirements)     | Quality requirements     | How do we know "good enough" when we measure it?      |
| [11](#11-risks-and-technical-debt) | Risks and technical debt | What could hurt us, and what already does?            |
| [12](#12-glossary)                 | Glossary                 | What do these words mean here?                        |

A recurring theme: chapters overlap, and every fact should live in exactly one of them and be linked
from the others. When you are unsure which chapter something belongs to, the "does not belong" lists
below usually name it explicitly.

---

## 1. Introduction and goals

**Answers:** what are we building, for whom, and what does "good" mean? If only one chapter is ever
right, make it this one — everything downstream is judged against it.

**Belongs:** a short problem statement; the 5–10 functional requirements that matter most; explicit
**non-goals**; 3–5 quality goals stated as outcomes with acceptance criteria; a stakeholder table of
who touches the system and what each expects from it.

**Does not belong:** component diagrams, a complete requirements catalogue, project history,
technology or deployment choices.

**Minimum viable:** one paragraph on the system, 5–10 requirement bullets, 3–5 quality goals, a
stakeholder table. A few screens, no more. A newcomer should understand the system after reading it,
and a non-technical stakeholder should recognise their own intent in it.

**Structure:** Introduction → Requirements overview (bullets, then non-goals) → Quality goals
(priority, goal, scenario / acceptance criterion) → Stakeholders (role, contact/group, expectation).

**Pitfalls:** naming the application without saying what problem it solves; listing features instead
of outcomes; omitting non-goals, which is an open invitation to scope creep; quality goals as
adjectives ("fast", "secure") with nothing measurable behind them; treating "stakeholders" as
developers only — operations, security, end users and the business belong there too.

**Done when:** someone new reads it and can say what the system is for, what it deliberately does
not do, which three qualities win an argument, and who cares about the answer.

---

## 2. Architecture constraints

**Answers:** what is fixed regardless of what we would prefer? A constraint is a rule you must
follow; a decision is a choice you make. Choices go in chapter 4 and chapter 9.

**Belongs:** organisational constraints (budget, team size and skills, governance, deadlines);
technical constraints (mandated platform, runtime, hosting, browser support); security and
compliance obligations; integration constraints (systems you must talk to, formats you must accept);
conventions (coding standards, CI rules, naming, branching); referenced standards.

**Does not belong:** architecture choices still under your control, personal preference, detailed
design.

**Minimum viable:** 8–15 genuine constraints in one table:

| Constraint | Type | Rationale | Impact on design | Source / owner |
| ---------- | ---- | --------- | ---------------- | -------------- |

The **impact** column is the one people skip and the one that earns the chapter its keep — a
constraint nobody traced to a consequence is trivia.

**Pitfalls:** writing the chapter late, so constraints surface as implementation surprises; vague
wording ("must be secure") instead of a testable rule; mixing in decisions; dropping the impact
column; forgetting governance and convention rules because they feel too mundane to write down.

**Done when:** every entry is genuinely non-negotiable, has a source you can point at, and names
what it forces or forbids in the design.

---

## 3. Context and scope

**Answers:** what is inside the system, what is outside, and how do they interact? This is the
black-box view — the lid stays on until chapter 5.

**Belongs:** a clear inside/outside boundary; external actors and neighbouring systems, each with a
responsibility; the direction of every exchange and who initiates it; what is exchanged, in business
terms and technical terms; the key interfaces with links to their specifications; a small payload
example for the one to three most important ones.

**Does not belong:** internal building blocks, runtime scenarios, deployment layout, internal
technical detail.

**Two views, kept apart:**

- **Business context** — actors, neighbour systems, and the value or information exchanged, with no
  protocols in sight. A domain expert should be able to read it.
- **Technical context** — the same edges expressed as integrations: protocol, format, direction,
  ownership, authentication.

**Minimum viable:** one business context diagram, one technical context diagram, and a table:

| Neighbour | Responsibility | Direction | Exchanged | Protocol / format | Owner |
| --------- | -------------- | --------- | --------- | ----------------- | ----- |

For critical interfaces, add SLAs, failure behaviour, retry rules and rate limits.

**Pitfalls:** naming a neighbour without saying what is exchanged with it; merging business and
technical context into one diagram that serves neither audience; assuming everything is REST —
files, SFTP drops, e-mails, scheduled exports and manual uploads are integrations too; leaving out
who owns the interface and who calls whom; skipping examples in favour of abstraction.

**Done when:** the boundary is unambiguous, every neighbour has a responsibility, every interface has
a direction, a protocol and an owner, and the important ones have a concrete example.

---

## 4. Solution strategy

**Answers:** what is our approach, and which few decisions shape everything else? This is the bridge
from chapters 1–3 into the design, and it should be readable in a couple of minutes.

**Belongs:** a short list of guiding choices — technology and platform, decomposition approach,
integration style, deployment style, how the top quality goals are achieved, how the organisation
maps onto the architecture. Each with its rationale, its consequence, and a link back to the goal or
constraint that drove it. Links to the relevant ADRs. Open questions, stated out loud.

**Does not belong:** internal component breakdowns (chapter 5), interaction flows (chapter 6),
environment detail (chapter 7), sprint-level technical choices, or restatements of chapters 1–3 —
link to those instead.

**Minimum viable:** three to seven statements, each in four parts:

1. **Approach** — one line.
2. **Rationale** — one or two lines: why this, given which goal or constraint.
3. **Consequence** — what it enables, and what it now makes harder.
4. **Traceability** — a link to the goal, constraint or ADR behind it.

Accumulated ADRs are the raw material here: when several decisions point the same way, summarise
that direction as a strategy statement and link the ADRs beneath it.

**Pitfalls:** leaving the chapter as a placeholder; copying chapters 1–3 instead of linking; a bare
technology list with no rationale — strategy is not a stack list; consequences omitted, so the
trade-off is invisible; so much detail that it competes with chapter 5; uncertainties hidden to make
the document look decisive.

**Done when:** a small set of stable statements, each with rationale and impact, each traceable back
to chapters 1–3, none of them likely to change inside a sprint, and the open questions visible.

---

## 5. Building block view

**Answers:** what are the main parts and what is each responsible for? Chapter 3 showed the system as
a black box; here you open it, and open its parts again where it pays.

**Belongs:** the decomposition hierarchy, coarse first; per block a **one-sentence responsibility**,
its key dependencies and its main interfaces; ownership boundaries where teams matter; the structural
consequences of chapter 4; links into the source tree or generated API docs.

**Does not belong:** copies of earlier chapters; step-by-step flows (chapter 6); environment detail
(chapter 7); full interface specifications — link them; implementation detail that changes weekly.

**Levels:** there is no fixed taxonomy. A large system might go products → domains → services; a
single service might go service → modules → namespaces; a library might go public API →
implementation. **Level 1 must contain the system boundary and the neighbours from chapter 3**, or
the two chapters describe different systems. Go deeper only where a part is complex or risky, and
stop as soon as more detail stops answering a real question.

**Minimum viable:** one level-1 diagram including the boundary and external neighbours, plus:

| Block | Responsibility | Depends on | Interfaces |
| ----- | -------------- | ---------- | ---------- |

and one level-2 zoom on the most complex or riskiest area, if there is one.

**Pitfalls:** decomposing too far too early; block names with no stated responsibility; a level 1
that contradicts chapter 3; duplicating interface specs across levels; naming technologies where a
responsibility belongs ("Redis" is not a responsibility); leaving data ownership unsaid — who may
write this, and who may only read it.

**Done when:** a newcomer can say what lives where, every block has one sentence of responsibility,
external interfaces are referenced rather than copied, and deeper levels exist only where justified.

---

## 6. Runtime view

**Answers:** who talks to whom, in what order, and why does it matter? Pick scenarios by what they
reveal about the architecture, not by what is easy to draw.

**Belongs:** interactions that change state or start a workflow; inbound and outbound integrations;
operationally important processes such as batch jobs and scheduled tasks; the flows that embody a
quality goal (latency, availability, resilience); and — the part that carries the architecture —
**alternatives and exceptions**: timeouts, retries, idempotency, degraded behaviour, compensation.
Note observability where it matters: correlation IDs, consistency expectations.

**Does not belong:** static responsibilities (chapter 5); full protocol or contract specifications;
environment detail (chapter 7); the same cross-cutting flow retold in every scenario — OAuth,
logging and error handling belong in chapter 8 and get linked.

**Minimum viable:** one to three scenarios that cross the system boundary. Per scenario: its
intention, its participants, the happy path, and **one key exception**. Keep the prose short; the
diagram carries the sequence.

**Diagrams:** sequence diagrams suit linear flows — show transformations and decisions, skip routine
return arrows and unchanged payloads, and compress internal hops unless a hop is the point. When
branching, looping and decision points dominate, a flowchart (or BPMN, if the organisation reads it)
stays legible where a sequence diagram stops being readable.

**Pitfalls:** documenting only the success path, when the failure path is where the architecture
actually lives; naming participants differently from chapter 5; diagram detail with no architectural
payoff; and putting the chapter off because there are now too many flows — group them by kind and
document one representative of each.

**Done when:** the interactions that matter are covered, participant names match chapter 5, key
exceptions are described, and a reader can answer "what happens when…" without guessing.

---

## 7. Deployment view

**Answers:** where does each part run, which environments exist, and what has to be configured for
this thing to work? Much of this normally lives in one person's head.

**Belongs:** nodes, environments and the connections between them; the mapping from building blocks
to where they run; runtime configuration — environment variables, config files, feature flags,
references to secrets; operational concerns such as scaling, isolation and failure behaviour; trust
boundaries and data classification; persistence, volumes, backups; the throughput, latency and
availability targets the topology is meant to meet; links to the IaC that actually creates it
(Dockerfile, compose file, Terraform, Helm chart, CI workflow).

**Does not belong:** restated block responsibilities; runtime scenarios that are not about
deployment; interface catalogues; an unexplained dump of every setting.

**Minimum viable:** one production-like deployment diagram, a mapping table, and 5–15 key settings.

| Building block | Node / environment | Notes |
| -------------- | ------------------ | ----- |

| Setting | Where set | Default | Required | Effect |
| ------- | --------- | ------- | -------- | ------ |

**Never document a secret's value** — document that it exists, where it comes from, and what breaks
without it.

**Pitfalls:** documenting production only, when most confusion is about getting a local or test
environment running; mixing behaviour into placement; configuration as an unstructured list with no
grouping and no defaults; unclear operational ownership; a diagram whose boxes do not match chapter
5's blocks.

**Done when:** the main environments are described, every building block is mapped to a node, the key
settings have defaults and effects, and a newcomer can answer "where does this run?" and "what do I
need to configure?"

---

## 8. Cross-cutting concepts

**Answers:** which patterns and rules apply across the whole system, and how do we apply them? This
is what stops five modules from solving the same problem five different ways.

**Belongs:** patterns that touch multiple building blocks; conventions you want applied consistently
over time; infrastructure behaviour that supports the domain logic; shared domain concepts — the
model, aggregates, state machines, the vocabulary; the _meaning_ of a configuration model, as
opposed to its settings.

**Does not belong:** rules specific to one feature; runtime scenarios retold (link to chapter 6);
the raw settings list (chapter 7); local implementation detail; hard constraints and enterprise
policy (chapter 2).

**Usual categories to start from:** security and authorisation, resilience and error handling,
observability (logging, metrics, tracing), data consistency and transactions, integration
conventions, configuration model, domain model, testing strategy, UI and UX patterns,
internationalisation.

**Per concept:** a short description, why it exists, the rules that follow from it, implementation
notes, and where it shows up — with links to the blocks, scenarios and code that apply it.

**Chapter 8 versus chapter 9:** chapter 8 answers "how do we do X consistently?", chapter 9 answers
"why did we choose X over Y?" They should link to each other, and neither should contain the other.

**Pitfalls:** waiting for a pattern to appear everywhere before writing it down, by which point three
variants exist; a junk drawer of unrelated notes; explaining the same concept again in every scenario
that uses it; documenting a concept that nothing in the code actually follows.

**Done when:** each concept has rules someone can apply, the code visibly follows them, and the
concept is linked from the chapters where it appears.

---

## 9. Architectural decisions

**Answers:** why is the system like this? This chapter is an index and timeline; the substance lives
in the ADR files under `adr/`. See `references/adr.md` for the full workflow, the template and the
statuses.

**Belongs:** a scannable timeline table of decisions; for each one the decision itself, a short
motivation, and a link to its ADR where there is one; links from decisions to the chapters and code
they affect.

**Does not belong:** easily reversible choices, meeting notes, or how-to guides for a concept — the
concept goes in chapter 8 and links back here for the "why".

**Index table:**

| ADR                                           | Decision                    | Status   | Date       |
| --------------------------------------------- | --------------------------- | -------- | ---------- |
| [001](adr/001-use-sqlite-as-the-datastore.md) | Use SQLite as the datastore | Accepted | 2026-02-10 |

Decisions too small for an ADR can still earn a row, with no link. `scripts/arc42.py check` verifies
that every file in `adr/` appears here.

**Pitfalls:** the significant decision disguised as a small sprint choice and never recorded;
options considered but not written down, so "why didn't we just use X?" returns every six months;
decisions with no consequences noted; deleting or rewriting a superseded ADR, which destroys the
reasoning that was true at the time; logging trivia until nobody reads the log.

**Done when:** the timeline is scannable, each entry has a decision and a motivation, important ones
document their alternatives, decisions link to the chapters they shaped, and quality trade-offs link
to the scenarios in chapter 10.

---

## 10. Quality requirements

**Answers:** what does "good enough" mean, measurably? This is where quality stops being a wish and
becomes a check. Chapter 1 named 3–5 quality goals; this chapter turns them into scenarios you can
test.

**Belongs:** an overview of the relevant quality characteristics, grouped along a standard structure
(ISO/IEC 25010:2023 is a reasonable default); quality scenarios with a stimulus, a response and a
number; links back to the chapter 1 goals; cross-references to the concepts, decisions and
deployment choices that deliver them.

**Does not belong:** technology choices, functional requirements, or adjectives without metrics.

**Scenario shape:**

| Quality | Stimulus (situation) | Response (expected behaviour) | Metric / target | How verified |
| ------- | -------------------- | ----------------------------- | --------------- | ------------ |

For example: _Performance_ / "500 concurrent users submit a search" / "results are returned" /
"p95 ≤ 2 s" / "load test in CI". "Testable" means something different per quality — a latency
scenario is checked by a load test or an SLO alert, a maintainability scenario by a change effort
estimate, a security scenario by a pen test or an automated policy check.

**Minimum viable:** a small overview grouped by quality characteristic, 3–6 top scenarios with real
numbers, and a visible link from each to the chapter 1 goal it serves.

**Pitfalls:** adjectives with no metric; describing a solution ("we use a CDN") where a requirement
belongs; scenarios that trace back to no stated goal; writing the chapter once and never revisiting
it — early numbers are guesses and should be corrected once production data exists; a list so long
nobody maintains it.

**Done when:** the top quality goals each have at least one scenario with a number and a way to check
it, and each scenario names how it is verified.

---

## 11. Risks and technical debt

**Answers:** what might go wrong, and what shortcut are we already paying for? The value is keeping
uncomfortable truths visible instead of leaving them in chat history.

**Risk versus debt:** a **risk** is something that might happen — you manage it with mitigation and
monitoring. **Technical debt** is a shortcut already taken — it has an interest rate, paid in every
future change.

**Belongs:** architecturally relevant risks (adoption, integration, operational, security,
performance, vendor, key-person); technical debt that slows delivery or threatens maintainability;
per item a clear statement, impact, likelihood, mitigation or repayment plan, an owner, and — where
it helps — an early warning signal; links to the drivers and decisions involved.

**Does not belong:** the project backlog; exploitable vulnerability detail in a document that is
published; decisions, which belong in chapter 9 even when they were uncomfortable.

**Minimum viable:** 3–5 realistic risks and 3–5 debt items.

| Risk | Impact | Likelihood | Mitigation / early warning | Owner |
| ---- | ------ | ---------- | -------------------------- | ----- |

| Debt | Where | Consequence (interest) | Repayment plan | Owner |
| ---- | ----- | ---------------------- | -------------- | ----- |

**Pitfalls:** treating the chapter as a shame list, which guarantees it stays empty; items with no
owner and no next step; only technical risks, when adoption, process and vendor risks are just as
architectural; items with no link back to the driver or decision that created them.

**Done when:** the things that could realistically hurt delivery or operations are named, the debt is
visible in one place rather than scattered through the backlog, each item has an owner and a next
step, and the list is reviewed on a cadence.

---

## 12. Glossary

**Answers:** what do these words mean _here_? Its job is shared meaning, not vocabulary size.

**Belongs:** domain terms used repeatedly — the core nouns and verbs of the system; abbreviations and
acronyms; architecture-specific terms with local meaning ("source of truth", "degraded mode");
homonyms, where the same word means different things to different neighbours; synonyms, with one
canonical term and its aliases recorded; the mapping between languages when the domain is not in the
same language as the code.

**Does not belong:** tutorials; a duplicate of the domain model; terms used once; terms obvious to
the audience; API field documentation, which belongs in the API reference.

**Include a term if:** it appears in several chapters, or two stakeholders could read it differently,
or it is part of a contract with a neighbour system, or a newcomer would stumble on it.

**Minimum viable:** 5–10 terms, one or two lines each, alphabetical.

| Term | Definition | Aliases / notes |
| ---- | ---------- | --------------- |

**Pitfalls:** listing only acronyms while the genuinely ambiguous domain words go undefined; defining
terms nobody uses; definitions that grow into essays; ignoring aliases, so two teams keep using two
words for one thing; never adding a term after the first draft.

**Done when:** the words that caused a misunderstanding are in it, each definition fits in a line or
two, and a canonical term is chosen wherever synonyms are in circulation.
