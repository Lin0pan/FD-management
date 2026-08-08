# Keeping the documentation alive

Documentation does not die because people stop caring. It dies because nothing connects it to
change. Everything below exists to make an update cheap, reviewable and hard to forget.

## Why the docs live in the repository

Kept in the repo as markdown, an architecture change is reviewed in the pull request that makes it,
versioned with the code that proves it, and checkable by CI. A wiki makes collaboration easy but
lets superseded pages accumulate until nobody can tell current from historical; a formal document
tool gives you sign-off and audit trails at the cost of iteration speed, which is the right trade
only when someone external requires it. If a rendered site is wanted, generate it from these files —
the repo stays the source.

## Which change touches which chapter

Consult this when reviewing a diff, and update the chapter in **the same pull request** as the code.
A separate "docs catch-up" ticket is where accuracy goes to die.

| A change that…                                               | Updates                    |
| ------------------------------------------------------------ | -------------------------- |
| adds or removes an external system, interface or actor       | 3, and level 1 of 5        |
| adds, merges or deletes a module, service or major component | 5, often 4                 |
| changes a workflow, or adds a failure/retry/degraded path    | 6                          |
| changes hosting, environments, or adds a setting             | 7                          |
| introduces or changes a system-wide pattern or convention    | 8, often 2                 |
| makes a hard-to-reverse choice                               | a new ADR + the index in 9 |
| changes a performance, availability or security target       | 10, often 1                |
| takes a deliberate shortcut, or reveals a new risk           | 11                         |
| introduces domain vocabulary, or renames a domain concept    | 12                         |
| changes a business goal, stakeholder or non-goal             | 1                          |
| adds an obligation nobody may override                       | 2                          |

A useful review question, put to the diff rather than the author: _if someone reads the architecture
docs after this merges, what will they now believe that is false?_

## Definition of done

For any change that touches architecture, treat these as part of finishing the work:

- The affected chapter is updated in the same pull request.
- A hard-to-reverse decision has an ADR, and the chapter 9 index has its row.
- `python3 .claude/skills/arc42/scripts/arc42.py check` passes.
- `_Last reviewed:_` is refreshed on chapters that were genuinely re-read.

## Review cadence

Change-triggered updates keep the facts right; scheduled reviews catch what silently stopped being
true — a goal nobody pursues any more, a constraint that was lifted, a risk that already happened.

- **Quarterly** — chapters 1, 2, 3, 9, 10, 11 with the team. Are the goals still the goals? Is any
  constraint gone? Did the context grow a neighbour? Did a risk land?
- **Annually** — everything, chapters 5, 7 and 12 especially: they drift quietly, because nothing
  fails when they are wrong.
- **On a major change** — a new integration, a platform migration, a re-org that moves ownership.

Log the review by updating `_Last reviewed:_`. A chapter whose date is eighteen months old is either
genuinely stable or quietly abandoned, and the date is what prompts someone to find out which.

## Ownership

**The team that builds the system owns the documentation.** Not an architect who writes it once, not
a technical writer downstream of the work — the people who change the code are the only people who
know when the description stopped matching. Documentation with unclear ownership decays by default.

## Drift check

```bash
python3 .claude/skills/arc42/scripts/arc42.py check
```

It reports mechanical failures: a missing or misnamed chapter, an ADR file absent from the chapter 9
index or listed with the wrong status, duplicate ADR numbers, a broken relative link, a missing
status or date, and a count of open `> **TODO:**` markers per file. These are cheap to fix and
expensive to leave — each one is a small reason for a reader to stop trusting the set.

What no script can check is whether a chapter is still _true_. That is what the review cadence and
the pull-request habit are for.

Wiring `check` into CI (or a pre-push hook) is what turns the convention into a guarantee. Keep it
advisory at first if the docs are new and full of TODOs; make it blocking once the tree is populated.

## Working with AI assistants

If the repository has a `CLAUDE.md` or `AGENTS.md`, point it at these docs so assistants read the
architecture before proposing changes to it, for example:

```markdown
## Architecture documentation

`docs/architecture/` holds the arc42 documentation and is the source of truth for goals,
constraints, structure and decisions. Read the relevant chapter before proposing an architectural
change. If a request conflicts with a documented constraint or decision, say so and ask — do not
silently pick one side. Any change that alters architecture updates the affected chapter in the
same pull request, and a hard-to-reverse choice gets an ADR.
```

The instruction that matters most is _surface the conflict_. An assistant that quietly picks between
two contradictory constraints has hidden exactly the problem the documentation exists to expose.
