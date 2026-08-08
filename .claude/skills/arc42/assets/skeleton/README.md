# Architecture documentation

This is the architecture documentation for **{{PROJECT}}**, following the
[arc42](https://arc42.org) template: one markdown file per chapter, kept in the repository so it is
reviewed alongside the code it describes.

_Last reviewed: {{DATE}}_

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

New to the system: chapters 1, 3 and 5 answer most first-day questions. Changing something: read the
chapter your change touches, then update it in the same pull request.

## Keeping it current

Any change that alters the architecture updates the affected chapter in the same pull request, and a
hard-to-reverse choice gets an ADR. A TODO marker is an honest gap, not a defect — better than a
confident guess.
