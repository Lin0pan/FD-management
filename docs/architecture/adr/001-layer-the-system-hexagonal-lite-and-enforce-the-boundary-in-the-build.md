# ADR-001 — Layer the system hexagonal-lite and enforce the boundary in the build

- **Status:** Accepted
- **Date:** 2026-07-21
- **Deciders:** the maintainer, with FD on the domain questions

## Context

FD's rules are the valuable part of this software and the part most likely to outlive its
frameworks: what a household is owed, when a card goes stale, which group collects this week. The
system's top quality goal is [legibility over five-plus years](../01-introduction-and-goals.md#quality-goals),
possibly for a different developer, and its second is that a small set of hard invariants never
break. Both are damaged by the same thing — business rules smeared into React components, server
actions and Prisma queries, where they cannot be tested without a browser or a database and cannot
be found without reading every screen.

The rule "the domain imports nothing from Next.js, React or Prisma" was written down as a convention
on 2026-07-21. On 2026-07-22 it stopped being one. This project is built in part by unattended
autonomous agent runs (see [chapter 1](../01-introduction-and-goals.md#stakeholders)), and review is
exactly what is absent from those. A convention nobody is present to enforce is not a boundary.

## Considered options

- **Hexagonal-lite layering, enforced by ESLint** — chosen. Four directories, dependencies pointing
  inwards only, with `no-restricted-imports` and `no-restricted-syntax` rules making a violation a
  failed `npm run lint` and therefore a failed CI run.
- **The same layering as a documented convention** — rejected. It was tried for one day. It holds
  only while a reviewer reads every diff, which is not the case here.
- **Full DDD with aggregates, domain events and CQRS** — rejected as more machinery than the problem
  has. ~240 customers, one distribution a week, one writer at a time. This is layering, not ceremony;
  the pattern is deliberately called _hexagonal-lite_ to say so.
- **No layering — a conventional Next.js application with logic in server actions** — rejected. It
  makes the rules untestable without a running framework and ties FD's domain to the release cadence
  of the fastest-moving dependency in the stack (see [ADR-004](004-pin-the-next-js-major-and-keep-the-core-outside-the-framework.md)).
- **Enforce the boundary with a dependency-graph tool (dependency-cruiser, madge)** — rejected as a
  dependency added to avoid configuration the linter already in the pipeline can express.

## Decision

The code is split into four layers — `src/domain/`, `src/application/`, `src/infrastructure/`,
`src/app/` — with dependencies pointing inwards only. `domain/` is pure: no framework, no I/O, no
wall clock. `application/` orchestrates and reaches the outside only through the interfaces in
`src/application/ports.ts`. `infrastructure/` is the only layer that touches Prisma, the filesystem
or the clock. `app/` validates with Zod, calls one use case and renders. The `fd/domain-boundary` and
`fd/application-boundary` rule blocks in `eslint.config.mjs` make each of those a build failure, and
`src/architecture.test.ts` lints code samples through the real config so the rules themselves are
tested.

## Consequences

- A rule can be tested by calling a function, which is why strict TDD and a 100 % coverage gate on
  the two pure layers are affordable at all — see [chapter 8](../08-crosscutting-concepts.md#testing-strategy).
- A zero-argument `new Date()` is a lint error outside `infrastructure/`, which is how the injected
  clock stays real rather than aspirational. `new Date(someValue)` stays legal: it transforms a value
  that was passed in.
- Replacing Next.js would throw away `src/app/` and nothing else.
- The cost is indirection: a new field is touched in four places — domain type, port, adapter,
  screen — even when it is a plain string. That is the recurring price, and it is paid on purpose.
- A second cost is that legitimate work occasionally hits a rule. The standing instruction is to
  change the config deliberately and say why in the commit, never to add an inline disable.
- Revisit if the boundary starts costing more than it protects — for example if the ports layer grows
  so wide that every use case is a pass-through.

## More information

- [Chapter 5 — building block view](../05-building-block-view.md)
- [Chapter 8 — cross-cutting concepts](../08-crosscutting-concepts.md)
- `eslint.config.mjs`, `src/architecture.test.ts`, `src/application/ports.ts`
- Commits `1f9fc09` (the layering), `6ddf551` (the enforcement)
