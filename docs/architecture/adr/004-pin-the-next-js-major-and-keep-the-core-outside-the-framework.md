# ADR-004 — Pin the Next.js major and keep the core outside the framework

- **Status:** Accepted
- **Date:** 2026-07-21
- **Deciders:** the maintainer

## Context

The system is expected to run for five or more years with little maintenance. Next.js is the
fastest-moving dependency in the stack: it has changed its routing model, its data-fetching model and
its caching semantics inside that kind of window before. Choosing it therefore takes on a risk that
none of the other choices do — that a version the project cannot stay on arrives before anyone has
time to follow it.

It was still chosen, because the alternative stacks cost more in the near term than the risk costs
in expectation: server actions and the App Router give a form-driven internal tool its writes without
a separate API layer, and one runtime and one language across the whole project is a real
maintainability gain at this size.

## Considered options

- **Next.js App Router, major pinned exactly, business logic kept out of it** — chosen.
- **Next.js used conventionally, logic in server actions and components** — rejected: it converts a
  framework upgrade into a rewrite of the rules.
- **A plain React SPA plus a separate API (Express/Fastify)** — rejected. Two build setups, two
  deployment units and a hand-written API layer, all to serve a handful of users on one machine.
- **Server-rendered templates with no client framework** — rejected. The registration screen derives
  household counts live as staff type, and the counter needs interactive controls; that is a real
  client-side requirement, not a preference.
- **Track the Next.js latest and upgrade continuously** — rejected. Nobody is going to be watching
  this repository weekly in year three.

## Decision

`next` and `react` are pinned to exact versions in `package.json` (no `^`), and the framework is used
only for what a framework must do: routing, rendering, server actions and route handlers. No business
rule, no persistence call and no clock read lives in `src/app/`, which
[ADR-001](001-layer-the-system-hexagonal-lite-and-enforce-the-boundary-in-the-build.md) enforces from
the other side. A major-version bump is a deliberate, argued change, never a routine one.

## Consequences

- If the framework has to be replaced, only `src/app/` is thrown away — roughly the screens, not the
  system. That is the "framework insurance" the layering is bought with.
- The pin means security updates within the major still arrive by Dependabot, but a major does not
  arrive by accident.
- Staying pinned has its own cost: the longer the app sits on one major, the larger the eventual jump.
  This is recorded as a live risk in [chapter 11](../11-risks-and-technical-debt.md).
- Some framework-native conveniences are deliberately unused where they would pull logic upward.
  Related: `react-hook-form` is not used, because it fights the `useActionState` pattern the screens
  are built on.
- Revisit when the pinned major stops receiving security fixes.

## More information

- [Chapter 4 — solution strategy](../04-solution-strategy.md)
- `package.json`, `docs/tech_stack_architecture_sketch.md` §3.2
