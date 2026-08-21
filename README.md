# FD-Management

Operations software for the **Delbrücker Füllhorn** (DF) food bank: customer administration,
eligibility checks, and food-distribution tracking.

An early version, for DF to test with — it does not replace the spreadsheet yet. See
[`docs/`](./docs/) for the documentation that exists.

## Quick start

**Prerequisites**

- **Node 26.** Install it from [nodejs.org](https://nodejs.org/en/download) — npm comes with it —
  or through a version manager such as [nvm](https://github.com/nvm-sh/nvm) or
  [fnm](https://github.com/Schniz/fnm), which read the version from `.nvmrc`. The version is pinned
  (`engines` in `package.json`); nothing else is tested.
- No database server, no Docker, no account. Running the E2E suite additionally needs Playwright's
  browsers — see [`CONTRIBUTING.md`](./CONTRIBUTING.md).
- The app runs on one machine, bound to localhost, without a login. DF use a MacBook, so it is
  supported — and gated — on **Safari and Chromium-based browsers**
  ([ADR-012](./docs/architecture/adr/012-support-safari-and-chromium-based-browsers-and-gate-both-in-ci.md)).
- `data/fd.db` is the entire state of the system and there is **no backup yet**.

**Install**

```bash
npm run setup
```

Dependencies, `.env`, the Prisma client, migrations and the seed — in the one order that works. Safe
to repeat, so it is also the command to run after pulling: it never overwrites an existing `.env`
and never seeds over existing settings.
[Why a script](./CONTRIBUTING.md#getting-started) · [`scripts/setup.mjs`](./scripts/setup.mjs)

> **On Windows**, PowerShell may refuse to run `npm` at all until you allow local scripts once with
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` — see
> [`CONTRIBUTING.md`](./CONTRIBUTING.md#getting-started). The setup script itself works there.

**Run in development**

```bash
npm run dev                 # http://localhost:3000
```

**Run in production**

```bash
npm run build               # only after pulling new code — see below
npm start                   # http://localhost:3000
```

`npm start` serves the last build, so rebuild after every update and only then: a build is a
snapshot of the code, not of the data. Nothing DF does — customers, settings, hand-outs — needs one.
`npm run dev` needs no build at all.

Either way you get a working app with an **empty register**. To click around with something to look
at, add the demo data below.

## Demo data

```bash
npm run db:demo             # seeds twenty synthetic households
npm run db:demo -- --reset  # wipes the register first, then re-seeds
```

Twenty households — active, blocked and archived — in the states that are tedious to reach by hand:
lapsed and expiring certificates, cards due for reissue, past distribution days, and a waiting list.
The script prints a table of what it created and why. Today deliberately has no hand-outs recorded,
so the counter is yours to try.

Worth knowing:

- **It is opt-in.** Nothing runs it for you — not `db:seed`, not the E2E suite, not CI. `db:reset`
  wipes it, so re-run `db:demo` after one.
- **It is invisible to git.** `data/*.db` is git-ignored; seed and re-seed as often as you like.
- **It writes through the real use cases**, never Prisma directly, so the result is a database the
  application could have produced — invariants hold and the audit log reads forwards.
- **Never point it at DF's database.** It is a development fixture, and `--reset` deletes customer
  data outright. It refuses to run over a non-empty register unless you pass that flag.

## Stack

TypeScript (strict) · Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · SQLite via Prisma · Zod
· Vitest (unit) · Playwright (E2E).

## Architecture

Hexagonal-lite: four layers, `app → application → domain`, with `infrastructure` implementing the
ports. Dependencies point inwards only, and ESLint fails the build if one points outward.

- **`domain/` is pure.** The business rules are plain functions and value objects that import
  nothing from Next.js, React or Prisma, do no I/O, and never read the wall clock — so they are
  testable by calling them, which is what makes strict TDD and a 100 % coverage gate affordable.
- **`application/` is one function per user intention**, reaching the outside only through the port
  interfaces. No DI container, no class hierarchy.
- **`infrastructure/` is the only layer that touches Prisma, the filesystem or the clock**, and
  `app/` is thin: validate with Zod, call one use case, render.

Chapters [4](./docs/architecture/04-solution-strategy.md) and
[5](./docs/architecture/05-building-block-view.md) have the reasoning and the block-by-block
breakdown.

## Status

The crucial features are in place: DF can test the software and play around with it, but it is not
ready to replace the spreadsheet. The open questions are operational —
[chapter 11](./docs/architecture/11-risks-and-technical-debt.md) tracks them in full:

- **Backup.** No schedule, destination or restore drill exists.
- **Migration.** How the existing Excel data gets into the register is undecided.
- **Quota.** The seeded customer quota is a placeholder, not DF's real number.
- **Migration history** stays regenerable only until the first real customer is entered.

## Documentation

- [`docs/architecture/`](./docs/architecture/README.md) — the architecture, as twelve arc42 chapters
  plus the decision records: what the system is for, what constrains it, how it is built, and why.
  **Start here.**
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — workflow, TDD approach, and why each CI gate exists.

More documentation will follow.
