# Architecture documentation

This is the architecture documentation for **FD-Management**, the operations software of the
_Delbrücker Füllhorn_ food bank. It follows the [arc42](https://arc42.org) template: one markdown
file per chapter, kept in the repository so it is reviewed alongside the code it describes.

_Last reviewed: 2026-08-07_

## Chapters

| #   | Chapter                                                    | Answers                                               |
| --- | ---------------------------------------------------------- | ----------------------------------------------------- |
| 1   | [Introduction and goals](01-introduction-and-goals.md)     | Why does this system exist, and for whom?             |
| 2   | [Architecture constraints](02-architecture-constraints.md) | What is not up to us?                                 |
| 3   | [Context and scope](03-context-and-scope.md)               | Where are the system's edges?                         |
| 4   | [Solution strategy](04-solution-strategy.md)               | What is our approach?                                 |
| 5   | [Building block view](05-building-block-view.md)           | What are the parts, and what is each responsible for? |
| 6   | [Runtime view](06-runtime-view.md)                         | What happens when…?                                   |
| 7   | [Deployment view](07-deployment-view.md)                   | Where does it run, and what must be configured?       |
| 8   | [Cross-cutting concepts](08-crosscutting-concepts.md)      | How do we do things consistently?                     |
| 9   | [Architectural decisions](09-architectural-decisions.md)   | Why is it like this?                                  |
| 10  | [Quality requirements](10-quality-requirements.md)         | What does "good enough" mean, measurably?             |
| 11  | [Risks and technical debt](11-risks-and-technical-debt.md) | What could hurt us, and what already does?            |
| 12  | [Glossary](12-glossary.md)                                 | What do these words mean here?                        |

Decision records live in [`adr/`](adr/) and are indexed in
[chapter 9](09-architectural-decisions.md).

## Reading order

**New to the system:** chapters 1, 3 and 5 answer most first-day questions — what it is for, where
its edges are, and what lives where. Chapter 5 is deliberately short.

**Wondering why something is the way it is:** chapter 9's timeline, then the ADR it points at. The
four that explain the most about this codebase are
[ADR-001](adr/001-layer-the-system-hexagonal-lite-and-enforce-the-boundary-in-the-build.md) (the
layering and why it is a build failure),
[ADR-007](adr/007-derive-anything-computable-rather-than-storing-it.md) (derive, don't store —
the reason this software exists),
[ADR-008](adr/008-treat-a-customer-number-as-a-reusable-slot-not-an-identity.md) (a customer number
is a slot, not an identity) and
[ADR-003](adr/003-ship-without-login-and-bind-the-application-to-localhost.md) (no login, and what
follows from it).

**Changing something:** read the chapter your change touches, then update it in the same pull
request.

## Relationship to the rest of `docs/`

This tree is the **architecture record**. The other documents each keep a distinct job:

| Document                                                                         | Job                                                                                                |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [`docs/domain_analysis.md`](../domain_analysis.md)                               | FD's process as it is run today — the source material                                              |
| [`tasks/`](../../tasks/)                                                         | What the software must do, story by story — one PRD each, US-01 to US-26. The current record       |
| [`docs/ui_styling_guide.md`](../ui_styling_guide.md)                             | How to build a screen. Still the whole UI standard                                                 |
| [`CLAUDE.md`](../../CLAUDE.md)                                                   | The binding engineering standard for anyone, human or agent, writing code here                     |
| [`docs/user_stories_mvp.md`](../user_stories_mvp.md)                             | **Not current.** An early MVP scope the system has moved past; `tasks/` is the record              |
| [`docs/technical_documentation.md`](../technical_documentation.md)               | **Legacy.** An as-built reference kept temporarily; superseded by this tree and due for retirement |
| [`docs/tech_stack_architecture_sketch.md`](../tech_stack_architecture_sketch.md) | **Legacy.** The original proposal; its reasoning now lives in chapters 4 and 9                     |

## Keeping it current

Any change that alters the architecture updates the affected chapter in the same pull request, and a
hard-to-reverse choice gets an ADR. An accepted ADR is never rewritten — a reversed decision becomes
a new ADR that supersedes it.

```bash
python3 .claude/skills/arc42/scripts/arc42.py check     # structure, ADR index, dead links, TODOs
```

A TODO marker is an honest gap, not a defect — better than a confident guess. There are currently
two, both in [chapter 7](07-deployment-view.md): the backup schedule, and FD's real customer quota.
