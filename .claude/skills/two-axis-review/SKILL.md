---
name: two-axis-review
description: "Review a branch, PR or work-in-progress diff against FD-Management's own standard along two axes: Standards (does it follow CLAUDE.md, the styling guide and the architecture record?) and Spec (does it do what the story's PRD asked for?). Runs both as parallel sub-agents and reports them side by side, deliberately unmerged. Use when the user asks to review a branch, review the changes, review since X, review before opening the PR, or review a story's implementation."
---

Two-axis review of the diff between `HEAD` and a fixed point:

- **Standards**: does the code conform to this repository's documented standard?
- **Spec**: does the code faithfully implement the PRD the story came from?

Each failure is invisible from the other side — code can honour every rule in CLAUDE.md and
implement the wrong story, or match the PRD exactly while storing a derivable value. One reviewer
holding both questions trades one away for the other, so the axes run as **parallel sub-agents** and
are reported side by side, never merged or reranked.

**This review looks only at what the gates cannot see.** CI runs ESLint (layer boundaries,
wall-clock ban, Prettier), `tsc --strict`, `prisma validate`, the 100% coverage gate on `domain/`
and `application/`, `architecture.test.ts`, `schema.test.ts`, `arc42.py check` and Playwright on
both engines. Assume they are green; if the user hasn't run them, say so once and review anyway.

## Process

### 1. Pin the fixed point

Whatever the user named. **With nothing named, use `main`** — every unit of work here is a branch
squash-merged into `main`. If `HEAD` already is `main`, ask instead.

Capture once: `git diff <fixed-point>...HEAD` (three-dot, against the merge-base) and
`git log <fixed-point>..HEAD --oneline`. Confirm the ref resolves and the diff is non-empty before
spawning anything.

### 2. Identify the spec source

The branch name carries the story. From `ralph/us-37-…` or `feat/us-37-…`, take `US-37` and read:

1. `tasks/prd-us-37-*.md` — the PRD. Its `## Functional requirements` are numbered **FR-N**, its
   sub-stories (`### US-37.4`) carry `- [ ]` criteria. That numbering is the vocabulary findings cite.
2. `scripts/ralph/prds/*-us-37-*.json` if one exists — the batch the Ralph loop ran, whose
   `acceptanceCriteria` are sharper and whose `passes` field claims what was finished.
3. Failing both, a US-NN reference in the commit messages, then a path the user passed.

If nothing is found, ask. If there is no PRD, skip the Spec sub-agent and say so — a spec inferred
from the diff only asks the code whether it agrees with itself.

### 3. Identify the standards sources

`CLAUDE.md` is the standard. Add whatever the diff touches: `docs/guideline/ui_styling_guide.md` for
any `src/app/**` or `src/components/**` change (§8 text, §12 icons), `tasks/README.md`, the relevant
`docs/architecture/` chapter and any ADR the diff argues with.

On top of those the Standards axis carries the **house baseline**: the rules this project holds that
no gate can check, each as _what it is_ → _how to fix_. Every item is a judgement call — a labelled
heuristic ("possible Stored Derivable") — and a documented exception wins: CLAUDE.md names four
stored-derivable exceptions, §8 keeps the surviving hints, §12 registers the icons. Cite the
exception and move on.

- **Stored Derivable**: a new column, field or state variable holding something computable — a
  count, a price, a balance, a group, a validity. → derive it at every read; storing it takes an ADR.
- **Silent State Change**: a use case that archives, blocks, moves a customer number, reissues a
  card, edits policy or the Nachweis-Arten, or ends or reopens a session without an audit entry. →
  add it: _what, when, why_, never _who_. Starting and discarding a session write nothing (ADR-020).
- **Loose Money**: a currency value as a float, or a hand-rolled `€`/comma format in a component. →
  integer cents through `src/domain/money.ts`.
- **German in the Component**: a user-visible German literal outside `src/i18n/de.ts`. → move it to
  the dictionary, read the key.
- **The Screen Explaining Itself**: a hint, intro or card description restating what the screen
  shows. → delete it, unless it names a side effect, a one-way door, a closing window, the meaning
  of an _empty_ field, or an example for a free-text box (§8).
- **The Comment Explaining the Code**: a comment narrating what the line does, retelling what a
  value used to be, or re-arguing a recorded decision. → delete it, or cite the ADR and stop.
- **Icon as the Only Channel**: a glyph with no label and no `aria-label` off a `de.ts` key, a text
  character standing in for an icon, a second icon set, or a meaning unregistered in §12. → give it
  the second channel, or register it.
- **Logic Above Its Layer**: a business rule computed in a server action, a component or a Prisma
  query — lint sees imports, not reasoning. → push it into `domain/`; `app/` validates with Zod,
  calls one use case, renders.
- **Primitive Obsession**: a domain concept passed as a string or number where a value object
  (`CardNumber`) belongs, or the same fields travelling together as a type wanting to be born.
- **Test Named After the Function**: `it("works")` instead of the rule — `turns grown-up on the 13th
birthday, not the day before`; or a time-dependent rule with no day-before / day-of / day-after
  test against a fake clock.
- **Coverage-Chasing Test**: a test in `app/` or `infrastructure/` that moves the number rather than
  proving a rule; a mocking library where a hand-written fake belongs.
- **Bare Error**: `throw new Error("…")` where a typed error from `errors.ts` belongs.
- **Corrective Migration**: pre-release, a migration patching a schema nobody has ever run. →
  replace the history (`migrate dev --name init`), then `npm run db:reset`.
- **Dependency for Fifty Lines**: a new `package.json` entry standing in for a small amount of code,
  or a heavier pattern — events, CQRS, aggregates — than the problem needs.
- **Real-Looking Fixture**: a name, address or certificate in a test that didn't come from Faker.
- **Panel Not Proved**: an e2e spec that asserts a write only after another `page.goto`, where a
  second panel on the same page displays it. → assert the second panel in the same page load.
- **Undocumented Decision**: a hard-to-reverse choice with no ADR, or a change that makes an arc42
  chapter untrue. → update the chapter in this PR, or record the ADR.

### 4. Spawn both sub-agents in parallel

One `Agent` call each, both in the same message, `subagent_type: "general-purpose"`.

**Standards sub-agent prompt** carries the diff command, the commit list, the standards-source paths
from step 3, and **the house baseline pasted in full** — the sub-agent starts cold and has no other
access to it, though CLAUDE.md loads itself. The brief: "Report, per file and hunk, (a) every place
the diff breaks a documented rule: cite the document and the rule; and (b) any baseline smell: name
it and quote the hunk. Documented-rule breaches can be hard findings; baseline smells are always
judgement calls, and a documented exception overrides the baseline. Before reporting a finding,
confirm the document you cite actually says it, and check CLAUDE.md's documented exceptions — drop
anything you cannot quote. Report nothing ESLint, tsc, the coverage gate, the schema test or
`arc42.py check` would catch. Under 500 words."

**Spec sub-agent prompt** carries the diff command, the commit list, and the PRD and Ralph batch
paths. The brief: "Report: (a) requirements and acceptance criteria the spec asked for that are
missing or partial — cite the **FR-N** or the `- [ ]` line; (b) behaviour nobody asked for, checked
against the PRD's `## Non-goals`, which makes most scope creep a fact rather than an opinion; (c)
requirements that look implemented but whose implementation looks wrong; (d) where a Ralph batch
exists, any criterion whose story is marked passing but which you cannot find in the diff. Quote the
spec line for every finding. Under 400 words."

### 5. Aggregate

Present both reports under `## Standards` and `## Spec`, verbatim or lightly cleaned. End with one
line: the count per axis and the worst finding _within each axis_ — no single winner across the two.

Then stop. This skill reviews; it does not fix. Applying the findings is a separate instruction, and
a finding you decline to fix is either a row in `docs/architecture/11-risks-and-technical-debt.md`
or an ADR — findings do not accumulate anywhere else.
