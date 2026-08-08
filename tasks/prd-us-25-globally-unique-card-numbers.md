# PRD: A card number is never handed out twice (US-25)

> Corrects a rule laid down in **US-02** (issue a customer card) and relied on by **US-09** (reissue
> after loss), **US-13** (stale counts) and **US-16.4** (group move). It is the consequence of
> **US-10** (archiving frees the slot), **US-11** (re-registration) and **US-24** (choosing the
> number): the moment a customer number can be reused, the card number built from it can collide.

## Introduction

A card number is `<customer number>k<index>` — `66k1` is the first card of customer 66. The index
counts **per customer record**: registration writes index 1 and every reissue takes the next one
(`src/domain/card/cardNumber.ts`, `@@unique([customerId, index])`).

A customer number, however, is a **slot**, not an identity. Archiving a household releases it and the
next registration may take it (US-10, US-11, US-24). Put the two rules together and the same card
number is issued twice:

```
Customer1 registers on slot 66      → card 66k1
Customer1 is archived               → slot 66 is free, 66k1 is still printed on a card in the world
Customer2 registers on slot 66      → card 66k1     ← the same number, a different household
```

`src/infrastructure/prisma/card-repository.ts` says so out loud today: _"Card numbers are **not**
unique across the archive: two customers may each hold `50k1`."_ That was a deliberate decision. It
is the wrong one, and this PRD reverses it.

**Why it matters at the counter.** The whole check a staff member performs under time pressure is
reading the number off the card and typing it in. Customer1 keeps their physical card after being
archived — nothing is collected back — and can hand it to anybody. That person presents `66k1`. The
software resolves slot 66 to its current holder, Customer2, finds the presented index equal to
Customer2's current index, and answers **Ausgabe frei**. A card belonging to a household that left
the register a year ago buys food, and neither the screen nor the staff member has any way to notice.
The counter's one job — "is this card valid?" — silently returns the wrong answer.

**The fix is a counting rule, not a new check.** A card index is one above the highest index **ever
issued on that customer number**, archived holders included. Customer2 then starts at `66k2`, `66k1`
can never be issued again, and presenting it lands on the `OUTDATED_CARD` verdict the counter already
has: _Karte ungültig — vorgelegt 66k1, aktuell 66k2._ Nothing about how staff read a card changes;
the number they read simply stops being ambiguous.

## Goals

- **A card number identifies exactly one piece of card, for the lifetime of the database.** Once
  `66k1` has been issued it is never issued again, whoever holds slot 66 afterwards.
- The rule is enforced by the **database**, not by application code alone — a unique constraint on
  `(customerNumber, index)`, the way `Customer_customerNumber_onRegister_key` is the final authority
  on a free slot.
- An old card presented at the counter is refused, with the number of the current card named beside
  it, on the verdict that already exists.
- The **counting rule lives in one place**. Registration and reissue both ask "what is the next index
  on this slot", rather than each knowing how the run begins.
- Nothing staff read or type changes: the format is still `<number>k<index>`, the parser is untouched,
  and a first card is still `k1` on every slot that has never had one.

## User Stories

### US-025.1: The next index is the slot's, not the record's (domain)

**Description:** As a developer, I want the counting rule to be one pure function over the slot's
whole run, so registration and reissue cannot come to different answers about where the numbering
starts.

**Acceptance Criteria:**

- [ ] `src/domain/card/cardNumber.ts` exports
      `nextCardIndex(highestIssuedOnSlot: number): number` — `highestIssuedOnSlot + 1`, so a slot
      that has never held a card (`0`) yields `1` and a slot whose archived holder reached `3` yields
      `4`.
- [ ] `nextCardNumber` is re-expressed on top of it —
      `{ customerNumber: card.customerNumber, index: nextCardIndex(card.index) }` — so "the next
      index is one on from the highest" is stated once.
- [ ] `nextCardIndex` throws `InvalidCardNumber` for a negative or non-integer argument. `0` is
      **valid** and is the whole point of the function: it is what an untouched slot answers.
- [ ] The module's header comment is rewritten. It currently says a card number is _"the customer's
      slot and the index of the card **they** hold"_ and that `12k2` is _"the one issued after **they**
      lost it"_. Both sentences are now wrong in the case that matters. It must state instead: the
      index counts the **slot's** cards, across every household that has ever held it, so a card
      number names one physical card for good.
- [ ] `formatCardNumber`, `parseCardNumber`, `parseCounterQuery` and `counterQueryOrNull` are
      **unchanged** — in behaviour and in signature. The grammar staff read and type is not what this
      PRD changes.
- [ ] A new typed error `CardNumberTaken` is added to `src/domain/errors.ts`, carrying
      `{ customerNumber, index }`, for the new global constraint. It is **not** `CardIndexTaken`:
      that one names a race between two issues on one record, and `card-repository.ts` already
      anticipates this split in the doc comment on `isCardIndexCollision` — _"`Card` may grow a second
      unique constraint, and it should then surface as itself rather than as a lost race that a retry
      would answer wrongly."_
- [ ] `CardNumberTaken` is added to `DomainErrorCode` — the 32nd — and therefore to `TIERS` in
      `src/app/notice-tier.ts`, where it is an **`error`**, alongside `CardIndexTaken` and for the
      same reason: the screen read the card run stale and has to be re-read, not re-submitted.
- [ ] The module stays pure: no I/O, no `Date`, no import from Next.js, React or Prisma.
- [ ] Strict TDD, invariant-breaking test first, one named test per rule. Named cases:
      `a slot that has never held a card starts at 1`; `a slot whose last card was k3 issues k4`;
      `the next number keeps the customer number and only moves the index`; `a negative highest index
is refused`; `a fractional highest index is refused`.
- [ ] Domain coverage stays at 100%.
- [ ] `npm run lint` and `npm run typecheck` pass.

### US-025.2: The card row carries the number printed on it (schema)

**Description:** As a developer, I want the database itself to refuse a duplicate card number, so the
guarantee does not rest on every future caller remembering to ask the right question first.

**Acceptance Criteria:**

- [ ] `Card` in `prisma/schema.prisma` gains `customerNumber Int` — the slot the card was printed
      under. Not nullable and with no default, so every writer must state it.
- [ ] `@@unique([customerNumber, index])` is added. `@@unique([customerId, index])` **stays**: it
      still settles a race between two reissues on one record, which is a different fact and gets a
      different error (US-025.1).
- [ ] `@@index([customerNumber])` is added if the unique index above does not already serve
      `MAX(index) WHERE customerNumber = ?` — it does, as the leading column, so **no second index**
      is created. State this in the schema comment rather than adding one to be safe.
- [ ] The column's doc comment makes the argument for it, because it is stored data the code could
      derive. It is **not** a snapshot in the sense `grownUpsAtIssue` and `groupAtIssue` are — those
      capture a value that goes on changing, and this one cannot change at all, since a customer's
      number is fixed at registration and released only by archiving (US-24, Non-Goals). It is the
      same kind of thing as `firstNameFolded`: a **key the constraint needs**, written by the adapter
      from the customer row in the same transaction, never read as the card's number. What a card
      number _is_ remains `formatCardNumber(customer.customerNumber, card.index)`, derived at every
      read.
- [ ] The header comment of `schema.prisma` — which today lists only the customer-number partial index
      as a rule the file cannot state on its own — is unchanged in substance: this constraint **can**
      be expressed in Prisma and needs no hand-written SQL.
- [ ] Migration history is regenerated, not stacked on: `rm -rf prisma/migrations/`,
      `npx prisma migrate dev --name init`, then `npm run db:reset`. DF hold no real data, so the
      corrective migration would describe a system nobody ever ran (CLAUDE.md, _Database migrations_).
- [ ] **The hand-written partial unique index is re-added to the regenerated
      `prisma/migrations/*_init/migration.sql`**, verbatim, comment included:
      `CREATE UNIQUE INDEX "Customer_customerNumber_onRegister_key" ON "Customer"("customerNumber") WHERE "status" <> 'ARCHIVED';`
      Regenerating drops it, and without it the slot rule is enforced by application code alone.
- [ ] `src/infrastructure/prisma/schema.test.ts` still passes: no relation gained
      `onDelete: Cascade`, and every nullable relation still says `onDelete: Restrict` out loud.
- [ ] `npm run db:reset` completes and the settings screen reports settings in force — the symptom
      CLAUDE.md names for a schema that drifted from the database.
- [ ] `npm run lint` and `npm run typecheck` pass.

### US-025.3: The repository answers for the slot (infrastructure)

**Description:** As a developer, I want the store to be able to say what the highest index ever issued
on a customer number is, because it is the only layer that can see the archived holders.

**Acceptance Criteria:**

- [ ] `CardRepository` in `src/application/ports.ts` gains
      `highestIndexForNumber(customerNumber: number): Promise<number>` — the highest `index` of any
      card ever issued on that slot, **`0`** when none ever was. Archived holders count; nothing about
      status is consulted, because a card that was printed exists whatever became of the household.
- [ ] Its doc comment states why it is not `currentCard(customerId).index`: the two agree for every
      **active** household — the active holder always sits at the top of the slot's run, since a
      registration starts above every predecessor and only the active holder is ever reissued — but
      the invariant is exactly what the counting rule must not have to remember. Both callers ask the
      slot.
- [ ] `PrismaCardRepository.highestIndexForNumber` is one `aggregate` with `_max: { index: true }`,
      answering `0` for `null`. One query, served by the leading column of the new unique index.
- [ ] `issue` writes the `customerNumber` column. The adapter reads it off the customer row rather
      than taking it as an argument, in **one transaction** with the insert, so the column can never
      disagree with the slot the customer holds. An unknown `customerId` fails as it does today.
- [ ] `PrismaCustomerRepository.create` writes `customerNumber` onto the first card in the same
      transaction it already writes the customer, the household, the certificate and the card in — it
      is writing both rows, so it has the number in hand.
- [ ] `isCardIndexCollision` is split so the **two** constraints surface as themselves:
      `(customerId, index)` → `CardIndexTaken`, `(customerNumber, index)` → `CardNumberTaken`. Matched
      on the constraint target, not on a substring of the meta blob that both would satisfy — the
      present check (`JSON.stringify(error.meta).includes("index")`) would match either.
- [ ] The header comment of `card-repository.ts` is rewritten. The paragraph beginning _"Card numbers
      are **not** unique across the archive"_ states the opposite of the rule from now on and must
      say so, including why the per-customer constraint is kept beside the new one.
- [ ] `issueCounts.cardsIssued` becomes a **count of the customer's own card rows**, not
      `_max(index)`. Under the new rule an index counts the slot's history, so a returning household
      holding `66k4` as their first card would otherwise report four cards issued and appear to have
      lost three it never held. Still one grouped aggregate: the total is the sum of the groups'
      `_count._all`.
- [ ] `CardIssueCounts.cardsIssued` in `ports.ts` loses the words _"The index of the card the customer
      holds"_ and gains _"How many cards this customer has been issued"_; `read-card.ts`'s
      `CardView.cardsIssued` comment loses _"the current index, since every reissue counts on from the
      highest"_ for the same reason. „Ausgestellte Karten" on `/kunden/[id]/karte` needs no change —
      it goes on meaning what it says.
- [ ] Test-after integration tests against a throwaway SQLite file, using `clearRegister` from
      `test-support.ts`. Named cases: `a slot that has never held a card answers 0`; `the highest index
counts an archived holder's cards`; `issuing the same card number twice is refused by the
database`; `two customers may still not share an index on one record`; `a customer's card count
is the rows they hold, not their highest index`.
- [ ] `npm run lint` and `npm run typecheck` pass.

### US-025.4: Registration and reissue continue the slot's run (application)

**Description:** As a staff member, I want a household registering on a freed number to be handed the
next unused card number, so the card the previous household walked away with can never be presented
as valid.

**Acceptance Criteria:**

- [ ] `RegisterCustomerDeps` gains `readonly cards: CardRepository`.
- [ ] `registerCustomer` computes the first card's index as
      `nextCardIndex(await deps.cards.highestIndexForNumber(customerNumber))`, **inside** the attempt
      loop and **after** the number is settled — the index depends on which slot was taken, and the
      allocated-number path can move to a different slot on a retry.
- [ ] The literal `index: 1` disappears from `register-customer.ts`. A slot nobody has ever held still
      produces `1`; that is now a consequence of the rule rather than a constant.
- [ ] `issueCard` asks `highestIndexForNumber(customer.customerNumber)` instead of
      `currentCard(customerId)`, and its `current === null ? 1 : …` branch disappears with it — the
      two cases are the same call now. `currentCard` stays on the port; other callers use it.
- [ ] `CardNumberTaken` propagates to the caller from both use cases. `registerCustomer` does **not**
      retry it: the retry loop exists for a lost customer-number race and moves to another slot, and a
      taken card number on a slot the registration has already won means the run was read stale.
      `@throws` documentation on both use cases names it.
- [ ] Everything else about a registration is untouched: same transaction, same `FIRST_ISSUE` reason,
      same `ACTIVE` status, same `reminderCount: 0`, same `countsAtIssue` and `groupAtIssue` snapshot,
      same audit entry with the same `changedFields`. **No new audit event and no new field** — that a
      card number continues a predecessor's run is a property of the numbering, not a decision a later
      reader can act on.
- [ ] `registerFromWaitingList` (US-12.2) inherits this through `registerCustomer` and gains no rule of
      its own; a failed registration still leaves the queue untouched.
- [ ] Re-registration from an archived record (US-11.3) gains no branch. It gets its card index from
      the same call as a walk-in — which is the point: if the household happens to be given their old
      number back, they get the next card on that run rather than a duplicate of the card they are
      still carrying.
- [ ] `reissueCard` (US-09) and the stale-card reissue (US-13, US-16.4) are unchanged apart from
      inheriting `issueCard`'s new source for the index.
- [ ] TDD against hand-written fakes; no mocking library. Every existing fake `CardRepository` gains
      the method. Named tests for: `a registration on a fresh slot writes card index 1`; `a
registration on a slot an archived household held at k1 writes k2`; `a registration on a slot an
archived household held at k3 writes k4`; `a reissue counts on from the slot's highest, not the
record's`; `a card number taken between the read and the write is not retried`; `the allocated-
number retry re-reads the card run for the slot it moved to`.
- [ ] Application coverage stays at 100%.
- [ ] `npm run lint` and `npm run typecheck` pass.

### US-025.5: The screens stop promising `k1` (presentation)

**Description:** As a staff member re-registering a household from the archive, I do not want the
screen to tell me the card will be `k1` when it will not.

**Acceptance Criteria:**

- [ ] `de.customers.registration.prefilled.detail` in `src/i18n/de.ts` no longer says
      „einer neuen Karte (k1)". The literal `k1` is a promise the software can no longer keep, and it
      is the one place in the dictionary that makes it. Replace it with a phrase that names no index —
      the number is on the card view a click later, and the registration screen does not know it yet
      because the slot has not been chosen at the point this banner renders.
- [ ] Every other German string mentioning a card is re-read against the new rule and left alone if it
      still holds. `counter.verdicts.outdatedCard` („Karte ungültig") and the presented/current pair
      beside it are **correct as they stand** — the wording is about the card, not about "your" card,
      which is what makes it read properly when the person at the counter is holding a stranger's.
- [ ] No component gains a German literal; no key is added that a component does not read.
- [ ] `document.documentElement.scrollWidth - clientWidth` is `0` at 1920, 1280, 1024, 800 and 390 on
      `/kunden/neu` with an archive pre-fill.
- [ ] `npm run lint` and `npm run typecheck` pass.
- [ ] Verified with the `playwright-cli` skill against a **production** build, reading the
      **accessibility snapshot**: the pre-fill banner on `/kunden/neu` reads correctly and names no
      card index, and `/kunden/[id]/karte` for a re-registered household announces the real card
      number and „Ausgestellte Karten 1".

### US-025.6: E2E — the archived household's card is refused

**Description:** As a developer, I want the scenario that motivated this PRD proved end to end against
the built app, because it is the one bug a green unit suite already allowed.

**Acceptance Criteria:**

- [ ] `tests/e2e/` covers the full sequence in one spec, in this order: register a household on a
      chosen number (US-24) → note its card number → archive it → register a **different** household
      on the **same** number → assert the second household's card number is **not** the first's.
- [ ] Asserts at the counter (`/ausgabe`): typing the **first** household's card number returns the
      „Karte ungültig" verdict and names the current card number beside it; typing the **second**
      household's card number returns „Ausgabe frei" (given the right week colour).
- [ ] Asserts the database directly: no two `Card` rows share a `(customerNumber, index)` pair after
      the flow, and the first household's card row is still there — nothing is deleted to make room.
- [ ] Asserts the reissue path: reissuing the second household's card yields the next index on the
      slot, and the first household's number is not reachable again.
- [ ] Asserts `/kunden/[id]/karte` for the second household shows „Ausgestellte Karten 1" — the card
      count is theirs, not the slot's.
- [ ] Synthetic data only (Faker); the spec seeds in a high, otherwise unused number band so no other
      spec's registrations land inside it.
- [ ] The existing registration, reissue and counter specs pass unchanged.
- [ ] `npm run test:e2e` passes in full, **with the dev server stopped first**.

### US-025.7: The documents say the new rule (documentation)

**Description:** As the next developer, I want the places that state the old rule to state the new one,
because three of them argue for it explicitly and would otherwise read as a decision DF once made.

**Acceptance Criteria:**

- [ ] `CLAUDE.md`, _Derive, don't store_: the exception list gains `Card.customerNumber` with its own
      argument — a key the `(customerNumber, index)` constraint needs, written by the adapter from the
      customer row, never read as the card's number — and says that unlike the three `AtIssue` fields
      it snapshots nothing, because a customer number cannot change.
- [ ] ~~`docs/technical_documentation.md` describes the counting rule as the slot's rather than the
      record's, and names the counter consequence it exists for.~~ `[obsolete]` — that file has since
      been deleted; the rule is recorded in
      [ADR-008](../docs/architecture/adr/008-treat-a-customer-number-as-a-reusable-slot-not-an-identity.md).
- [ ] `docs/archiv/domain_analysis.md` — wherever it defines a card number — says a card number is issued once
      and never reused.
- [ ] `tasks/prd-us-02-issue-customer-card.md`, `prd-us-09-reissue-card-after-loss.md` and
      `prd-us-11-reuse-archived-record.md` carry a short note that US-25 superseded the per-record
      counting rule they specified. The PRDs are the record of what was asked for and are **not**
      rewritten; a note is how a change of mind is recorded.
- [ ] `prisma/demo-seed.ts` gains a shape that demonstrates the rule: a household archived on a slot
      and a second household registered on the **same** slot, so a manual click-through shows a card
      number that does not start at `k1`. Its `demonstrates` string says so.
- [ ] No documentation claims a card number can repeat.

## Functional Requirements

- **FR-1:** A card index must be one above the highest index ever issued on that **customer number**,
  counting cards of households that have since been archived.
- **FR-2:** A customer number that has never held a card must produce index `1`. The common case is
  unchanged.
- **FR-3:** A card number, once issued, must never be issued again — for the lifetime of the database,
  whoever holds the slot afterwards.
- **FR-4:** FR-3 must be enforced by a **unique constraint in the database**, which is the final
  authority. Application code reads before it writes and only the database can settle the gap.
- **FR-5:** The per-record constraint `(customerId, index)` must remain, and a violation of each of the
  two constraints must surface as its own typed error.
- **FR-6:** A card presented at the counter whose index is below the slot's current card must be
  refused with the existing `OUTDATED_CARD` verdict, naming the current card number. No new verdict.
- **FR-7:** The printed format `<customer number>k<index>` and everything that parses it are unchanged.
  A number staff read off a card is typed exactly as before.
- **FR-8:** All three registration paths — walk-in, re-registration from the archive (US-11.3) and
  promotion off the waiting list (US-12.4) — must follow FR-1 identically, with no branch between them.
- **FR-9:** „Ausgestellte Karten" must count the cards **that customer** has been issued, not the
  slot's whole run.
- **FR-10:** The audit entries for registration and card issue are unchanged.
- **FR-11:** Migration history is regenerated rather than stacked on, and the hand-written partial
  unique index on `Customer.customerNumber` is re-added to the regenerated migration.
- **FR-12:** All German strings live in `src/i18n/de.ts`, and none may promise a card index.

## Non-Goals

- **Not** a change to how customer numbers are allocated. A slot is still released by archiving and
  still reused by the next registration (US-10, US-24). This PRD is the reason that stays safe, not a
  retreat from it.
- **Not** a new counter verdict. The existing `OUTDATED_CARD` already says the thing a staff member
  needs to act on, and adding a "card of a former household" case would put a new branch through every
  screen that switches on `Verdict` to say the same sentence differently.
- **Not** a change to the printed card number's grammar. No suffix, no separator, no second
  discriminator — `66k2` is what a card says, and the parser is untouched.
- **Not** a way to reclaim or re-issue a retired card number. There is no administrative override, and
  none is wanted: the guarantee is only worth something if it has no exceptions.
- **Not** collecting physical cards back at archiving. DF have no way to compel it, which is exactly
  the premise this PRD works from.
- **Not** a check that the presented index is not **above** the current one. `66k9` typed for a
  household holding `66k2` still falls through to `CLEAR_TO_SERVE` today. It is a pre-existing gap, it
  is a typo rather than a forged card, and fixing it is a change to `evaluateAtCounter` with its own
  tests — see Open Questions.
- **Not** a migration of existing data. DF hold none; the history is regenerated (CLAUDE.md).
- **Not** a change to the household counts, the group, the certificate or the allowance on the card.

## Design Considerations

- **The staff-facing behaviour is unchanged, and that is the measure of the design.** A staff member
  reads a number and types it; a card that is not current is refused. What this PRD fixes is invisible
  until it is exploited, which is why the fix belongs in the numbering rather than in a new thing to
  read on screen.
- The one visible difference is that a household registering on a reused slot walks out with a card
  ending in `k2` or higher on their **first** card. That is legible without explanation — it looks
  exactly like a household who once lost a card, and „Ausgestellte Karten 1" on their record says
  which it is.
- The `OUTDATED_CARD` verdict names both numbers already („vorgelegt" / „aktuell"). That is the right
  amount of information for the case this PRD is about: the staff member sees the card in their hand
  is not the one the register knows, and does not need to be told a story about who used to hold the
  slot.
- Do **not** add a warning to the archive screen about the card the household keeps. The physical card
  is uncollectable; a screen that asks staff to worry about it would be asking for something they
  cannot do, and the numbering has already made it harmless.

## Technical Considerations

- **The invariant that makes this cheap:** for an active household the record's highest index and the
  slot's highest index are the same number, because a registration starts above every predecessor and
  only the active holder is ever reissued (`issueCard` refuses an archived customer). So the change is
  not a correctness patch to reissue — it is registration that jumps the run. Both callers ask the
  slot anyway, so that invariant never has to be true again for the code to be right.
- **Why the column and not a join.** `MAX(index)` over `Card ⋈ Customer` would give the same number
  without storing anything, but it leaves no constraint that can refuse a duplicate: the rule would
  live in application code, and the gap between reading the run and writing the card would be open.
  Every other invariant in this schema that matters is settled by the database — the free slot, the
  once-per-day hand-out, the once-per-day reminder — and this one is settled the same way.
- **`Card.customerNumber` is a key, not a fact.** It is written by the adapter, from the customer row,
  in the transaction that writes the card. Nothing reads it to answer what the card's number is. The
  precedent is `firstNameFolded`, not `groupAtIssue` — and unlike either, it cannot go stale, because
  a customer number is fixed at registration (US-24, Non-Goals).
- `nextCardIndex` accepting `0` is deliberate and is what removes the `current === null ? 1 : …`
  branch from `issueCard` and the `index: 1` literal from `registerCustomer`. Two special cases become
  one call.
- **`CardNumberTaken` is the 32nd `DomainErrorCode`**, so `TIERS` in `notice-tier.ts` will fail the
  build until it is tiered. That is the mechanism working, not an obstacle.
- **Match the collision on the constraint target.** `isCardIndexCollision` currently asks whether the
  stringified `meta` contains `"index"`, which is true of both constraints — `(customerId, index)` and
  `(customerNumber, index)`. Left as it is, a global duplicate would be reported as a per-record race
  and retried into failing again.
- Indices stay small. DF archive a handful of households a year against a quota of a few hundred, and
  a slot reused twice with a loss apiece reaches `k4`. There is no realistic path to a card number
  that is awkward to read out.
- `parseCardNumber`'s leading-zero strictness and its case-insensitive `k` are untouched, and the
  counter query grammar with them. Nothing about typing changes.
- The demo seed already replays the real use cases in order rather than writing rows
  (`prisma/demo-seed.ts`), so the new shape needs no special support — archive one household and
  register another on the same number, and the rule demonstrates itself.

## Success Metrics

- A card number issued at any point in the database's life resolves to exactly one physical card.
- The motivating scenario is refused: an archived household's card presented at the counter after the
  slot was reused returns „Karte ungültig", proved by an e2e test.
- A registration on a slot nobody has ever held produces byte-for-byte the record it produces today.
- No `(customerNumber, index)` pair appears twice in `Card`, and the database — not the test suite —
  is what guarantees it.
- „Ausgestellte Karten" never overstates how many cards a household has held.

## Open Questions

- **Should an index _above_ the current one be refused at the counter?** `66k9` for a household holding
  `66k2` reads as `CLEAR_TO_SERVE` today. It is almost certainly a typo rather than a forgery, and the
  household is the right one either way — but the counter accepting a card number that was never issued
  is a smaller version of the same category of bug this PRD closes. Left out; it is a change to
  `evaluateAtCounter` with its own boundary tests and deserves its own story.
- **Should the card view name the household that previously held the slot?** A record whose first card
  is `66k4` invites the question. `previousCustomerId` already links a re-registration to its
  predecessor, but a slot reused by _unrelated_ people has no such link and would need one. Left out
  until DF ask what a gap in a card run means.
- **Should archiving record which card numbers the household kept?** The audit entry says a household
  was archived; it does not say `66k1` is out there on a card nobody collected. It is not actionable —
  which is the argument for leaving it out — but it is the sort of thing an auditor asks for.
