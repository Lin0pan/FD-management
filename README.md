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
npm run dev                 # http://localhost:3000
```

## Stack

TypeScript (strict) · Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · SQLite via Prisma · Zod
· Vitest (unit) · Playwright (E2E). Hexagonal-lite architecture — the domain layer imports nothing
from Next.js, React, or Prisma.

## Status

Walking skeleton: runnable app, hexagonal structure, test harness, and CI pipeline in place. Domain
features follow the build order **US-14 → US-01 → US-02 → US-03 → US-04 → US-05** (see
`docs/user_stories_mvp.md`).

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the workflow, TDD approach, and why each CI gate
exists.
