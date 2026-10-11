# ADR-023 — Delete a campaign reminder's ticks when it is switched off

- **Status:** Accepted
- **Date:** 2026-10-11
- **Deciders:** the maintainer, with DF on what a campaign reminder is for (their requirement
  „Aktionserinnerung", refined 11.10.2026, decisions 5, 12 and 13)

## Context

DF occasionally run a campaign — a Christmas bag every household gets once, on top of the regular
hand-out — and need to know, per household, whether it has had it yet. US-40 gives them one freely
named checkbox per household, switched on and off in the settings. While it is on, a row in
`CampaignReminderTick` means „received" and no row means „not yet received"; when DF switch it off,
the checkbox disappears everywhere and switching on again starts every household at „not yet
received".

That leaves the question of what happens to the ticks of a reminder that has been switched off, and
the project's standing answer is that nothing is deleted
([ADR-010](010-never-hard-delete-a-record-archive-and-let-the-database-refuse.md)). That rule exists
to protect customer data and the records DF are accountable for. Three exceptions stand beside it,
each on an argument of its own kind: member rows (no history of past compositions is kept),
`CertificateType` rows (nothing references one —
[ADR-019](019-keep-the-certificate-type-list-out-of-the-versioned-settings-history.md)) and
`HandoutReceipt` rows (the freeze itself, re-taken whole —
[ADR-021](021-capture-the-household-s-state-when-a-distribution-session-is-ended.md)). A tick is a
fourth case, and without this record the next reader either deletes nothing and keeps a history DF
explicitly declined, or reads the delete as a breach of ADR-010 and „fixes" it.

DF were asked and answered plainly: a tick is a note to self, not customer data, and when it was set
is not kept (decision 13, requirement point 8). The driver is
[legibility over five-plus years](../01-introduction-and-goals.md#quality-goals) — a table of
ticks from every campaign there ever was, read by nothing, is a question a future maintainer has to
answer without anyone left to ask.

## Considered options

- **Delete every tick of the reminder in the same transaction that stamps its `endedAt`** — chosen.
  The table holds the current campaign and nothing else, which is all anything reads.
- **Keep the ticks under the ended reminder** — rejected. It would be history nobody asked for: DF
  said in so many words that who had a Christmas bag last year is not something they want kept, no
  screen would read it, and a store of per-household facts nobody reads is the kind of data that is
  later found and assumed to mean something. Keeping it would also make a rule out of an accident:
  ADR-010 is about records, and this is not one.
- **A boolean column on `Customer`** — rejected. Switching off would then be an `UPDATE` of every
  household rather than a delete, which is the same loss of information spelt differently; renaming
  the reminder would have nowhere to hang; and the „at most one" rule, the „who is ticked under
  _this_ reminder" question and a stale screen ticking under a reminder that has meanwhile been
  replaced all lose the reminder id they are checked against.

## Decision

Switching a campaign reminder off **deletes every `CampaignReminderTick` of that reminder**, in the
same transaction that stamps its `endedAt`, and unticking a household deletes its one row. This is
the **fourth** deliberate exception to ADR-010, on the argument that a tick is a note to self and not
customer data, and that nothing points at it. The `CampaignReminder` row itself is **never** deleted:
an ended reminder keeps its name, `startedAt` and `endedAt`.

## Consequences

- **The table holds one campaign at most.** „Has this household received it" is the presence of one
  row, switching on writes nothing per household, and a household registered mid-campaign is „not yet
  received" without anything being written for it.
- **What a past campaign reached is not recoverable from the ticks.** The audit entry written on
  switch-off names the reminder and the number of ticks deleted (`campaignReminder.ended`), and that is
  all that survives of it — DF are told the number in the confirmation before they agree.
- **Switching off is a one-way door**, and the settings say so: the confirmation names the count of
  ticks that will be lost. Switching the same name on again is a new reminder starting from zero.
- **The database still refuses every other delete.** Both of the tick's relations are
  `onDelete: Restrict` out loud; the adapter deletes the ticks before it ends the reminder, and
  `src/infrastructure/prisma/schema.test.ts` keeps guarding every cascade. A household cannot be
  deleted from under a tick, and could not be anyway.
- **An ended reminder's row outlives its ticks.** It is read by nothing today — the port's read type
  does not even carry `endedAt` — and is kept because ADR-010 holds for it: it is the thing the audit
  entries name.
- Revisit if DF ever ask what a past campaign reached household by household, or ask for two
  campaigns at once. Either makes the ticks a record of something, and a record is kept.

## More information

- [ADR-010 — never hard-delete a record](010-never-hard-delete-a-record-archive-and-let-the-database-refuse.md)
  (amended by this decision: a fourth exception)
- [ADR-024 — do not audit the individual campaign reminder tick](024-do-not-audit-the-individual-campaign-reminder-tick.md)
  (the other half of „a note to self")
- [Chapter 5 — inside each layer](../05-building-block-view.md#level-2--inside-each-layer),
  [chapter 8 — domain model and persistence](../08-crosscutting-concepts.md#domain-model-and-persistence),
  [chapter 12 — glossary](../12-glossary.md)
- `tasks/prd-us-40-campaign-reminder.md`
- `prisma/schema.prisma` (`CampaignReminder`, `CampaignReminderTick`),
  `src/application/campaign/end-campaign-reminder.ts`,
  `src/infrastructure/prisma/campaign-reminder-repository.ts`
- Commits `7eee936`, `28627f6`, `7658c57`
