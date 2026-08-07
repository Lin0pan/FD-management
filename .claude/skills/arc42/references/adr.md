# Architecture decision records

An ADR captures one decision, at the moment it was made, with the reasoning that was true then. Its
readers are future maintainers — including the people who made the decision, eighteen months later,
having forgotten why.

## When a decision deserves an ADR

Write one when the decision **constrains future work** _and_ is **hard to reverse**. Both halves
matter: a choice that is easy to undo is not worth the ceremony, and a choice that binds nothing is
not worth the reader's attention.

Typical candidates: persistence and platform choices, integration style, decomposition and module
boundaries, authentication and authorisation approach, deployment model, a deliberate quality
trade-off, a dependency you will be stuck with, a convention the whole team must follow.

Everything else gets at most a one-line row in the chapter 9 timeline. A decision log full of trivia
teaches people to skim it, which costs you the entries that mattered.

The decision that most often goes unrecorded is the one that felt like a small sprint choice at the
time. If you catch yourself explaining a choice for the second time, that is the signal.

## Creating one

**Hand this to the `record-adr` skill** — it owns the procedure: the scaffolding command, the
section-by-section guidelines, the statuses and the superseding checklist. What follows here is the
shape of the result and what the chapters owe it afterwards, so you can review an ADR without
loading that skill.

## Format

```markdown
# ADR-001 — Use SQLite as the datastore

- **Status:** Accepted
- **Date:** 2026-02-10
- **Deciders:** the team

## Context

The problem or force that made a decision necessary. What is true about the situation, what
constraint or quality goal applies, what happens if we do nothing. Link to the chapter 1 goal,
chapter 2 constraint or chapter 10 scenario that drove it.

## Considered options

Every option genuinely on the table, each with why it was not chosen. This section is what stops
"why didn't you just use Postgres?" from coming back every six months.

- **SQLite** — …
- **PostgreSQL** — rejected because …
- **Do nothing / defer** — rejected because …

## Decision

One paragraph, present tense, stating what we do. Nothing else here.

## Consequences

What gets easier, and — the half people skip — what gets harder. Include the follow-up work the
decision creates and what would make us revisit it.

## More information

Links to the affected chapters, the code, benchmarks, spikes, tickets, external references.
```

Keep it to a page. An ADR is a record, not an essay; if the context needs five pages, most of it
belongs in a chapter that the ADR links to.

Statuses are `Pending`, `Accepted` and `Superseded by ADR-NNN`, and an accepted ADR is never
rewritten or deleted — a reversed decision becomes a new ADR that supersedes it. The `record-adr`
skill has the superseding checklist.

## After writing one

- Chapter 9's index row exists and matches the file's title, status and date — `arc42.py check`
  verifies this.
- If the decision changes the shape of the system, the affected chapter changes with it: a new
  component in chapter 5, a new node in chapter 7, a rule in chapter 8, a trade-off in chapter 10.
- If several ADRs now point in the same direction, that direction is a strategy statement — summarise
  it in chapter 4 and link the ADRs beneath it. Accumulated ADRs are the raw material chapter 4 is
  built from, which is why an empty decision log is worth creating on day one.

## Pitfalls

- Considered options left out, so the decision looks arbitrary in hindsight.
- Consequences left out, so the cost side of the trade-off is invisible.
- A title that names a topic instead of a decision.
- An ADR written for a choice nobody will ever have to revisit.
- Silent rewriting of history when a decision is reversed.
