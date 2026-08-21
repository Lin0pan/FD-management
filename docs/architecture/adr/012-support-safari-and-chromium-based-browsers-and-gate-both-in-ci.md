# ADR-012 — Support Safari and Chromium-based browsers, and gate both in CI

- **Status:** Accepted
- **Date:** 2026-08-21
- **Deciders:** the maintainer, with DF on which machine they actually use

## Context

DF run the application on one staff member's own MacBook, so **Safari is the production browser
today**. The end-to-end suite has always run on Chromium — not as a decision, but because it is
Playwright's default. Until now **no document in the repository named a supported browser at all**:
[chapter 2](../02-architecture-constraints.md) pins Node, TypeScript, Prisma and SQLite and is silent
on the browser, and [chapter 7](../07-deployment-view.md) said only "one production node and it is a
laptop".

That gap is the force here. The engine DF actually use had never rendered the application in CI, and
nobody could tell from the repository whether that was an oversight or a decision — which is exactly
the state [quality goal 1](../01-introduction-and-goals.md#quality-goals) (legibility over five-plus
years, for a possibly different developer) exists to prevent.

The machine is not fixed forever. It is one person's personal laptop; a replacement could as easily
be a Windows or Linux machine, which would put a Chromium-based browser back in front of DF. So the
question is not "which browser do they use" — that answer expires — but **which set the software
promises to work in**.

Doing nothing means the promise stays unwritten and Safari stays ungated, on a five-year horizon
where the person maintaining this will not be the person who knows which laptop it was.

The cost is real but bounded: the suite is deliberately serial (`fullyParallel: false, workers: 1`,
because the specs share one register and assert against each other's writes), so a second engine
roughly doubles end-to-end wall-clock.

## Considered options

- **Gate Safari and Chromium both** — chosen. Covers the browser in use today and the one a
  replacement machine would most likely bring, and states a promise that does not expire the next
  time the hardware changes. Costs a second engine's wall-clock in CI.
- **Track whichever browser DF currently use (Safari only)** — rejected. Cheapest to run, but the
  supported set would have to be renegotiated every time the laptop changes, and dropping Chromium
  would throw away coverage that already exists and already passes.
- **Stay on Chromium only** — rejected. It is the status quo, and it leaves the production browser
  untested. A rendering or scripting difference would be found by DF at the counter with a queue
  waiting, which is the worst place this project has to discover anything.
- **Add Firefox as well** — rejected. Nobody in this deployment runs it. A third engine bought on
  symmetry alone is a standing cost against no identified risk; it can be added if that changes.
- **Rely on a manual Safari pass instead of a gate** — rejected as the _only_ measure. A manual pass
  is still required (see Consequences), but it depends on someone remembering, which is not a gate.

## Decision

The application is supported on **Safari and on Chromium-based browsers**, and both are gated: the
end-to-end suite runs on WebKit and on Chromium, and both must be green for a change to land.

The two engines run as **separate Playwright invocations** (`npm run test:e2e` and
`npm run test:e2e:webkit`), each driving registers of its own, rather than as two projects in one
run.

## Consequences

- **The production browser is now gated.** A Safari-only regression fails CI instead of reaching the
  counter.
- **The promise outlives the hardware.** If DF's laptop is replaced by a Windows or Linux machine,
  the supported set already covers it and nothing has to be renegotiated.
- **CI grows a leg.** `e2e-tests` becomes a two-leg matrix (`fail-fast: false`, so "Safari broke" and
  "both broke" stay distinguishable). The legs run in parallel, so wall-clock is roughly unchanged
  even though the work doubles. Locally the two runs are sequential and the suite takes about twice
  as long.
- **A second browser binary** must be installed by every contributor, the devcontainer and CI
  (`npx playwright install --with-deps chromium webkit`).
- **The engine could not be a Playwright project.** The specs read their database and pinned-clock
  paths at module scope, where `testInfo` does not exist, and the shared register is order-dependent
  — `registration.spec.ts` asserts the lowest free customer number against what earlier specs
  consumed, and each database is re-seeded once per _run_, not per project. Hence one invocation per
  engine, and hence [`tests/e2e/registers.ts`](../../../tests/e2e/registers.ts) as the single place
  that maps an engine to its ports and files. Anything else reading those paths must go through it.
- **WebKit is not Safari, and this ADR does not pretend otherwise.** Playwright ships the engine
  without Apple's shell, so the real macOS `<input type="date">` picker — this application's most
  common field, in eight components — cannot be exercised in CI. A manual pass in Safari on a Mac
  stays part of "done" for UI work, per
  [`ui_styling_guide.md` §11](../../guideline/ui_styling_guide.md).
- **Revisit if** DF move to a machine whose browser is outside this set, if a third engine gains a
  real user, or if the serial suite grows long enough that doubling it stops being tolerable — at
  which point a WebKit smoke subset is the fallback, not dropping the gate.

## More information

- [Chapter 2 — architecture constraints](../02-architecture-constraints.md), where the supported set
  is recorded as a technical constraint.
- [Chapter 7 — deployment view](../07-deployment-view.md), for the production node and the e2e
  environments.
- [Chapter 10 — quality requirements](../10-quality-requirements.md), scenario Q3 (usability at the
  counter), which is the goal a browser difference would damage.
- [`tests/e2e/registers.ts`](../../../tests/e2e/registers.ts) — engine, ports and register files.
- [`playwright.config.ts`](../../../playwright.config.ts) and
  [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml) — the gates themselves.
- Measured on 2026-08-21 against Playwright's WebKit 26.5: of 145 specs, **144 passed and one failed**
  — and that one was a spec assumption, not a defect. Chromium treats a programmatic `focus()` as the
  sequential-navigation origin and WebKit does not, so `focus()` then `Tab` never reached the
  hand-out history region. The region is tab-reachable and focusable in both engines; the spec now
  opens the fold with the keyboard, which is engine-neutral and closer to what a keyboard user does.
