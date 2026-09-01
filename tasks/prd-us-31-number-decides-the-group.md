# PRD: The customer number decides the group (US-31)

> **Changes US-01** (a group is chosen at registration), **US-16.4** (a group is changed on the
> record), **US-20** (the group choice is folded away), **US-24** (staff choose the number) and
> **US-30** (a household may be moved to another number). It takes two decisions the software treats
> as unrelated and makes them one.
>
> Source: DF's requirement, `local_only/number-group-relation/refined-requirements.md` (the first
> draft, in German, is `…/requiremenet-description.md`). Every question put to DF has been answered;
> §11 of the refined requirement lists three points that are the author's recommendation rather than
> DF's instruction, and they are carried into §Design Considerations here.
>
> **This batch drops two columns and regenerates the migration history** (ADR-009) — see
> §Technical Considerations. It also removes a use case, two port methods, a domain error, a stale-card
> reason and an audit event. It is the largest simplification in the project so far, and almost all of
> it is deletion.

## Introduction

DF have always worked to a rule the software does not know about: **even customer numbers are BLUE,
odd customer numbers are RED.** It is how the paper register works and how staff read a card at the
counter — the number alone says which week that household comes.

The software treats the two as unrelated. A number is a slot staff choose (US-24) and may change
(US-30); a group is a separate property set at registration (US-01) and changed on the record
(US-16.4). Nothing stops them contradicting DF's rule, and nothing notices when they do. That is two
sources of truth for one fact — the Excel failure this project exists to replace, sitting in the
middle of the register.

**This PRD makes DF's rule the software's rule.** The group stops being a fact about a household and
becomes a _consequence of the number_, derived the way the number of grown-ups is derived from
birthdates. One fact is recorded — the number — and the group follows from it everywhere it is shown.

### What that buys, and what it costs

It buys the strongest guarantee available: **there is no rule to enforce, because there is nothing to
enforce it against.** A filtered dropdown is a convenience that would not survive two staff working at
once or a quota lowered while a form is open. Deriving is what makes a household on 37 and a household
in BLUE an impossible pair, in every route, at every moment, for ever.

It costs one new fact of life: **a group can be full while the register is not.** With a quota of 240
there are 120 even slots and 120 odd ones, and either half can run out on its own. That is the main
practical consequence of the rule and the reason free slots have to be visible _per group_.

### The move, worked

A household on 37 — odd, therefore RED — that DF wants in the BLUE week. Slot 106 is free; the last
card ever printed on 106 was `106k2`, by a household since archived.

| Before                                      | After                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| `Customer.customerNumber` = 37              | 106                                                                       |
| Group **RED**, because 37 is odd            | **BLUE**, because 106 is even — nothing was set                           |
| Card in the household's pocket: `37k4`, RED | `106k5` printed on the spot, BLUE; `37k4` invalid                         |
| Slot 37                                     | free, and it is a **RED** slot — only a RED household can take it next    |
| Cards on the record                         | `106k5`, then `37k4`, `37k3` … — each still RED, because 37 is still odd  |
| „Karten neu ausstellen“                     | the household is **not** on it: the move printed the card in the same act |
| Everything else on the record               | untouched                                                                 |

The card index is `k5` and not `k3`, for the reason US-30 established: the index is the later of the
slot's run and the household's own (`nextCardIndexOnMove`), so no card number is ever printed twice.
That rule is unchanged and this PRD adds no caller to it — the group change _is_ the number change.

### Three things stop existing

- **`Customer.group`.** The column, the port method that wrote it (`setGroup`), the use case that
  called it (`changeGroup`), its audit event (`customer.groupChanged`), its refusal (`GroupUnchanged`)
  and the control on the record that drove it. A group is now `groupOf(customer.customerNumber)`.
- **`Card.groupAtIssue`.** A card already carries the slot it was printed under (US-30, ADR-016), and
  the group of that slot is the group that was printed on it. The snapshot has a snapshot.
- **The `GROUP_CHANGE` stale-card reason.** A household's _current_ card always carries their current
  number — registration, a reissue and a move all print on the slot the household holds, the last of
  them in the same transaction as the move — so the group printed on the card a household is carrying
  can never disagree with the group derived from their number. Cards still fall out of date for a 13th
  birthday and for a change in household composition.

### What does not change

What a group means, the two-week cycle, the week's colour and how it is derived; the number as a
reusable slot in `1..quotaN`; the quota as one number; the counter; the waiting list's rule for when
somebody may be registered; and every card keeping the number — and therefore now the group — it was
printed with.

## Goals

- **One fact is recorded.** The group is derived at every read, and no write anywhere can produce a
  household whose number and group disagree.
- **One decision in one place.** Number and group are chosen together, in one section, in the same
  shape at registration and on the record: pick a group, pick a number from what that group offers.
- **The group is the meaningful choice and leads.** It is preselected with a recommendation, and DF
  almost always accept it; the number follows.
- **A group that has nothing to offer cannot be chosen**, and says why rather than presenting an
  empty list.
- **A group change always prints a card**, because it is always a number change. The card that says
  the wrong week stops being a state the system can be in.
- **Free slots are visible per group**, wherever capacity is on screen — a group can be full while the
  register is not, and that is new.
- **The register DF already keeps needs no correction**: it complies with the rule today, which is
  where the rule came from.

## User Stories

### US-31.1: The number decides the group (domain)

**Description:** As a developer, I need one pure rule that turns a customer number into a group, so
that every screen, use case and query reads the group from the same place and no second answer exists.

**Acceptance Criteria:**

- [ ] `groupOf(customerNumber: number): Group` in `src/domain/customer/group.ts` — even → `BLUE`,
      odd → `RED`. It is the whole rule, in one expression, and it is the only place parity is ever
      read as a group
- [ ] Its doc comment states what the module's opening paragraph no longer may: a group is **not a
      property of a household**. It is DF's own rule, older than the software, and the reason the two
      values were separate before is now the reason they must not be. It also states the non-goal
      out loud: the mapping is **not configurable**, because DF see no reason it would ever flip and a
      setting would be a second place for it to be wrong
- [ ] `inGroup(numbers: ReadonlyArray<number>, group: Group): ReadonlyArray<number>` — the members of
      `numbers` that belong to `group`, order preserved. One function used by both screens and both
      allocation paths, so "the numbers of this group" is never spelled out twice
- [ ] `countByGroup(customerNumbers: ReadonlyArray<number>): GroupCounts` — how many of the given
      numbers fall in each group. It **replaces the `groupCounts()` port method**: the numbers held by
      active households are already a query the register answers (`takenActiveNumbers`), and counting
      them by parity is arithmetic, not persistence. The doc comment says so, because deriving a
      figure the database used to count is the shape of this whole PRD in miniature
- [ ] `suggestGroup(freeNumbers, counts): Group | null` is **rewritten**, and its two arguments are
      the two halves of R-8: the smaller group **that still has a free number**. Balance is still the
      goal — left alone a register would fill up on one parity — but a group with nothing to offer is
      never recommended, and a lowered quota (US-14) is exactly the case where the _smaller_ group is
      the full one. `null` when neither group has a free number, which is the register being full and
      is the one state the registration screen already renders on its own
- [ ] The tie-break stays **RED**, and stays fixed for the reason it always was: a random suggestion
      would make registration irreproducible. The existing doc comment survives the rewrite
- [ ] The recommendation is **the only pressure the software applies.** No warning when the groups
      drift apart, no threshold, nothing that suggests a move — DF read the balance off the figures
      already on screen. A named test asserts there is no second output
- [ ] `parseGroup` is **deleted**. It existed to read a stored group word back out of SQLite and off a
      form, and after this batch neither exists — a group is never stored, never submitted and never
      parsed. `GROUPS` stays: it is what renders the two options
- [ ] Strict TDD, invariant-breaking test first, one named test per rule:
      `an even number is BLUE`, `an odd number is RED`, `one is RED and two is BLUE`,
      `keeps the order of the numbers it filters`, `counts a register by parity`,
      `counts an empty register as nothing`,
      `recommends the smaller group`, `recommends RED on a tie`,
      `recommends the larger group when the smaller one is full`,
      `recommends nothing when the register is full`,
      `recommends the only group with a free number even when it is much larger`
- [ ] Pure: no I/O, no clock, no import from Next.js, React or Prisma
- [ ] `npm run lint`, `npm run typecheck` and `npm run test:coverage` pass; `domain/` stays at 100%

### US-31.2: The group stops being a stored fact (domain)

**Description:** As a developer, I need the group off the customer record and off the card, so that
the type system refuses the disagreement rather than a test looking for it.

**Acceptance Criteria:**

- [ ] `RegisteredCustomer.group` (`src/domain/customer/customer.ts`) is **removed**. Every reader
      calls `groupOf(customer.customerNumber)`. Leaving a derived `group` on the record would put the
      value back where readers could hold it while the number moved underneath — the deletion is what
      makes the rule structural
- [ ] `IssuedCard.groupAtIssue` (`src/domain/card/card.ts`) is **removed**, and the file's list of
      three `AtIssue` snapshots becomes two. The doc comment on `customerNumber` gains the job it has
      inherited: the slot the card was printed under **is** the group that was printed on it, so the
      snapshot that existed to catch a group move is the number itself
- [ ] `NewCard` loses the field with it, so no writer can pass a group
- [ ] `staleCard` (`src/domain/card/staleCard.ts`) loses its `group` arguments and its
      `GROUP_CHANGE` reason; `StaleCardReason` becomes `"AGE_13" | "HOUSEHOLD_CHANGE"`. The doc
      comment states **why the case is gone rather than merely unhandled**: a household's current card
      is always the highest index on the slot they currently hold, so its number is their number and
      its group is their group. A named test says so:
      `a current card never names another group`
- [ ] `GroupUnchanged` is **deleted** from `src/domain/errors.ts`, from `DomainErrorCode` and from
      `src/app/notice-tier.ts`. There is no act it could refuse: a group is chosen by choosing a
      number, and choosing the number you already hold is `CustomerNumberUnchanged`
- [ ] Tests written first, one per rule: `a card no longer carries a group of its own`,
      `a household record no longer carries a group`, `a thirteenth birthday still makes a card stale`,
      `a member added still makes a card stale`, `a current card never names another group`
- [ ] `domain/` stays at 100%; typecheck and lint pass

### US-31.3: Registration allocates inside a group (application)

**Description:** As a staff member, I want the registration screen to recommend a group and offer me
the numbers that belong to it, so the one decision I make is the one that matters and the number
follows from it.

**Acceptance Criteria:**

- [ ] `proposeRegistration` reads the register **once** and derives everything from that one reading:
      `freeNumbers` (the whole pool, unchanged), `groupCounts` from `countByGroup(takenActiveNumbers)`,
      `suggestedGroup` from `suggestGroup(free, counts)`, and `customerNumber` — the number the form
      opens on — as the **lowest free number of the suggested group**
- [ ] The `groupCounts()` call is therefore **gone**, and the use case makes one repository call where
      it made two. A named test asserts the register is read once
- [ ] `suggestedGroup` becomes `Group | null`, `null` exactly when `customerNumber` is `null`. The
      screen already renders a full register as a state of its own, and two fields that can only be
      absent together must be absent together
- [ ] The proposal keeps the **whole** free pool rather than only the recommended group's: the form
      re-filters it in the browser when staff pick the other group (US-31.6), and a second round trip
      to change a radio would be a round trip to look at a list the screen already holds
- [ ] `RegisterCustomerInput.group` is **removed**. The form submits one field for the pair — the
      number — and a group that cannot be submitted cannot be submitted wrongly. This is §9 of the
      requirement in one line, and the doc comment says it
- [ ] The allocate path (`customerNumber` left out) stays and becomes group-aware: the lowest free
      number of `suggestGroup`'s answer, via `inGroup`. `NoFreeCustomerNumber` still means the **whole**
      register is full, which is the only state the waiting list exists for (R-26)
- [ ] The lost-race retry stays bounded at `MAX_ATTEMPTS` and **stays inside the parity it started
      in**. A retry that crossed to the other group would silently register the household into a
      different week than the one the balance chose — the one bug this loop could grow. A named test
      drives it: `retries within the same group after losing a number`
- [ ] The retry is unchanged for a number staff **chose** — still one attempt, still refused back to
      the screen (US-24.3)
- [ ] `groupAtIssue` is no longer written to the first card; `NewCustomer.group` is no longer written
      to the record
- [ ] TDD against hand-written fakes, one named test per rule:
      `recommends the smaller group`, `opens on the lowest free number of the recommended group`,
      `recommends the other group when the smaller one is full`,
      `offers the whole free pool, not only the recommendation's`,
      `reports a full register as no number and no recommendation`,
      `registers the household on the number staff chose`,
      `puts an allocated household in the recommended group`,
      `retries within the same group after losing a number`,
      `writes no group anywhere`
- [ ] `application/` stays at 100%; typecheck and lint pass

### US-31.4: The group is derived wherever it is read (application)

**Description:** As a staff member, I want every screen that shows a group to show the one the number
implies, so that no two screens can ever disagree about which week a household comes.

**Acceptance Criteria:**

- [ ] `changeGroup` (`src/application/customers/change-group.ts`) and its tests are **deleted**. There
      is no act left: a group change is a number change, and `changeCustomerNumber` is it
- [ ] `read-customer.ts` — the view's `group` is `groupOf(customer.customerNumber)`, and `groupCounts`
      comes from `countByGroup(takenActiveNumbers())`. The record renders from the read model exactly
      as it does now
- [ ] `list-customers.ts` — each row's `group` is derived from its number, and `groupCounts` likewise.
      **The group filter is applied here rather than in the query**: `CustomerListQuery.group` is
      removed from the port, and the use case narrows the rows the register returned with `groupOf`.
      Its comment carries the argument — parity is not a column, SQLite cannot express `% 2` in a
      `WHERE` clause, and a stored parity key would be exactly the second recording of one fact this
      PRD exists to remove. The register is bounded by the quota, so the widest this filter ever
      scans is `quotaN` rows on a four-user application
- [ ] `read-group-roster.ts` — the week's households are the register's active rows narrowed by
      `groupOf`, in place of the removed query criterion. Everything else about the roster is
      untouched: the group walked is still the week's own, `neighbours` still compares numerically,
      and `groupProgress` still counts from `members` alone
- [ ] `lookup-customer.ts` — `groupOnCard` is `groupOf(card.customerNumber)` and the household's group
      is `groupOf(customer.customerNumber)`. A named test states the consequence at the counter: a
      **superseded** card from before a move still names its own — older — group, because that is what
      is printed on the piece of card in front of the volunteer
- [ ] `cards-due-for-reissue.ts` — the group drops out of the staleness question entirely. A named test
      proves the list loses a reason rather than a case: `never reports a card as stale for its group`
- [ ] `change-customer-number.ts` — `groupAtIssue` is no longer derived or passed. Its audit entry's
      `why` **names the group when the parity changed** and does not when it did not:
      `customerNumber=37→106; group=RED→BLUE` against `customerNumber=37→39`. The entry has to tell
      its own story (ADR-006), and „the household moved to the other week“ is the half of the story
      the two numbers only imply
- [ ] `list-number-choices.ts` — each `NumberChoice` gains `group`, derived from its own number, so
      the record's control can filter and the confirmation can name the group without the browser
      working out parity. It is a read model, not a second rule: the value comes from `groupOf`
- [ ] `issue-card.ts` and `reissue-card.ts` no longer derive `groupAtIssue`. Neither changes otherwise
- [ ] TDD against fakes, one named test per rule:
      `reads a household's group off their number`, `counts the register's groups off its numbers`,
      `narrows the list to one group`, `walks the week's group`,
      `names the group printed on a superseded card, not today's`,
      `never reports a card as stale for its group`,
      `names both groups in the audit entry when the parity changed`,
      `names only the numbers when it did not`,
      `offers each number with the group it belongs to`
- [ ] `application/` stays at 100%; typecheck and lint pass

### US-31.5: The store forgets the group (infrastructure)

**Description:** As a developer, I need the two group columns gone from the schema, so that a hand-
edited row cannot reintroduce the disagreement the rest of this batch removed.

**Acceptance Criteria:**

- [ ] `prisma/schema.prisma`: `Customer.group`, `@@index([group])` and `Card.groupAtIssue` are
      **removed**. The `Customer.customerNumber` doc comment gains what it now decides — the slot and
      the week are one value — and `Card.customerNumber` gains the same for the card
- [ ] **The migration history is regenerated** per ADR-009: delete `prisma/migrations/`,
      `npx prisma migrate dev --name init`, then `npm run db:reset`. A corrective migration is
      forbidden here — it would describe a decision DF never made. **Re-confirm before deleting**
      that DF still holds no real data; the moment they enter their first customer this reverses and
      the batch needs a different story
- [ ] The hand-added partial unique index on `Customer` is carried into the regenerated migration
      unchanged — it is what settles a lost race for a number, and it is the reason this batch needs
      no new constraint of its own. `src/infrastructure/prisma/schema.test.ts` still passes, including
      its `onDelete: Cascade` grep
- [ ] `CustomerRepository.setGroup` and `CustomerRepository.groupCounts` are **removed** from
      `ports.ts` and from the adapter. `CustomerListQuery.group` goes with them, and the `list` doc
      comment — „every criterion is a `WHERE` clause“ — is corrected to say which criterion is not one
      any more and why
- [ ] `NewCustomer.group` is removed from the port; `create` no longer writes it
- [ ] `PrismaCustomerRepository.toRegisteredCustomer` and `PrismaCardRepository.toCard` stop selecting
      and parsing the two columns
- [ ] `src/infrastructure/prisma/seed.ts` assigns numbers and lets the group follow. A seeded register
      that was RED-heavy by accident now says what its numbers say
- [ ] Thin integration tests against a throwaway SQLite file, with `clearRegister` from
      `test-support.ts`: `stores a household without a group`, `stores a card without a group`,
      `counts the register's active numbers for the group balance`,
      `refuses a number an active household holds` (unchanged, and proves the index survived the
      regeneration)
- [ ] Typecheck and lint pass

### US-31.6: One choice at registration (presentation)

**Description:** As a staff member registering a household, I want to pick the group and then the
number in one place, so that the two read as the single decision they are.

**Acceptance Criteria:**

- [ ] The `Zuordnung` section becomes **one block**: the group radios first, the number select
      beneath, with the free-number figures under that. The group is the meaningful choice and the
      number is administrative, so that is the reading order (R-5, R-10)
- [ ] **The group choice is unfolded** — US-20's `<details>` is removed. It was folded because DF
      accept the proposal and two permanently visible radios were a control for a decision almost
      nobody makes. That argument does not survive this PRD: the group now _drives the list beneath
      it_, and a folded control cannot show that BLUE has nothing to offer. The reversal is
      deliberate and the comment in the file says so, naming US-20
- [ ] The radios preselect `proposal.suggestedGroup`; each wears its own colour and always carries the
      word (US-03.4)
- [ ] **The number select offers `inGroup(freeNumbers, chosenGroup)`**, filtered in the browser from
      the pool the server sent. Changing the group re-filters the list and moves the preselection to
      the **lowest free number of the newly chosen group** (R-6, R-7)
- [ ] **A group with no free number cannot be chosen**: its radio is `disabled`, and a sentence beside
      it names the reason — not an empty dropdown and not a silent failure. Staff see _why_ rather
      than finding nothing there (R-9)
- [ ] **No `group` field is submitted.** The radios are browser state; the form posts the number and
      nothing else. `registration-input.ts` loses its `group` schema and its `parseGroup` import, and
      both registration actions (`/kunden/neu` and `/warteliste/[entryId]/registrieren`) stop passing
      one
- [ ] The free-number hint is **per group**: „Noch frei — Rot: 12, Blau: 3“ in place of
      `assignment.freeNumberCount`'s single total. This is the one genuinely new fact on the screen —
      a group can be full while the register is not — and it is the only place staff would find out
      (R-23)
- [ ] The group sizes („Aktuell: Rot n, Blau m“) stay where they are: they are what an override is
      decided from, and R-8 leans on staff being able to see the drift for themselves
- [ ] A full register is unchanged: the alert at the top of the form, the disabled submit, no hint
- [ ] After a refused save, the fresh pool (`fresh-pool.ts`) still repopulates the list, and the
      chosen group survives the round trip — a staff member who picked BLUE and lost a race for 106
      must come back to BLUE's remaining numbers, not to RED's
- [ ] German only in `src/i18n/de.ts`: the per-group free-count line, the "this group is full"
      sentence, and the removal of `assignment.groupChoiceOverride`, which named a disclosure that no
      longer exists
- [ ] Driven and reviewed with the `playwright-cli` skill per `docs/guideline/ui_styling_guide.md`
      §11 — the accessibility snapshot is what says whether the radios read as _the same decision_ as
      the select beneath them, and a screenshot cannot. One look in real Safari on a Mac
- [ ] Typecheck and lint pass

### US-31.7: One choice on the record (presentation)

**Description:** As a staff member, I want to move a household between the weeks by choosing a group
and a number in one section, and be told the number, the group and the card before anything is
written.

**Acceptance Criteria:**

- [ ] The record's two sections „Gruppe“ and „Kundennummer“ become **one**, headed
      „Gruppe und Kundennummer“, in the position „Gruppe“ holds today. `GroupControl` is deleted;
      `NumberControl` grows the group radios above its select
- [ ] The control is presented **as at registration** (R-11): group first, then the numbers that group
      offers. Staff meet one shape for one decision, in both places they make it
- [ ] The radios open on the household's **current** group — `groupOf(customerNumber)` — and filter
      `numberChoices` by their `group`. Picking the other group moves the selection to that group's
      lowest choice, since the household's own number is never in it
- [ ] **A group with no free number is unselectable**, with the reason named — the same treatment as
      registration. This is R-13 on screen: if BLUE is full there is no way into BLUE, and the only
      way through is to raise the quota (US-14). The screen says the group is full; it does **not**
      instruct staff to change the quota, because raising it by one may add a slot to the wrong parity
      (R-25) and a sentence that is right half the time is worse than none
- [ ] The household's own group is never unselectable, whatever the register looks like: they are
      standing in it
- [ ] The confirmation names **the number, the group and the card number** that will be printed
      (R-16). It names the group whether or not the parity changed — the group is printed on the
      physical card, so it is one of the things being copied out by hand, not a status line
- [ ] The receipt names the same three: „Kundennummer geändert 37 → **106**; Gruppe **Blau**; neue
      Karte **106k5** ausgestellt.“ The two figures acted on _off_ the screen keep the bold, per the
      `Segment` shape already in the dictionary
- [ ] The two-step save is unchanged (a disclosure that reveals what saving would do, and a submit
      inside it), as is `guardEnter` on the select
- [ ] The free-number figures beneath are **per group**, in the registration form's wording. When the
      household's own number is the only choice in their group, `noOtherNumber` still says so
- [ ] An **archived** household reads the number and the group as two read-only `Field`s. They hold no
      slot, `numberChoices` is empty, and there is no control
- [ ] `changeGroupAction` and its `GroupUnchanged` branch are deleted from
      `src/app/kunden/[id]/actions.ts`; `changeCustomerNumberAction` is otherwise unchanged
- [ ] `src/i18n/de.ts`: `customers.record.groupHeading`, `groupHint`, `groupSubmit` and `groupSizes`
      move into or out of `customers.numberChange` as the merge requires; `numberChange.confirm` and
      `numberChange.saved` gain the group. Nothing new is _explained_ — the group is a value the
      screen shows, not a rule it recites (`ui_styling_guide.md` §8)
- [ ] The record's header shows the number and the group **together** (R-27), which is where a staff
      member learns to read one off the other
- [ ] Driven and reviewed with the `playwright-cli` skill; one look in real Safari on a Mac
- [ ] Typecheck and lint pass

### US-31.8: E2E — the number and the group cannot disagree

**Description:** As a developer, I need one Playwright spec proving the rule end to end in both
engines, because it now spans registration, the record, the card and the counter.

**Acceptance Criteria:**

- [ ] New `tests/e2e/number-group.spec.ts` over the registers in `tests/e2e/registers.ts`, green in
      **both** `npm run test:e2e` and `npm run test:e2e:webkit`. No branch on `browserName` in `src/`
- [ ] Registration: the recommended group is preselected; the number select offers **only** that
      group's numbers; switching the group re-filters the list and moves the preselection; the
      registered household's record and card show the group the number implies
- [ ] A group driven to full: its radio is unselectable and the reason is on screen, while the other
      group still registers normally and the waiting list is **not** offered — a slot exists (R-26)
- [ ] The record: moving a household to a number of the other parity changes the group, the
      confirmation names all three values before the write, and the receipt names them after
- [ ] **The card view is asserted without navigating away and back mid-form** — after the move it
      shows the new card with the new number and the new group first, and the superseded cards still
      under the number _and the group_ they were printed with
- [ ] „Karten neu ausstellen“ never lists a household for a group change, and a household that was on
      it for stale counts leaves it after a move
- [ ] The counter serves the household under the new number in the new week's colour, and answers a
      superseded card number with the group printed on it
- [ ] The customer list's group filter returns exactly the households whose numbers have that parity,
      and the group balance agrees with the rows
- [ ] The free-number figures per group are asserted on the **registration form and the record** —
      the two screens that show them. `/warteliste` has no free-slot count to assert (it names one
      free number and one applicant), and a move never changes whether a slot is free
- [ ] **Every seeded e2e household is re-banded to the parity its assertions need**, because a
      fixture may no longer choose a group. This is the batch's widest e2e change and it breaks a
      shared invariant: `group-walk.spec.ts` seeds 311–315 RED and asserts its own 315 is the
      **highest walkable RED** in the shared register, while 321, 331, 333, 341 and 343 all become
      RED under the rule. Re-band so each spec's households carry the parity they claim, and re-check
      the invariant with the numbers-in-use sweep
      (`grep -rhno "\b[23][0-9][0-9]\b" tests/e2e/*.spec.ts | cut -d: -f2 | sort -un`)
- [ ] `tests/e2e/registers.ts`, the seeds and every spec that pins a group are updated together, and
      **both engines are green in one run each** — a re-banding that passes Chromium and not WebKit
      is a re-banding that has not been checked

### US-31.9: The record says the number decides the group (documentation)

**Description:** As the next developer, I need the written record to describe a system with one fact
where there were two, because six documents currently describe the other one.

**Acceptance Criteria:**

- [ ] **ADR-017** via the `record-adr` skill: _"The customer number decides the group."_ Context: DF's
      own rule, older than the software, which the software could contradict. Decision: even → BLUE,
      odd → RED; the group is derived at every read; `Customer.group` and `Card.groupAtIssue` are
      dropped; a group change is a number change and prints a card. Consequences: no validation is
      needed because no disagreement is representable; each group has an implicit capacity of about
      half the quota and can be full while the register is not; raising the quota by one may add a
      slot to the wrong parity; the mapping is deliberately not configurable. Its row in
      `docs/architecture/09-architectural-decisions.md`
- [ ] **ADR-007** — the derive-don't-store table: `Card.groupAtIssue` leaves the first row, whose
      remaining two counts stay as they are; the `Card.customerNumber` row gains that it is now read
      as the card's **group** as well as its number. The table drops from four exceptions to four with
      one narrowed — say which, and link ADR-017
- [ ] **ADR-008** gains a paragraph: a customer number is still a slot rather than an identity, and it
      now also carries which week the slot collects in. That makes the slot _more_ of a slot, not less
      — it is a place in DF's fortnight, and a household moving between slots moves between weeks
- [ ] **ADR-016** gains a sentence: a card keeping the number it was printed with now means it keeps
      the **group** it was printed with, at no extra cost and with no extra column
- [ ] **Root `CLAUDE.md`**: the derive-don't-store exception list loses `groupAtIssue` from the first
      bullet and gains the group as a newly derived value — the third time this project has refused to
      store something computable, after the balance (US-29) and beside the counts
- [ ] **`docs/architecture/05-building-block-view.md`**, **`08-crosscutting-concepts.md`** and
      **`12-glossary.md`**: the group entry says it is derived from the number; the ER note drops the
      two columns
- [ ] **`tasks/prd-us-16-maintain-customer-record.md`** (§16.4, changing the group) and
      **`tasks/prd-us-20-fold-group-choice.md`** each gain a note at the top naming US-31 as what
      superseded them, and what survives of them. Neither is rewritten — a PRD is the record of what
      was asked for at the time
- [ ] `docs/handout/` is checked and corrected if any page tells DF to change a group on its own
- [ ] A final grep proves nothing in `src/`, `prisma/`, `docs/` or `tasks/` still describes the group
      as a property that is set, chosen independently of the number, or changed on its own

## Functional Requirements

- **FR-1** An even customer number is **BLUE**; an odd customer number is **RED**. Nothing else
  decides a group.
- **FR-2** The group is **derived at every read** and stored nowhere: not on the household, not on the
  card, not in any index.
- **FR-3** The rule holds for every household — active, blocked, archived — and on every route to a
  number: walk-in registration, promotion off the waiting list, re-registration of an archived
  household, and a number change on the record.
- **FR-4** At registration staff choose the **group first**, with a recommendation preselected. The
  chosen group filters the numbers offered; the preselected number is the **lowest free number of that
  group**. Changing the group re-filters the list and moves the preselection.
- **FR-5** The recommendation is the **smaller group that still has a free number**. A group with
  nothing to offer is never recommended. No warning is raised when the two groups drift apart.
- **FR-6** A group with **no free number cannot be chosen**, at registration or on the record. It is
  shown, unselectable, with the reason named — never as an empty list.
- **FR-7** A household refused one group goes into the other. They are **not** put on the waiting list
  while any slot exists; the waiting list is entered only when the register is full (unchanged).
- **FR-8** Number and group are **one section** on both screens, in the same shape and the same order.
- **FR-9** A group change **always** implies a number change, and therefore **always** prints a new
  card in the same act and the same transaction (US-30).
- **FR-10** A number change may or may not change the group, according to the parity. Both are
  ordinary outcomes and neither has a confirmation of its own.
- **FR-11** Before confirming a move, staff see the resulting **number**, the resulting **group** and
  the **card number** that will be printed. All three come from the read model.
- **FR-12** Nothing else moves: identity, names, address, members, certificate, notes, status, block
  reason, hand-out history and the derived balance are all as they were.
- **FR-13** A card shows the number **and the group** it was printed with, which therefore always
  agree. A superseded card keeps both.
- **FR-14** „This card is out of date because the household changed group“ **no longer exists**. Cards
  still fall out of date for a 13th birthday and for a change in household composition.
- **FR-15** The quota `N` stays **one number**. There is no quota per group.
- **FR-16** Each group nevertheless holds about half of `N` — an odd quota gives RED one slot more,
  and the software says nothing about it.
- **FR-17** **Free slots per group are shown wherever the register's capacity is shown**: the
  registration form and the record's control. A group can be full while the register is not.
- **FR-18** Lowering the quota is still refused below the number of active households and never forces
  a household to move — including a household left holding a number above the quota, which is the one
  case where the _smaller_ group is the full one.
- **FR-19** Raising the quota adds slots at the top of the range, alternating parity, so it does not
  necessarily help the group that is full. The settings screen says nothing about this.
- **FR-20** A number change is recorded as it is today — what changed, when, and both numbers — and
  **names both groups when the parity changed**. No reason is asked of staff.
- **FR-21** The separate „group changed“ audit event no longer exists, because the separate act no
  longer exists.
- **FR-22** No validation beyond the filtered list is needed or added. The refusals that remain are all
  about the _number_: outside the quota, held by an active household, or the one the household already
  holds.
- **FR-23** DF's existing register already complies with the rule, so **no household has to be
  corrected** and no data migration is written.

## Non-Goals

- **No configurable mapping.** DF see no reason even/odd would ever flip, and a setting would be a
  second place for the rule to be wrong.
- **No quota per group**, and no per-group figure on the settings screen.
- **No warning, badge or threshold** when the two groups drift apart. The recommendation is the only
  pressure the software applies.
- **No history** of the numbers or groups a household has held. The card history reveals past numbers
  — and now past groups — as a side effect, and is left correct rather than obscured (ADR-016).
- **No renumbering of the existing register**, no bulk moves, no "rebalance the groups" action.
- **No direct swap** of two households' numbers. DF may want one later; it is not required now, and
  neither number is free while the other holds it.
- **No change at the counter**: the same lookup, the same verdict, the same week colour.
- **No way to reprint a card „with the correct group“** — after this there is no such thing.
- **No change to what a group means**, to the two-week cycle, or to how a week's colour is derived
  from the anchor in settings.
- **No sentence on the settings screen** about which parity a raised quota adds.

## Design Considerations

**Why the group leads and the number follows.** The group is what DF decide; the number is
administrative. Staff pick a week for a household and the register hands them a slot in it. Building
the screens the other way round — number first, group as a consequence shown afterwards — would be
literally true to the rule and exactly backwards as a decision, since it would ask staff to search a
list for a number of the right parity in order to express a choice they have already made.

**One section, not two.** Today's `Zuordnung` card holds a number control and a folded group choice as
if they were two settings that happen to sit together. They are two halves of one sentence: _which
group, and which number in it_. This is the recommendation the requirement flags as the author's
rather than DF's (R-10), and the one to look at hardest on a real screen.

**A full group is shown, not hidden.** An unselectable radio with a reason beside it tells a staff
member why they cannot do what they were about to do. An absent option, or a group whose dropdown is
empty, tells them the software is broken. This is the second flagged recommendation (R-9).

**Number and group together, everywhere.** Reading „37“ and knowing „RED week“ without looking
anything up is the whole benefit of DF's rule, and the software should teach it rather than merely
obey it. The record header, the customer list row, the card and the counter all show both. This is the
third flagged recommendation (R-27).

**Unfolding the group choice reverses US-20 on purpose.** US-20 folded the radios because DF accept the
proposal and the control was five lines for a decision almost nobody makes. Two things changed: the
group now _drives_ the list beneath it, so a folded control hides the reason the list looks the way it
does; and „BLUE is full“ is a thing the screen has to be able to say. The fold went in for a good
reason and comes out for a better one, and the file says which.

**What is not written on the screen.** That a group change prints a card — the screen shows the card
number in the confirmation, which says it better. That the two groups should stay balanced — the
sizes are on screen and DF have run this for years. That raising the quota might not free a slot in the
group you want — true, rare, and half the time wrong in the direction that would mislead. Each of these
was considered and cut under `ui_styling_guide.md` §8: a hint that restates what the screen already
shows is clutter DF have asked to have removed five times.

**The receipt names the group even when it did not change.** The group is printed on the physical card
the staff member is about to write out, so it is one of the values being copied, not a status. One
sentence shape, no branch, nothing to get wrong at the counter.

## Technical Considerations

**Two columns are dropped, and the migration history is regenerated.** `Customer.group`,
`@@index([group])` and `Card.groupAtIssue` all go. Per ADR-009 that means deleting
`prisma/migrations/`, regenerating `init` and running `npm run db:reset` — not a corrective migration,
which would describe a schema DF never ran. **Re-confirm the pre-release status before deleting
anything**; the moment DF enters their first real customer this reverses and the story has to be
rewritten as an append-only migration with a data backfill (which, per FR-23, would be a no-op —
DF's register already complies).

**Parity cannot be a `WHERE` clause, and must not become a column.** SQLite has no expression index
Prisma can reach and no `% 2` in a filter, so the customer list's group filter and the roster's
membership query move out of the query and into the use case, where `groupOf` narrows the rows the
register returned. The alternative — a stored `groupParity` key beside `firstNameFolded`, or an
`IN (1,3,5,…)` list built from a `MAX(customerNumber)` — was rejected twice over: the first is the
second recording of the one fact this PRD exists to have recorded once, and the second is a second
expression of parity that has to agree with `groupOf` for ever. The register is bounded by the quota,
so the widest scan either query can do is ~240 rows on an application with four users.
`docs/architecture` should not be read as forbidding this: the rule is _don't filter in memory what
the database could index_, and the database cannot index this.

**`groupCounts()` leaves the port rather than changing.** The numbers held by active households are
already one query (`takenActiveNumbers`), and counting them by parity is arithmetic. Removing the
method makes `proposeRegistration` one repository call instead of two, and it makes the group balance
and the free pool provably one reading of the register.

**The card needs no new column and loses one.** `Card.customerNumber` already exists and is already
the slot the card was printed under (ADR-016). Its group is that slot's group, so `groupAtIssue`
was, from the moment US-30 landed, a snapshot of a snapshot.

**`GROUP_CHANGE` is impossible, not merely unhandled.** The invariant US-30 rests on — _the card a
household holds is the highest index on the slot they hold_ — is what removes the case: registration
prints on the slot the household takes, a reissue prints on the slot they hold, and a move prints on
the new slot inside the transaction that moves them. There is no ordering of writes that leaves a
current card on another slot, so there is none that leaves it in another group. A named test states
the invariant rather than leaving it implicit, because two derivations now rest on it.

**No new refusal, and no new race.** Everything that can go wrong is already about the number: taken,
out of range, unchanged. The partial unique index on `Customer` is still the final authority on a lost
race, and a lost race after a group has been picked is answered the way US-24 and US-30 answer one —
a fresh pool back to the screen, filtered to the group the staff member had chosen.

**Coverage.** `domain/` and `application/` stay gated at 100% (`vitest.config.ts`). The new rules and
the changed use cases are TDD'd; the adapter and the screens are tested after, thinly, and covered by
Playwright. The batch **deletes** more tests than it adds — `change-group.test.ts` in full, and every
assertion about a group that was set rather than derived.

## Success Metrics

- No write anywhere in the system can produce a household whose number and group disagree — provable
  by the absence of a column to disagree with.
- A staff member registers a household by making one decision (which group) and accepting two
  proposals (which number, and the card it prints).
- A group that is full is visible as full **before** a staff member tries to use it, on both screens.
- No household ever appears on „Karten neu ausstellen“ for a group change again.
- The batch removes more code than it adds: one use case, two port methods, one domain error, one
  stale-card reason, one audit event, one parser, one React component and two columns.

## Open Questions

- **Is „Noch frei — Rot: 12, Blau: 3“ the wording DF want** for the per-group figure, or would they
  rather read it as two lines beside the two radios? It is the one genuinely new fact on the
  registration screen, and worth five words at the next acceptance session.
- **Does the merged section read as one decision on a real screen** (R-10), and does the unselectable
  full group read as an explanation rather than a fault (R-9)? Both are the author's recommendation
  rather than DF's instruction, and both are trivially reversible.
- **Should the record's confirmation name the group when the parity did not change?** This PRD says
  yes — the group is printed on the card — but DF may read it as noise on a move within one week.
- Nothing else is open: the refined requirement settles the rules, and §11 of it records that every
  question put to DF has been answered.
