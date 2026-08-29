# PRD: The customer balance (US-29)

> **Extends US-05** (recording a hand-out), **US-04** (the counter screen) and **US-16** (the customer
> record). A hand-out stops being paid-or-not and becomes an **amount**; the difference between what
> was asked for and what was handed over accumulates into one **balance** per customer, and the
> counter states what to collect today rather than what the household nominally costs.
>
> Source: DF's requirement, `local_only/new_requirement_balance_refined.md` (German:
> `…_refined_de.md`), the Q&A it came out of in `…_q-and-a.md`.
>
> **Schema change**, and the fifth batch to **regenerate** `prisma/migrations/` — confirmed with DF
> on 2026-08-28 that no real customer data exists yet. See §Technical Considerations.

## Introduction

A hand-out today is either **paid** or **not paid**: `DistributionRecord.paid` is a boolean, and the
counter offers a checkbox. Reality has a third case, and DF have been writing it in the Excel list by
hand ever since:

- The household owes 5,00 € and has 2,00 € in their pocket. They pay 2,00 €.
- Rarely, a household pays **more** than is asked so as not to have to remember it next week.

Neither survives contact with a checkbox. Cleared, it says the household paid nothing, which is
false. Ticked, it says they paid in full, which is also false. The 3,00 € goes into the Excel list,
and the software — the thing that is supposed to replace the Excel list — loses it.

**What this PRD adds is one number per customer: the balance.** It is negative when the household
owes DF money, positive when they have paid ahead, and zero the rest of the time, which is the normal
state. It is never stored: it is the arithmetic of the household's own hand-out history, exactly as
the price, the counts and the eggs are the arithmetic of the household's own record.

**The counter then states what to collect.** Not the price — the price is what the household costs
this week — but the **amount to pay**: the price offset by the balance, floored at zero. A staff
member reads „6,00 €" and the two figures beside it say why (price 4,00 €, 2,00 € still open), so
they can tell that household from a plain 6,00 € one without remembering last week.

### The arithmetic, worked

The balance is **the sum, over every hand-out the customer has, of what they paid minus what the
household cost that week**:

```
balance      = Σ (paidCents − priceCents)
amountToPay  = max(0, priceCents − balance)
```

The second formula is what a staff member reads; the first is what makes it come out right next week.
Read them together on the worked cases:

| Week | Price  | Balance before | Asked for | Paid   | Balance after |
| ---- | ------ | -------------- | --------- | ------ | ------------- |
| 1    | 5,00 € | 0,00 €         | 5,00 €    | 2,00 € | −3,00 €       |
| 2    | 5,00 € | −3,00 €        | 8,00 €    | 8,00 € | 0,00 €        |
| 3    | 2,00 € | 0,00 €         | 2,00 €    | 5,00 € | +3,00 €       |
| 4    | 2,00 € | +3,00 €        | 0,00 €    | 0,00 € | +1,00 €       |
| 5    | 2,00 € | +1,00 €        | 1,00 €    | 1,00 € | 0,00 €        |

**Two quantities are in play, and the requirement measures a different thing against each.** Being
explicit about it is worth a paragraph, because an early draft of the source document used one
phrase — „geforderter Betrag", _amount asked for_ — for both. That draft was corrected and the
reading below confirmed with DF on **2026-08-28**; it is what
`local_only/new_requirement_balance_refined.md` rules 2 and 10 now state.

- **The balance (rule 2) is measured against the price.** Against the amount to pay instead, the
  definition never settles. In week 2 above the household hands over the full 8,00 € they were asked
  for — `8,00 − 8,00 = 0` — and the −3,00 € debt is still there next week to be charged again; in
  week 4, `0 − 0 = 0` and the credit never shrinks. A balance that can only move when a payment
  _differs_ from what was asked can never return to zero.
- **The colour mark (rule 10) is measured against the amount to pay** — what was actually asked for
  on the day. A household clearing an old debt hands over 8,00 € against a 5,00 € price and must
  read _paid exactly_, green, not _paid over_.

So `askedCents` is still derived, for the mark and for nothing else, by replaying the history in
order. Nothing is stored to support it.

Rule 3 says the same thing from the other side: "a credit larger than the week's price leaves the
customer paying nothing and keeps the **remainder** for next week". The table is what "remainder"
means arithmetically.

### What the cap does and does not do

The Maximalpreis (US-26) caps the **price** — what one week of food costs a household. It does not cap
the **amount to pay**: an old debt is added on top of a capped price and is not itself capped. This
falls out of the formula without a line of code, because `amountToPay` takes the already-capped price
as its input. It is stated here because it is the kind of thing somebody will later "fix".

## Goals

- **A part payment stops leaving the system.** What was handed over is recorded as an amount, and the
  difference is carried, not lost.
- **The counter says what to collect**, so no staff member has to remember last week or work out a
  sum at the table with a queue in front of them.
- **The balance is derived, never stored** — one place computes it, from the hand-outs that are
  already the record of what happened, so it cannot fall out of step with them.
- **Nobody does sign arithmetic.** One signed number internally; on screen, _Guthaben_ or _Offen_ and
  a positive amount.
- **The customer record explains how a balance came about** — per hand-out, what was asked and what
  was paid, marked short / exact / over.
- **The one irreversible mistake is guarded.** A payment above what was asked is confirmed before it
  is written, at the counter and in the use case both.
- **Nothing follows automatically from a debt.** The software informs; a human decides.

## User Stories

### US-29.1: The balance arithmetic (domain)

**Description:** As a developer, I need one pure module that turns a household's hand-outs into a
balance and an amount to pay, so no screen and no use case does the sum of its own.

**Acceptance Criteria:**

- [ ] New pure module `src/domain/distribution/balance.ts`
- [ ] `PaidRecord = { readonly priceCents: Cents; readonly paidCents: Cents }` — the two fields the
      arithmetic reads, and deliberately not `DistributionRecord`: the module is about money, and
      taking the whole record would let a later change drag a date or a customer id into a sum
- [ ] `balanceOf(records: ReadonlyArray<PaidRecord>): Cents` returns `Σ (paidCents − priceCents)`. It
      does **not** sort — a sum has no order — and it returns `0` for an empty history
- [ ] The doc comment carries the worked table from §Introduction, and states **why the sum is
      against the price and not against the amount asked for**: read the other way the balance never
      settles — a household paying off its debt in full has the debt charged again next week, and a
      credit is never consumed by the week it pays for. This is the single most likely thing for a
      later reader to "correct", so the comment must be explicit
- [ ] `amountToPay(priceCents: Cents, balanceCents: Cents): Cents` returns
      `Math.max(0, priceCents - balanceCents)` — a debt raises it, a credit lowers it, and it never
      goes below zero because credit is never paid out in cash
- [ ] `balanceKind(balanceCents: Cents): "CREDIT" | "DEBT" | "SETTLED"` — the one place the sign is
      read. Every screen asks this rather than comparing to zero itself, which is what keeps rule 6
      ("staff never do sign arithmetic") from being re-decided per screen
- [ ] The module holds **no limit of any kind**: no floor, no ceiling, no warning threshold. DF's
      balances stay within ±20 € in practice and the software says nothing about it (rule 1)
- [ ] Strict TDD, invariant-breaking test first, one named test per rule:
      `a household with no hand-outs is settled`, `a full payment leaves the balance where it was`,
      `a part payment leaves the shortfall open`, `paying more than the price leaves a credit`,
      `two shortfalls add up`, `a later payment settles an earlier shortfall`,
      `a debt raises the amount to pay`, `a credit lowers the amount to pay`,
      `a credit larger than the price leaves nothing to pay`,
      `a credit larger than the price is consumed by the week it pays for` (the week-4 row above —
      the named test that pins the formula), `the amount to pay is never negative`,
      `a capped price plus an old debt exceeds the cap` (rule 4),
      `names a positive balance a credit`, `names a negative balance a debt`,
      `names a zero balance settled`
- [ ] Pure: no I/O, no clock, no import from Next.js, React or Prisma
- [ ] `npm run test:coverage` keeps `domain/` at 100%; typecheck and lint pass

### US-29.2: The payment replay and the overpayment guard (domain)

**Description:** As a staff member, I want each past hand-out to say what was asked and what was
paid, so the record explains how the balance came about — and I want the one mistake that cannot be
undone to be confirmed before it is written.

**Acceptance Criteria:**

- [ ] `PaymentStanding = "SHORT" | "EXACT" | "OVER"` and
      `standingOf(paidCents: Cents, askedCents: Cents): PaymentStanding` — the comparison is against
      the **amount that was asked for**, never against the price, so clearing an old debt is `EXACT`
- [ ] `replayPayments<T extends PaidRecord & { date: Date }>(records: ReadonlyArray<T>)` returns one
      `Settlement<T>` per record, **oldest first**:
      `{ record: T; askedCents: Cents; standing: PaymentStanding; balanceAfter: Cents }`
- [ ] `replayPayments` **sorts its input by `date` ascending itself** rather than trusting the caller.
      The order is the whole meaning of a running balance, and the port that supplies the rows makes
      no promise about it — the same bargain `createEggRule` strikes by sorting inside the
      constructor. It sorts a copy; the argument is not mutated
- [ ] `askedCents` for each record is `amountToPay(record.priceCents, balanceBefore)`, where
      `balanceBefore` is the running balance of every **earlier** record — so `askedCents` is exactly
      what the counter would have shown that day
- [ ] A named test proves `replayPayments(records).at(-1)?.balanceAfter === balanceOf(records)` for a
      non-trivial history — the two functions must never be able to disagree, and this is the test
      that says so
- [ ] `settlementOf(settlements, recordId)` is **not** added. A caller wanting one record's asked
      amount finds it in the replay; a second lookup helper would be a second way to ask
- [ ] New `OverpaymentNotConfirmed` in `src/domain/errors.ts`, carrying `paidCents` and
      `amountToPayCents`, with its code in `DomainErrorCode` and tiered **`refusal`** in
      `src/app/notice-tier.ts` — the staff member is being asked a question, not shown a fault
- [ ] The error's doc comment says what it is for: a mistyped credit is the one error this design
      cannot undo, because it silently pays for the household's next weeks (rule 14). A **shortfall**
      needs no confirmation — it shows up as an open amount at the very next hand-out
- [ ] Tests written first, named after the rule: `marks a payment matching the amount asked as exact`,
      `marks a shortfall as short`, `marks a payment above the amount asked as over`,
      `marks clearing an old debt as exact, not over` (the rule-10 test),
      `marks paying nothing on a settled account as short`,
      `replays a history typed out of order`, `replays an empty history as nothing`,
      `states what was asked on the day, not what is asked today`,
      `agrees with the plain sum`
- [ ] Pure; `domain/` stays at 100%; typecheck and lint pass

### US-29.3: A hand-out records an amount, not a flag (domain type, schema, infrastructure)

**Description:** As a developer, I need the distribution record to carry the amount that was handed
over, so the balance has something to be the arithmetic of.

**Acceptance Criteria:**

- [ ] `NewDistributionRecord.paid: boolean` in `src/domain/distribution/distributionRecord.ts` becomes
      `readonly paidCents: Cents` — **the flag is removed, not kept alongside**. A boolean and an
      amount are two sources of truth for one fact, and the amount answers everything the boolean did
      (`paidCents === priceCents` is "paid in full", and nothing outside a test asks that)
- [ ] The field's doc comment states that it is what the household **handed over**, which may be less
      or more than what was asked, and that it is the only thing on the record the balance reads
- [ ] `prisma/schema.prisma`: `paid Boolean` on `DistributionRecord` becomes `paidCents Int`, with a
      comment saying it is whole euro cents and that the balance is derived from it and `priceCents`,
      never stored
- [ ] `prisma/migrations/` is **regenerated** (`rm -rf prisma/migrations`,
      `npx prisma migrate dev --name init`, `npm run db:reset`) — DF hold no real data
      (ADR-009). The hand-written partial unique index on `Customer.customerNumber` **must be
      re-added** to the generated migration, and `src/infrastructure/prisma/schema.test.ts` is what
      catches it if it is not
- [ ] `PrismaDistributionRecordRepository`: `RecordRow` and `toRecord` carry `paidCents`;
      `setPaid(recordId, paid)` becomes `setPayment(recordId, paidCents)`, and the port method in
      `src/application/ports.ts` is renamed with it
- [ ] `src/infrastructure/prisma/seed.ts` and `prisma/demo-seed.ts` write amounts. The demo seed keeps
      its counting rather than drawing at random (its own comment explains why) and is extended so
      the register **demonstrates the new states**: at least one household carrying a debt, one
      carrying a credit, and one whose history contains a short payment later settled exactly. Its
      closing tally reports them
- [ ] Thin integration tests against a throwaway SQLite file: a record round-trips its `paidCents`,
      `setPayment` writes a new amount and returns the stored row, a payment of `0` is stored as `0`
      and not as null, and `clearRegister` still clears
- [ ] **Intermediate state, deliberate and temporary:** `recordAttendance` and `correctAttendance`
      still take a boolean at the end of this story and bridge it as
      `paidCents: paid ? allowance.priceCents : 0`. The screens are unchanged and the app is green.
      US-29.4 replaces the bridge; it is in this batch and not a follow-up for exactly that reason
- [ ] `grep -rn "\bpaid\b" src/ prisma/ tests/` returns no boolean-flag survivors once US-29.4 lands —
      checked as an acceptance criterion of US-29.9, in the manner US-27.5 established
- [ ] Typecheck, lint and the full test suite pass

### US-29.4: Recording and correcting a payment (application)

**Description:** As a staff member, I want to record the amount a household actually handed over, and
to raise it later the same day when they come back with the rest.

**Acceptance Criteria:**

- [ ] `RecordAttendanceInput.paid?: boolean` becomes
      `readonly paidCents?: Cents` and `readonly overpaymentConfirmed?: boolean`
- [ ] `recordAttendance` derives the balance from the records **it has already loaded** for the
      once-per-day guard (`deps.records.listForCustomer`) — no second query. It then derives
      `amountToPay(allowance.priceCents, balance)`
- [ ] `paidCents` **defaults to the amount to pay** when omitted: confirming what is asked is the
      normal case, and the default is the same value the pre-filled field shows
- [ ] A `paidCents` above the amount to pay throws `OverpaymentNotConfirmed(paidCents, amountToPay)`
      unless `overpaymentConfirmed` is `true`. Nothing is written. A `paidCents` **below** it — down
      to `0` — is written without a question
- [ ] A negative `paidCents` cannot arrive: `parseEuros` refuses one at the boundary (US-29.7), and
      the use case does not re-check it. The doc comment says which layer owns that refusal
- [ ] The guards keep their order: eligibility, then once-per-day, then the payment. A customer who
      may not be served is refused before any amount is looked at
- [ ] The audit entry's `changedFields` becomes `["showedUp", "paidCents", "priceCents"]`. There is
      **no extra audit entry** for a payment that differs from what was asked (decision: staff are
      trusted, the amounts are small) — but the entries a hand-out and its correction already write
      stay exactly as they are
- [ ] `CorrectAttendanceInput`'s `SET_PAID` variant becomes
      `{ recordId; action: "SET_PAYMENT"; paidCents: Cents; overpaymentConfirmed?: boolean }`;
      `REMOVE` is unchanged
- [ ] `correctAttendance` loads the customer's records (`listForCustomer`) so it can replay them and
      find **the amount that was asked for that record**, and applies the same overpayment guard
      against it. It cannot use today's amount to pay: that figure already has this record's own
      payment folded into it
- [ ] `correctAttendance` calls `deps.records.setPayment`; its audit entry names `["paidCents"]`
- [ ] **Removal needs no new code.** Deleting the record deletes its payment with it, and the balance
      returns to what it was because the balance is a derivation over the surviving rows (rule 9).
      A named application test asserts exactly that, because it is the property the whole
      derive-don't-store choice was made for
- [ ] TDD against hand-written fakes, never a mock library. Named tests:
      `records the amount asked for when none is given`, `records a part payment`,
      `records a payment of nothing`, `refuses an unconfirmed payment above the amount asked`,
      `records a confirmed payment above the amount asked`,
      `asks for the price plus an old debt`, `asks for nothing when the credit covers the price`,
      `asks for a capped price plus an uncapped debt`,
      `raises a payment recorded earlier today`,
      `refuses an unconfirmed correction above the amount that was asked`,
      `judges a correction against what was asked that day, not against today's amount to pay`,
      `refuses to correct a record from an earlier day`,
      `restores the balance when a record is removed`
- [ ] Every hand-written fake `DistributionRecordRepository` under `src/application/**` gains
      `setPayment` in the same commit — the suite will not compile otherwise
- [ ] `application/` stays at 100%; typecheck and lint pass

### US-29.5: The counter reads the amount to pay and the balance (application)

**Description:** As a staff member, I want the counter lookup to hand the screen the amount to
collect and the household's standing, so the screen renders them rather than working them out.

**Acceptance Criteria:**

- [ ] `CounterCustomerView` in `src/application/customers/lookup-customer.ts` gains
      `readonly balanceCents: Cents` and `readonly amountToPayCents: Cents`
- [ ] Both are derived from `recordsForCustomer`, which the lookup **already loads** for
      `recordForDay` and `countNoShows`. The counter still issues no further query (US-04.3)
- [ ] `balanceCents` is the household's balance **as it stands now** — after today's payment when one
      has been recorded. `amountToPayCents` is `amountToPay(priceCents, balanceCents)`, which for a
      household already served today is what would be asked if they were served again; the screen
      does not show it in that state (US-29.7)
- [ ] `TodaysRecordView` gains `readonly paidCents: Cents` and `readonly askedCents: Cents`, the
      latter read from `replayPayments` — so the correction form opens on the amount that is stored
      and states the amount that was asked
- [ ] `TodaysRecordView.paid: boolean` is removed
- [ ] `TodaysRecordView` also gains `readonly balanceWithoutRecordCents: Cents` — the balance the
      household would return to if this record were removed, so the removal warning can name it
      (rule 9). It is `balanceOf` of the records minus this one, derived here rather than in the
      component
- [ ] Tests written first against fakes: `states the price as the amount to pay for a settled
household`, `adds an open amount to the price`, `subtracts a credit from the price`,
      `asks for nothing when the credit exceeds the price`,
      `states the balance after today's payment once a hand-out is recorded`,
      `states what was asked for today's record`,
      `states the balance a removal would return to`,
      `states a settled balance for a household with no hand-outs`
- [ ] `application/` stays at 100%; typecheck and lint pass

### US-29.6: The customer record reads the balance and the payment history (application)

**Description:** As a staff member, I want the customer record to state where a household stands and
what each past hand-out cost and paid, so I can see how a balance came about.

**Acceptance Criteria:**

- [ ] `CustomerCardView` in `src/application/customers/read-customer.ts` gains
      `readonly balanceCents: Cents`
- [ ] `history` changes from `ReadonlyArray<DistributionRecord>` to
      `ReadonlyArray<Settlement<DistributionRecord>>` — each row carrying `askedCents`, `paidCents`
      (on `record`), `standing` and `balanceAfter`
- [ ] The order stays **newest first**, applied here: `replayPayments` returns oldest-first because a
      running balance has to be built that way, and the view reverses it. The reversal is one line
      and is commented as being the display order rather than the arithmetic's
- [ ] The price on each row stays the **record's own**, as it already is: a policy change since then
      must not rewrite what a household paid last March. `askedCents` is likewise what was asked
      **then**, replayed from the prices on the rows
- [ ] `balanceCents` and the replay come from the records `readCustomer` already loads for
      `countNoShows` — no extra query
- [ ] An **archived** record reads exactly the same way: its history and its last balance are shown
      unchanged, with no "written off" mark. Nothing special-cases the status, which is why there is
      nothing to build — but there is a named test, because the decision was explicit
- [ ] A household that **re-registers from an archived record** starts at zero, and again nothing is
      built: a re-registration writes a new `Customer` row, hand-outs hang off the surrogate id, so
      the new household has no history and therefore no balance (ADR-008). A named test in
      `src/application/customers/` pins it, because it is a property somebody could break later by
      keying records on the customer number
- [ ] Tests written first: `states a settled balance for a household with no hand-outs`,
      `states an open amount after a part payment`, `states a credit after an overpayment`,
      `lists the hand-outs newest first`, `states what was asked on each past hand-out`,
      `marks a hand-out that cleared an old debt as exact`,
      `keeps an archived household's balance`, `starts a re-registered household at zero`
- [ ] `application/` stays at 100%; typecheck and lint pass

### US-29.7: The counter collects an amount (presentation)

**Description:** As a staff member, I want the counter to tell me what to collect and let me record
what was actually handed over, quickly.

**Acceptance Criteria:**

- [ ] A **payment row** directly above the serve form, in its own two-column grid, separate from the
      four derived tiles (which are untouched — Erwachsene | Kinder | Eier | Preis, price still in
      the fourth slot): - `Stat` **Zu zahlen**, `testId="counter-amount-to-pay"`, `valueClassName="text-4xl"` — the
      prominent figure, sized like the Kundennummer/Kartennummer pair rather than like the derived
      tiles, because it is the number the transaction turns on - `Stat` **Saldo**, `testId="counter-balance"`, worded not signed: `Guthaben 2,00 €`,
      `Offen 2,00 €` or `ausgeglichen`, chosen on `balanceKind` and never on a comparison written
      in the component
- [ ] The `paid` checkbox is replaced by a **text input** pre-filled with the amount to pay,
      `name="betrag"`, `data-testid="serve-amount"`, `inputMode="decimal"`, labelled **Betrag**. It is
      the German amount form `formatEuroAmount` produces and `parseEuros` reads back — `4,00`, no
      currency symbol — which is the pair those two functions exist to be
- [ ] Entry stays quick: the field carries `autoComplete="off"`, selects its contents on focus so
      overwriting takes no deletion, and the form is submitted by the existing button. **Enter must
      not submit** — `src/app/enter-guard.ts` already owns that rule for the data-entry forms (#123)
      and this field is inside a form it covers
- [ ] An amount **above** the amount to pay reveals a confirmation step before the record is written,
      in the same `<details>`-free shape the counter already uses for a destructive act: the button
      states what it will do and a sentence names the credit that will result. Nothing may have to be
      dismissed before the next customer is served
- [ ] The confirmation is driven from the **server's** refusal, not from arithmetic in the browser:
      the action submits without `overpaymentConfirmed`, `OverpaymentNotConfirmed` comes back as a
      `refusal`-tiered notice with the confirm button beside it, and the second submission carries
      the flag. One rule, in the use case, and the screen is not the only guard (FR-8)
- [ ] `ServeState` gains a `confirmOverpayment` status carrying the typed amount and the amount to
      pay, so the notice can name both
- [ ] The correction form replaces its checkbox with the same amount field, pre-filled with
      `todaysRecord.paidCents`, above a line stating what was asked (`todaysRecord.askedCents`). The
      button becomes **Betrag speichern**; the same overpayment confirmation applies
- [ ] The already-served heading states the amount instead of the flag:
      `Heute bereits versorgt um 14:32 Uhr. (6,00 € von 6,00 € gezahlt)`
- [ ] The removal warning names the consequence plainly (rule 9): the record, **its payment**, and the
      balance the household returns to — `de.distribution.serve.correct.removeConfirm` becomes a
      function of `balanceWithoutRecordCents`
- [ ] German strings only in `src/i18n/de.ts`: `de.customers.derived.balance` („Saldo"),
      `de.customers.derived.amountToPay` („Zu zahlen"),
      `de.customers.derived.balanceValue(kind, cents)` („Guthaben 2,00 €" / „Offen 2,00 €" /
      „ausgeglichen"), `de.distribution.serve.amount` („Betrag"),
      `de.distribution.serve.asked(cents)`, `de.distribution.serve.overpayment.*` and the reworded
      `alreadyServed` / `removeConfirm`. No German literal in a component
- [ ] `de.distribution.serve.paid` and `paidState` are **deleted**, not left behind — a dictionary key
      for a flag that no longer exists is the survivor US-27 taught this project to grep for
- [ ] Driven and reviewed with the **`playwright-cli` skill**, not only screenshotted: the
      accessibility snapshot must show the amount field with its label, the two payment tiles as one
      `<p>` each (label and value announced together), and the confirmation reachable by keyboard
      (`docs/guideline/ui_styling_guide.md` §11)
- [ ] Typecheck and lint pass

### US-29.8: The record states the balance and marks each hand-out (presentation)

**Description:** As a staff member, I want the customer record to show where a household stands and
which hand-outs were paid short, exactly or over, so I can judge an open amount case by case.

**Acceptance Criteria:**

- [ ] The balance is stated **once, above the hand-out history**, in the counter's wording:
      `data-testid="record-balance"`, „Guthaben 2,00 €" / „Offen 2,00 €" / „ausgeglichen". It sits
      inside the history disclosure's header area, beside the existing `history-count`, so opening
      the history is what shows both — it is a fact about the history, not a fifth derived tile
- [ ] The history table's **Bezahlt** column becomes two: **Gefordert** (`history-asked`) and
      **Gezahlt** (`history-paid`), both `tabular-nums`, beside the existing **Preis**
- [ ] The **Gezahlt** cell carries the amount and, where the payment was not exact, a short mark with
      the difference — „2,00 € offen" for a shortfall, „2,00 € zu viel" for an overpayment, „genau"
      for an exact one — in a `Badge`, `data-testid="history-standing"`. **Superseded by the
      amendment note below:** the two amounts are now signed, „−2,00 €" and „+2,00 €".
- [ ] The three tints go in `src/app/accents.ts` as one exported `PAYMENT_STANDING_STYLES` record,
      not hand-tinted at the call site, with a doc comment placing them among the accents already
      there: they are **standing state on a row**, like a lapsed certificate's amber, not an answer to
      a button. Red for `SHORT`, green for `EXACT`, blue for `OVER`, per DF's own wording
- [ ] **The colour only reinforces the word.** Every mark states its meaning in text; the table is
      legible in greyscale and in print, and a reader who cannot distinguish the colours loses
      nothing. This is the same rule the group colours already follow (US-03.4) and it is checked in
      the e2e by asserting the text, never a class
- [ ] The requirement's illustrative „−2,00 € offen" loses its minus sign. „Offen" already says which
      direction the amount runs, and rule 6 forbids making a staff member read a sign; a minus beside
      the word would be the sign arithmetic the wording exists to remove. Noted here because it is a
      deliberate departure from the source document's example string
- [ ] The history hint sentence gains one clause: a hand-out is correctable only on the day it was
      recorded, and a mistake found later is put right by a compensating amount at the **next**
      hand-out (rule 8) — the screen states the procedure the software does not implement
- [ ] The archived (read-only) variant of the record shows the same balance and the same marks; there
      is no "written off" state and nothing is greyed differently
- [ ] Driven and reviewed with the **`playwright-cli` skill**; the accessibility snapshot must show the
      standing as text inside the cell, not as a title attribute or a bare colour
- [ ] Typecheck and lint pass

> **Amended 2026-08-29, after reviewing the built screen.** Three of the presentation criteria in
> US-29.7 and US-29.8 above were changed and are kept as written so the reasoning stays legible:
>
> - The Saldo is **signed, not worded**: „+2,00 €“ and „−2,00 €“ replace „Guthaben 2,00 €“ and
>   „Offen 2,00 €“; „ausgeglichen“ is unchanged. At a counter one glyph is read faster than a word,
>   and the sign is also what lets the tile be tinted without the colour carrying meaning alone
>   (US-03.4). `balanceKind` still reads the sign, and still exactly once.
> - **The history's standing mark follows it**, and the signed form is now the project-wide rule for
>   any amount that runs two ways rather than a decision about the balance: „−2,00 €“ short and
>   „+2,00 €“ over replace „2,00 € offen“ and „2,00 € zu viel“, with „genau“ unchanged for the same
>   reason „ausgeglichen“ is. Both go through one `signedAmount` helper in `src/i18n/de.ts`, and the
>   rule is written down in `docs/guideline/ui_styling_guide.md` §8. The paragraph "**The mark is a
>   word first**" below still holds — the mark states its meaning in text and the tint only repeats
>   it — but that text is now a sign rather than a word.
> - The Saldo tile is **tinted** on the counter — faint red for a debt, faint blue for a credit,
>   `Stat`'s muted fill when settled — through a new `BALANCE_STYLES` in `src/app/accents.ts`. The
>   customer record's `record-balance` stays untinted: it is an inline line, not a tile.
> - **Zu zahlen drops from `text-4xl` to `text-2xl`**, the Saldo's size, and the two are separated by
>   weight instead: `Zu zahlen` keeps semibold, the Saldo value goes `font-medium`. The Betrag field
>   moves onto the same line as its button, in both the serve and the correction form.
>
> `docs/handout/betriebsanleitung.md` §Saldo, `docs/architecture/08-crosscutting-concepts.md`,
> `12-glossary.md` and ADR-015 were updated with it.

### US-29.9: E2E — a part payment carried to the next hand-out

**Description:** As a developer, I need the whole chain proved end to end on both engines, so a part
payment is known to survive from the counter to the balance to the next week's amount to pay.

**Acceptance Criteria:**

- [ ] New `tests/e2e/balance.spec.ts`, running on **both** engines (`npm run test:e2e` and
      `npm run test:e2e:webkit`) over registers of its own in `tests/e2e/registers.ts` (ADR-012).
      No branching on `browserName` in `src/`
- [ ] The spine, in one spec: register a household → look it up at the counter → the amount to pay
      equals the price and the balance reads „ausgeglichen" → record a **part** payment → the record's
      history shows Gefordert, Gezahlt and „… offen", and the balance above it reads „Offen …"
- [ ] A second pass proves the carry: with the shortfall standing, look the household up again and
      assert the counter's **Zu zahlen** is the price plus the open amount while **Preis** is
      unchanged. This needs a second distribution day, which `tests/e2e/day.ts` already sets up for
      the age-13 and reminder specs
- [ ] The credit case: record a payment above the amount to pay, assert the **confirmation is
      demanded**, confirm it, and assert the balance reads „Guthaben …" and the next amount to pay is
      reduced — including the case where the credit exceeds the price and the amount to pay is
      `0,00 €`
- [ ] The cap case: a household whose price is capped at the Maximalpreis and which carries a debt
      shows an amount to pay **above** the cap, and the Preis tile still shows the cap (rule 4)
- [ ] The removal case: remove today's record and assert the balance returns to what it was, in the
      **same page load** the removal's confirmation lands in — the panel-coupling rule
      (`CLAUDE.md` §Testing): a write one panel makes must be proved on the panel that displays it,
      without navigating
- [ ] The existing specs are updated rather than duplicated: `serve.spec.ts`, `price-cap.spec.ts`,
      `customer-record.spec.ts`, `archive.spec.ts` and `reregistration.spec.ts` all assert the paid
      checkbox or the „Bezahlt: ja/nein" column and must be moved onto amounts
- [ ] `grep -rni "bezahlt\b" src/ tests/` and `grep -rn "\bpaid\b" src/ prisma/ tests/` return no
      survivor of the boolean flag — the US-27.5 sweep, repeated because this batch is also a removal
- [ ] Both suites green, with the dev server stopped first (leftover `next dev` **and** `next start`)

### US-29.10: The documents describe the balance, and an ADR records the derivation

**Description:** As the next developer — or DF themselves — I need the balance written down where the
project already keeps its decisions and its instructions.

**Acceptance Criteria:**

- [ ] **ADR-015: derive the customer balance from the hand-out history, never store it.** The context
      is that `CLAUDE.md` grants exactly three exceptions to derive-don't-store, each with an argument
      of its own kind, and a running balance is the classic candidate for a fourth. The decision is
      that it is not one: a stored balance and a hand-out history are two answers to one question, and
      a removed or corrected record would leave them disagreeing silently — which is the Excel failure
      this project exists to replace. The consequences are honest: every read of a balance replays a
      customer's history (~50 rows a year, ~240 customers, one distribution a week — irrelevant at
      this size, and the note says so), and a correction is automatically consistent for free.
      Recorded with the `record-adr` skill, including its row in the chapter 9 decision log
- [ ] `docs/architecture/05-building-block-view.md` gains `src/domain/distribution/balance.ts` in the
      domain listing
- [ ] `docs/architecture/06-runtime-view.md`'s hand-out walkthrough is updated: the counter derives an
      amount to pay, the staff member confirms or overwrites it, and the use case guards an
      overpayment
- [ ] `docs/architecture/08-crosscutting-concepts.md` §Money gains the balance: integer cents, signed,
      derived, and the one place the sign is read (`balanceKind`)
- [ ] `docs/architecture/03-context-and-scope.md` and `11-risks-and-technical-debt.md` are checked for
      the paid-flag description and corrected where they carry it
- [ ] `docs/handout/betriebsanleitung.md` (German, printable, DF's own) gains a **Saldo** section
      covering: what Guthaben and Offen mean; that the field is pre-filled and normally just
      confirmed; that a payment can be corrected **on the same day only**; and — the point of the
      section — **the procedure the software deliberately does not implement**: a mistake found later
      is put right by recording a compensating amount at the household's next hand-out (rule 8).
      Written for a volunteer, not a developer
- [ ] `tasks/README.md` §Seed values — the paragraph under the table explains what the price is and
      what the cap and the eggs do or do not touch. It gains a sentence on the balance: derived from
      the hand-out history, offsetting the price to give the amount to pay, and **not** capped. The
      §Index table is **not** touched: it lists the sixteen MVP PRDs by design, and US-17 onwards are
      already absent from it
- [ ] No document claims a hand-out is paid or unpaid

## Functional Requirements

- **FR-1:** The system must record, for every hand-out, the amount the household handed over, in whole
  euro cents, which may be zero, less than, equal to, or more than what was asked for.
- **FR-2:** The system must derive every customer's balance as the sum over their hand-outs of
  `paidCents − priceCents`, and must never store it.
- **FR-3:** The amount to pay must be `max(0, priceCents − balance)`: a debt raises it, a credit
  lowers it, and it is never negative. Credit is never paid out in cash.
- **FR-4:** The Maximalpreis must cap the price only. The amount to pay may exceed it when a debt is
  added on top.
- **FR-5:** The counter must show the amount to pay as the prominent figure, with the week's regular
  price and the balance beside it.
- **FR-6:** The balance must be worded, never signed: _Guthaben_ for a credit, _Offen_ for a debt,
  and a settled state for zero. No screen may show a leading minus.
- **FR-7:** The payment field must be pre-filled with the amount to pay, must accept cent amounts, and
  must be overwritable downwards to 0,00 € and upwards.
- **FR-8:** A payment above the amount asked for must be confirmed before it is written — both when
  first recorded and when corrected — and the confirmation must be enforced by the use case, not only
  by the screen. A payment below needs no confirmation.
- **FR-9:** A payment must be correctable on the Berlin calendar day it was recorded, and not after.
- **FR-10:** Removing a hand-out must remove its payment, and the balance must return to what it was.
  The screen must state this before the removal is confirmed.
- **FR-11:** The customer record must show, per hand-out, the amount asked for and the amount paid,
  marked _paid short_, _paid exactly_ or _paid over_ against the amount **asked for**, so clearing an
  old debt reads as exact.
- **FR-12:** Each mark must carry its meaning in words; colour may only reinforce it.
- **FR-13:** The customer record must state the balance as one figure above the hand-out history, in
  the counter's wording.
- **FR-14:** A debt must have no automatic consequence: the household is served normally and the staff
  member is informed and nothing more.
- **FR-15:** No audit entry is added for a payment differing from what was asked; the entries a
  hand-out, a correction and a removal already write are unchanged and must keep working.
- **FR-16:** An archived household must keep its history and its balance unchanged, with no
  "written off" mark; a household re-registering from an archived record must start at zero.
- **FR-17:** The system must impose no limit, floor, ceiling or warning threshold on a balance.

## Non-Goals

- **No „Zahlung erfassen".** Settling a debt without a hand-out — somebody dropping in to pay off
  3,00 € — is not built. It is the natural second step and also the proper fix for a mistake found
  late; until it exists, the procedure in the handout stands in for it.
- **No overview of everyone who owes money.** Balances are read customer by customer, at the counter
  and on the record. A debtors' list is deferred with „Zahlung erfassen" and should be revisited with
  it, once DF have run a few distributions with balances.
- **No note field on a payment.** The amount is the whole record of a part payment; a staff member who
  wants to write down _why_ uses the existing comment field on the customer.
- **No balance on the customer list, the card view or the counter's group roster.** The list is
  scanned, not read; the card is a representation of a printed card; the roster answers "who has
  collected", not "who owes".
- **No consequence of a debt in software** — no block, no warning, no threshold, no colour on the
  household's name. Rule 11 is a decision, not an omission.
- **No cash payout of a credit**, and therefore no negative amount to pay.
- **No separate audit trail for payments.**
- **No correction window beyond the day**, and no back-dated adjustment.
- **No interest, no rounding rule, no write-off, no instalment plan.** The balance is a sum of
  differences and nothing else touches it.
- **No per-group or per-household payment rule.**

## Design Considerations

**Why the payment row is its own row.** The counter's four derived tiles answer _what does this
household get and cost_; the payment row answers _what do I collect now_. Putting six tiles in one
grid would put the figure the transaction turns on at the far end of a row from the button that
performs it, and would move the price out of the fourth slot — the one change on this screen a staff
member could act on wrongly, and the reason US-28 put the eggs in third rather than shuffling
everything along. The payment row sits directly above the serve form, sized like the
Kundennummer/Kartennummer pair, so the amount, the field pre-filled with it and the button are read
in one downward glance.

**„Zu zahlen" and „Preis" must not be confusable.** They are the same kind of figure — euros — a few
centimetres apart, and for the overwhelming majority of households they are equal. The separation is
carried by the gap between the rows, by the size step, and by the label; not by colour, which is the
verdict's budget on this screen.

**„ausgeglichen", not „0,00 €".** A settled balance is a _state_, not a quantity, and the word says so
in a way a zero does not — a zero next to „Saldo" reads as an amount that happens to be nothing, and a
staff member glancing at it has to decide which. This is the mirror of the argument US-28 made for
showing `0` eggs: there, the absence _is_ the quantity and a blank would be indistinguishable from a
failure to render; here the absence is the ordinary state and naming it is what makes it legible.

**The confirmation is a refusal, not a dialog.** The counter has a queue at it, and nothing on this
screen may have to be dismissed before the next customer can be served — the reason the removal
confirmation is an inline `<details>` and not a modal. An overpayment comes back as an amber
`refusal` notice with the confirm button in it: the record is simply not written until the second
click, and walking away leaves nothing to clean up.

**The mark is a word first.** Red, green and blue are what DF asked for, and they are what a
practised eye reads a column by. They are not what the software _says_: every mark states „genau",
„2,00 € offen" or „2,00 € zu viel" in text, so the table survives greyscale printing — which is what
happens when a hand-out is disputed — and colour-blindness, which is the standing rule for every
accent in this application.

**The balance lives with the history, not with the tiles.** On the customer record the balance is a
summary of the hand-out history and belongs in its header, next to the count of hand-outs, where
opening one reveals the other. A fifth derived tile beside Erwachsene / Kinder / Eier / Preis would
claim it is a property of the household in the way those four are; it is a property of what has
happened to the household.

**Wording.** „Saldo" for the figure, „Guthaben" and „Offen" for its two directions, „Zu zahlen" for
the amount to collect, „Betrag" for the field, „Gefordert" and „Gezahlt" for the two history columns.
„Gefordert" rather than „Fällig" because it names what was actually asked for at the table on the day,
which is exactly what the mark is compared against.

## Technical Considerations

**This is the fifth batch to regenerate `prisma/migrations/`.** Confirmed with DF on 2026-08-28 that
no real customer data exists (ADR-009, `CLAUDE.md` §Database migrations). Two things to watch, both
of which have bitten before: the hand-written partial unique index on `Customer.customerNumber` must
be re-added to the generated migration, and `src/infrastructure/prisma/schema.test.ts` audits the
generated SQL for it and for `onDelete: Cascade`. Run `npm run db:reset` after the regeneration —
the schema and the database drift apart silently, and the first symptom is the settings screen
reporting that nothing is configured.

**The replay is O(history) per read, and that is the whole cost of the ADR.** A household collects
roughly fifty times a year; DF have ~240 households and run one distribution a week. The counter
replays one household's history, the record replays one, and the customer list replays none because
it does not show a balance. There is no query to add, because every caller already loads the rows it
needs for the once-per-day guard or the no-show count. If a future screen ever wants every
household's balance at once, the shape to reach for is the one `describeAllowances` already uses —
read the rows once, fold per customer — not a stored column.

**`balanceOf` and `replayPayments` must not be able to disagree**, which is why US-29.2 requires a
test asserting the last `balanceAfter` equals the plain sum. Two functions that compute the same
number from the same rows are exactly the situation this project keeps out of the data model, and it
is worth one test to keep it out of the code as well.

**The order of the guards in `recordAttendance` is load-bearing.** Eligibility, then once-per-day,
then the payment. A blocked household must be refused before an amount is looked at, or the screen
will ask a staff member to confirm a credit for somebody who cannot be served.

**The intermediate state in US-29.3 is deliberate.** Between the schema change and US-29.4 the use
cases bridge a boolean into an amount (`paid ? priceCents : 0`), which is exactly the behaviour that
exists today, so the app stays green. It is flagged in both stories and US-29.4 is in this batch and
not a follow-up for that reason — the same call US-28 made about the empty egg rule.

**`parseEuros` already refuses a negative amount**, a third decimal digit, and anything that is not a
number, and it throws the typed `InvalidEuroAmount`. The payment field must go through it and nothing
else; the use case does not re-check, and the doc comments say which layer owns the refusal. That
division is what keeps a second, quietly different parser from appearing.

**Every hand-written fake gains `setPayment` when the port does**, in the same commit — including the
one in `read-group-roster.test.ts`, which implements the repository in full and is easy to miss
because that use case has nothing to do with payments.

**Coverage.** `domain/` and `application/` are gated at 100%. The branches most likely to be left
uncovered are the credit-exceeds-price floor in `amountToPay`, the `SETTLED` arm of `balanceKind`, the
empty-history arms of both `balanceOf` and `replayPayments`, and the confirmed-overpayment path in
both use cases. Each has a named test above.

**Enter must still not submit.** `src/app/enter-guard.ts` exists because Enter in a data-entry form
was submitting it (#123). The new amount field is a text input inside the counter's form and inherits
that guard; it is worth an explicit check in the browser session, because a field that submits on
Enter would make an unconfirmed overpayment one keystroke away.

## Success Metrics

- A household that hands over 2,00 € of a 5,00 € price has that recorded in the software, and the
  3,00 € appears in what they are asked for at their next hand-out — without anyone writing it down.
- A staff member reads one figure at the counter and collects it, without consulting last week or
  doing arithmetic at the table.
- A staff member looking at a customer record can say why the balance is what it is, from the history
  alone.
- No screen shows a negative amount, and no screen asks anyone to interpret a sign.
- A mistyped credit cannot be written in one click.
- Removing a hand-out returns the balance to exactly what it was, every time, because there is nothing
  to keep in step.
- The Excel column DF keep by hand for part payments is retired.

## Open Questions

- **How soon does „Zahlung erfassen" become necessary?** It is the proper fix for a mistake found
  after the day, and until it exists the handout carries a human procedure in its place. Worth
  revisiting — together with the debtors' overview, since they are one piece of work — once DF have
  run a few distributions with balances. **Not designed for here.**
- **Does an open amount ever need to be visible before the counter?** Today it is not: a household
  with a debt is served normally and nothing marks them on the register or the group roster (rule 11).
  If staff report being surprised at the table, the cheapest change is a line on the roster, not a
  consequence in software.
- **Does a credit ever need to be written off** — a household leaves the register with 4,00 € standing
  to them? Today the archived record simply keeps it, unmarked, and a re-registration starts at zero.
  Assumed sufficient; a write-off would need an audit entry and a reason, which is a different feature.
- **Should the counter state the balance for a household already served today?** The screen currently
  shows the balance as it stands after today's payment, which is the true answer but is a different
  question from the one the row above it answers. Watch how it reads at a real distribution.
