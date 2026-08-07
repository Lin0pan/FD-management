# 1. Introduction and goals

_Last reviewed: 2026-08-07_

## Introduction

**FD-Management** is the operations software of the _Delbrücker Füllhorn_ (FD), a food bank in
Delbrück. It supports what FD actually does: keep a register of the households they supply, check
that each one is still entitled to collect, and record who collected what on a distribution day.

It replaces a spreadsheet. The spreadsheet works, but it keeps facts that ought to be computed —
above all the number of grown-ups and children in a household, typed in once and wrong from the next
birthday onwards. Nothing notices, and the portion allowance and the price that follow from those
counts quietly go wrong with them. **Removing that class of drift is the point of this software**,
and it is why "derive, don't store" runs through every chapter that follows.

The system is small and will stay small: roughly 240 households, about four staff, one distribution
per week, one machine. It is expected to run for five years or more with little maintenance, possibly
in the hands of a different developer.

## Requirements overview

The full catalogue is [`docs/user_stories_mvp.md`](../user_stories_mvp.md) and the per-story PRDs in
[`tasks/`](../../tasks/). What matters architecturally:

- **Register a household** onto a free customer number within the quota, with its members, address
  and proof of need, and issue its first card.
- **Derive the household composition** — grown-ups and children — from birthdates against today,
  never from stored counts. The boundary is the 13th birthday.
- **Derive the portion allowance and the price** from that composition and the policy in force,
  capped by FD's _Maximalpreis_.
- **Answer one question at the counter**: given a card or customer number, may this household
  collect today? Exactly one verdict, never a list of hints.
- **Record a hand-out** — at most one per household per distribution day — and allow it to be
  corrected the same day.
- **Track the proof of need**: flag an expiring or expired certificate, log each reminder given,
  record a renewal. There is no automatic consequence; escalation is a staff judgement.
- **Alternate RED and BLUE weeks** strictly, derived from the calendar so two weeks of one colour in
  a row are impossible.
- **Keep the register true over time**: block and unblock, archive (releasing the number), reuse an
  archived record for a re-registration, run a waiting list in strict arrival order.
- **Let FD change their own rules** — quota, portions, prices, price cap, distribution weekday, week
  anchor — in the UI, with the change in force immediately and the history kept.
- **Notice when a printed card has been overtaken** by a birthday, a household change or a group
  move, and offer a reissue.

### Non-goals

Deliberately out of scope, each because FD said so or because it is someone else's job:

| Not built                                    | Why                                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Login, accounts, roles                       | FD are three or four trusted colleagues on one machine — see [ADR-003](adr/003-ship-without-login-and-bind-the-application-to-localhost.md) |
| Printing the physical card                   | A separate existing system does it; this app produces the numbers on it                                                                     |
| Portion adjustments for supply or occasions  | They happen — at the counter, not in the software                                                                                           |
| Reporting and statistics                     | Not asked for; the data is there when it is                                                                                                 |
| A full field-level change history            | The audit log records the state changes that matter, not every edit                                                                         |
| Retention or deletion rules                  | Archived records are kept indefinitely; FD has no rule today                                                                                |
| Contact details, letters, e-mail reminders   | FD does not hold phone numbers or addresses for this purpose                                                                                |
| Importing the existing Excel sheet           | A migration question, still unanswered — see [chapter 11](11-risks-and-technical-debt.md)                                                   |
| Multi-user, multi-machine or cloud operation | One machine, by design                                                                                                                      |

## Quality goals

In priority order. When two of these conflict, the one higher up wins.

| #   | Goal                                   | What it means here                                                                                                                                                                                                | Acceptance criterion                                                                                                                                        |
| --- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Legibility over five-plus years**    | A different developer must be able to read a rule, change it, and be confident about the blast radius. Volume is irrelevant at this scale; comprehension is the constraint.                                       | A new policy value costs a column, a form field and a dictionary entry — not a change to how anything is derived. [Scenario Q1](10-quality-requirements.md) |
| 2   | **Correctness of the hard invariants** | A handful of statements must be impossible to break, not merely unlikely: one non-archived household per customer number, exactly one valid card, one hand-out per household per day, a card number never reused. | Each is enforced by a database constraint as well as by the domain. [Scenario Q2](10-quality-requirements.md)                                               |
| 3   | **Data protection**                    | Sensitive personal data about vulnerable people stays on FD's machine and leaves no trail anywhere else.                                                                                                          | No network listener beyond localhost, no third-party service, no real data in fixtures. [Scenario Q5](10-quality-requirements.md)                           |
| 4   | **Testability**                        | Every rule is reachable without a browser, a database or a wall clock, so the suite is fast enough to be run before every push.                                                                                   | 100 % line, branch, function and statement coverage on `src/domain` and `src/application`, gated in CI. [Scenario Q4](10-quality-requirements.md)           |

Usability at the counter is a real requirement and is treated as one — a single verdict, colour never
carrying meaning alone, type legible across a desk — but it is governed by
[`docs/ui_styling_guide.md`](../ui_styling_guide.md) rather than by the architecture. It appears here
as [scenario Q3](10-quality-requirements.md).

## Stakeholders

| Role                  | Who                                                                 | What they expect                                                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Counter staff         | ~4 FD volunteers, sharing one machine, no accounts                  | To type a number and get one unambiguous answer while a queue waits; to be trusted with judgement calls rather than blocked by the software                                                                          |
| FD as an organisation | The food bank's leadership                                          | To change the quota, prices and portions themselves, without a developer; to be able to say later what was decided and why                                                                                           |
| Customers             | ~240 households                                                     | That their entitlement is judged consistently, and that their data does not leave the building                                                                                                                       |
| Maintaining developer | Today one person; in future possibly someone else entirely          | To find the rule, change it and know what it touched — the reason quality goal 1 is first                                                                                                                            |
| Autonomous agent runs | The Ralph loop (`scripts/ralph/`) writes production code unattended | Rules that hold without a reviewer present. This is why the layer boundary is a build failure and not a convention — see [ADR-001](adr/001-layer-the-system-hexagonal-lite-and-enforce-the-boundary-in-the-build.md) |

---

Next: [2. Architecture constraints](02-architecture-constraints.md)
