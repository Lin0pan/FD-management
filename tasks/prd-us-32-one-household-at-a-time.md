# PRD: One household at a time at the counter (US-32)

> Source: `local_only/ausgabe_screen/refined-requirements.md` — DF's feedback after working real
> afternoons on `/ausgabe`, with their answers to the first round of questions folded in. Two changes
> to one screen, R-1 … R-15 there, §US-32.1 … §US-32.9 here.

## Introduction

`/ausgabe` is the counter. A staff member types a number, reads the verdict, takes the money and
records the hand-out, ~120 times an afternoon. Two things were built around that loop before anyone
had stood at it, and DF have now told us both are wrong.

**The walk (US-21) is unusable.** `Zurück` and `Weiter` step through today's group in customer-number
order. DF do not call households that way: they call them in **blocks** — "everyone from 1 to 30 now"
— and within a block the households arrive in whatever order they turn up. The person standing at the
counter is therefore almost never the next number after the one just served, and a control that steps
one number forward matches no moment of the afternoon. The buttons were not wrong; the assumption
behind them was. US-21 is **withdrawn**, the way US-22 withdrew the week-colour lookup.

**The served household stays on screen.** After `Ausgabe erfassen` the verdict, the counts, the price,
the certificate row and the block and archive controls all stand, and the confirmation appears beside
the button two screens down. Everything on that screen is finished business, and the next person is
already at the counter — so the screen is showing one household while another is standing in front of
it, and the staff member has to scroll back up past a record that no longer concerns them. A recorded
hand-out must **clear the screen** and say what it booked, at the top, where a navigation lands.

Both changes are the same screen and largely the same files, so they are one PRD and one batch. What
the counter reads like afterwards:

> Type a number → read the verdict → take the money → press `Ausgabe erfassen` → the screen is empty
> again, one line at the top says who was just served for how much and when, and the group tally is
> one higher. One loop, one control, no state left over between two households — and one click back
> to the last household while the memory of it is still fresh.

## Goals

- The counter has **no next-household navigation**. Typing a number is the only way in, plus clicking
  a name in the group list, which is staff finding one named person and not a walk.
- A recorded hand-out returns the screen to its **initial state**: banner, group progress, empty
  focused number field.
- The confirmation **names the household and the transaction** — number, name, amount, time — because
  the household it is about is no longer on the screen, and carries **one click back to them**.
- Looking a served household up again still shows them, their hand-out and the controls to change or
  remove it. Clearing the screen must not make a correction unreachable.
- Looking a served household up is stated as a **fact**, not answered „Ausgabe frei" and not painted
  red. No second hand-out is offered, which is what enforces the rule.
- Nothing about what is recorded, how the price or the balance is derived, or what is audited changes.
  This PRD is about what the screen shows after the write.

## User Stories

### US-32.1: Remove `Zurück`, `Weiter` and the walk sentence from the counter (presentation)

**Description:** As a staff member, I want the counter to offer the one control I actually use, so
that nothing on the row I type into steps somewhere I never go.

**Acceptance Criteria:**

- [ ] `WalkControl`, `walkHint`, the `WALK_CONTROL` constant and the `walkFromStart` binding are
      deleted from `src/app/ausgabe/page.tsx`, along with the two `<WalkControl>` elements in the
      lookup form and the `walk-hint` paragraph below it.
- [ ] The `ChevronLeft` and `ChevronRight` imports go with them. `Search` stays — `Nachschlagen`
      wears it — and so does `CircleAlert` on `ErrorNote`.
- [ ] `readGroupRoster` is called with **no second argument**: the position the walk stood at is
      nobody's question now. The `Promise.all` beside `lookUpNumber` stays as it is.
- [ ] The lookup form is otherwise untouched: `method="get"`, the `nummer` input, `autoFocus`, the
      `counter-input` testid and `Nachschlagen`. Nothing is added in the space that frees up.
- [ ] The `de.distribution.walk` block is removed in full from `src/i18n/de.ts` — `previous`, `next`
      and all four `hints`. `de.distribution.progress.*` is untouched.
- [ ] `tests/e2e/group-walk.spec.ts` is **deleted**, not skipped. It proves a feature that no longer
      exists.
- [ ] A grep for `walk` under `src/app/`, `src/i18n/` and `tests/` returns nothing but the roster's
      own remaining prose, which §US-32.2 rewrites.
- [ ] The testids `walk-previous`, `walk-next` and `walk-hint` appear nowhere in `src/` or `tests/`.
- [ ] `npm run lint`, `npm run typecheck` and `npm run build` pass; `npm run test:e2e` and
      `npm run test:e2e:webkit` pass in full, `group-progress.spec.ts` included and unmodified.
- [ ] Verified with the `playwright-cli` skill against a production build: the accessibility snapshot
      of `/ausgabe` shows one textbox and one submit on the counter row, and no link or button named
      „Zurück" or „Weiter".

### US-32.2: `readGroupRoster` stops answering "which number comes next" (application)

**Description:** As a developer, I want the roster to answer only the questions a screen still asks,
so no field survives whose only reader has been deleted.

**Acceptance Criteria:**

- [ ] `GroupRosterView` loses `previous` and `next`. `group`, `isEmpty`, `members` and `progress`
      stay: they are US-23's, not the walk's.
- [ ] `readGroupRoster(deps)` loses its `rawQuery` parameter, the `positionOf` helper and the
      `neighbours` import. The `counterQueryOrNull` import goes with `positionOf` — check it has no
      second use in the file before removing it.
- [ ] `isEmpty` **stays and keeps its meaning**, and its doc comment is rewritten: it is the group
      list's own empty state (`group-progress-card.tsx`), which is where it is read now, and no
      longer a statement about two dead controls.
- [ ] The module's opening comment is rewritten. It currently explains a walk in its first paragraph
      and three decisions about it; what survives is why the **week's own** colour is the group read
      (not `nextDistribution.colour`), why membership is `ACTIVE` + `BLOCKED`, and why the query is
      the existing `CustomerRepository.list` with the group narrowed in memory. The paragraph that
      explains the walk is replaced by one saying the roster outlived it: the walk was withdrawn
      (US-32), the tally and the list it was extended for (US-23) are what it is now for.
- [ ] `src/application/distribution/read-group-roster.test.ts` **loses the walk cases**: leads to the
      next and previous number, positions from a card number, positions around a number of the other
      group, walks from start on an unreadable or absent query, both ends walked out. The roster and
      progress cases stay — member order, `servedToday` by Berlin day key, joining by surrogate id,
      blocked listed but out of `expected`, one records query per day, the empty tally, and that the
      use case writes nothing.
- [ ] Where a surviving test merely _used_ `previous`/`next` to prove something else — which group is
      read on a non-distribution day is the one to check — it is **re-pointed**, not deleted: the rule
      it proves is not the walk's.
- [ ] No caller passes a second argument to `readGroupRoster` anywhere in `src/`.
- [ ] Application coverage stays at 100%; `npm run test:coverage` passes.

### US-32.3: Delete `groupWalk.ts` (domain)

**Description:** As the next developer, I want the domain to hold rules something reads, so that
`src/domain/distribution/` describes the distribution as it is run.

**Acceptance Criteria:**

- [ ] `src/domain/distribution/groupWalk.ts` and `src/domain/distribution/groupWalk.test.ts` are both
      deleted.
- [ ] A grep for `neighbours`, `Neighbours` and `groupWalk` across `src/` and `tests/` returns
      nothing.
- [ ] Nothing else in `src/domain/distribution/` is touched — `groupProgress.ts`, `attendance.ts`,
      `balance.ts` and `weekColour.ts` all have live readers.
- [ ] Domain coverage stays at 100% (deleting a fully covered module and its test moves the ratio,
      not the gate); `npm run test:coverage` passes.
- [ ] `npm run lint`, `npm run typecheck` and `npm run build` pass.

### US-32.4: The verdict learns whether the household has already collected today (domain)

**Description:** As a staff member, I want the counter to tell me that this household has already
collected today, instead of answering „Ausgabe frei" for someone who has.

**Acceptance Criteria:**

- [ ] `CounterInput` in `src/domain/distribution/counterVerdict.ts` gains
      `readonly servedToday: boolean` — whether a hand-out is recorded for this household on the
      Berlin day being evaluated. The rule takes the **fact**, never the record: it does no I/O and
      knows nothing about `DistributionRecord`.
- [ ] `evaluateAtCounter` returns `ALREADY_SERVED_TODAY` when `servedToday` is true, in the
      precedence **after `OUTDATED_CARD` and before the certificate check**: an archived, blocked,
      wrong-group or outdated-card household is that first, and a household that has collected is
      that rather than "clear to serve, certificate expired".
- [ ] The union's doc comment is corrected. It currently says the read-only lookup never produces
      `ALREADY_SERVED_TODAY` "because 'already served' is a fact of the day's distribution record
      rather than of the customer, and this rule takes no such record" — the second half stops being
      true, and the comment must say what the rule now takes and why it is a boolean rather than a
      record.
- [ ] The module's precedence paragraph is updated to list the new position, in the same sentence
      form as the rest.
- [ ] `certificateExpired(validUntil, today)` is **exported**. It is the seam §US-32.5 needs so the
      screen can still know an expired certificate on a household whose verdict is now
      `ALREADY_SERVED_TODAY`, and exporting it is what stops that check being written a second time.
- [ ] Strict TDD, invariant-breaking test first, one named test per rule. The named cases are: a
      household that collected today is `ALREADY_SERVED_TODAY`; one that has not is unchanged; a
      **blocked** household that collected today is still `BLOCKED`; a household in the **wrong
      group** that collected today is still `WRONG_GROUP` (the counter is telling them the wrong
      week, which is the more useful fact); a household with an **expired certificate** that
      collected today is `ALREADY_SERVED_TODAY`, not `CLEAR_TO_SERVE_CERTIFICATE_EXPIRED`; and
      `certificateExpired` keeps its day-boundary cases.
- [ ] Domain coverage stays at 100%.

### US-32.5: The lookup passes the fact; the write path keeps its own error (application)

**Description:** As a developer, I want the one place that already knows today's record to hand it to
the rule, and the hand-out's own refusal to keep saying what it always said.

**Acceptance Criteria:**

- [ ] `lookupCustomer` passes `servedToday` to `evaluateAtCounter`, read from the day's record it
      **already loads** for `todaysRecord` (`recordForDay` over `listForCustomer`). No further query:
      the counter still issues one read per lookup (US-04.3).
- [ ] `CounterCustomerView` gains `readonly certificateExpired: boolean`, derived through the domain's
      newly exported `certificateExpired` against the same instant the verdict is evaluated at. The
      screen reads its certificate controls off this field, never off the verdict kind — which is
      exactly what would break the moment the verdict says „already served" instead (§US-32.6).
- [ ] `recordAttendance` still throws **`AlreadyServedToday`** for a second hand-out on the same day,
      with the same German sentence at the counter. Today it evaluates the verdict _before_ calling
      `canRecord`, so a verdict that now knows the day's record would report the duplicate as
      `NotClearToServe` and reword the refusal — **the `canRecord` check moves above the verdict
      evaluation**, so the more specific fact about today's write still wins.
- [ ] `correctAttendance` is untouched: it amends or removes a record and never evaluates a verdict.
- [ ] TDD against the existing hand-written fakes. Named tests: the lookup of a household served today
      answers `ALREADY_SERVED_TODAY`; the lookup of one served **yesterday** is unaffected; a second
      hand-out on the same day still fails with `AlreadyServedToday` and writes nothing; a hand-out
      for a **blocked** household still fails with `NotClearToServe`; and `certificateExpired` is true
      on the view for a household whose certificate lapsed and whose verdict is `ALREADY_SERVED_TODAY`.
- [ ] Application coverage stays at 100%.

### US-32.6: The already-served verdict states a fact rather than refusing (presentation)

**Description:** As a staff member, I want a screen on which nothing is wrong to stop looking as if
something is, now that looking a served household up again is the ordinary way to a correction.

**Acceptance Criteria:**

- [ ] `statementFor` in `src/app/ausgabe/counter-lookup.tsx` returns a **neutral** tone for
      `ALREADY_SERVED_TODAY` — not `refuse`. A new `done` entry in `TONES`, muted chrome
      (`bg-muted text-foreground ring-foreground/10`) and a `Check`, which is the glyph this
      application already uses for "it happened" (`ui_styling_guide.md` §12). Red is for a household
      who must not be served; this one already has been.
- [ ] The headline is the existing `de.distribution.counter.verdicts.alreadyServedToday.headline`
      („Heute bereits ausgegeben"), **unchanged and with no detail line**. The time, the amount handed
      over and what was asked for are in the `already-served` card immediately below it, and a
      verdict repeating them would be the screen saying one fact twice (`ui_styling_guide.md` §8).
- [ ] `CertificateControls` receives `expired={counter.lookup.customer.certificateExpired}` in
      `page.tsx` instead of the verdict-kind comparison. A household with a lapsed certificate keeps
      the reminder and renewal controls after they have collected, which is what makes R-13 true of
      them too.
- [ ] `permitsServing` is untouched and still lists only the two clear-to-serve kinds, so no serve
      button is offered — that, and not the paint, is what enforces "no second hand-out".
- [ ] `ServeControls` is unchanged in this story: `todaysRecord !== null` already switches it to the
      `already-served` card with the correction controls.
- [ ] Verified with the `playwright-cli` skill: look up a household that has collected, and the
      accessibility snapshot shows the verdict, the record and the correction controls, with no serve
      button and nothing coloured as a refusal.

### US-32.7: A recorded hand-out clears the screen and confirms at the top (presentation)

**Description:** As a staff member, I want the screen empty and ready for the next person the moment
the hand-out is booked, with one line telling me what I just booked and one click back to it.

**Acceptance Criteria:**

- [ ] New module `src/app/ausgabe/served-flag.ts` exporting `export const HANDOUT_RECORDED = "erfasst"`,
      beside `removed-flag.ts` and for the same reason: it is read by a `"use server"` action and by a
      server component, and a `"use server"` module may export nothing but async functions.
- [ ] On a **successful** `recordServe`, the action calls `revalidatePath("/ausgabe")` and then
      `redirect("/ausgabe?erfasst=<Kundennummer>")` — the redirect **outside** the `try`, as
      `correctServe`'s removal branch already does, because Next signals a redirect by throwing.
- [ ] The customer number reaches the action as a hidden field on the serve form, rendered from
      `counter.lookup.customer.customerNumber`. It is the **household's** number, not the raw query:
      `50k3` must land on `?erfasst=50`.
- [ ] **Only success redirects** (R-12). `OverpaymentNotConfirmed` still returns
      `confirmOverpayment` and every refusal still returns `error`, so a household with a question
      outstanding stays on screen with it. Nothing may be cleared while an answer is owed.
- [ ] `page.tsx` renders a `Confirmation` at the top — beside the removal's and the archive's, above
      the week banner — reading „Ausgabe für #7 Peter Pan erfasst — 4,00 € um 14:32 Uhr." from a new
      `de.distribution.serve.recorded(customerNumber, name, paidCents, time)`, with testid
      `serve-recorded-confirmation`.
- [ ] The four facts are **derived, not carried**: the URL holds the customer number alone, and the
      page reads name, amount and time through the existing `lookupCustomer` — `customer.firstName`,
      `customer.lastName`, `todaysRecord.paidCents`, `germanTime(todaysRecord.at)`. The read joins the
      existing `Promise.all`.
- [ ] The **balance is not** in the confirmation. A household that still owes money is not something
      to be told about after they have left the counter.
- [ ] The confirmation carries a „Korrigieren" link to `/ausgabe?nummer=<Kundennummer>`, inside the
      same notice, with testid `serve-recorded-correct`.
- [ ] `nummer` **wins over** `erfasst`: when a number is being looked up, no confirmation about the
      previous household is rendered. It stays until the next lookup and no longer — no timer, no
      dismiss control (R-10).
- [ ] A `?erfasst=` naming a household with **no record today** — removed in another tab, or typed by
      hand — renders **no** confirmation and no error. Like `?datum=` before it, an unreadable
      parameter is inert.
- [ ] `ServeState`'s `recorded` variant and `initialServeState`'s path to it are deleted, along with
      `de.distribution.serve.confirmed` and the `serve-confirmation` rendering inside `ServeControls`.
      They are unreachable once the form's own page navigates away. The correction's `saved`
      confirmation **stays where it is** (R-14): a staff member correcting a record is working on it.
- [ ] The `useEffect` that clears `counter-input` by id is deleted. The navigation renders a fresh,
      empty, autofocused field, which is what the effect was standing in for.
- [ ] `lookedUpNumber` keeps its job on the **correction** form, which still returns to the household.
- [ ] Verified with the `playwright-cli` skill: record a hand-out and the snapshot shows the banner,
      the progress card, an empty focused number field, the confirmation naming the household, and no
      verdict, record, payment, certificate, block or archive control anywhere on the page.

### US-32.8: E2E — the loop, over both engines

**Description:** As a developer, I want the suite to describe the counter as it is now worked, so the
next change to this screen breaks a test rather than a distribution.

**Acceptance Criteria:**

- [ ] `tests/e2e/serve.spec.ts`: the happy path asserts that after `Ausgabe erfassen` the URL matches
      `\/ausgabe\?erfasst=\d+$`, `serve-recorded-confirmation` is visible, `toBeInViewport()` and
      names the number, the name, the amount and the time; and that `counter-verdict`,
      `already-served` and `serve-button` are all **absent** from the page.
- [ ] The test that asserted the confirmation stays where the button was pressed
      („leaves the confirmation where the button was pressed") is **replaced** by one asserting the
      opposite is now true: the confirmation is at the top and the household is gone. A test proving
      a withdrawn behaviour is deleted, never skipped.
- [ ] A test clicks „Korrigieren" and asserts the URL is `/ausgabe?nummer=<n>`, the household is back
      with `already-served` and the correction controls, and the amount can be changed and saved from
      there — R-9 and R-13 in one pass.
- [ ] A test asserts the **overpayment question does not clear the screen**: an amount above what was
      asked leaves the household, the question and the confirm button on screen, and only the
      confirming submission redirects.
- [ ] A test asserts a **saved correction** does not clear the screen (R-14), and the existing removal
      test — URL `nummer=…&entfernt=1`, `serve-removed-confirmation` — stays exactly as it is.
- [ ] `tests/e2e/counter.spec.ts` gains the verdict it has always been missing: a household served
      today looks up as `data-verdict="ALREADY_SERVED_TODAY"`, with no serve button. The header
      comment that records `ALREADY_SERVED_TODAY` as the one verdict this spec cannot reach is
      updated with it.
- [ ] `tests/e2e/group-progress.spec.ts`: the tally-rises-after-a-serve test is amended — the tally is
      now read on the screen the redirect lands on, and the assertion that `already-served` is visible
      goes, because the household has left. R-11's evidence is the tally itself.
- [ ] Both engines pass: `npm run test:e2e` and `npm run test:e2e:webkit`, each over its own register
      (ADR-012). No spec branches on `browserName`.
- [ ] No new `page.goto` is introduced to make an assertion reachable that the redirect already makes:
      the confirmation and the tally are asserted **on the page the write landed on**.

### US-32.9: Record the withdrawal in the documents that asked for it (documentation)

**Description:** As the next developer, I want to find out that the walk was deliberately removed at
the place where I would otherwise read that it is required.

**Acceptance Criteria:**

- [ ] `tasks/prd-us-21-step-through-group.md` is marked **withdrawn** at the top, in the block-quote
      form `prd-us-05-record-attendance.md` uses for its supersession, naming US-32 and the date. The
      reason is stated and is the one DF gave: the buttons were not wrong, the assumption behind them
      was — DF call households in blocks and serve them in the order they turn up, so the next number
      is never the next person. The document is **not deleted** and its criteria are left readable, so
      the next person to propose a walk finds the argument to beat.
- [ ] The parts of US-21 that **survived** are named in that same note: `readGroupRoster` is US-23's
      now, and `CustomerRepository.list` needed no port method then and needs none now.
- [ ] `docs/architecture/09-architectural-decisions.md`: the rejected-alternatives row "Finding the
      next household at the counter" is updated to end in „→ withdrawn", with the block-calling reason
      in the rationale column, in the same voice as the week-colour-lookup row above it.
- [ ] `docs/architecture/05-building-block-view.md`: the three rows that name the walk — the
      `domain/distribution/` summary, the `application/distribution/` summary and the `/ausgabe` row —
      stop naming it. The roster, the tally and the list stay named.
- [ ] `docs/handout/betriebsanleitung.md` §„Beim Erfassen" says what DF now see: after
      `Ausgabe erfassen` the screen is empty again, a line at the top names the household, the amount
      and the time, and **Korrigieren** brings them straight back. §„Einen Fehler berichtigen" gains
      that link as the second way back beside typing the number again. German, printable, no
      screenshot.
- [ ] `tasks/prd-us-05-record-attendance.md` §US-05.4's criterion "the screen shows a short
      confirmation in place of the button" is marked as superseded by US-32 with a one-line reason —
      it is precisely what R-7 reverses, and it is the sentence a reader would otherwise implement
      back.
- [ ] `tasks/prd-us-23-group-progress.md` gains a line saying the roster it builds on outlived the
      walk that created it, so its "US-21 must be merged before this starts" reads as history rather
      than a dangling dependency.
- [ ] **No source file and no spec file is changed in this story.**
- [ ] `npm run format:check` passes.

## Functional Requirements

- **FR-1 (R-1, R-3):** The counter must offer no next-household navigation and no sentence describing
  where such a walk stands.
- **FR-2 (R-2):** Typing a customer number or a card number remains the way a household is brought up,
  unchanged.
- **FR-3 (R-4):** The group progress card stays in full, including the fold, the list of today's group
  and clicking a name to look that household up. It remains the only place on screen that answers
  "how far through the group are we" and "who has not been yet".
- **FR-4 (R-5, R-14):** Nothing about serving, verdicts, money, record keeping or auditing changes.
  Only **recording a hand-out** clears the screen: a saved correction does not, and the removal and
  the archive keep the returns they already have.
- **FR-5 (R-6):** A successfully recorded hand-out must return `/ausgabe` to its initial state — week
  banner, group progress, empty focused number field — with the household's verdict, record, payment
  controls, certificate controls and block/archive controls all gone.
- **FR-6 (R-7, R-8):** A confirmation must appear at the top of the screen, where the removal's
  already does, naming the customer number, the name, the amount taken and the time. The household's
  balance must **not** be in it.
- **FR-7 (R-9):** The confirmation must carry a direct way back to that household.
- **FR-8 (R-10):** The confirmation must stand until the next lookup and no longer. It must not fade
  on a timer and needs no dismiss control, and it must never be readable as being about a household
  now on screen.
- **FR-9 (R-11):** The group progress tally must show the household as served and the count one
  higher on the screen the write lands on.
- **FR-10 (R-12):** Only a successfully recorded hand-out clears the screen. A refusal, and the
  question an amount above the amount asked for raises, leave the household and the question standing.
- **FR-11 (R-13):** Looking a served household up again must show them, their hand-out and the
  controls to change the amount or remove the record.
- **FR-12 (R-15):** A household that has already collected today must be stated as a fact and not
  presented as a refusal, and no second hand-out may be offered.

## Non-Goals

- **No replacement for the walk.** Nothing steps from one household to the next, in either direction,
  by any control. Clicking a name in the group list is not a step: it is staff finding one named
  person, which is what the block-calling pattern produces.
- **The block-calling pattern is not represented in the software.** DF's "1 to 30 now" is their
  organisation of the afternoon, not a fact the system tracks. No per-block tally, no block
  boundaries, no notion of a current block. The progress card goes on showing the whole group.
- **Certificate reminders are not re-sequenced.** Where a certificate has run out, staff may serve and
  log a reminder; after this change the reminder control leaves the screen with the household. DF will
  log the reminder **before** recording the hand-out. The software does not warn about an outstanding
  reminder in the confirmation and does not hold the screen open for one. (What it does do is keep the
  reminder reachable on a **re-lookup** — §US-32.6 — which costs one field and would otherwise have
  been silently lost.)
- **No change to what is recorded**, to how the price, the amount to pay or the balance is derived, or
  to the audit entry. This is about what the screen shows after the write.
- **No change** to the week's group, the two-week cycle, or the settings behind them.
- **No new port method and no schema change.** Every fact this PRD needs is already loaded by
  `lookupCustomer` and `readGroupRoster`.
- **No ADR.** Nothing here is hard to reverse: a withdrawn screen control's home is the
  rejected-alternatives table in chapter 9, which §US-32.9 updates.

## Design Considerations

- **The confirmation is a `Confirmation` at the top of the page, not a toast.** `ui_styling_guide.md`
  §7 already states the rule this follows: _a control that its own write destroys cannot hold its
  confirmation — hand the message to a parent that survives, or redirect with a flag the page reads._
  The removal has done exactly that since US-05; this is the same mechanism for the same reason.
- **Four facts in one line.** „Ausgabe für #7 Peter Pan erfasst — 4,00 € um 14:32 Uhr." The number and
  the name say who, the amount and the time say what was booked — which is what a staff member wants
  to re-read once the cash drawer has closed. Watch the length on a narrow window: it is one sentence
  and it must not wrap into a paragraph.
- **„Korrigieren" is the word**, and it was chosen against „Anzeigen". The link exists for the case DF
  will actually hit — realising within seconds that the wrong amount was typed — and naming that case
  is worth more than covering the rarer one where the amount was right and staff only want to look. A
  staff member who wants to check clicks it and finds a screen that lets them check.
- **Vertical space is this screen's scarcest resource.** The walk row and its hint free roughly one
  control row and one paragraph above the verdict; nothing takes their place. Measure the counter
  card's height at 1440×900 before and after and record it in the commit message, as US-22 did.
- **The already-served screen must not look like a fault.** Muted chrome and a `Check`: the household
  collected, the record is below, and the only thing missing is a serve button — which is what says
  "not again today" more reliably than any colour.
- **DF run Safari.** The redirect, the autofocus that follows it and the confirmation's wrapping all
  want one look in real Safari on a Mac beyond the two gated engines (ADR-012).

## Technical Considerations

- **`recordAttendance` evaluates the verdict before `canRecord`.** Once the verdict knows the day's
  record, that order turns a duplicate into `NotClearToServe` and quietly rewords the counter's
  refusal. Moving the `canRecord` check above the evaluation is the whole fix, and the named
  application test on the message is what stops it drifting back.
- **`CertificateControls`' `expired` prop is derived from the verdict kind in `page.tsx`.** It is the
  second thing the new verdict silently breaks, and the symptom — a served household losing its
  reminder button on re-lookup — would not fail a single existing test. `certificateExpired` on the
  lookup view is the fix, which is why the domain helper is exported in §US-32.4.
- **`redirect` throws.** It must sit outside the `try`, or the action's own `catch` will treat the
  navigation as a failed write. `correctServe` is the worked example in the same file.
- **`isEmpty` survives the walk.** It reads as walk vocabulary and is not: `group-progress-card.tsx`
  branches on it for the group's empty state. Deleting it would take US-23's empty state with it.
- **The verdict switch is exhaustive with a `never` default**, so any change to the union fails the
  build until every screen renders it. That mechanism is doing its job here; do not add a `default`.
- **`ALREADY_SERVED_TODAY` already exists in the union and in the dictionary.** This PRD makes it
  reachable; it does not invent it. The string is unchanged, and only the tone moves.
- **`lookupCustomer` already loads today's record.** `servedToday` is `todaysRecord !== null` at the
  seam that computes it — no second query, and the counter keeps its one-read budget (US-04.3).

## Success Metrics

- Recording a hand-out leaves nothing on screen about the household it was for: after the write,
  `counter-verdict`, `already-served` and every payment, certificate, block and archive control are
  absent, proved by the e2e assertion rather than by a screenshot.
- The counter card is shorter by the walk row and its hint, measured at 1440×900 and recorded.
- One e2e spec deleted (`group-walk.spec.ts`), one verdict spec completed (`ALREADY_SERVED_TODAY` was
  the only one `counter.spec.ts` could not reach), and `serve.spec.ts` proving the loop end to end on
  both engines.
- A grep for `walk`, `neighbours` and `Weiter` under `src/` returns nothing.
- No file under `prisma/`, `src/infrastructure/` or `src/application/ports.ts` is touched by the whole
  batch.

## Settled before this was written

**Are the two changes one piece of work?** They are one screen, one afternoon's feedback and largely
one set of files — `page.tsx`, `de.ts`, `serve.spec.ts`. Split into two batches they would have to run
in sequence, the second cutting its branch from a `main` the first had just rearranged, which is the
conflict `scripts/ralph/prds/README.md` point 1 exists to prevent. One PRD, one batch, and the
withdrawal recorded inside it the way US-22 recorded US-03's.

**Is the already-served household shown as a red refusal today?** No — and the source document says it
is. `evaluateAtCounter` takes no record, so `lookupCustomer` answers `CLEAR_TO_SERVE` and the screen
shows the **green** „Ausgabe frei" banner with the `already-served` card below it; the
`ALREADY_SERVED_TODAY` verdict is declared and unreachable. That makes R-15 more worth doing rather
than less: green is the worse of the two mistakes, and R-9 and R-13 turn looking a served household up
again from an accident into the ordinary route to a correction. What R-15 asks for — a verdict that
states what happened, in no alarming colour, offering no second hand-out — is what §US-32.4 to
§US-32.6 build.

**How do the four facts reach the confirmation?** Through the customer number in the URL and nothing
else. The name, the amount and the time are read back through `lookupCustomer` on the page the
redirect lands on. Carrying all four as query parameters would have put a household's name in the
address bar and in browser history, and would let the banner disagree with the record it describes.
Deriving is what the rest of this application does with every figure it shows.

**Does the confirmation need a dismiss control?** No. It stands until the next lookup, and a lookup is
one keystroke on a field that is already focused. A confirmation that vanishes on a timer is one a
staff member can miss, and on a quiet afternoon a line at the top of an otherwise empty screen costs
nothing.

## Open Questions

- **None blocking.** Every question put to DF has been answered.
- Two things are worth one look on a real screen rather than on paper, and both are checks rather than
  decisions: the length of the confirmation now that it carries four facts, on the narrowest window DF
  actually use; and whether the already-served verdict, no longer red, still reads at a glance as "do
  not hand out again" — with the serve button gone, it should.
