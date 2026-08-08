# ADR-011 — Track the newest even-numbered Node release

- **Status:** Accepted
- **Date:** 2026-08-08
- **Deciders:** the maintainer

## Context

The runtime was pinned to Node 22, which leaves maintenance on 2027-04-30. Something had to move
before then, and the question was what to move to and when.

Dependabot forced the question early, and in the least helpful way. PR #45 offered `@types/node` 22 →
26 — type definitions only, never the runtime. Merged on its own it would have taught `tsc` about
APIs the installed Node did not have, so `npm run typecheck` would have gone on passing while
describing a runtime nobody was running. The type package is not a dependency in the ordinary sense;
it is a description of the runtime, and it has to move with it or not at all.

On the day of the decision the options were awkwardly timed. Node 26 had been out since 2026-05-05
but was still **Current** — it becomes Active LTS on 2026-10-28. Node 24 was Active LTS that week,
but only until 2026-10-20, when it drops to maintenance.

The one thing making this cheap is that DF holds no real data yet. They have the test version and the
Betriebsanleitung; the register is seeded, not live. The same reasoning that lets migration history be
regenerated ([ADR-009](009-regenerate-migration-history-until-fd-holds-real-data.md)) applies to the
runtime: a bad runtime bump discovered now costs an afternoon, and the same bump discovered in year
three costs a weekend of someone's life.

## Considered options

- **Node 26 now, ~11 weeks ahead of its LTS date** — chosen.
- **Node 24, Active LTS on the day** — rejected. It looks like the conservative answer and is not.
  Its active phase ended twelve weeks later and it dies 2028-04-30, a full year before Node 26, so
  the by-the-book choice buys a few weeks of LTS status in exchange for doing this again within a
  year. The cost of a Node bump here is almost entirely the verification pass, not the edit, and that
  cost does not halve for being paid twice.
- **Prepare now, merge on 2026-10-28** — rejected. It leaves a verified branch rotting against a
  moving `main` for eleven weeks to buy a status change that arrives on its own.
- **Stay on Node 22 until it expires** — rejected. It defers the work to a point where DF does hold
  real data, which is exactly when we would least want to be moving the runtime.
- **Stop pinning; track whatever the developer has installed** — rejected. The pin exists so DF's
  machine and CI are the same runtime; that is the whole value of it.

## Decision

The project tracks the **newest even-numbered Node release**, adopted once it is out and the gates
pass against it, without waiting for the October LTS promotion. Odd-numbered releases are never
adopted — they get six months of life and no LTS phase at all.

The version is pinned in four places that move in one commit:

| Pin                                          | Seen by                                    |
| -------------------------------------------- | ------------------------------------------ |
| `.nvmrc`                                     | developers, and CI via `node-version-file` |
| `engines.node` in `package.json`             | npm, as a warning                          |
| `"version"` on the Node devcontainer feature | the devcontainer only                      |
| `@types/node`                                | `tsc`                                      |

`@types/node` is held to the same major by a Dependabot `ignore` rule on major updates, so it can
never again be offered ahead of the runtime. Minor and patch updates still flow through the
`minor-and-patch` group.

The devcontainer pin is the awkward one. The registry publishes no `typescript-node:26` image, so the
devcontainer uses a base image plus `ghcr.io/devcontainers/features/node`, and its version string is
the one pin **CI cannot see** — nothing fails if it drifts. It is named in
[chapter 2](../02-architecture-constraints.md) and [chapter 7](../07-deployment-view.md) for that
reason.

A bump is only done when the full gate suite has been run against the real runtime, not just CI's:
`npm ci`, `prisma generate`, lint, typecheck, unit tests at the coverage gate, `next build`, a
`db:reset` through `tsx`, the e2e suite, and `format:check`.

## Consequences

- Node 26 is supported until **2029-04-30**, which is past the five-year horizon this project is
  built for. The next forced bump is Node 28 or later, not next year.
- For the ~11 weeks to 2026-10-28 the app runs on a Current release: security fixes still arrive, but
  there is no LTS guarantee and semver-major changes can still land in the line. Recorded as a live
  risk in [chapter 11](../11-risks-and-technical-debt.md), to be retired on that date.
- This is a different policy from the Next.js pin in
  [ADR-004](004-pin-the-next-js-major-and-keep-the-core-outside-the-framework.md), deliberately. Next
  is pinned because its majors have rewritten the routing and caching models inside this project's
  expected lifetime; Node's majors do not rewrite anything the project uses. Framework churn and
  runtime churn are not the same risk and do not deserve the same answer.
- The Node 26 bump itself cost nothing in code: no removed API (`http.writeHeader`, the legacy
  `_stream_*` modules, DEP0182 crypto) is used anywhere, no outbound `fetch` exists for undici 8 to
  change, and the `NODE_MODULE_VERSION` 147 bump is invisible because every native binary in the tree
  is N-API or an out-of-process engine. That this was uneventful is itself the argument for doing it
  while it is uneventful.
- npm arrives with Node, so a runtime bump is also an npm bump. Node 26 ships npm 11, which no longer
  runs dependency install scripts by default. Nothing here depends on them — Prisma's client is
  generated by an explicit `prisma generate` and sharp's binary is a plain dependency — but a future
  dependency that does will fail quietly at install time rather than loudly.
- Revisit when Node 28 is released, or sooner if a security advisory affects the Current line.

## More information

- [Chapter 2 — architecture constraints](../02-architecture-constraints.md)
- [Chapter 7 — deployment view](../07-deployment-view.md)
- [Node.js release schedule](https://github.com/nodejs/Release/blob/main/schedule.json)
