---
name: record-adr
description: Create or modify an architecture decision record (ADR) from the project template — the numbered file in docs/architecture/adr/ plus its row in the chapter 9 decision log. Use whenever the user says "record an ADR", "/record-adr", "write down why we chose X", "document this decision", or wants to supersede, accept or reword an existing decision. The wider arc42 skill delegates all ADR work here.
---

# Record an architecture decision

An ADR captures **one** decision, at the moment it was made, with the reasoning that was true then.
Its readers are future maintainers — including the people who made the decision, eighteen months
later, having forgotten why.

Write one when the decision **constrains future work** _and_ is **hard to reverse**. Both halves
matter: a choice that is easy to undo is not worth the ceremony, and a choice that binds nothing is
not worth the reader's attention. Anything else is at most a one-line row in the chapter 9 timeline —
a decision log full of trivia teaches people to skim it, which costs you the entries that mattered.

## Creating the file

**Use the project's scaffolding rather than writing a file by hand** — it picks the next free number,
renders the template and adds the index row in chapter 9 in one step:

```bash
python3 .claude/skills/arc42/scripts/arc42.py new-adr "Use SQLite as the datastore"
```

That template (`.claude/skills/arc42/assets/skeleton/adr/template.md`, or
`docs/architecture/adr/template.md` once the docs tree is bootstrapped) is the single source of truth
for the ADR format. Do not invent a second one.

If the script is not available in this repository, create
`docs/architecture/adr/NNN-title-of-the-adr.md` yourself — three-digit number, one higher than the
highest existing, slug from the title — with the heading `# ADR-NNN — Title`, the
**Status** / **Date** / **Deciders** list, and the five sections below in order. Then add the row to
the decision log yourself.

**Put the decision in the title.** "Use SQLite as the datastore", not "Datastore" and not "Database
evaluation". People scan the index; a title that names the decision means most readers never open the
file.

## Guidelines for recording the decision

- Use a single sentence to describe the decision made, in present tense.
- Defer any explanation for _why_ to the context section — nothing else belongs here.

## Guidelines for recording the context

- Explain why we have to make the choice in the first place: the force that made a decision
  necessary, what is true about the situation, what happens if we do nothing.
- Name the constraint or quality goal that drove it, and link it — the chapter 1 goal, chapter 2
  constraint or chapter 10 scenario.
- Mention that alternatives exist; the detail goes under considered options.

**IMPORTANT: if you don't have this information, ask the user to provide it.** Never invent a
rationale — a plausible-sounding invention is worse than a gap, because nobody can tell it apart
from the truth. Batch the questions and ask them in one go.

## Guidelines for recording the considered options

- Create a sub-section per option with a short description of its pros and cons.
- Keep each description short and concise.
- Include every option genuinely on the table, each with **why it was not chosen** — including
  "do nothing / defer" where that was real. This section is what stops "why didn't we just use X?"
  from returning every six months.

## Guidelines for recording the consequences

- List the consequences one by one.
- Include both positive and negative consequences — what gets easier _and_ what gets harder. The
  cost side is the half people skip, and its absence is what makes a trade-off look free.
- Include the follow-up work the decision creates and what would make us revisit it.

## Statuses, and modifying an existing ADR

| Status                  | Meaning                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `Pending`               | Drafted, not yet agreed. Real, so the discussion has a document to happen against. |
| `Accepted`              | Agreed and in force.                                                               |
| `Superseded by ADR-007` | Replaced. The file stays exactly as it was.                                        |

A new ADR starts `Pending`; when the user agrees it, set `Accepted` in **both** the file and its
index row.

**Never rewrite or delete an accepted ADR.** The reasoning was correct given what was known at the
time, and that record is the point — deleting it leaves the next reader with the same trap and no
warning. When a decision changes, write a new ADR and supersede the old one:

1. New ADR: state in Context that it replaces ADR-00X and what changed since.
2. Old ADR: status becomes `Superseded by ADR-00Y`. Nothing else changes.
3. Chapter 9 index: update the old row's status, add the new row.
4. Chapters that cited the old decision: point them at the new one.

Correcting a typo or filling a `> **TODO:**` in an existing ADR is fine. Changing what it decided is
not — that is a new ADR.

## Where the files live

- ADRs live in `docs/architecture/adr/`, numbered uniquely: `001-title-of-the-adr.md`.
- Every ADR has a row in the decision log table in `docs/architecture/09-architectural-decisions.md`,
  matching the file's title, status and date.
- If this repository keeps its documentation somewhere else, follow it and say so once rather than
  starting a second tree.

## Before you finish

```bash
python3 .claude/skills/arc42/scripts/arc42.py check
```

Treat its errors as blocking — an ADR missing from the index, a duplicate number or a status that
disagrees with the log are exactly the mechanical failures that make a reader stop trusting the whole
set.

Then, if the decision changes the shape of the system, the affected arc42 chapter changes with it: a
new component in chapter 5, a node in chapter 7, a rule in chapter 8, a trade-off in chapter 10. Use
the `arc42` skill for that. And if several ADRs now point the same way, that direction is a strategy
statement — summarise it in chapter 4 and link the ADRs beneath it.

## Pitfalls

- Considered options left out, so the decision looks arbitrary in hindsight.
- Consequences left out, so the cost side of the trade-off is invisible.
- A title that names a topic instead of a decision.
- An ADR written for a choice nobody will ever have to revisit.
- Silent rewriting of history when a decision is reversed.
- More than a page. An ADR is a record, not an essay; if the context needs five pages, most of it
  belongs in a chapter the ADR links to.
