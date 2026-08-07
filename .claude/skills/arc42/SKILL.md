---
name: arc42
description: Write, maintain and update arc42 architecture documentation as one markdown file per chapter in docs/architecture/, plus architecture decision records (ADRs). Use this whenever the user mentions arc42, architecture documentation, an ADR or architecture decision record, a context/building-block/runtime/deployment view, quality scenarios, a solution strategy, an architecture glossary or a risk-and-technical-debt list — and also when they ask to "document the architecture" or when a change lands that makes existing architecture docs wrong. Writing a single ADR is delegated to the `record-adr` skill.
---

# arc42 documentation

arc42 is a twelve-chapter template that answers the questions people keep asking about a system:
what is it for, what constrains it, where are its edges, how is it built, how does it behave, where
does it run, why is it like that. This skill writes and maintains those chapters as markdown in the
repository, one file per chapter, so they are reviewed in pull requests like code.

**Working rule: minimal but honest.** Write the smallest amount of documentation that prevents an
expensive misunderstanding. Architecture docs are not a deliverable, they are a feedback loop — a
short chapter that is true beats a thorough chapter that is stale, and it is the conversation the
template forces that carries most of the value.

## Layout

```
docs/architecture/
├── README.md                        index + reading order
├── 01-introduction-and-goals.md
├── 02-architecture-constraints.md
├── 03-context-and-scope.md
├── 04-solution-strategy.md
├── 05-building-block-view.md
├── 06-runtime-view.md
├── 07-deployment-view.md
├── 08-crosscutting-concepts.md
├── 09-architectural-decisions.md    index of ADRs
├── 10-quality-requirements.md
├── 11-risks-and-technical-debt.md
├── 12-glossary.md
└── adr/
    ├── 001-use-sqlite-as-the-datastore.md
    └── 002-derive-household-composition.md
```

`docs/architecture/` is the default. If the repository already keeps docs elsewhere, follow it and
say so once rather than starting a second tree.

## Never invent facts

Everything in these chapters is a claim about a real system, and a plausible-sounding invention is
worse than a gap because nobody can tell it apart from the truth. So:

- **Read before writing.** The answers are in the repo: `CLAUDE.md`/`AGENTS.md` and existing docs for
  goals and constraints, `package.json` and lockfiles for the stack, config and IaC for deployment,
  the source tree and module boundaries for building blocks, tests for behaviour, git history for
  decisions already taken.
- **Leave a marked gap instead of a guess.** Write `> **TODO:** who owns the nightly export?` and
  keep going. `scripts/arc42.py check` counts these, so gaps stay visible instead of quietly
  hardening into fiction.
- **Ask the user for what only they know** — business goals, stakeholder expectations, SLAs, why an
  option was rejected. Batch the questions and ask at the end of a chapter, not one at a time.
- **Surface contradictions, don't resolve them silently.** If the code contradicts a documented
  constraint, say so in the chapter and to the user. That conflict is the most valuable thing the
  documentation found.

## Workflows

### Bootstrap the documentation

```bash
python3 .claude/skills/arc42/scripts/arc42.py init          # --dir docs/architecture
```

This copies the skeleton — twelve chapters and a README, each with its headings and TODO markers —
without overwriting anything that exists. Then fill chapters in this order, which is what a first
week actually needs: **1 (goals) → 2 (constraints) → 3 (context) → 5 (level-1 building blocks) →
6 (one runtime flow) → 10 (quality scenarios) → 9 (empty decision log)**. The rest follow as the
design settles. Chapter 1 is the one to get right if you only get one right.

Do not fill all twelve in one sitting to make the tree look finished. An honest `> **TODO:**` in
chapter 7 is worth more than a paragraph of invented topology.

### Write or extend a chapter

1. Read the chapter's entry in `references/chapter-guides.md` — what belongs, what does not, the
   minimum viable version, the pitfalls, and the done-when checklist.
2. Gather the facts from the repo (see "Never invent facts").
3. Write it, then cross-link instead of repeating: chapters overlap constantly, and the second copy
   of a fact is the one that goes stale. `See [chapter 5](05-building-block-view.md#payment-module).`
4. Check it against the chapter's done-when list, and update `docs/architecture/README.md` if the
   chapter went from empty to written.

### Record an architecture decision (ADR)

**Use the `record-adr` skill.** Writing a new ADR, accepting a pending one, superseding an old one —
all of it belongs there, and this skill hands the work over rather than repeating it. Invoke it as
soon as the work turns out to be a decision record, including when the user reached this skill by
asking to "write down why we chose X".

It scaffolds through the same script and template as everything else here:

```bash
python3 .claude/skills/arc42/scripts/arc42.py new-adr "Use SQLite as the datastore"
```

Write an ADR when a decision **constrains future work and is hard to reverse**. Anything else is a
one-line row in chapter 9 at most — a log of trivia trains people to stop reading it.

What stays this skill's job is everything an ADR then touches: chapter 9's index reads as a
timeline, a decision that changes the system's shape changes the chapter that describes that shape,
and several ADRs pointing the same way become a strategy statement in chapter 4. `references/adr.md`
has the background — when a decision is worth recording, and what to do with the chapters afterwards.

### Keep the documentation alive

Docs do not die from apathy, they die because nothing connects them to change. When a change lands
that touches architecture, update the affected chapter in the same pull request — see
`references/maintenance.md` for which change triggers which chapter, the review cadence, and how to
run a drift check.

```bash
python3 .claude/skills/arc42/scripts/arc42.py check        # structure, ADR index, links, TODOs
```

Run this after any edit to the docs tree, and treat its errors as blocking: they are the mechanical
failures (an ADR missing from the index, a broken link, a duplicate number) that make a reader stop
trusting the whole set.

## Conventions

- **One file per chapter**, numbered as above; the number is part of the filename so the tree sorts
  and so `see chapter 6` resolves to a file.
- **Every file starts** with `# N. Title` and an italic `_Last reviewed: YYYY-MM-DD_` line. That date
  is what makes a stale chapter visible; refresh it when you genuinely re-read the chapter, not on
  every typo fix.
- **Relative markdown links** between chapters and to source files, so they work on GitHub and in
  any static site build.
- **Diagrams as Mermaid** in fenced ```mermaid blocks — they render on GitHub, diff as text, and
  cannot drift out of the repo the way an exported PNG does. Prefer `flowchart` for context and
  building blocks, `sequenceDiagram` for runtime flows, `flowchart` in a subgraph-per-node style for
  deployment. If a diagram needs a notation Mermaid cannot express, link the source file next to the
  image rather than committing a picture alone.
- **Tables for anything enumerable** — constraints, stakeholders, quality scenarios, risks, the ADR
  index. They stay scannable and make an omission obvious.
- **Write in the language the repository's other documentation uses.** Match the surrounding prose;
  do not switch a German-documented project to English or the reverse.
- **No secrets, ever** — chapter 7 documents that a setting exists, where it is set and what it
  affects, never its value. Same for exploit detail in chapter 11.

## Reference files

| Read this                      | When                                                                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `references/chapter-guides.md` | Writing or reviewing any chapter — one entry per chapter with scope, minimum viable version, pitfalls, done-when checklist. |
| `references/adr.md`            | Judging whether a decision is worth an ADR, and what the chapters owe it afterwards. Writing one is the `record-adr` skill. |
| `references/maintenance.md`    | Keeping docs current: change triggers, review cadence, drift checks, ownership.                                             |
| `assets/skeleton/`             | The files `init` copies, including `adr/template.md`.                                                                       |
