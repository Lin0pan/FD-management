# 1. Introduction and goals

_Last reviewed: 2026-08-07_

## Introduction

**FD-Management** is the operations software of the _Delbrücker Füllhorn_ (DF), a food bank in
Delbrück. It supports what DF actually does: keep a register of the households they supply, check
that each one is still entitled to collect, and record who collected what on a distribution day.

It replaces a spreadsheet, for four reasons: **correctness** — the sheet stores counts that ought to
be computed, so they are wrong from the next birthday onwards and nothing notices; **consistency** —
the same fact can be recorded two ways in two places; **usability** — a form that asks the right
questions beats a wide grid at a counter with a queue waiting; and **robustness** — a spreadsheet is
easy to break by accident, a dragged formula or an overwritten column at a time, and hardest to use
safely for exactly the people who use it most, who are volunteers rather than spreadsheet
specialists.

The system is small and will stay small: a few hundred households — roughly 250 today, and a number
that moves — a handful of staff, one distribution per week, one machine. It is expected to run for
five years or more with little maintenance, possibly in the hands of a different developer.

## Requirements overview

The story-by-story record is [`tasks/`](../../tasks/), one PRD per user story, US-01 to US-26.
(`docs/archiv/user_stories_mvp.md` describes an early MVP scope the system has since moved past; it is not
current — see [chapter 11](11-risks-and-technical-debt.md).) What matters architecturally:

- **Register a household** onto a free customer number within the quota, with its members, address
  and proof of need, and issue its first card.
- **Derive the household composition** — grown-ups and children — from birthdates against today,
  never from stored counts. The boundary is the 13th birthday.
- **Derive the price** from that composition and the policy in force, capped by DF's
  _Maximalpreis_.
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
- **Let DF change their own rules** — quota, prices, price cap, distribution weekday, week anchor —
  in the UI, with the change in force immediately and the history kept.
- **Notice when a printed card has been overtaken** by a birthday, a household change or a group
  move, and offer a reissue.

### Non-goals

Deliberately out of scope, each because DF said so or because it is someone else's job. Confirmed
still current on 2026-08-07:

| Not built                                    | Why                                                                                                                                                                                                       |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login, accounts, roles                       | DF are a handful of trusted colleagues on one machine — see [ADR-003](adr/003-ship-without-login-and-bind-the-application-to-localhost.md)                                                                |
| Printing the physical card                   | A separate existing system does it; this app produces the numbers on it                                                                                                                                   |
| A portion allowance                          | Withdrawn 2026-08-24 (US-27): food is not handed out in portions. A staff member decides per distribution how much each head gets, from what was donated that week — so the figure named no real quantity |
| Reporting and statistics                     | Not asked for; the data is there when it is                                                                                                                                                               |
| A full field-level change history            | The audit log records the state changes that matter, not every edit                                                                                                                                       |
| Retention or deletion rules                  | Archived records are kept indefinitely; DF has no rule today                                                                                                                                              |
| Contact details, letters, e-mail reminders   | DF does not hold phone numbers or addresses for this purpose                                                                                                                                              |
| Importing the existing Excel sheet           | A migration question, still unanswered — see [chapter 11](11-risks-and-technical-debt.md)                                                                                                                 |
| Multi-user, multi-machine or cloud operation | One machine, by design                                                                                                                                                                                    |

## Quality goals

In priority order. When two of these conflict, the one higher up wins.

| #   | Goal                                   | What it means here                                                                                                                                                                                                | Acceptance criterion                                                                                                                                        |
| --- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Legibility over five-plus years**    | A different developer must be able to read a rule, change it, and be confident about the blast radius. Volume is irrelevant at this scale; comprehension is the constraint.                                       | A new policy value costs a column, a form field and a dictionary entry — not a change to how anything is derived. [Scenario Q1](10-quality-requirements.md) |
| 2   | **Correctness of the hard invariants** | A handful of statements must be impossible to break, not merely unlikely: one non-archived household per customer number, exactly one valid card, one hand-out per household per day, a card number never reused. | Each is enforced by a database constraint as well as by the domain. [Scenario Q2](10-quality-requirements.md)                                               |
| 3   | **Data protection**                    | Sensitive personal data about vulnerable people stays on DF's machine and leaves no trail anywhere else.                                                                                                          | No network listener beyond localhost, no third-party service, no real data in fixtures. [Scenario Q5](10-quality-requirements.md)                           |
| 4   | **Testability**                        | Every rule is reachable without a browser, a database or a wall clock, so the suite is fast enough to be run before every push.                                                                                   | 100 % line, branch, function and statement coverage on `src/domain` and `src/application`, gated in CI. [Scenario Q4](10-quality-requirements.md)           |

Usability at the counter is a real requirement and is treated as one — a single verdict, colour never
carrying meaning alone, type legible across a desk — but it is governed by
[`docs/guideline/ui_styling_guide.md`](../guideline/ui_styling_guide.md) rather than by the architecture. It appears here
as [scenario Q3](10-quality-requirements.md).

## Stakeholders

| Role                  | Who                                                                                                     | What they expect                                                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Counter staff         | DF volunteers, sharing one machine, no accounts                                                         | To type a number and get one unambiguous answer while a queue waits; to be trusted with judgement calls rather than blocked by the software                                                                          |
| DF's manager          | The person who runs the food bank's operation                                                           | To change the quota and the prices themselves, without a developer; to be able to say later what was decided and why                                                                                                 |
| Customers             | A few hundred households, roughly 250 today                                                             | That their entitlement is judged consistently, and that their data does not leave the building                                                                                                                       |
| Maintaining developer | Today one person; in future possibly someone else entirely                                              | To find the rule, change it and know what it touched — the reason quality goal 1 is first                                                                                                                            |
| Autonomous agent runs | The Ralph loop (`scripts/ralph/`), and other AI coding agents besides, write production code unattended | Rules that hold without a reviewer present. This is why the layer boundary is a build failure and not a convention — see [ADR-001](adr/001-layer-the-system-hexagonal-lite-and-enforce-the-boundary-in-the-build.md) |

---

Next: [2. Architecture constraints](02-architecture-constraints.md)
