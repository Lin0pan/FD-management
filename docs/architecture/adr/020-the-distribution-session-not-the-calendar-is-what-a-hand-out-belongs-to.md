# ADR-020 — The distribution session, not the calendar, is what a hand-out belongs to

- **Status:** Accepted
- **Date:** 2026-09-20
- **Deciders:** the maintainer, with DF on how an afternoon actually runs (SPEC-AUSGABE-1.1 and
  their answers F-1…F-16, G-1…G-8 of 19.09.2026)

## Context

Until now the software derived everything about a distribution from the calendar. Two settings — a
week anchor („KW 02/2026 war Rot") and a distribution weekday — answered which group collects
"today", and four rules hung off that answer: the eligibility check at the counter, the group tally,
the no-show count and the correction window („nur am selben Kalendertag").

DF's afternoons do not follow that calendar. When the register is thin they **merge** the two groups
for a while; a Thursday is **cancelled**; an extra distribution is held. Each time, the calendar and
the afternoon that actually happened part company — and the software takes the calendar's side. A
cancelled Thursday shifts the colour of every week after it as far as the code is concerned and
shifts nothing at all as far as DF are concerned; a merged period cannot be expressed without
configuring something; an afternoon that runs past midnight splits one household's collection from
the next household's. The week anchor is also a settings value with no observable effect on the day
it is wrong, which is the kind of value that quietly stops being maintained.

The driver is [quality goal 2 — correctness of the hard invariants](../01-introduction-and-goals.md#quality-goals):
"a household collected once" has to be a fact about a real event, and the calendar day is a proxy
for that event that DF's own process regularly falsifies. Doing nothing keeps the proxy in the four
places a staff member is most likely to meet it, at the counter, with a queue waiting.

## Considered options

- **Make the session the unit: started and ended by hand, and the thing a hand-out belongs to** —
  chosen. The record matches what happened, so no rule has to be told what the calendar got wrong.
- **Keep the calendar and let DF override it** — a cancellation list, a merged-weeks setting, a
  "this Thursday is RED" switch. Rejected: every exception DF have would need modelling in advance,
  and the overrides are a second source of truth about the same afternoon — the spreadsheet failure
  this project exists to remove, one layer down. It also leaves the correction window on midnight.
- **Derive the session from the hand-outs themselves** — treat a run of records as an afternoon,
  with no row of its own. Rejected: an afternoon that served nobody is still an afternoon (it counts
  for the no-show rule and for the next group's proposal), the groups served could only be guessed
  from who happened to come, and "is one running now" would have no answer at all.
- **Close a session automatically** — at midnight, after a timeout, or when the next one starts.
  Rejected by DF explicitly (F-9): a session closing itself is a correction window closing behind a
  staff member's back, and the machine is switched off six days a week, so nothing could run it
  anyway. A forgotten session is made visible on the Start screen instead.
- **Let an ended session be edited** rather than reopened. Rejected: the freeze is what makes an
  ended session a record. Reopening states the same intent as a new, audited act with a reason,
  which is how blocking and archiving already work ([ADR-006](006-record-what-when-and-why-in-the-audit-log-never-who.md)).
- **Delete a session started by mistake.** Rejected — [ADR-010](010-never-hard-delete-a-record-archive-and-let-the-database-refuse.md)
  holds here as everywhere: it is stamped `discardedAt` and filtered out of every read.

## Decision

A **distribution session** is started by a staff member, who names the group or groups it serves
(`RED`, `BLUE` or both), and is ended by a staff member; **the software never ends one itself**. At
most one runs at a time, application-wide, and the database enforces that with a partial unique
index. Every hand-out and every certificate reminder **belongs permanently to exactly one session**,
and every rule that used to ask the calendar now asks that session: a household collects at most once
**per session**, is eligible when its group is among the **running session's** groups, and its
hand-out stays correctable **until the session is ended**. The next session's group is proposed from
the last session that took place, never from the week number.

## Consequences

- **„Einmal pro Kalendertag" becomes „einmal pro Ausgabetermin", and the same-day correction window
  goes.** `@@unique([customerId, sessionId])` on `DistributionRecord` and on `ReminderLog` replaces
  the `dayKey` and `loggedOn` indexes; `canCorrect` is `isRunning`. Two hand-outs to one household on
  one calendar day are now representable and correct — they are two afternoons.
- **A session may run past midnight** without splitting anything, which is what made the Berlin day
  key load-bearing before. `berlinDayKey` survives with one reader left, the no-show count.
- **A merged distribution needs no configuration**: DF start one session serving both groups. Extra
  distributions are ordinary sessions and are not marked (D-5) — DF accepted the two side effects
  knowingly, that the next proposal repeats both groups and that a missed extra distribution counts
  as a no-show.
- **The week anchor and the distribution weekday have no reader left** except the Start screen's
  „nächste Ausgabe" line. They are removed from settings in US-36, along with `weekColour.ts`; until
  then the settings screen holds two values that decide nothing, which is a deliberate
  one-batch-long intermediate state.
- **A session ended by mistake is reopened, not edited.** Only the most recently ended one, only
  while none is running, only with a reason, and the reopening is an audit entry
  (`distribution.session.reopened`). Older sessions stay frozen for good.
- **A session discarded while empty is stamped, not deleted** (ADR-010), and writes **no** audit
  entry at all: DF get no paperwork for a misclick, and the log therefore never shows a session that
  began and never ended. Ending writes the one entry, carrying both instants and the groups (FR-8).
- **Between afternoons the counter offers no lookup.** `lookupCustomer` and `recordAttendance` throw
  `NoDistributionSessionRunning`, and the distribution screen shows the start control and the last
  session's summary instead. That is a screen state that did not exist before and has to be designed
  for every screen reading a session.
- **The cost is a click at each end of the afternoon**, and a forgotten session leaves hand-outs
  correctable longer than DF intend. The mitigation is visibility, not automation: a running session
  is stated on the distribution screen and prominently on the Start screen.
- **Follow-up this creates.** US-35 freezes the household's state as it stood at the session and
  **must follow immediately** — every session ended before that rule exists is lost to the detail
  view for good. US-36 removes the two settings and the week-colour arithmetic; US-37 is the session
  overview and detail view.
- Revisit if DF ever ask for more than one counter working at once, which is where "at most one
  session" stops being a simplification and starts being a limit.

## More information

- [ADR-006 — record what, when and why in the audit log, never who](006-record-what-when-and-why-in-the-audit-log-never-who.md)
  (why ending is audited and by what, and why no actor is named)
- [ADR-010 — never hard-delete a record: archive, and let the database refuse](010-never-hard-delete-a-record-archive-and-let-the-database-refuse.md)
  (why a discarded session is stamped)
- [ADR-017 — the customer number decides the group](017-the-customer-number-decides-the-group.md)
  (a household's group is still the parity of its number; what changed is what that group is
  compared against)
- [Chapter 5 — building block view](../05-building-block-view.md),
  [chapter 6 §Scenario 1](../06-runtime-view.md#scenario-1--serving-a-household-at-the-counter),
  [chapter 8 — domain model and persistence](../08-crosscutting-concepts.md#domain-model-and-persistence),
  [chapter 12 — glossary](../12-glossary.md)
- `tasks/prd-us-34-distribution-session.md`
- `src/domain/distribution/session.ts`, `src/domain/distribution/attendance.ts`,
  `src/application/distribution/{start,discard,end,reopen}-distribution-session.ts`,
  `src/infrastructure/prisma/distribution-session-repository.ts`,
  `src/app/ausgabe/session-controls.tsx`
- Commits `58d7c59`, `c13b796`, `28d7995`, `b16196a`, `75c431d`, `2e657a7`, `cdd42fd`, `31bf847`,
  `51aab38`, `cede502`, `14dab14`
