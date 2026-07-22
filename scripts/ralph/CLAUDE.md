# Ralph Agent Instructions

You are an autonomous coding agent working on a software project.

> **The engineering standard for this project is the repository-root `CLAUDE.md`** — architecture
> rules, coding style, testing approach, git conventions and the definition of done. It is
> authoritative, and step 1 below tells you to read it. This file contains only the loop contract:
> what to do each iteration and how to report it.
>
> The work itself is specified in `tasks/` (one PRD per user story). Every story in `prd.json` cites
> its source PRD section — read it when a criterion is ambiguous rather than guessing.

## Your Task

1. **Read `CLAUDE.md` at the repository root before anything else.** It is the engineering standard
   and it is authoritative: architecture boundaries, coding style, the testing approach, git
   conventions, and what "done" means. Your session may already have loaded it as project memory —
   read it explicitly anyway, because nothing here should depend on that having happened.
2. Read the PRD at `prd.json` (in the same directory as this file)
3. Read the progress log at `progress.txt` (check Codebase Patterns section first)
4. Check you're on the correct branch from PRD `branchName`. If not, check it out or create from main.
5. Pick the **highest priority** user story where `passes: false`
6. Implement that single user story
7. Run the quality checks: `npm run lint && npm run typecheck && npm run test:coverage && npm run build`
8. Update CLAUDE.md files if you discover reusable patterns (see below)
9. Check and update documentation if needed
10. If checks pass, commit ALL changes with a **conventional** message —
    `feat(<scope>): <imperative subject>`, subject ≤72 chars, e.g.
    `feat(domain): derive household composition from birthdates`. Put the story ID and the _why_ in
    the body, not the subject. Scope is usually the layer (`domain`, `application`, `infra`, `app`)
    or `docs`/`ci`.
11. Update the PRD to set `passes: true` for the completed story
12. Append your progress to `progress.txt`

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
