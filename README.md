# FD-Management

Operations software for the **Delbrücker Füllhorn** food bank: customer administration, eligibility
checks, and food-distribution tracking. Local-first, single-machine, no login — see `docs/` for the
domain analysis, user stories, tech-stack/architecture sketch, and dev-process overview.

## Quick start

Requires **Node 22** (`.nvmrc`).

```bash
npm install
cp .env.example .env
npx prisma migrate deploy   # creates data/fd.db
npm run db:seed             # provisional policy values, so the app boots usable
npm run dev                 # http://localhost:3000
```

That gives you a working app with an **empty register**. To click around with something to look at,
add the demo data below.

## Demo data

```bash
npm run db:demo             # seeds twenty synthetic households
npm run db:demo -- --reset  # wipes the register first, then re-seeds
```

Twenty households — 12 active, 3 blocked, 5 archived, 1–6 people each — with the states that are
tedious to reach by hand: lapsed certificates with reminder trails, two expiring within the month, a
card reissued after a loss, a child who just turned 13 and a household moved between groups (both
land on the cards-due list), a re-registration linked to the archived record it came from, eight
past distribution days including no-shows and unpaid hand-outs, and three waiting-list applicants.
The script prints a table of what it created and why each household is there.

Today deliberately has no hand-outs recorded, so the counter is yours to try.

Worth knowing:

- **It is opt-in.** Nothing runs it for you — not `db:seed`, not the E2E suite, not CI. `db:reset`
  wipes it, so re-run `db:demo` after one.
- **It is invisible to git.** `data/*.db` is git-ignored; seed and re-seed as often as you like.
- **It writes through the real use cases**, never Prisma directly, so the result is a database the
  application could have produced — invariants hold and the audit log reads forwards.
- **Never point it at FD's database.** It is a development fixture, and `--reset` deletes customer
  data outright. It refuses to run over a non-empty register unless you pass that flag.

Two customer numbers appear twice in its output. That is the slot rule, not a bug: archiving
releases the number and a later registration takes it, while the archived record keeps the one it
had. See `docs/technical_documentation.md` for the full description.

## Stack

TypeScript (strict) · Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · SQLite via Prisma · Zod
· Vitest (unit) · Playwright (E2E). Hexagonal-lite architecture — the domain layer imports nothing
from Next.js, React, or Prisma.

## Status

Walking skeleton: runnable app, hexagonal structure, test harness, and CI pipeline in place. Domain
features follow the build order **US-14 → US-01 → US-02 → US-03 → US-04 → US-05** (see
`docs/user_stories_mvp.md`).

## Documentation

- [`docs/architecture/`](./docs/architecture/README.md) — the architecture, as twelve arc42 chapters
  plus the decision records: what the system is for, what constrains it, how it is built, and why.
  **Start here.**
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — workflow, TDD approach, and why each CI gate exists.
- [`docs/ui_styling_guide.md`](./docs/ui_styling_guide.md) — the rules for every screen.
- `docs/` — domain analysis and user stories. `technical_documentation.md` and
  `tech_stack_architecture_sketch.md` are legacy, retiring into `docs/architecture/`.
