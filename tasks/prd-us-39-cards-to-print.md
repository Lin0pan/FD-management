# PRD: „Karten drucken" — a reminder for cards still to be printed (US-39)

> Source: `local_only/cards-to-print/requirement.md` (refined 01.10.2026, all questions answered;
> German original `requirement-de.md`). The decisions table there (§"Decisions from refinement",
> #1–#12) is cited below as **D1–D12**. Listed as "Known future work" in the US-38 PRD's non-goals.

## Introduction

The software prints no cards. It shows the card on screen (`/kunden/[id]/karte`), and DF copy it by
hand or transfer it into their own printing system (US-02). In practice a household does not always
get the printed card straight away: sometimes DF hand out a **temporary card** and print the real one
later. Today nothing but the staff's memory keeps track of that, so a card that still has to be
printed can be forgotten — and a household can be left on a temporary card for good.

This batch makes every newly issued card either **printed** or **not yet printed**, and collects
the not-yet-printed ones in a list, **„Karten drucken"**, that DF tick off. It is a real to-do in
the sense of US-38: working through it brings it back to 0, so it gets a row in „Zu erledigen" on
Start (only while something is open) and a tile under „Übersichten" (always, 0 included).

It is the step **after** „Karten neu ausstellen", not the same list:

| List                      | Question                                                          |
| ------------------------- | ----------------------------------------------------------------- |
| **Karten neu ausstellen** | A card _should_ be issued (counts changed), but has not been yet. |
| **Karten drucken**        | A card _has been_ issued and is valid, but its paper is missing.  |

A household reissued from the first list therefore moves into the second, unless the card is
printed on the spot.

**Nothing changes at the counter (D3, D11).** A not-yet-printed card is fully valid the moment it
is issued — the card number is what counts, exactly as before. The software does not know about the
temporary card and does not need to.

## Goals

- Every card carries one new fact: **when it was printed**, or that it has not been yet.
- When a card is issued **by hand** — registration, loss/damage, changed counts — DF can state in
  the same step that it is already printed: a checkbox **„Karte ist bereits gedruckt"**, empty by
  default (D1, D2, D12).
- A card issued **automatically** — a customer-number change, which includes a group change — always
  starts **not yet printed** (requirement §3).
- One list, `/karten-drucken`, of every household whose **current** card is not yet printed, where
  each is ticked off one at a time (D5, D8) and a tick can be undone right afterwards (D7).
- „Karten drucken" appears in „Zu erledigen" while its count is above 0 and as a tile under
  Übersichten always, counted by the same use case (US-38's rule).
- The printed date is visible in the card history on the card view; ticking and undoing are audited
  (D9).

## Rules (from the requirement)

- **Opt-in.** Without a statement, a card counts as not yet printed (D2).
- **The reminder ends at printing, not at handover** (D3). Whether DF tick when printing or when
  handing over is their call; the software shows nothing extra anywhere.
- **At most one entry per household: its current card** (D4). A not-yet-printed card that is
  replaced leaves the list — it no longer needs printing. The new card takes its place if it, too,
  is not yet printed.
- **Archived households leave the list, blocked ones stay** (D6). A blocked household keeps its
  number and comes back; an archived one never comes, and a re-registered household gets a new card
  anyway.
- **Undo only in the list, plainly and without a reason** (D7). Right after ticking off, the list
  shows what was just ticked off and offers the undo there. There is no undo anywhere else.
- **Every card existing at go-live counts as printed** (D10). The list starts empty.

## User stories

### US-39.1: A card knows whether it has been printed (domain + schema + infrastructure)

**Description:** As a developer, I need each card to record when it was printed, so that the list,
the card history and the tick-off all read one stored fact.

**Acceptance Criteria:**

- [ ] `IssuedCard` (`src/domain/card/card.ts`) gains `readonly printedAt: Date | null` — `null`
      means not yet printed. `NewCard` gains the same field, so **every writer states it**; there is
      no default.
- [ ] Two pure domain functions in `src/domain/card/card.ts`, TDD first:
  - `markPrinted(card, at)` returns the card with `printedAt = at`; throws **`CardAlreadyPrinted`**
    if `printedAt` is already set (a second tick must not move the first date);
  - `unmarkPrinted(card)` returns the card with `printedAt = null`; throws **`CardNotPrinted`** if
    it is not printed.
    Named tests: `records the day a card was printed`, `refuses to tick off a card twice`,
    `takes a tick back`, `refuses to take back a tick that was never made`.
- [ ] `CardAlreadyPrinted`, `CardNotPrinted` and `CardSuperseded` (used in US-39.3) added to
      `src/domain/errors.ts` as typed domain errors, each tiered in `TIERS`
      (`src/app/notice-tier.ts`) — the build fails until they are.
- [ ] `prisma/schema.prisma`: `Card.printedAt DateTime?`, with a short `///` comment: it is a
      recorded **event**, not a derived value, and it is the one column of a card row that changes
      after the insert (ticked, or taken back); the snapshot columns beside it still never do. Cite
      ADR-022 (written in US-39.9).
- [ ] Migrations regenerated per CLAUDE.md "Database migrations" (still pre-release): delete
      `prisma/migrations/`, `npx prisma migrate dev --name init`, then **re-add both hand-written
      indexes** — the partial unique index on `Customer.customerNumber` (`WHERE "status" <>
  'ARCHIVED'`) and the one-running-session index (`WHERE "endedAt" IS NULL AND "discardedAt" IS
  NULL`) — copied verbatim with their comments from the old migration. `npm run db:reset`.
- [ ] `PrismaCardRepository` reads and writes `printedAt` on every path: `currentCard`, `listCards`,
      `issue`, and the card written inside `PrismaCustomerRepository.changeCustomerNumber`. The
      customer read model's current card (`customer.card`, used by `listWithStatus`) carries it too.
- [ ] Every caller compiles by passing `printedAt: null` for now (`issueCard`, `registerCustomer`,
      `changeCustomerNumber`); behaviour arrives in US-39.2.
- [ ] Both seeds (`prisma/seed.ts`, `prisma/demo-seed.ts`) write `printedAt = issuedAt` for every
      card — D10: what exists at go-live counts as printed.
- [ ] **Every e2e spec that inserts a card directly** (`grep -n "cards: {" tests/e2e/*.ts` — about
      twenty specs) states `printedAt` explicitly: `issuedAt`'s value unless the spec is about an
      unprinted card. Otherwise those households silently land on the new list and any spec that
      asserts an empty „Zu erledigen" breaks.
- [ ] Every hand-written fake `CardRepository` / `CustomerRepository` in the application tests
      carries the field.
- [ ] Infrastructure integration test (throwaway SQLite): a card issued with `printedAt` set and one
      with `null` read back as written, through `currentCard` and `listCards`.
- [ ] `src/infrastructure/prisma/schema.test.ts` still passes (no `onDelete: Cascade`, no implicit
      `SetNull`).
- [ ] Typecheck, lint and `npm run test:coverage` pass (domain and application at 100%).

### US-39.2: Issuing a card states whether it is printed (application)

**Description:** As DF, I want to say when I issue a card by hand that it is already printed, so
that a card I printed on the spot never reminds me to print it.

**Acceptance Criteria:**

- [ ] `issueCard` input (`src/application/customers/issue-card.ts`) gains `printed: boolean`
      (required, not optional). `printed: true` writes `printedAt` = the same `now` the card's
      `issuedAt` uses — one read of the clock, one event. `printed: false` writes `null`.
- [ ] `reissueCard` passes it through unchanged.
- [ ] `registerCustomer` input gains `cardPrinted: boolean`, handled the same way for the first card
      (D1: registration counts as issuing by hand).
- [ ] `changeCustomerNumber` always writes `printedAt: null` — there is no moment in which DF could
      say otherwise. It takes **no** such input; a test proves the card it prints is unprinted.
- [ ] The issue's audit entry names `printedAt` among `changedFields` **when** the card was issued
      as printed (`["card", "printedAt"]`), and stays `["card"]` otherwise; the registration's
      `REGISTERED_FIELDS` likewise gains `printedAt` only when ticked.
- [ ] The three server actions that issue a card (`src/app/kunden/neu/actions.ts`,
      `src/app/kunden/[id]/actions.ts` → `reissueCardAction`,
      `src/app/karten-neuausstellung/actions.ts`) pass `false` for now, so behaviour on screen is
      unchanged until US-39.5.
- [ ] TDD against hand-written fakes. Named tests: `issues a card as printed when DF say so`,
      `issues a card as not yet printed unless DF say otherwise`,
      `registers the first card as printed when DF say so`,
      `prints a moved household's card as not yet printed`,
      `names the printed date in the audit entry only when it was given`.
- [ ] Typecheck, lint and `npm run test:coverage` pass.

### US-39.3: Ticking a card off, and taking the tick back (application + port + adapter)

**Description:** As DF, I want to tick a card off once it is printed — and take that back if I
clicked the wrong row — so that the list says what is really still to print.

**Acceptance Criteria:**

- [ ] New port method on `CardRepository` (`src/application/ports.ts`), documented once on the
      port: `setPrintedAt(customerId: number, index: number, printedAt: Date | null): Promise<void>`.
      Implemented in `PrismaCardRepository`; every fake gains it.
- [ ] New use case `src/application/customers/mark-card-printed.ts`:
      `markCardPrinted(deps, { customerId, index })`. It reads the customer and their current card
      and:
  - throws `CustomerNotFound` / `CustomerArchived` as `issueCard` does;
  - throws **`CardSuperseded`** if `index` is not the household's current card — the row DF saw was
    replaced in the meantime (D4);
  - applies `markPrinted(card, clock.now())` (so `CardAlreadyPrinted` comes from the domain);
  - writes through `setPrintedAt` and appends an audit entry
    `{ what: "customer.card.printed", changedFields: ["printedAt"], when: now, why: "" }`.
- [ ] New use case `undoCardPrinted(deps, { customerId, index })` in the same module family
      (`undo-card-printed.ts`): same guards, `unmarkPrinted`, `setPrintedAt(…, null)`, audit
      `{ what: "customer.card.printUndone", changedFields: ["printedAt"], when: now, why: "" }`.
      **No reason is asked for** (D7).
- [ ] A blocked household may be ticked off and taken back (D6) — test it.
- [ ] Both carry full `@throws` lists.
- [ ] TDD against hand-written fakes. Named tests:
      `ticks off the card a household holds`, `refuses to tick off a card that has been replaced`,
      `refuses to tick off a card twice`, `takes back a tick without asking why`,
      `ticks off a blocked household's card`, `refuses an archived household's card`,
      `writes an audit entry for the tick and for taking it back`.
- [ ] Infrastructure integration test: `setPrintedAt` sets and clears the column of exactly one
      card row.
- [ ] Typecheck, lint and `npm run test:coverage` pass.

### US-39.4: The „Karten drucken" list (application + screen)

**Description:** As DF, I want one list of every household whose card still has to be printed, with
a tick-off per row, so that no card is forgotten.

**Acceptance Criteria:**

- [ ] New use case `src/application/customers/cards-to-print.ts`:
  - `listCardsToPrint(deps)` reads `listWithStatus("ACTIVE")` and `listWithStatus("BLOCKED")`
    (archived excluded, D6) and keeps every household whose **current** card has
    `printedAt === null` — so a replaced card is never listed (D4) and each household appears at
    most once;
  - each row: `customerId`, `customerNumber`, `firstName`, `lastName`, `blocked: boolean`, the card's
    `index`, `cardNumber` (`formatCardNumber(card.customerNumber, card.index)` — the card's own slot,
    ADR-016), `issuedAt`, `reason`;
  - ordered **oldest `issuedAt` first**, ties by customer number — the household waiting longest on
    a temporary card is on top;
  - `countCardsToPrint(deps)` built from `listCardsToPrint` and measured, the shape
    `countCardsDueForReissue` takes.
    Named tests: `lists a household whose card is not yet printed`,
    `leaves out a household whose card is printed`, `lists only the card a household holds`,
    `keeps a blocked household on the list`, `drops an archived household from the list`,
    `puts the longest-waiting card first`, `counts exactly the rows it lists`.
- [ ] New route `src/app/karten-drucken/page.tsx`, `force-dynamic`, calling `listCardsToPrint` and
      nothing else; deps from an existing composition root (`src/app/kunden/deps.ts`).
- [ ] `h1` „Karten drucken" (`de.cardsToPrint.heading`). One row per household (test id
      `cards-to-print-row`): the card number, the name linking to `/kunden/[id]/karte` (so DF can
      open the card to print it), the issue date and the reason in the words
      `de.customers.cardReasons` already has. A blocked household's row shows the existing blocked
      state word — the only extra.
- [ ] One button per row, **„Gedruckt"** (test id `cards-to-print-submit`), with an icon registered
      in `ui_styling_guide.md` §12 (proposal: `Printer`, „mark as printed"). No confirmation step —
      the undo is the safety net. Hidden fields `customerId` and `index`.
- [ ] Server action `markCardPrintedAction` in `src/app/karten-drucken/actions.ts`: Zod-validates the
      two ids, calls `markCardPrinted`, revalidates `/karten-drucken`, `/`, `/uebersichten`,
      `/kunden/[id]` and `/kunden/[id]/karte`, then **redirects** to
      `/karten-drucken?kunde=<customerId>&karte=<index>` — as `reissueStaleCardAction` does, because
      the row it was submitted from disappears. Refusals (`CardSuperseded`, `CardAlreadyPrinted`,
      `CustomerArchived`) come back as a notice beside the row, in German from `de.ts`, tiered by
      `tierOf`.
- [ ] **Undo, right after (D7).** When the two params name a card that is still the household's
      current card and is printed, the page shows above the list a `Confirmation` naming the card
      and the household (test id `cards-to-print-done`) with a button **„Rückgängig"** (test id
      `cards-to-print-undo`). `undoCardPrintedAction` calls `undoCardPrinted`, revalidates the same
      paths and redirects to `/karten-drucken` with no params — the row is back. Params naming
      anything else render no notice and no error. Nowhere else offers an undo.
- [ ] Empty list: the heading and one plain line from `de.ts` (e.g. „Keine Karten zu drucken."), no
      explanation of what the list is for (CLAUDE.md, "Don't explain the screen").
- [ ] A back link to `/uebersichten` in the shape `/karten-neuausstellung` has (`BackLink`, test id
      `cards-to-print-back`).
- [ ] `/karten-drucken` belongs to the **Übersichten** tab: added to its `routes` in
      `src/app/active-section.ts`, asserted in `active-section.test.ts`, and added to the routes
      `navigation.spec.ts` checks mark `nav-overviews` and nothing else.
- [ ] All German strings in `src/i18n/de.ts` under a new `cardsToPrint` group.
- [ ] Typecheck, lint, `npm run test:coverage` and `npm run test:e2e` pass.
- [ ] Driven and reviewed with the `playwright-cli` skill (accessibility snapshot: each row's button
      has a name that says which card it ticks off).

### US-39.5: The checkbox „Karte ist bereits gedruckt" on every manual issue (presentation)

**Description:** As DF, I want to tick „Karte ist bereits gedruckt" when I issue a card I have
printed on the spot, so that it never reaches the list.

**Acceptance Criteria:**

- [ ] A checkbox labelled **„Karte ist bereits gedruckt"** (`de.cardsToPrint.alreadyPrinted`),
      **unticked by default** (D2), in all three places a card is issued by hand:
  - the registration form (`src/app/kunden/neu/registration-form.tsx`), near the submit button —
    test id `registration-card-printed`;
  - the loss reissue control (`src/app/kunden/[id]/reissue-controls.tsx`, used on the record and on
    the card view), inside the confirmation step beside the submit — test id `reissue-printed`;
  - the stale-card reissue control on `/karten-neuausstellung`
    (`stale-card-controls.tsx`) — test id `stale-reissue-printed`.
- [ ] The three actions read the checkbox (`formData.get(…) === "on"`, Zod-validated) and pass it to
      `registerCustomer` (`cardPrinted`) / `reissueCard` (`printed`) instead of the `false` from
      US-39.2. A re-rendered registration form after a validation error keeps the box as it was.
- [ ] Every issuing action also revalidates `/`, `/uebersichten` and `/karten-drucken`, so the count
      follows.
- [ ] The number-change control gets **no** checkbox.
- [ ] No hint text under the checkbox — its label is the whole statement.
- [ ] Typecheck, lint and `npm run test:e2e` pass.
- [ ] Driven and reviewed with the `playwright-cli` skill.

### US-39.6: „Karten drucken" in Übersichten and in „Zu erledigen" (application + presentation)

**Description:** As DF, I want Start to tell me when cards are waiting to be printed, and
Übersichten to show how many, so that I do not have to remember to look.

**Acceptance Criteria:**

- [ ] `readOverviews` returns `{ cardsDue, cardsToPrint, pastSessions }`, `cardsToPrint` read through
      `countCardsToPrint` — never a second derivation.
- [ ] `ToDoKind` gains `"CARDS_TO_PRINT"`; `listToDos` lists `CARDS_DUE` then `CARDS_TO_PRINT` (the
      two consecutive steps, in order), each omitted at 0. Named tests:
      `lists the cards to print with their count`,
      `counts the cards to print exactly as the overview does`,
      `leaves the cards to print off the list when none are waiting`.
- [ ] `LISTS` in `src/app/uebersichten/lists.ts` gains
      `cardsToPrint: { href: "/karten-drucken", name: de.cardsToPrint.countedName }` — the name
      inflected by count like its siblings (`countedName`).
- [ ] Übersichten, area **Kunden**: a second `ListLink` after the cards-due tile, test ids
      `overview-cards-to-print` / `overview-cards-to-print-link`, shown at 0 too.
- [ ] Start's „Zu erledigen": the `ToDoKind` → list mapping gains the new kind (the build fails until
      it does). Test ids `to-do-cards-to-print` / `to-do-cards-to-print-count`.
- [ ] Neutral styling, as for every to-do — no amber, no red.
- [ ] The Kunden hub gets **no** link for this list (not asked for; see Non-goals).
- [ ] Typecheck, lint, `npm run test:coverage` and `npm run test:e2e` pass.
- [ ] Driven and reviewed with the `playwright-cli` skill.

### US-39.7: The printed date in the card history (presentation)

**Description:** As DF, I want to see on the card view when each card was printed, so that I can
answer "has this household had its proper card yet?" without the list.

**Acceptance Criteria:**

- [ ] The card view's read model (`src/application/customers/read-card.ts`) carries `printedAt` for
      the current card and for every superseded one (it comes with `IssuedCard`).
- [ ] Current card (`/kunden/[id]/karte`, the `dl` beside „Ausgestellt am" / „Grund"): a third entry
      **„Gedruckt am: 01.10.2026"**, or **„Gedruckt: noch nicht"** when `printedAt` is null. Test id
      `card-printed-at`.
- [ ] Each superseded entry (`de.customers.cardView.supersededEntry`) names the printed date, or that
      it was never printed — e.g. `12k2 — ausgestellt am 03.09.2026, gedruckt am 05.09.2026, Grund:
  Verlust` / `…, nicht gedruckt, Grund: …`.
- [ ] Nothing about printing appears on the counter screen (D3, D11).
- [ ] Typecheck, lint, `npm run test:coverage` and `npm run test:e2e` pass.
- [ ] Driven and reviewed with the `playwright-cli` skill.

### US-39.8: The whole round trip, proved end to end (e2e)

**Description:** As a developer, I want the list's promises proved through the screens: a card
enters on issue, leaves on tick, comes back on undo, and the three counts agree.

**Acceptance Criteria:**

- [ ] New `tests/e2e/cards-to-print.spec.ts`, **isolated** (it makes claims about the whole register,
      like `overviews.spec.ts`; add it to the isolated specs in `tests/e2e/registers.ts`, ADR-012):
  - empty register: Start has no `to-do-cards-to-print`, the Übersichten tile reads 0;
  - registering a household **without** the checkbox: the household is on `/karten-drucken`, Start
    shows the row with 1, the tile reads 1 — and the counter still answers „Ausgabe frei" for the
    new card number (D11);
  - registering a second household **with** the checkbox: it is not on the list, counts unchanged,
    and its card view shows „Gedruckt am …" with today;
  - ticking off the first household: it leaves the list, the confirmation and „Rückgängig" show;
    pressing „Rückgängig" puts it back; ticking off again and reloading `/karten-drucken` shows no
    undo any more; Start's row is gone and the card view shows the printed date;
  - reissuing for loss without the checkbox puts the household back on the list with the **new**
    card number only (one row — D4);
  - changing a household's customer number puts it on the list with the new card number (automatic
    issue, requirement §3);
  - blocking a listed household keeps it on the list; archiving it removes it (D6).
- [ ] `overviews.spec.ts` updated where its claims now depend on printing: its seeded card states
      `printedAt`, and the stale-card reissue in "drops the to-do from Start once the card is
      reissued" ticks `stale-reissue-printed` (or the assertion narrows to `to-do-cards-due`), so the
      test still proves what it was written to prove.
- [ ] `home.spec.ts`, `reissue.spec.ts`, `registration.spec.ts`, `number-change.spec.ts` and
      `navigation.spec.ts` still pass; any of them asserting an empty „Zu erledigen" is adjusted
      deliberately, not by deleting the assertion.
- [ ] Both engines pass: `npm run test:e2e` and `npm run test:e2e:webkit`.

### US-39.9: Betriebsanleitung, ADR and architecture record (documentation)

**Description:** As DF, I want the handout to explain the checkbox and the list, and as a future
maintainer I want the decision to store a printed date recorded.

**Acceptance Criteria:**

- [ ] `docs/handout/betriebsanleitung.md` (German, printable): a short section **„Karten drucken"** —
      what the checkbox „Karte ist bereits gedruckt" does, that a card from a number change always
      lands on the list, that a ticked card can only be taken back right after ticking, and that the
      list is under Übersichten and in „Zu erledigen". The Übersichten section lists the new tile.
- [ ] **ADR-022** via the `record-adr` skill: _record when a card was printed on the card row_ —
      a stored **event** (not a derivable value, so not a fifth "derive, don't store" exception);
      nullable, `null` = not printed; the one column of a card row that changes after the insert
      (tick, undo); undo clears it and the audit log keeps both events; alternatives weighed (a
      separate `CardPrint` table; a flag without a date). Row added to the chapter 9 log.
- [ ] arc42 via the `arc42` skill: **05** — the `/karten-drucken` route, the four new use cases
      (`listCardsToPrint`/`countCardsToPrint`, `markCardPrinted`, `undoCardPrinted`), the new port
      method; **08** if the audit-event list lives there; **12** — _gedruckt_ / _Karten drucken_ if
      worth fixing.
- [ ] `CLAUDE.md`: the "Don't skip the audit entry" list gains _ticking a card off as printed or
      taking that back_; the `Card` bullet under "Derive, don't store" notes that `printedAt` is a
      recorded event beside the snapshots (cite ADR-022) — one line, no history.
- [ ] `ui_styling_guide.md` §12 registers the tick-off icon (and the undo icon, if one is used).
- [ ] `scripts/ralph/prds/README.md` gains the batch 39 row and a short paragraph: schema change
      (migrations regenerated, both hand-written indexes re-added), one new port method, two domain
      functions, three typed errors, ADR-022.
- [ ] `npm run arc42:check` passes.

## Functional requirements

- **FR-1:** Every card has a printed date or none. No date means "not yet printed".
- **FR-2:** Registration, the loss reissue (customer record and card view) and the stale-counts
  reissue (`/karten-neuausstellung`) each offer the checkbox „Karte ist bereits gedruckt",
  unticked by default. Ticked, the card's printed date is the moment of issue; unticked, the card is
  not yet printed.
- **FR-3:** A card issued by a customer-number change is always not yet printed. No checkbox is
  offered there.
- **FR-4:** `/karten-drucken` lists every **active or blocked** household whose **current** card is
  not yet printed — one row per household — oldest issue first.
- **FR-5:** A row is ticked off with one button, one row at a time. The card's printed date becomes
  now and the row leaves the list.
- **FR-6:** Immediately after a tick, the list shows which card was ticked off and offers
  „Rückgängig", which clears the printed date and returns the row. No reason is asked. No other
  screen offers an undo, and once the page is left or reloaded the offer is gone.
- **FR-7:** A not-yet-printed card that is replaced by a new card leaves the list. Archiving a
  household removes it from the list; blocking does not.
- **FR-8:** „Karten drucken" appears in Start's „Zu erledigen" only while its count is above 0, and
  as a tile under Übersichten (area Kunden) always, 0 included. Row and tile link to
  `/karten-drucken` and show the same count from one use case.
- **FR-9:** `/karten-drucken` marks the Übersichten tab.
- **FR-10:** The card view shows each card's printed date, or that it was not (yet) printed.
- **FR-11:** Ticking off and undoing each write an audit entry (what and when, never who); an issue
  with the checkbox ticked names `printedAt` among the changed fields.
- **FR-12:** Every card that exists at go-live counts as printed; the list starts empty.
- **FR-13:** Nothing changes at the counter: a not-yet-printed card is valid exactly like a printed
  one.

## Non-goals

- **No batch tick-off** (D8) — one at a time; revisited after DF feedback.
- **No printing.** The software still prints nothing; "printed" is DF's statement.
- **No "handed over" state** (D3) and no notion of a temporary card (D11).
- **Nothing at the counter** — no hint, no colour, no verdict change.
- **No undo outside the list and no undo later** (D7); no time window enforced beyond "the notice
  right after the tick".
- **No link from the Kunden hub** to the new list — not asked for; Start and Übersichten carry it.
- **No backfill logic** for real data: the project is pre-release, the seeds mark their cards
  printed (D10). If DF hold real data by the time this runs, see Open questions.

## Design considerations

- `/karten-drucken` is built like `/karten-neuausstellung` (D12): same shell, heading, row layout,
  back link and post-write redirect-with-notice pattern. Reuse `Confirmation`, `Notice`,
  `useNoticeSlot`, `BackLink`, `ListLink`, the blocked `StateWord`.
- Sketch:

  ```
  ← Übersichten
  Karten drucken

  [✓ 12k3 für Erika Muster als gedruckt abgehakt.   (Rückgängig)]

  7k2   Max Beispiel        ausgestellt 28.09.2026 · Verlust              [🖨 Gedruckt]
  31k5  Anna Probe (gesperrt) ausgestellt 30.09.2026 · Kundennummer geändert [🖨 Gedruckt]
  ```

- The checkbox sits directly above the button that issues the card, so the statement and the act
  are one step.
- „Zu erledigen" rows stay neutral (US-38.4); a card waiting to be printed is not an alarm.

## Technical considerations

- **Why a stored date and not something derived:** printing happens outside the software; the only
  source is DF's statement, so it must be recorded. It is an event, like an archive date — not one
  of the "derive, don't store" exceptions. ADR-022 records it.
- **The card row gains its first mutable column.** Every other card column is a snapshot and stays
  never-updated; `setPrintedAt` touches `printedAt` only. Say so on the schema comment and the port.
- **Identify a card by `(customerId, index)`**, which `@@unique([customerId, index])` already
  guarantees. Passing the index from the row DF saw is what lets `markCardPrinted` notice the card
  was replaced in the meantime (`CardSuperseded`) instead of ticking off a card DF never looked at.
- **One count, one source.** `countCardsToPrint` measures `listCardsToPrint`; `readOverviews` and
  `listToDos` go through it. The `Record<keyof Overviews, …>` in `lists.ts` and the `ToDoKind`
  mapping fail the build until the new list has a place — that is the mechanism working.
- **Story order matters for the build:** the list page (US-39.4) exists before `readOverviews`
  gains `cardsToPrint` (US-39.6), so `LISTS` never points at a route that 404s.
- **Cost:** `listCardsToPrint` reads the active and blocked register (~240 rows) on every Start
  load, as cards-due already does. Fine at this size; do not cache.
- **e2e direct inserts:** about twenty specs create cards through Prisma. Because `printedAt` is
  nullable, an insert that omits it silently produces an unprinted card — US-39.1 makes each state
  it.
- Migrations: regenerating drops the two hand-written partial indexes unless they are put back
  (as batches 25, 26 and 34 had to).

## Success metrics

- No card issued without the checkbox can be forgotten: it is visible on Start until ticked off.
- Start, Übersichten and the list show the same count in the e2e spec.
- DF can answer "was this card printed, and when?" from the card view alone.

## Open questions

- **Re-confirm pre-release status before the run.** Last confirmed 2026-08-24; D10's "existing
  cards count as printed" implies go-live has not happened. If DF already hold real data, US-39.1
  must append a migration that adds the column and sets `printedAt = issuedAt` for every existing
  card, instead of regenerating the history.
- Icon for „Gedruckt": `Printer` is proposed; confirm during the `playwright-cli` review.
