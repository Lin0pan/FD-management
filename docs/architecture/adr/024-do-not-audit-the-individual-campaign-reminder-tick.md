# ADR-024 — Do not audit the individual campaign reminder tick

- **Status:** Accepted
- **Date:** 2026-10-11
- **Deciders:** the maintainer, with DF on what a campaign reminder is for (their requirement
  „Aktionserinnerung", refined 11.10.2026, decisions 5 and 12)

## Context

Every state change writes an audit entry
([ADR-006](006-record-what-when-and-why-in-the-audit-log-never-who.md)): with no login, the log is the
only accountability the system has, and skipping an entry is treated as a defect. One deliberate gap
stands beside that rule — starting a distribution session and discarding an empty one write nothing
([ADR-020](020-the-distribution-session-not-the-calendar-is-what-a-hand-out-belongs-to.md)).

A campaign reminder (US-40) has two kinds of change. Switching it on, renaming it and switching it off
happen a handful of times a year and decide what every household is asked about. Ticking a household
off happens once per household per campaign — about 240 times, mostly at the counter with a queue
waiting — and is taken back with a second click, without a reason. Whether the tick is a state change
in ADR-006's sense had to be settled, because a reader applying the rule as written would add the
entry, and DF asked in refinement that it not be there (decision 12).

## Considered options

- **Audit switching on, renaming and switching off; not the individual tick** — chosen. The entries
  that remain are the ones that change what the whole register is asked about.
- **Audit every tick and untick** — rejected. A tick changes no entitlement, no money and no record
  DF are accountable for: it is a note to self that a bag was handed over, it blocks nothing and
  prices nothing. About 240 entries per campaign, plus every correction, would bury the entries that
  matter — an archive, a block, a policy edit — in a log nobody would then read. The log would also
  claim a precision it does not have: it records no _who_, and a tick has no _why_.
- **Audit the ticks in bulk** — one entry per afternoon, or a count on switch-off. The second half
  is taken: the switch-off entry names the number of ticks deleted. An entry per afternoon is
  rejected, because a tick belongs to no session and is set just as often in the customer record
  between afternoons.

## Decision

Switching a campaign reminder on (`campaignReminder.started`), renaming it
(`campaignReminder.renamed`) and switching it off (`campaignReminder.ended`, naming the ticks
deleted) are audited. **Ticking a household off and taking the tick back write no audit entry.** This
is the second deliberate gap in the audit rule, beside ADR-020's.

## Consequences

- **The log stays readable during a campaign.** It gains three entries per campaign at most, plus
  any renames, and nothing at the counter.
- **Who was ticked off when is not recoverable.** No audit entry, no timestamp on the tick, and the
  ticks themselves are deleted on switch-off
  ([ADR-023](023-delete-a-campaign-reminder-s-ticks-when-it-is-switched-off.md)). A tick set by
  mistake is corrected by unticking it and leaves no trace — which is what DF asked for.
- **A wrongly unticked household is indistinguishable from one never ticked.** The cost is at most
  a second bag handed over; DF accepted it as the price of a box that is quick to click.
- **The rule needs reading with its exceptions.** „Every state change is audited" is now true with
  two named gaps, and both are listed where the rule is stated — `CLAUDE.md` and chapter 8.
- Revisit if a tick ever acquires a consequence — if it starts to block a hand-out, carry money or
  decide an entitlement. At that point it is a record DF are accountable for, and is audited.

## More information

- [ADR-006 — record what, when and why in the audit log, never who](006-record-what-when-and-why-in-the-audit-log-never-who.md)
  (the rule this is a gap in)
- [ADR-020 — the distribution session is what a hand-out belongs to](020-the-distribution-session-not-the-calendar-is-what-a-hand-out-belongs-to.md)
  (the first gap)
- [ADR-023 — delete a campaign reminder's ticks when it is switched off](023-delete-a-campaign-reminder-s-ticks-when-it-is-switched-off.md)
- [Chapter 8 — audit](../08-crosscutting-concepts.md#audit)
- `tasks/prd-us-40-campaign-reminder.md`
- `src/application/campaign/set-campaign-reminder-received.ts`,
  `src/application/campaign/{start,rename,end}-campaign-reminder.ts`
- Commits `28627f6`, `f188d3d`
