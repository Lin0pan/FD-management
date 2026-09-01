# PRD: Changing a customer's customer number (US-30)

> **Extends US-24** (staff choose the number at registration), **US-25** (a card number is never
> handed out twice), **US-16** (the customer record) and **US-09** (a reissue invalidates the card in
> the household's pocket). The choice US-24 gave staff at registration is extended to a household
> that is already on the register.
>
> Source: DF's requirement, `local_only/changing-customer-numbers/refined-description.md` (the first
> draft is `…/description.md`).
>
> **No schema change and no migration.** Every column this needs already exists — see
> §Technical Considerations. What does change is a written architectural claim: `Card.customerNumber`
> stops snapshotting nothing, and ADR-016 records that.

## Introduction

A customer number is the slot a household occupies in DF's register — 1 up to `quotaN` — and it is
the number printed on the card the household carries. Since US-24 staff **choose** it at
registration, from the numbers that are free. After that it is decided for good: the register offers
no way to change it, and the record says so in as many words — „Die Kundennummer lässt sich nicht
ändern." (`src/i18n/de.ts`), with the same claim written into `ports.ts`, `schema.prisma`, ADR-007
and the root `CLAUDE.md`.

Testing showed that is too rigid. DF have reasons the software cannot see for wanting a particular
household on a particular number:

- a returning family going back to the number their neighbours know them by,
- a block of numbers DF want kept together,
- a number typed in wrongly at registration and noticed a week later.

None of these is a fault the software can detect, and none of them needs the software's opinion.
**This PRD lets a staff member move an existing household from the number it holds to any other
number that is free** — and, because the number is printed on a physical card, issues the new card in
the same act so that nobody has to remember a second step and nobody can forget one.

### The move, worked

A household on number 5, carrying card `5k4`. Slot 23 is free; the last card ever printed on 23 was
`23k5`, by a household that has since been archived and walked away with it.

| Before                                | After                                                        |
| ------------------------------------- | ------------------------------------------------------------ |
| `Customer.customerNumber` = 5         | 23                                                           |
| Card in the household's pocket: `5k4` | `23k6` — printed on the spot, `5k4` invalid                  |
| Slot 5                                | free; the next registration may take it, and starts at `5k5` |
| Slot 23                               | held; its run has reached 6                                  |
| Cards on the record                   | `23k6`, then `5k4`, `5k3`, `5k2`, `5k1` — none re-labelled   |
| Cards issued to this household        | 5, not 6 — the jump is the slot's history, not theirs        |
| Everything else on the record         | untouched                                                    |

`23k6` and not `23k1`, because `23k5` may still be in somebody's pocket and a card number names one
physical card for good (US-25, ADR-007). This is not a new rule — `nextCardIndex` and
`CardRepository.highestIndexForNumber` already count the **slot's** whole run, archived holders
included — and the number change is simply a fourth caller of it.

### The vacated number is safe because the cards left on it are

The four cards `5k1…5k4` stay on slot 5 with the number they were printed under. That is what makes
5 safe to hand out again: the next household to register on 5 asks the slot for its highest index,
gets 4, and is printed `5k5`. Were those cards re-labelled under 23 when the household moved, slot 5
would look untouched, the next household would be printed a `5k1` that already exists out in the
world, and the counter would answer „Ausgabe frei" to a dead card.

So a card is never re-labelled — and it also must not be, on its own terms: `5k3` was printed as
`5k3`, it is a real piece of card, and displaying it as `23k3` would name a card that either never
existed or belongs to somebody else.

### The one architectural claim this reverses

`Card.customerNumber` is stored today, and ADR-007 justifies it as **a key the constraint needs**,
explicitly not a snapshot:

> It snapshots nothing — a customer number is fixed at registration — and is never read as the card's
> number.

Both halves of that sentence stop being true here. A card printed on slot 5 keeps 5 while its
household moves to 23, so the column genuinely becomes a snapshot of what was printed — the fourth of
its kind beside `grownUpsAtIssue`, `childrenAtIssue` and `groupAtIssue`. And because the household's
own number no longer answers "what number is on this card", the column has to be **read** as the
card's number, which is exactly what ADR-007 forbade.

That is a deliberate, hard-to-reverse reversal of a written decision, so it gets **ADR-016**, and
every place that repeats the old claim is corrected in the same batch (US-30.9). It does not weaken
ADR-008: a customer number is _more_ obviously a slot rather than an identity now that it can change
hands without the household changing.

### No number history is built, and the card history reveals one anyway

Nothing in the software resolves a household to "the numbers it used to hold": there is no such list,
no such report, and no screen asks the question. But the card history shows every card under the
number it was printed with, so a reader of `5k4` on a household now holding 23 can see they were once
on 5. **That is accepted.** Keeping no number history was never a requirement in its own right; it is
simply nothing DF asked for, and it is not worth distorting a correct card history to achieve.

A card number in the history is not a way back to the household, either. Typing `5k4` at the counter
resolves to whoever holds slot 5 **today** — nobody, or the household that has since taken it. This
needs no code: `lookupCustomer` already resolves a query through `findByCustomerNumber`, which asks
the slot and not the card.

## Goals

- **A number can be corrected.** The choice US-24 gave staff at registration is available for the
  life of the household, with no restriction on timing and no limit on how often.
- **The physical card cannot fall out of step.** The move and the new card are one act and one
  transaction: there is no state in which a household holds 23 and carries a card printed `5k4`.
- **A card number still names one physical card for good.** The vacated slot keeps its run, the new
  card continues the new slot's run, and no card is ever re-labelled.
- **Nothing else about the household moves.** A number is a slot, not an identity — the record, the
  history and the balance all hang off the surrogate id (ADR-008).
- **Staff confirm what they are about to print.** The number _and_ the card number are named before
  the write, because the card is copied by hand and the move cannot be taken back.
- **A refusal writes nothing at all** and leaves the staff member on the screen with an up-to-date
  list of numbers.
- **The record stops claiming the opposite**, in the German text staff read and in every architecture
  document that repeats it.

## User Stories

### US-30.1: Which numbers a household may be moved to (domain)

**Description:** As a developer, I need one pure rule that says which numbers this household may be
moved to and whether a chosen one may still be written, so no screen and no use case decides it.

**Acceptance Criteria:**

- [ ] In `src/domain/customer/customerNumber.ts`, beside `freeNumbers` and `assertFreeNumber` —
      the same file, because this is the same question asked from the other end of a household's life
- [ ] `choosableNumbers(currentNumber, takenNumbers, quotaN): ReadonlyArray<number>` — every number
      in `1..quotaN` no **active** household holds, **plus `currentNumber` itself**, ascending and
      without duplicates. Built on `freeNumbers` rather than beside it, so the pool the registration
      form offers and the pool this control offers can never come apart
- [ ] `currentNumber` is added back because `takenNumbers` contains it: the household is active and
      holds its own slot. The doc comment says so, since a reader who misses it will "fix" the
      duplicate-looking merge
- [ ] A `currentNumber` **above `quotaN`** — which a lowered quota (US-14) produces without anybody
      doing anything wrong — is still in the list, and sorts last. The household may keep it and may
      move down into the quota; it is never forced to move
- [ ] `assertChoosableNumber(requested, currentNumber, takenNumbers, quotaN): number` returns
      `requested` unchanged when it may be written, and otherwise throws — **in this order**:
      **(1)** `CustomerNumberUnchanged` when `requested === currentNumber`. First, so a household
      parked above a lowered quota that saves its own number is told it already has that number
      rather than that the number is out of range. **(2)** `CustomerNumberOutOfRange` when
      `requested` is not a whole number in `1..quotaN`. **(3)** `CustomerNumberTaken` when an active
      household holds it — the same error the partial unique index raises, for the reason
      `assertFreeNumber` reuses it: it is the same fact found earlier, and the index stays the final
      authority
- [ ] Because the unchanged check comes first, the occupancy check needs no "except my own number"
      special case: any `requested` still in play is somebody else's. The doc comment states that
- [ ] New `CustomerNumberUnchanged` in `src/domain/errors.ts` carrying the number, with its code in
      `DomainErrorCode` and tiered **`refusal`** in `src/app/notice-tier.ts` — modelled on
      `GroupUnchanged`, and refused for the same reason: a no-op is not idempotent here. It would
      write an audit entry and consume a card number, and a staff member who pressed the button would
      be told nothing happened
- [ ] Strict TDD, invariant-breaking test first, one named test per rule:
      `offers every free number and the household's own`,
      `offers the household's own number first when it is the lowest`,
      `offers a current number above the quota, last`,
      `offers only the current number when the register is otherwise full`,
      `never offers a number another active household holds`,
      `refuses the number the household already holds`,
      `refuses the household's own number even when it is above the quota`,
      `refuses a number outside the quota`, `refuses a number an active household holds`,
      `accepts a number an archived household once held`, `accepts the lowest free number`
- [ ] Pure: no I/O, no clock, no import from Next.js, React or Prisma
- [ ] `npm run lint`, `npm run typecheck` and `npm run test:coverage` pass; `domain/` stays at 100%

### US-30.2: A card keeps the number it was printed under (domain)

**Description:** As a developer, I need a card to carry its own slot, so the history can show each
card under the number actually printed on it rather than under the household's number today.

**Acceptance Criteria:**

- [ ] `IssuedCard` in `src/domain/card/card.ts` gains `readonly customerNumber: number` — the slot
      this card was **printed under**
- [ ] Its doc comment is written as the fourth `AtIssue`-style snapshot, in the voice of the three
      that are there: it is a fact about a physical object, never the household's number (that is
      `Customer.customerNumber`), and it is never updated — a card printed under another number is a
      different card, and issuing one is how the change is recorded. It also states the second job the
      column does, which the other three do not have: it is the key
      `@@unique([customerNumber, index])` rests on, so the run of a **vacated** slot survives the
      household that left it and no card number is printed twice (US-25)
- [ ] `NewCard = Omit<IssuedCard, "customerNumber">` — the shape a _writer_ passes. The slot stays
      the adapter's to read off the customer row inside the write's own transaction
      (`card-repository.ts`: "a caller that could pass it is a caller that could pass the wrong one"),
      and that argument is unchanged by this PRD. `CardRepository.issue` takes a `NewCard` and returns
      an `IssuedCard`
- [ ] New card issue reason `CUSTOMER_NUMBER_CHANGED` in `CardIssueReason` and in
      `CARD_ISSUE_REASONS`, so `parseCardIssueReason` reads it back. A reason of its own beside
      `FIRST_ISSUE`, `LOST` and `STALE_COUNTS` — filed as `OTHER` the card view and the audit log
      would say a damaged card was replaced, which is not what happened
- [ ] `ReissueReason` in `reissue-card.ts` picks the new reason up for free (it is
      `Exclude<CardIssueReason, "FIRST_ISSUE">`). A test asserts that the **loss** count does not:
      `issueCounts` counts `LOST` alone, so a number change never reads as a lost card
- [ ] `src/i18n/de.ts` `customers.cardReasons` gains the German for it: „Kundennummer geändert"
- [ ] Tests written first: `reads the new reason back`,
      `refuses a reason word that is not one of the five`,
      `a card knows the slot it was printed under`
- [ ] `domain/` stays at 100%; typecheck and lint pass

### US-30.3: Moving a household to another number (application + ports)

**Description:** As a staff member, I want to move a household to a free number and have the new card
issued in the same act, so the record and the card in the household's pocket can never disagree.

**Acceptance Criteria:**

- [ ] New use case `src/application/customers/change-customer-number.ts` exporting
      `changeCustomerNumber(deps, { customerId, customerNumber })`
- [ ] It reads the customer, the settings in force (`readCurrentSettings` — the quota may have been
      lowered while the screen was open) and `customers.takenActiveNumbers()`, then calls
      `assertChoosableNumber`. `CustomerNotFound` for an unknown id and `CustomerArchived` for a
      household that has left the register — archived records are read-only, they hold no slot and
      they receive no cards. A **blocked** household is moved like any other: a block pauses them at
      the counter and does not freeze their record (the same division `changeGroup` and `issueCard`
      already make)
- [ ] One clock read for the whole act, as `issueCard` does: the card's `issuedAt` and both audit
      entries are the same event
- [ ] The card is derived here, not in the adapter: `index` from
      `nextCardIndex(await cards.highestIndexForNumber(newNumber))` — **the new slot's run**, not the
      household's card index — `countsAtIssue` from `composition(members, now)` and `groupAtIssue`
      from `customer.group`, so the new card prints **today's** counts and today's group
- [ ] New port method on `CustomerRepository`:
      `changeCustomerNumber(id: number, customerNumber: number, card: NewCard): Promise<IssuedCard>`,
      documented as **one transaction**: the number moves and the card is inserted together or
      neither happens. The precedent is `create`, which writes the customer, the household, the
      certificate and the first card as one. Two writes would have a window in which a household
      holds 23 and carries `5k4`, with nothing in the system able to notice
- [ ] The audit trail is **two entries**, because two things happened and each is read on its own.
      The number change is `what: "customer.numberChanged"`, `changedFields: ["customerNumber"]`,
      the instant, and `why: "customerNumber=5→23"` — the numbers ride in `why` as the one
      machine-written value the port already documents, exactly as a logged reminder writes
      `reminderCount=2` there: no human reason is asked for, and the entry has to tell its own
      story. **No reason is collected from staff** — the two numbers are the whole of what happened,
      and staff's reasons for wanting a particular number are their own (ADR-006). The card's own
      `customer.card.issued` with `why: "CUSTOMER_NUMBER_CHANGED"` is written beside it, exactly as
      `issueCard` writes it
- [ ] It returns the `IssuedCard` the store wrote, so the caller's receipt names the number the
      register actually holds rather than one the screen worked out
- [ ] **Nothing else is touched.** A named test asserts that identity, names, address, household
      members, certificate, `reminderCount`, notes, group, status, block reason, hand-out history and
      the derived balance are all as they were
- [ ] TDD against hand-written fakes (never a mock library), one named test per rule:
      `moves an active household to a free number`, `moves a blocked household`,
      `refuses an archived household`, `refuses an unknown customer`,
      `refuses the number the household already holds`, `refuses a number an active household holds`,
      `refuses a number above the quota in force`, `issues the next card on the new slot`,
      `continues the run of a slot an archived household left`,
      `issues k1 on a slot nobody has ever held`,
      `prints today's counts and today's group on the new card`,
      `records the reason as a number change`, `writes the two numbers into the audit entry`,
      `writes nothing when the number is refused` (the fake asserts no write of any kind reached it),
      `leaves the rest of the record alone`, `releases the old number` (a following
      `takenActiveNumbers` no longer contains it)
- [ ] `application/` stays at 100%; typecheck and lint pass

### US-30.4: What the record offers, and what each choice would print (application)

**Description:** As a staff member, I want the record to offer me every number I may move this
household to, each with the card number it would print, so the confirmation can name the card before
anything is written.

**Acceptance Criteria:**

- [ ] New use case `src/application/customers/list-number-choices.ts` exporting
      `listNumberChoices(deps, customer): Promise<ReadonlyArray<NumberChoice>>` with
      `NumberChoice = { readonly number: number; readonly nextCardNumber: string }` —
      e.g. `{ number: 23, nextCardNumber: "23k6" }`
- [ ] It reads the quota in force, `takenActiveNumbers()` and the highest index on every slot, calls
      `choosableNumbers`, and formats each choice's card number with `nextCardIndex` +
      `formatCardNumber`. **One reading of the register per call**, so the number offered and the card
      number beside it cannot come from different moments
- [ ] New port method `CardRepository.highestIndexByNumber(): Promise<ReadonlyMap<number, number>>` —
      the highest index ever issued on **each** customer number that has ever had a card, in one
      aggregate query. It is the plural of `highestIndexForNumber` and exists for the same reason
      `issueCounts` is an aggregate: the alternative is ~240 round trips to render one dropdown. A
      slot absent from the map has never had a card and answers `0` through `nextCardIndex`, which is
      what makes a fresh slot's first card `k1` with no special case
- [ ] An **archived** household gets an empty list and neither query is run: they hold no slot, so
      there is nothing to offer. That is a statement about meaning, not a saving
- [ ] `readCustomer` (`read-customer.ts`) returns `numberChoices: ReadonlyArray<NumberChoice>` from
      it, so the record renders the control from one read model, as it already does for
      `nextCardNumber` and `groupCounts`. `CustomerCardView`'s doc comment says what it is for and
      that the household's own number is always among the choices — which is what the control opens on
- [ ] The same use case is what a **refusal** re-reads, so the form can go on offering a list that is
      up to date after losing a race — the shape `freshPoolAfterRace` established for registration
      (US-24), and the reason it exists: without it the form goes on offering a number that provably
      cannot be saved
- [ ] TDD against fakes: `offers the household's own number and every free one`,
      `names the next card number on each slot`, `names k1 on a slot nobody has ever held`,
      `continues the run of a slot an archived household left`,
      `offers only the household's own number when the register is otherwise full`,
      `offers nothing for an archived household`, `reads the register once`
- [ ] `application/` stays at 100%; typecheck and lint pass

### US-30.5: Every card under the number it was printed with (application)

**Description:** As a staff member, I want the card history to show each card under its own number, so
I am never shown a card number that names a different card or none at all.

**Acceptance Criteria:**

- [ ] `read-card.ts`: `numberOf(card)` becomes `formatCardNumber(card.customerNumber, card.index)` —
      the card's own slot, not `customer.customerNumber`. This is the line that would otherwise
      re-label `5k4` as `23k4`, and its comment says so
- [ ] The current card is rendered from the card's own number too, even though the two agree: the
      household's current card is always the highest on their current slot, because a number change
      issues the new card in the same transaction as the move. A named test states that invariant
      rather than leaving it implicit — `the card the household holds is on the number they hold`
- [ ] `read-customer.ts`: `cardNumber` likewise comes from the current card's own slot.
      `nextCardNumber` — what a **reissue** would print — stays derived from the household's _current_
      number, because that is the slot the next card would be printed on
- [ ] `cardsIssued` is unchanged and stays a count of the household's own card **rows**
      (`issueCounts`), so a household that moved onto a slot at index 6 is reported as having been
      through 5 cards, not 6. A named test says so — the comment in `card-repository.ts` already
      makes this argument for the registration case, and a number change is the second way to reach it
- [ ] `cards-due-for-reissue.ts` needs no change and gets a test proving it: a household moved to
      another number is **not** on the list, because its new card prints today's counts and today's
      group; and a household that _was_ on the list for stale counts or a group change **leaves** it
      as a side effect of the move
- [ ] `lookup-customer.ts` needs no change and gets a test proving it: after a move from 5 to 23,
      typing `5` at the counter answers exactly as any unassigned number does, `5k4` resolves to
      whoever holds slot 5 today, and `23` and `23k6` find the household. Nothing is said about the
      number having been released
- [ ] `application/` stays at 100%; typecheck and lint pass

### US-30.6: The store moves the number and the card together (infrastructure)

**Description:** As a developer, I need the write to be one transaction and the read to carry the
card's slot, so no failure and no query can produce a card under the wrong number.

**Acceptance Criteria:**

- [ ] `PrismaCustomerRepository.changeCustomerNumber(id, customerNumber, card)` in **one
      `$transaction`**: update `Customer.customerNumber`, then insert the card reading the slot off
      the just-updated row exactly as `PrismaCardRepository.issue` does — so `Card.customerNumber` is
      the **new** number and no caller can pass a different one
- [ ] A lost race is the database's answer, not the use case's: the partial unique index on
      `Customer` refuses a number an active household took first and is translated to
      `CustomerNumberTaken(number)`; a card index taken on the slot in the meantime is translated to
      `CardNumberTaken(slot, index)` by the same collision reading `issue` already does. Both roll the
      transaction back whole — nothing written
- [ ] `PrismaCardRepository.toCard` selects and returns `customerNumber`, so every `IssuedCard` that
      comes out of the store carries the slot it was printed under. `currentCard`, `listCards` and
      `issue` all inherit it
- [ ] `PrismaCardRepository.highestIndexByNumber()` — one
      `groupBy({ by: ["customerNumber"], _max: { index } })`, served by the leading column of
      `@@unique([customerNumber, index])`, returned as a `Map`. No `where`: archived holders count,
      for the reason `highestIndexForNumber` states
- [ ] **No migration and no schema change.** Every column already exists; `reason` is a string column
      the domain validates, so the fifth reason word needs nothing from the database. The
      `schema.prisma` doc comment on `Card.customerNumber` is corrected instead (US-30.9) —
      the column's _justification_ changed, not the column
- [ ] Thin integration tests against a throwaway SQLite file, using `clearRegister` from
      `test-support.ts`: `moves the number and writes the card in one transaction`,
      `refuses a number an active customer holds and writes neither`,
      `refuses a card index already printed on the slot and writes neither`,
      `frees the old number for a later registration`,
      `reads a card back with the slot it was printed under`,
      `reports the highest index on every slot in one query`,
      `reports nothing for a slot that has never had a card`
- [ ] `npm run db:reset` is **not** needed and is not part of this story
- [ ] Typecheck and lint pass

### US-30.7: The number control on the record (presentation)

**Description:** As a staff member, I want to change a household's number where I change its group,
and be told exactly which card I am about to print before anything happens.

**Acceptance Criteria:**

- [ ] A new `Section` „Kundennummer" on `/kunden/[id]`, **directly after „Gruppe"** — its own section
      with its own save, presented the way the group control is, because it is the same kind of act:
      an administrative decision about the register, taken for DF's sake. It is the **only** place a
      number can be changed; the customer list, the counter and the card view offer nothing
- [ ] `NumberControl` (client component, `src/app/kunden/[id]/number-control.tsx`) rendering a
      `<select>` of `view.numberChoices` ascending, opened on the household's current number — the
      same kind of control the registration form uses for the same choice (US-24), so staff meet one
      control for one decision
- [ ] The select is **controlled** (`useState`), for the two reasons the registration form's is: the
      confirmation has to name the picked number's card number while the user is still deciding, and
      React resets a form after its action resolves, which would restore a `defaultValue` from an
      attribute rather than the revalidated record. After a successful save the control comes back
      opened on the **new** number, with the vacated one now among the choices
- [ ] An archived household sees the number as a read-only `Field`, like the group — no control at all
- [ ] Saving is **two steps**, the way a reissue after a loss is: the first button reveals a
      confirmation naming the chosen number and the card number that will be issued on it (from
      `numberChoices`, never worked out in the component), and only the second button writes. It can
      only be shown once a number has been chosen. It does **not** state that the card in the
      household's hand becomes invalid — see „What DF cut from the wording" below
- [ ] „Noch N freie Nummern" under the control, in the wording `assignment.freeNumberCount` already
      uses. There is **no** hint beside it. One was built, stating the three consequences that are
      not visible on this screen, and DF had it removed on review — see below
- [ ] When the household's own number is the **only** choice, the hint says no other number is free.
      The control is **not** disabled — a disabled control tells a staff member nothing about why
- [ ] `changeCustomerNumberAction` in `src/app/kunden/[id]/actions.ts`: Zod-validate, call exactly one
      use case, `revalidatePath`, return state. Business logic here is a bug
- [ ] A dedicated state type (`number-change-state.ts`, outside the `"use server"` module for the
      reason `reissue-state.ts` documents) carrying, on success, the old number, the new number and
      the new card number — the receipt names all three, and after the write the row it was read from
      is gone
- [ ] On a refusal the state carries fresh `numberChoices` from `listNumberChoices`, in the patch
      shape `freshPoolAfterRace` uses, so the staff member's obvious next move is not a number that
      provably cannot be saved. Other refusals leave the list alone
- [ ] German only in `src/i18n/de.ts`, under `customers.record` / a new `customers.numberChange`:
      heading, hint, the no-other-number hint, both button labels, the pending label, the confirmation
      sentence naming the number and the card it prints, the success receipt and one short sentence
      per refusal (taken, out of range, unchanged, archived). The success receipt is a receipt, not a
      warning: „Kundennummer geändert 5 → **23**; neue Karte **23k6** ausgestellt."
- [ ] `customers.record.detailsHint` loses „Die Kundennummer lässt sich nicht ändern." — the statement
      has stopped being true. It is replaced by nothing there; the new section says where the number
      is changed
- [ ] The customer number at the top of the record and the card number beside it show the new values
      as soon as the change is saved — they are rendered from the revalidated read model, so this is a
      test rather than an implementation
- [ ] Driven and reviewed with the `playwright-cli` skill per
      `docs/guideline/ui_styling_guide.md` §11 — the accessibility snapshot, not a screenshot, is what
      says whether the two-step save reads as one decision. One look in real Safari on a Mac
- [ ] Typecheck and lint pass

### US-30.8: E2E — a household moves, and both slots stay honest

**Description:** As a developer, I need one Playwright spec proving the whole act end to end in both
engines, because the coupling it creates spans four screens.

**Acceptance Criteria:**

- [ ] New `tests/e2e/number-change.spec.ts`, over the registers in `tests/e2e/registers.ts`, green in
      **both** `npm run test:e2e` and `npm run test:e2e:webkit`. No branch on `browserName` in `src/`
- [ ] The spec drives a household onto a slot an earlier household has been archived off, so the card
      index jump is real rather than asserted from a fixture
- [ ] It proves, in order: the control opens on the current number; the confirmation names the chosen
      number and the card number; after saving, the record's header shows the new number and the new
      card number, and the green receipt names both numbers and the card
- [ ] **The card history is asserted on the card view without navigating away and back mid-form** —
      after the move it shows the new card first and the superseded cards under the numbers they were
      printed with (`5k4`, not `23k4`), and „Karten insgesamt" counts the household's own cards
- [ ] The counter answers the vacated number as unassigned, resolves the old card number to whoever
      holds that slot today, and serves the household under the new number
- [ ] The free-slot count on the waiting list is one higher immediately after the move
- [ ] A household that was on „Karten neu ausstellen" for stale counts leaves the list after a move,
      and no household is put onto it by one
- [ ] Registering a new household afterwards may take the vacated number, and is printed the **next**
      card on it (`5k5`), not `5k1`
- [ ] The refusal path: with the screen open, the number is taken by another registration; saving is
      refused in one sentence, the staff member stays on the screen, nothing was written, and the list
      of numbers on offer no longer contains it

### US-30.9: The record stops saying a number cannot be changed (documentation)

**Description:** As the next developer, I need the written record to describe the system that exists,
because four documents currently state the opposite in as many words.

**Acceptance Criteria:**

- [ ] **ADR-016** via the `record-adr` skill: _"A customer number may be changed, and a card keeps the
      number it was printed with."_ Context: DF's testing; the reasons are theirs and not the
      software's. Decision: the move and the new card are one transaction; every card keeps its own
      slot; no number history is built. Consequences: `Card.customerNumber` becomes a snapshot **and**
      is read as the card's number, which ADR-007 ruled out; the vacated slot's run is what keeps its
      numbers from being printed twice; the card history reveals past numbers as a side effect and is
      left correct rather than obscured. Its row in
      `docs/architecture/09-architectural-decisions.md`
- [ ] **ADR-007** — the `Card.customerNumber` row of the derive-don't-store table is rewritten: it is
      a key _and_ a snapshot, and it is read as the card's number. It links to ADR-016. ADR-007 is
      **amended, not superseded**: the principle holds, one entry in its table changed
- [ ] **ADR-008** gains a sentence: a number changes hands between households _and_ between numbers
      for one household, which strengthens rather than weakens "a slot, not an identity"
- [ ] **Root `CLAUDE.md`**, the derive-don't-store exception list: the `Card.customerNumber`
      paragraph currently ends "it snapshots **nothing**: a customer number is fixed at registration
      and released only by archiving … and never read as the card's number". Rewritten to what is now
      true, with the pointer to ADR-016
- [ ] **`prisma/schema.prisma`**, the `Card.customerNumber` doc comment: the same correction — "as it
      will always stand" is no longer the case
- [ ] **`src/application/ports.ts`**, `CustomerRepository.updateDetails`: "The customer number is not
      among the fields, and there is deliberately no way to reach it" now needs the second half —
      there _is_ a way, it is `changeCustomerNumber`, and the number is still not a correction of who
      the customer is
- [ ] **`docs/architecture/12-glossary.md`** and **`08-crosscutting-concepts.md`**: the customer
      number entry and the ER note say a slot is released by archiving _or by a move_
- [ ] `tasks/README.md` §Conventions: the `Customer.id` bullet — „the `1..N` customer number is a
      **reusable slot attribute**, not an identity" — gains that a household may be moved between
      slots, which is the strongest statement of that bullet yet. The **§Index table is not
      touched**: it lists the sixteen MVP PRDs by design, and US-17 onwards are already absent
      from it
- [ ] A final grep proves nothing left in `src/`, `prisma/`, `docs/` or `tasks/` still asserts that a
      customer number cannot change

## Functional Requirements

- **FR-1** A staff member may move an **active or blocked** household from the number it holds to any
  other number that is free, at any time and as often as needed. An **archived** household may not be
  moved: their record is read-only, they hold no slot, and they receive no cards.
- **FR-2** The numbers on offer are every number in `1..quotaN` that no active household holds, plus
  the household's own current number, ascending. The control opens on the current number.
- **FR-3** A number an **archived** household once held is free and may be chosen — archiving releases
  the slot, exactly as it does at registration.
- **FR-4** A current number **above the quota in force** is offered and may be kept. The household may
  be moved down into the quota, but is never forced to move.
- **FR-5** Saving the number the household already holds is refused, with a short message saying the
  household already has that number.
- **FR-6** When no other number is free, only the household's own number is offered and a hint says
  no other number is free. The control is not disabled.
- **FR-7** Two active households cannot exchange numbers in one step — neither number is free while
  the other holds it. Swapping is done by moving one of them to a free number first. Nothing is built
  to make this easier.
- **FR-8** The old number is released **immediately** on confirming: the next registration may take
  it, and every free-slot count DF sees goes up by one straight away. All of these are derived, so
  nothing has to be invalidated.
- **FR-9** A number change issues a **new card** in the same act and the same transaction. Its index
  is the next unused index on the **new** slot, continuing that slot's whole run including cards
  printed for households that held the number before. A slot nobody has ever held issues `k1`.
- **FR-10** The new card records **`CUSTOMER_NUMBER_CHANGED`** as the reason it was issued — a reason
  of its own, so the card view and the audit log say what happened rather than filing it as `OTHER`.
  It is not counted as a card loss.
- **FR-11** The card the household is carrying becomes invalid immediately, like every other reissue:
  validity is _being the highest index on the slot_. Presenting it at the counter afterwards is
  refused as any superseded card is.
- **FR-12** The new card prints **today's** household counts and **today's** group, so a household on
  the „Karten neu ausstellen" list for stale counts or a group change leaves it as a side effect. No
  household is ever put **onto** that list by a number change.
- **FR-13** Every card the household was ever issued keeps the number it was **actually printed
  with**. No card is ever re-labelled under the household's new number.
- **FR-14** The count of cards a household has been issued stays a count of **its own** cards; the
  jump in the index is the slot's history, not theirs.
- **FR-15** At the counter, the vacated number is answered exactly as any unassigned number is, with
  nothing said about it having been released; if another household has since taken it, it resolves to
  that household. A card number from the history resolves to whoever holds that slot today.
- **FR-16** Everything else about the household is untouched: identity, names, address, household
  members, certificate and its reminder count, notes, group, block status, hand-out history and the
  balance derived from it. A hand-out recorded earlier the same day needs no attention — it belongs to
  the household, not to the number.
- **FR-17** **Nothing at all is written** — no number change, no card, no audit entry — if the chosen
  number is held by an active household by the time the change lands, is outside the quota in force,
  is the one the household already holds, or the household has been archived in the meantime.
- **FR-18** After a refusal the staff member stays on the screen, is told in one short sentence what
  happened, and the list of numbers on offer is up to date.
- **FR-19** A number change writes an audit entry naming the change, the instant, and the numbers
  moved **from** and **to**. No reason is asked for or recorded. The card's issue writes its own entry.
- **FR-20** Saving asks for a confirmation first, naming the chosen number **and** the card number
  that will be issued on it. It can only be shown once a number has been chosen.
- **FR-21** On success a green message states both facts in one sentence: the number moved from the
  old one to the new one, and the new card has been issued.
- **FR-22** The customer number at the top of the record and the card number beside it show the new
  values as soon as the change is saved.
- **FR-23** The record's own text no longer states that the customer number cannot be changed.

## Non-Goals

- **No list, report or search of a household's previous customer numbers.** The card history reveals
  past numbers as a side effect and is left correct rather than obscured.
- **No reason, note or comment** attached to the change. DF have their reasons and the software does
  not need an opinion about them.
- **No change to how numbers are allocated at registration**, to the quota rule, or to how card
  numbers are formed and read.
- **No way to move an archived household** to a different number.
- **No bulk renumbering, no "compact the register", no direct swap** of two households' numbers.
- **No limit** on how often a household may be moved, and no restriction on when — a distribution day,
  before or after the household has collected, is all the same.
- **No change to the group, the household, the certificate, the notes or the hand-out history.**
- **No hint at the counter** that a number was recently released.
- **No schema change and no migration.** Nothing here needs a column that does not exist.
- **No undo.** Moving back would consume yet another card number; the confirmation before the write is
  what stands in for it.

## Design Considerations

**Where the control lives.** In its own section directly after „Gruppe", presented the way the group
control is. Both are administrative decisions about the register taken for DF's sake rather than the
household's, both are in force immediately, and both leave the card in the household's pocket needing
attention — except that this one deals with the card itself. It is deliberately **not** in the danger
zone with the reissue, the block and the archive: those are irreversible things done _to_ a household,
and a number change is an ordinary correction. It borrows the danger zone's _confirmation_, not its
place.

**Why the confirmation, then.** The card the household is holding becomes invalid the moment the
change lands, the staff member prints the replacement on the spot, and moving back would consume yet
another card number. Naming the number and the card before the write is what lets them check they are
about to print the card they mean — the argument `reissue-controls.tsx` already makes.

**One control for one decision.** Staff already pick a customer number from a `<select>` of the free
ones when registering a household (US-24). This is the same decision at a later moment, so it is the
same control, and the same „Noch N freie Nummern" wording underneath.

**The two-step save is one decision, not two.** The first button is not a save — it reveals what
saving would do. The accessibility snapshot is what says whether that reads correctly, which is why
the `playwright-cli` skill drives this screen rather than a screenshot review.

**What DF cut from the wording.** The screen was built to the three bullets above and then shown to
DF, who found it explained too much. Three things went, and the reason is one reason: **every rule
these sentences recited is a rule the four people using this already know**, and a sentence that
recites what the reader knows is a sentence they learn to click past — taking the one figure that
_is_ new with it. So the hint under the dropdown went entirely; the confirmation lost „Die Karte
100k2 wird damit ungültig und darf an der Ausgabe nicht mehr angenommen werden" and is now „Neue
Kundennummer **105**, neue Karte **105k3**."; and the receipt was shortened to „Kundennummer geändert
100 → **105**; neue Karte **105k3** ausgestellt." The group control's hint was cut the same way in the
same pass, down to the one thing it says that no other screen does: „Die Karte muss danach unter
„Karten neu ausstellen" neu ausgestellt werden."

**What is set in bold, and why only that.** The two figures a staff member acts on _off_ the screen:
the number the household now occupies and the number they are about to write on a physical card. Both
sentences are read at a counter, in passing, and the bold is what makes them findable without
reading. The number moved _off_ stays plain — it is read only as the other end of the arrow. This is
the dictionary's own doing: `Segment` lets an entry say which of its fragments carry weight, so the
German and its emphasis stay in `de.ts` and no component assembles a sentence.

**Nothing counts, compares or warns.** There is no threshold on how often a household may be moved, no
sentence that appears at a high number of moves, and nothing that suggests a move. The software
informs; a human decides — the same stance the reissue control takes on card losses.

## Technical Considerations

**No migration.** `Customer.customerNumber` is already an updatable column; `Card.customerNumber`
already exists and is already written per card; `Card.reason` is a string the domain validates on the
way in and out, so a fifth reason word costs the database nothing. The partial unique index that
exempts archived rows is what makes the vacated number free the instant the number column is written,
and it is also the final authority on a lost race. **This batch does
not touch `prisma/migrations/`**, which keeps ADR-009's pre-release regeneration question out of it
entirely.

**The transaction boundary is the whole point.** `changeCustomerNumber` on the repository writes the
number and inserts the card together. Split into `setCustomerNumber` + `issueCard`, a crash between
them leaves a household on 23 carrying `5k4` and no query in the system can detect it: the card looks
like an ordinary superseded card, and the household looks like it holds no current card on its slot.
The precedent is `create`, which already writes a customer and their first card as one.

**`IssuedCard` gains a field, `NewCard` is what writers pass.** The adapter keeps reading the slot off
the customer row inside the transaction rather than taking it as an argument — the existing argument
("a caller that could pass it is a caller that could pass the wrong one") is untouched by this PRD,
and inside `changeCustomerNumber`'s transaction the row it reads is already the updated one.

**One aggregate for the dropdown.** `highestIndexByNumber()` is a single `groupBy` over `Card`, served
by the leading column of `@@unique([customerNumber, index])`. At DF's ~240 slots that is one query of
a few hundred rows; ~240 calls to `highestIndexForNumber` to render one dropdown would not be.

**The invariant the whole design rests on:** _the card a household currently holds is always the
highest index on the slot they currently hold._ Registration starts above every predecessor on the
slot, a reissue counts on from the slot's run, and a number change issues the new card on the new slot
in the same transaction as the move. `read-customer.ts` and `read-card.ts` each get a named test
saying so, because several derivations (`nextCardNumber`, the counter's outdated-card verdict) would
be quietly wrong if it ever stopped holding.

**Two audit entries, not one.** A number change and a card issue are two facts read by different
people at different times, and `AuditEntry` has no room for a nested event. The card's entry is
written by exactly the code that writes every other card's entry.

**Coverage.** `domain/` and `application/` stay gated at 100% (`vitest.config.ts`). The new domain
rules and the new use cases are TDD'd; the adapter and the screen are tested after, thinly, and
covered by Playwright.

## Success Metrics

- A staff member can move a household to another number and hand over the new card in one pass at the
  record, with no second step to remember.
- After a move, no screen anywhere shows a card under a number it was not printed with, and no card
  number is ever printed twice on either slot.
- A refused change leaves the database byte-for-byte as it was.
- Nothing about the household other than the number and the card differs after a move — provable by
  reading the record.
- No document in the repository still claims a customer number cannot be changed.

## Open Questions

- **Does DF want the number change in the record's reading order where this PRD puts it** (after
  „Gruppe"), or higher up beside the number in the header? The section order was set with DF once
  already and is trivially reversible; worth one look during acceptance.
- **Is „Kundennummer geändert" the wording DF want on the card view** for the new issue reason, or do
  they read the four existing reasons as being about the _card_ rather than the household? A five-word
  question at the next acceptance session.
- Nothing else is open: the refined description settles the rules, and the four design decisions this
  PRD had to make (the read model for the choices, the transactional port method, the audit encoding
  and the documentation scope) were confirmed before it was written.
