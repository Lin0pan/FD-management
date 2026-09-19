# PRD: A hand-out is the receipt of who stood at the counter (US-35)

> Source: `local_only/manually-start-ausgabe/refined-requirements.md`, requirement **E** — DF's
> additional requirement of 19.09.2026, which goes beyond SPEC-AUSGABE-1.1. This PRD covers **E-4,
> E-5, E-7, E-8 and E-9**: capturing the state and freezing it. The screens that read it (E-1…E-3,
> E-6) are US-37.
>
> **This batch has an expiry date, and it is the only one in the project that does** (§4 of the
> requirements): every session ended before the freeze rule exists is lost to the detail view for
> good, because the values it would have shown are overwritten by ordinary editing. It must therefore
> merge **immediately after US-34** and before DF are handed a build they run a real afternoon on.

## Introduction

US-34 made a hand-out belong to a session. DF then asked for something the software has never been
able to do: a past session must show the households **as they stood then** — the name they had that
afternoon, the counts that were true that afternoon, the number they held, the card they carried, the
certificate date that was on file.

Most of that cannot be reconstructed today. Some of it can:

| Detail                            | Reconstructible today?                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| Preis, Betrag                     | **Yes** — both are on the hand-out                                                         |
| Karte, Nachweis bis, Erinnerungen | **Yes** — these three histories are appended to, never overwritten                         |
| Nr. and Gruppe                    | **Only indirectly** — via the card valid then, since every number change prints a new card |
| **Name**                          | **No** — overwritten when edited (US-16)                                                   |
| **Erw. + Kinder**                 | **No** — household members are replaced when edited (US-16, FR-2)                          |

So two of the eight columns are unreconstructable and three more would have to be assembled out of
three different histories. DF's own recommendation, and this PRD's decision, is to **capture them all
together** (E-8): a table in which half the columns show what was and the other half a reconstruction
is one nobody can check.

The hand-out becomes the **receipt** of who stood at the counter that afternoon — the same kind of
thing a printed card already is. `Card.grownUpsAtIssue` records what was printed on a piece of card;
this records what was true of the household when the afternoon was closed.

**When it is captured is the whole design.** While the session runs, the details still follow every
correction — a misspelt name noticed after the hand-out still reaches the record (E-5). **Ending the
session settles them.** Reopening (US-34, B-9) thaws them again, and ending a second time freezes
them again: two rules for one state would not be explainable.

**This reverses a written decision** (E-9). `tasks/prd-us-16-maintain-customer-record.md` states that
no history of past household compositions is kept and that there is no „as of" view of a past
household. There still is not, in general — customer administration goes on showing today's state and
no name history comes into being. What comes into being is bounded to the session: eight values, per
hand-out, written once when the afternoon is closed.

Nothing in this batch is visible. The receipts are written, and the screen that reads them is US-37 —
which is why its e2e story is the one that proves the freeze end to end.

## Goals

- Every hand-out of an ended session carries the eight household details as they stood at the end of
  that session.
- The capture happens exactly when the session is ended, in the same transaction, and never again.
- Reopening a session thaws the capture; ending it re-takes it.
- Nothing outside a session gains a history: no name history, no household history, no „as of" view
  of a customer.
- A past session names the household that was **actually** served, even after its number has been
  archived and given to somebody else.
- The reversal of US-16's decision is recorded as an architecture decision, and the „derive, don't
  store" exception list gains its fourth entry with an argument of its own kind.

## User stories

### US-35.1: The receipt is a domain value (domain)

**Description:** As a developer, I want the set of details a receipt holds — and how they are read
off a household — to be one pure module, so that the adapter never decides what „as it stood" means.

**Acceptance Criteria:**

- [ ] New module `src/domain/distribution/handoutReceipt.ts`. Pure; no I/O, no clock.
- [ ] `HandoutReceipt`: `{ customerNumber: number; firstName: string; lastName: string; grownUps:
number; children: number; cardCustomerNumber: number; cardIndex: number; certificateValidUntil:
Date; reminderCount: number }`.
- [ ] **The group is not among them.** It is `groupOf(customerNumber)` of the _captured_ number
      (ADR-017), derived wherever it is shown — a `group` column here would be the second recording
      US-31 removed, free to disagree with the number beside it. The module's opening comment says
      this in one line.
- [ ] **The card number is not among them either**, for the same reason: it is
      `formatCardNumber(cardCustomerNumber, cardIndex)`, and the two integers are what is stored —
      exactly as `Card` stores them today. A card printed under a slot the household has since left
      keeps that slot (ADR-016), which is why the card's own number is captured and not the holder's.
- [ ] `receiptFor({ customer, members, card, at })` builds one, deriving the counts through
      `composition(members, at)` — the household's counts at the session's end instant, never the
      card's printed ones, and never a stored count.
- [ ] Written test-first, one named test per rule:
  - `captures the name as it is spelled at the end of the session`
  - `captures the counts as they stand at the end of the session, not as printed on the card`
  - `captures the card's own slot, not the holder's current one`
  - `derives the group from the captured number`
  - `counts a child who turns 13 after the session as a child`
- [ ] Domain coverage stays at 100%.

### US-35.2: The receipt table, written and thawed with the session (schema + infrastructure)

**Description:** As DF, I want the captured state stored beside the hand-out it describes, so that a
past afternoon reads back whole rather than being assembled out of four histories.

**Acceptance Criteria:**

- [ ] New model `HandoutReceipt` in `prisma/schema.prisma`, **one row per `DistributionRecord`**:
      `recordId Int @unique` with a relation to `DistributionRecord` (`onDelete: Restrict`, stated out
      loud), plus the nine captured columns of US-35.1 and no others.
- [ ] The model comment states, in no more than three lines, the one thing the code cannot: this is a
      **snapshot in the sense `Card.grownUpsAtIssue` is** — never read as the household's current
      name, number or counts, which are the customer's own row — and it exists because two of these
      values are not reconstructable at all (ADR-021, US-35).
- [ ] `Price` and `paidCents` are **not** copied here (E-6): both are already on the hand-out and
      copying them would be the first place two figures could disagree about one payment.
- [ ] New port methods on `DistributionRecordRepository`, documented once on the port:
      `freezeSession(sessionId, receipts)` — write every receipt of a session in **one transaction**,
      with the session's end — and `thawSession(sessionId)` — remove them, which only a reopening
      does.
- [ ] **The thaw is a delete, and the schema comment says why that is allowed** where ADR-010 forbids
      deleting: a receipt is not history, it is the freeze itself, re-taken whole by the next ending.
      A reopened session may have a hand-out removed (US-34, FR-14), and a receipt still pointing at
      it would make the store refuse that removal — so thawing is what keeps the correction window
      open at all. It is the third deliberate exception, beside `HouseholdMember` and
      `CertificateType`, and root `CLAUDE.md` gains it in US-35.4.
- [ ] Migrations regenerated, not stacked (ADR-009); **re-add by hand** the partial unique index on
      `Customer.customerNumber` and the one-running-session index from US-34.3. `npm run db:reset`
      after.
- [ ] `clearRegister` in `src/infrastructure/prisma/test-support.ts` and `releaseNumbers` in
      `tests/e2e/seeding.ts` delete receipts before the records they point at.
- [ ] `prisma/demo-seed.ts`'s ended session gets receipts, so the demo build's detail view (US-37) has
      something in it. `prisma/seed.ts` still seeds no session and therefore no receipt.
- [ ] Integration test against a throwaway SQLite file: receipts round-trip; `freezeSession` writes
      one per record and no more; `thawSession` leaves the records untouched; a record whose receipt
      was thawed can then be removed, and one whose receipt stands cannot.

### US-35.3: Ending a session takes the receipts; reopening gives them back (application)

**Description:** As DF, I want the capture to happen when I end the afternoon and at no other moment,
so that a correction made while the session runs still reaches the record.

**Acceptance Criteria:**

- [ ] `endDistributionSession` builds one `HandoutReceipt` per hand-out of the session — reading the
      customer, household members, current card and certificate through the repositories it already
      has — and writes them with the ending, in one transaction (E-5, E-8). If the freeze fails,
      the session does not end.
- [ ] The receipt is taken at the **end instant**: a child who turned 13 during the afternoon is
      counted as the composition at that instant says, not as the price charged earlier says. That
      divergence is real, is what `Card.grownUpsAtIssue` already exposes, and is not to be "fixed".
- [ ] `reopenDistributionSession` calls `thawSession` in the same transaction as clearing `endedAt`
      (E-5, H-2), so the reopened session behaves exactly like a running one.
- [ ] **A household moved to another customer number while the session runs is captured under its
      new number and therefore its new group** (E-5, J-1) — in a RED-only session possibly as BLUE.
      This is accepted and deliberately **not prevented**: the receipt shows the state at the end of
      the session, which is what was asked for. One comment says so and cites J-1; it does not argue
      with the requirement.
- [ ] **A household archived and its number given to somebody else is still the household that was
      served** (E-4): the receipt is joined by `DistributionRecord.customerId` — the surrogate id,
      never the customer number — so a past session can never name a household that was never there.
      A named application test proves exactly this: serve, end, archive, register a new household on
      the freed number, and read the session back.
- [ ] Ending an **empty** session writes no receipts and is not an error.
- [ ] TDD against hand-written fakes; application coverage stays at 100%. Named tests:
  - `freezes every hand-out of the session when it is ended`
  - `keeps following corrections while the session is still running`
  - `thaws the frozen state when the session is reopened`
  - `freezes it again when the reopened session is ended`
  - `keeps the household that was served after its number is given to another`

### US-35.4: Record ADR-021 and correct what it reverses (documentation)

**Description:** As the next developer, I want the reversal written down as a decision, so that the
next reader does not find two documents disagreeing about whether this project keeps history.

**Acceptance Criteria:**

- [ ] **ADR-021** via the `record-adr` skill: _„Capture the household's state when a distribution
      session is ended"_. Context: a past session must show the households as they stood then (E-2);
      two of the eight details cannot be reconstructed at all and three more only by assembling three
      histories. Decision: one receipt per hand-out, written when the session is ended, thawed and
      re-taken on a reopening; the group and the card number stay derived from the two numbers
      captured. Consequences: US-16's statement that no past household composition is kept is now
      bounded rather than absolute; nothing outside a session gains a history; the receipt is the
      fourth exception to derive-don't-store; the thaw is the third deliberate deletion in the schema.
- [ ] It explicitly **reverses in part** `tasks/prd-us-16-maintain-customer-record.md` §FR-2, which
      gains a dated note at the top naming ADR-021 and this PRD. Its body is not rewritten.
- [ ] Root `CLAUDE.md` is updated in two places, both of which currently state something that has
      stopped being true: the **three** exceptions to „derive, don't store" become four, with the
      receipt's argument of its own kind stated in the same voice as the others; and the two
      deliberate deletion exceptions in the „Don'ts" list become three.
- [ ] arc42 updated with the `arc42` skill: **05** (the new domain module and the two port methods),
      **08** (what is derived and what is snapshotted — this is where the exception list is argued at
      length), **09** (the ADR-021 row), **12** (glossary: _Beleg / Zustand bei Beendigung_).
- [ ] `docs/handout/betriebsanleitung.md` gains three or four sentences: what a past Ausgabe shows,
      that corrections made **while the Ausgabe runs** still reach it, and that ending settles it —
      the one thing DF have to know in order to use the reopening sensibly.
- [ ] `npm run arc42:check` passes.

## Functional requirements

- **FR-1** (E-8): Every hand-out of an ended session carries a receipt holding the household's
  number, first and last name, grown-ups, children, card slot and index, certificate validity date
  and reminder count as they stood when the session was ended.
- **FR-2** (E-6): The price and the amount paid are **not** copied into the receipt; both already
  live on the hand-out.
- **FR-3** (E-5): While a session runs — including a reopened one — nothing is frozen and every
  correction reaches the record.
- **FR-4** (E-5, H-2): Ending a session writes its receipts in the same transaction; reopening
  removes them; ending again writes them afresh.
- **FR-5** (E-4): A receipt belongs to the hand-out by the customer's surrogate id, so a session never
  names a household that was not there, whatever became of the customer number since.
- **FR-6** (E-5, J-1): A household moved to another number while the session runs is captured under
  the new number, and therefore the new group. This is accepted, not prevented.
- **FR-7** (ADR-017): The group and the card number are derived from the captured numbers and are
  not columns.
- **FR-8** (E-9): No history comes into being outside the session. Customer administration shows
  today's state only.
- **FR-9** (E-10): Nothing is migrated. Sessions ended before this batch simply have no receipts, and
  the screens that read them (US-37) must render that case rather than assume it away.

## Non-goals

- No screen: the overview and the detail view are US-37.
- No general name, address or household history, and no „as of" view of a customer anywhere outside a
  session.
- No capture of the households that did **not** turn up (C-6, G-2).
- No capture of blocks or archivings performed during the session (C-6, H-1).
- No balance on the receipt (E-6, G-7): the balance is derived from the hand-out history and belongs
  on the household's own record.
- No migration of existing data (E-10, F-16).

## Technical considerations

- **Nothing in this batch is visible in the application.** The freeze is proved by application and
  integration tests; US-37's e2e proves it end to end. A story that finds itself editing
  `src/app/**` has misread the batch.
- **It is the tenth batch to regenerate `prisma/migrations/`**, so both hand-written indexes — the
  partial unique on `Customer.customerNumber` and the one-running-session index from US-34.3 — have
  to be put back. That is the single thing most likely to be forgotten.
- **The receipt is written, never updated.** There is no `updateReceipt`; a change is a thaw and a
  fresh freeze. A story that adds an update method has re-introduced the two-sources-of-truth problem
  the whole capture is designed around.
- **Order matters inside `endDistributionSession`:** the receipts are built from the state as it is
  _before_ `endedAt` is written and committed with it, so an aborted ending leaves neither.

## Open questions

None. One judgement is recorded rather than asked: the receipt captures **all** the details together
rather than only the two that cannot be reconstructed. That is DF's own recommendation (E-8) and the
reason is checkability, not convenience — a table in which some columns are captured and others
reassembled is one nobody can verify.
