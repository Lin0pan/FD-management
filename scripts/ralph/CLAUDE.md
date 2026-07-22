# Ralph Agent Instructions

You are an autonomous coding agent working on a software project.

## Your Task

1. Read the PRD at `prd.json` (in the same directory as this file)
2. Read the progress log at `progress.txt` (check Codebase Patterns section first)
3. Check you're on the correct branch from PRD `branchName`. If not, check it out or create from main.
4. Pick the **highest priority** user story where `passes: false`
5. Implement that single user story
6. Run quality checks (e.g., typecheck, lint, test - use whatever your project requires)
7. Update CLAUDE.md files if you discover reusable patterns (see below)
8. Check and update documentation if needed
9. If checks pass, commit ALL changes with message: `feat: [Story ID] - [Story Title]`
10. Update the PRD to set `passes: true` for the completed story
11. Append your progress to `progress.txt`

## Progress Report Format

APPEND to progress.txt (never replace, always append):

```
## [Date/Time] - [Story ID]
- What was implemented
- Files changed
- **Learnings for future iterations:**
  - Patterns discovered (e.g., "this codebase uses X for Y")
  - Gotchas encountered (e.g., "don't forget to update Z when changing W")
  - Useful context (e.g., "the evaluation panel is in component X")
---
```

The learnings section is critical - it helps future iterations avoid repeating mistakes and understand the codebase better.

## Consolidate Patterns

If you discover a **reusable pattern** that future iterations should know, add it to the `## Codebase Patterns` section at the TOP of progress.txt (create it if it doesn't exist). This section should consolidate the most important learnings:

```
## Codebase Patterns
- Example: Use `sql<number>` template for aggregations
- Example: Always use `IF NOT EXISTS` for migrations
- Example: Export types from actions.ts for UI components
```

Only add patterns that are **general and reusable**, not story-specific details.

## Update CLAUDE.md Files

Before committing, check if any edited files have learnings worth preserving in nearby CLAUDE.md files:

1. **Identify directories with edited files** - Look at which directories you modified
2. **Check for existing CLAUDE.md** - Look for CLAUDE.md in those directories or parent directories
3. **Add valuable learnings** - If you discovered something future developers/agents should know:
   - API patterns or conventions specific to that module
   - Gotchas or non-obvious requirements
   - Dependencies between files
   - Testing approaches for that area
   - Configuration or environment requirements

**Examples of good CLAUDE.md additions:**

- "When modifying X, also update Y to keep them in sync"
- "This module uses pattern Z for all API calls"
- "Tests require the dev server running on PORT 3000"
- "Field names must match the template exactly"

**Do NOT add:**

- Story-specific implementation details
- Temporary debugging notes
- Information already in progress.txt

Only update CLAUDE.md if you have **genuinely reusable knowledge** that would help future work in that directory.

## Quality Requirements

- ALL commits must pass your project's quality checks (typecheck, lint, test)
- Do NOT commit broken code
- Keep changes focused and minimal
- Follow existing code patterns

## Documentation

The software should be well documented, includin the follwing types of documentation:

- Architecture: How the system is structured Architects, senior developers
- Design: How specific features/components work Developers
- API: How to interact with the software Developers, integrators
- User Documentation: How to use the software End users
- Operations: How to deploy and maintain it DevOps, SREs, IT
  After any change, check if the documentaion exists and still up-to-date, update if necessary

## Browser Testing (If Available)

For any story that changes UI, verify it works in the browser if you have browser testing tools configured (e.g., via MCP):

1. Navigate to the relevant page
2. Verify the UI changes work as expected
3. Take a screenshot if helpful for the progress log

If no browser tools are available, note in your progress report that manual browser verification is needed.

## Stop Condition

After completing a user story, check if ALL stories have `passes: true`.

If ALL stories are complete and passing, reply with:
<promise>COMPLETE</promise>

If there are still stories with `passes: false`, end your response normally (another iteration will pick up the next story).

## Important

- Work on ONE story per iteration
- Commit frequently
- Keep CI green
- Read the Codebase Patterns section in progress.txt before starting

## Development Guidelines — FD-Management

Short list of the habits that keep this codebase maintainable over years. Rationale lives in
[`tech_stack_architecture_sketch.md`](../../docs/tech_stack_architecture_sketch.md) and
[`fd_dev_setup_overview.md`](../../docs/fd_dev_setup_overview.md).

### Git

- **Small commits, one intent each.** A commit either refactors or changes behaviour — never both.
- **Conventional commit messages:** `feat(domain): derive household composition from birthdates`.
  Subject in imperative, ≤72 chars. Use the body for _why_, not _what_ — the diff says what.
- **Branch per story** (`feat/us-01-register-customer`), rebase on `main`, squash-merge via PR.
- **Green before push.** Hooks run lint + unit tests; don't `--no-verify`.
- Never commit `data/fd.db`, `.env`, or anything with real customer data.

### Architecture rules (non-negotiable)

- `domain/` imports **nothing** from Next.js, React or Prisma. Zero I/O, no `new Date()`.
- `application/` orchestrates; it talks to persistence only through `ports.ts` interfaces.
- `app/` is thin: validate with Zod → call one use case → render. Logic here is a bug.
- Dependencies point inwards only: `app → application → domain`.

### Coding style

- TypeScript **strict**; no `any`, no non-null `!` — narrow or fail loudly.
- **Time is injected.** Always take a `Clock`; never call `Date.now()` outside `infrastructure/`.
- **Derive, don't store** anything computable (grown-up/children counts, portion allowance, card
  validity). Two sources of truth is the Excel failure we are replacing.
- **Money is integer cents.** Never a float.
- **Policy values are data**, never constants — price table, portions, reminder threshold, quota `N`
  live in settings with `effectiveFrom`.
- Throw **typed domain errors** from `errors.ts`; no bare `throw new Error("...")`.
- **Identifiers English, UI strings German**, and only in `src/i18n/de.ts` — no German literals in
  components.
- Prefer pure functions and value objects (`CardNumber`) over primitives passed around.
- Formatting/import order is Prettier + ESLint's job — never argue about it in review.

### Testing

- **Domain: strict TDD**, red → green → refactor. Write the invariant-breaking test _first_
  (duplicate customer number, two active cards, out-of-order week), then the happy path.
- **Application: TDD against hand-written fakes.** Prefer fakes over mocking libraries.
- Infrastructure: test-after against a throwaway SQLite file. UI: cover via Playwright.
- One named test per business rule; name it after the rule, not the function
  (`turns grown-up on the 13th birthday, not the day before`).
- **Synthetic test data only** (Faker). Never real names, addresses or certificates.
- Coverage on domain/application is a consequence of TDD — don't chase it elsewhere.

### Don'ts

- ❌ Don't put business rules in a server action, React component or Prisma query.
- ❌ Don't hard-code a price, portion count or threshold.
- ❌ Don't hard-delete customer data — archive (status change), keep it queryable.
- ❌ Don't skip the audit entry on a state change (archive, block, group move, card reissue,
  policy edit) — with no login, the log is the only accountability we have.
- ❌ Don't add a dependency to avoid ~50 lines of code, and don't reach for a heavier pattern
  (events, CQRS, aggregates) than the problem needs.
- ❌ Don't bump the Next.js major casually — it's pinned on purpose.

### Reviewing / done

A change is done when: tests written first (domain), CI green, the domain boundary intact, German
strings in the dictionary, an audit entry where state changed, and docs updated if a decision
changed.
