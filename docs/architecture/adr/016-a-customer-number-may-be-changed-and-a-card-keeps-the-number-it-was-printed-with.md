# ADR-016 — A customer number may be changed, and a card keeps the number it was printed with

- **Status:** Accepted
- **Date:** 2026-09-01
- **Deciders:** the maintainer, with DF from their testing of the register screens

## Context

Since [ADR-008](008-treat-a-customer-number-as-a-reusable-slot-not-an-identity.md) a customer number
has been a slot in `1..quotaN` that changes hands when a household is archived, and since US-24 staff
**choose** it at registration from the free ones. After that it was fixed for good, and the record
said so in as many words: „Die Kundennummer lässt sich nicht ändern."

DF's testing showed that is too rigid. A family returning after a year wants the number their
neighbours know them by; a block of numbers is to be kept together; a number was typed in wrongly and
noticed a week later. None of those is a fault the software can detect, and none of them needs its
opinion — they are exactly the kind of administrative decision about the register that DF already
take when they pick a number at registration, only at a later moment.

What made the change more than an `UPDATE` is the card. The number is printed on the card the
household carries, and a card number `<number>k<index>` must name one physical card **for good**
(ADR-008, US-25). So a move has to answer two questions at once: what the household carries
afterwards, and what happens to the cards already printed under the old number.

## Considered options

- **Move the household and issue a new card in one transaction; every card keeps its own slot** —
  chosen.
- **Move the number and leave the card alone** — rejected. Validity is _being the highest index on
  the slot_, so the household would hold a card on a slot they no longer occupy: no query in the
  system could tell that from an ordinary superseded card, and the counter would refuse them with no
  way for staff to see why. It also puts the reprint in a second step somebody has to remember, and
  can forget.
- **Move the number and re-label the household's existing cards under it** — rejected, and it is the
  thing an implementer will reach for. The cards left on the vacated slot are what makes that slot
  **safe to hand out again**: the next household to take it asks the slot for its highest index and
  is printed the one above it. Re-labelled away, the slot forgets its run and prints a number that is
  already in the world on somebody's kitchen table.
- **Keep a history of the numbers a household has held** — rejected. DF never asked for one, no
  screen asks the question, and a list nobody reads is a second place for the truth to live.
- **Let two households swap numbers in one step** — rejected. Neither number is free while the other
  holds it; swapping is two moves through a free number, and nothing is built to make that easier.

## Decision

A staff member may move an **active or blocked** household from the number it holds to any number
that is free, from a section on the customer record beside the group control, as often as needed.
The move and the new card are **one transaction**: the number is written and the card is inserted
together, so there is no instant at which a household holds one number while carrying a card printed
under another. The new card's index continues the **new** slot's whole run, including cards printed
for households that have since been archived, and it records `CUSTOMER_NUMBER_CHANGED` as the reason
it was issued.

Every card the household was ever issued **keeps the number it was actually printed with**. Nothing
is re-labelled, and no history of past numbers is built.

## Consequences

- **`Card.customerNumber` becomes a snapshot, and it is read as the card's number** — which
  [ADR-007](007-derive-anything-computable-rather-than-storing-it.md) ruled out when the column was a
  key and nothing else. It is now both: the key `@@unique([customerNumber, index])` needs, and the
  record of the slot the card was printed under. ADR-007's table row is rewritten to say so; the
  principle it states is unchanged.
- **The vacated slot's run is what keeps its numbers from being printed twice.** Its cards stay where
  they are, so the next household on the slot is printed the index above them — `5k5` after a
  household that left carrying `5k4`. Deleting or re-labelling those rows breaks the one invariant a
  card number rests on.
- **The count of cards a household has been issued stays a count of its own cards.** A household that
  moves from `5k4` onto a slot whose last card was `23k5` carries `23k6` and has been issued five
  cards, not six: the jump in the index is the slot's history, not theirs.
- **The card history reveals past numbers as a side effect, and is left correct rather than
  obscured.** A reader of `5k4` on a household now holding 23 can see they were once on 5. Keeping no
  number history was never a requirement in its own right, and it is not worth distorting a correct
  card history to achieve. A card number from the history is not a way back to the household either:
  typing `5k4` at the counter resolves to whoever holds slot 5 **today**, because `lookupCustomer`
  asks the slot and not the card.
- **The old number is free immediately** — the partial unique index over non-archived rows is
  satisfied the moment the column is written, and every free-slot count DF sees is derived, so
  nothing has to be invalidated.
- **The card in the household's hand becomes invalid immediately**, like every other reissue, which
  is why saving asks for a confirmation naming the chosen number and the card number it will print.
  There is no undo: moving back would consume yet another card number.
- **The database settles a lost race, as it does at registration.** A number taken by another
  registration between reading the choices and saving surfaces as a domain refusal on screen, with
  nothing written — no number change, no card, no audit entry.
- **Two audit entries, not one:** the change names the instant and the numbers moved from and to, and
  the card's issue writes its own. `AuditEntry` has no room for a nested event, and the two facts are
  read by different people at different times.
- **No schema change and no migration.** `Customer.customerNumber` was always an updatable column and
  `Card.reason` is a string the domain validates on the way in and out.
- Revisit if DF ever ask to see the numbers a household used to hold — that is the point at which the
  card history stops being enough and a real history has to be argued for.

## More information

- [ADR-007 — derive anything computable rather than storing it](007-derive-anything-computable-rather-than-storing-it.md)
  (`Card.customerNumber` is the exception this decision rewrote)
- [ADR-008 — treat a customer number as a reusable slot, not an identity](008-treat-a-customer-number-as-a-reusable-slot-not-an-identity.md)
- [Chapter 8 — domain model and persistence](../08-crosscutting-concepts.md#domain-model-and-persistence)
- `tasks/prd-us-30-change-customer-number.md`
- `src/domain/customer/customerNumber.ts` (`choosableNumbers`, `assertChoosableNumber`),
  `src/domain/card/cardNumber.ts` (`nextCardIndexOnMove`),
  `src/application/customers/change-customer-number.ts`,
  `src/application/customers/list-number-choices.ts`,
  `src/app/kunden/[id]/number-control.tsx`
- Commits `99505c7`, `6a13537`, `e5114fb`, `71db5ff`, `b8f2ec5`, `78f46cd`, `d5de969`
