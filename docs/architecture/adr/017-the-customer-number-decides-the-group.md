# ADR-017 — The customer number decides the group

- **Status:** Accepted
- **Date:** 2026-09-02
- **Deciders:** the maintainer, with DF on how a number is read at the counter

## Context

DF distribute on a two-week cycle: the RED half of the register collects one week, the BLUE half the
next. Which half a household belongs to has never been written down anywhere at DF, because it did
not have to be — **an even customer number is BLUE and an odd one is RED**. It is how the paper
register has always worked and how staff read a card at the counter: the number alone says which week
that household comes.

The software did not know that rule. A number was a slot staff choose
([ADR-008](008-treat-a-customer-number-as-a-reusable-slot-not-an-identity.md), US-24) and may change
([ADR-016](016-a-customer-number-may-be-changed-and-a-card-keeps-the-number-it-was-printed-with.md),
US-30); a group was a separate property, set at registration and edited on the record. So `Customer`
carried both, `Card` carried both, and nothing stopped them contradicting each other — a household on
37 could sit in BLUE, be printed a BLUE card, be walked in the BLUE roster and be refused on the RED
Thursday their number says they belong to. Two stored answers to one question, with nothing to notice
when they disagreed, is precisely the spreadsheet failure this project exists to remove and the thing
[correctness of the hard invariants](../01-introduction-and-goals.md#quality-goals) names as a
quality goal. Doing nothing leaves it in the middle of the register.

## Considered options

- **Derive the group from the number and stop storing it** — chosen. There is one fact, so there is
  nothing to disagree.
- **Keep both columns and validate that they agree** — rejected. It needs a rule on every write path
  (registration, promotion off the waiting list, re-registration, a number change) and a repair story
  for the rows that already disagree, and it still leaves two columns that _can_ hold a contradiction
  between the check and the read.
- **Keep both columns and filter the dropdown so staff cannot pick a contradicting pair** — rejected,
  and it is the thing an implementer reaches for. A filtered list is a convenience, not an invariant:
  it does not survive two staff working at once, a quota lowered while a form is open, or any write
  that does not go through that form.
- **Make the mapping configurable — a setting saying which parity is BLUE** — rejected. DF see no
  reason it would ever flip, and a setting is a second place for the rule to be wrong, which is the
  fault being removed put back one layer down.
- **Keep the group as the fact and derive the number from it** — rejected as backwards. A number is
  what is printed, spoken, typed at the counter and unique in the register; a group is a word for its
  parity.

## Decision

An **even customer number is BLUE and an odd customer number is RED**, and nothing else decides a
group. The group is **derived at every read** by `groupOf(customerNumber)` and stored nowhere:
`Customer.group` and `Card.groupAtIssue` are dropped from the schema. A household's group therefore
follows from the number it holds today, and a card's group from the slot it was printed under. **A
group change is a number change**, made on the record like any other move and printing a new card in
the same transaction (ADR-016). The mapping is not configurable.

## Consequences

- **No validation is needed, because no disagreement is representable.** There is no rule to enforce,
  no repair path and no state where a household's group and number contradict each other — on any
  route, at any moment, for ever. `GroupUnchanged` and the „card out of date because the group
  changed" reason are gone with the act they described.
- **Each group has an implicit capacity of about half the quota, and a group can be full while the
  register is not.** With `N = 240` there are 120 even slots and 120 odd ones, and either half can
  run out on its own. Free slots are therefore shown **per group** wherever capacity is shown — the
  registration form and the record's number control — and a group with nothing free is offered
  unselectable with its reason beside it, never as an empty list. A household refused one group goes
  into the other; the waiting list is still entered only when the whole register is full.
- **Raising the quota by one may add a slot to the wrong parity.** `N` stays one number — there is no
  quota per group — so raising it from 240 to 241 adds an odd slot and does nothing for a full BLUE.
  The settings screen says nothing about this; it is arithmetic DF can see.
- **Lowering the quota can leave the _smaller_ group as the full one**, since a household above the
  new quota keeps its number and is never forced to move (US-31, FR-18).
- **Balancing the two halves stops being a thing staff do and becomes a thing they are steered
  towards.** At registration the recommended group is the smaller one that still has a free number,
  preselected; staff may take the other. No warning is raised when the halves drift apart.
- **Moving a household between weeks costs a card.** It always did, but it is now the only way to do
  it: there is no group control to change on its own, and every move prints a new card number.
- **The week the counter names on a presented card is read off that card's own slot**
  (`groupOnCard`), so a superseded card still says the week it was printed for while the verdict
  turns on the week the household is in today.
- Revisit if DF ever change how the paper register reads a number — which would be a change to
  `groupOf` and nothing else, and is the reason the rule lives in one function.

## More information

- [ADR-007 — derive anything computable rather than storing it](007-derive-anything-computable-rather-than-storing-it.md)
  (the third value that argument has refused, after the household counts and the balance)
- [ADR-008 — treat a customer number as a reusable slot, not an identity](008-treat-a-customer-number-as-a-reusable-slot-not-an-identity.md)
  (the slot now carries which week it collects in)
- [ADR-016 — a customer number may be changed, and a card keeps the number it was printed with](016-a-customer-number-may-be-changed-and-a-card-keeps-the-number-it-was-printed-with.md)
  (a card therefore keeps the group it was printed with)
- [Chapter 8 — domain model and persistence](../08-crosscutting-concepts.md#domain-model-and-persistence),
  [chapter 12 — glossary](../12-glossary.md)
- `tasks/prd-us-31-number-decides-the-group.md`
- `src/domain/customer/group.ts` (`groupOf`, `inGroup`, `countByGroup`, `suggestGroup`),
  `src/application/customers/register-customer.ts`,
  `src/application/customers/list-number-choices.ts`,
  `src/app/kunden/neu/registration-form.tsx`, `src/app/kunden/[id]/number-control.tsx`
- Commits `d3b5452`, `c8e5c7c`, `af6101c`, `d64ade7`, `2712d0b`, `4b85653`, `322c561`, `731f786`
