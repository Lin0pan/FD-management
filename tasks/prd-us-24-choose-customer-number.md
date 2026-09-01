# PRD: Choose the customer number when registering (US-24)

> Extends **US-01** (register a customer) and its slot rule. Depends on **US-14** for the quota `N`.
> Touches every registration path: the walk-in form, the re-registration of an archived household
> (**US-11**) and the promotion off the waiting list (**US-12**).

## Introduction

Registration hands out the **lowest free** customer number, and nobody types it (US-01, FR-4). That
is the right default: the number is a slot, not an identity, and reusing the gap an archived
household left keeps the range dense (`src/domain/customer/customerNumber.ts`).

It is not always the right answer. A customer number is printed on a physical card that a staff
member is holding, and DF have reasons the software cannot see for wanting a particular one — a
household returning to the number their neighbours know them by, a block of numbers kept together, a
pre-printed card in the drawer. Today the screen shows „Vorgeschlagene Kundennummer 37" as a
read-only figure and the only way to land on 38 is to register somebody else first.

This PRD makes the number a **choice with a default**: a dropdown of every free number in `1..N`,
opened on the lowest one. Accept it and nothing about registration changes. Pick another and that is
the number the household gets.

The rule that does **not** change: only a genuinely free number may be chosen, and the database's
partial unique index stays the final authority on what "free" means.

## Goals

- The registration form offers every free customer number, ascending, with the lowest **preselected**
  — so the common registration is still one that nobody has to think about.
- A staff member can pick any other free number in one control, without leaving the form.
- The number shown when **Aufnehmen** is pressed is always the number saved. No silent substitution.
- A number that was taken by a colleague between opening the form and saving is refused by name, with
  everything typed still on screen and a list that no longer offers it.
- All three registration paths behave identically — there is one registration, and it gets one number
  rule.

## User Stories

### US-024.1: `freeNumbers` and `assertFreeNumber` — the pool, and the check on a chosen slot (domain)

**Description:** As a developer, I want the set of free slots and the verdict on a requested one to be
pure functions, so the screen offering a number and the use case saving it read the same rule.

**Acceptance Criteria:**

- [ ] `src/domain/customer/customerNumber.ts` exports
      `freeNumbers(takenNumbers: ReadonlyArray<number>, quotaN: number): ReadonlyArray<number>` —
      every integer in `1..quotaN` that nobody active holds, **ascending**.
- [ ] The existing `findLowestFreeNumber` is re-expressed on top of it
      (`const free = freeNumbers(...); return free.length === 0 ? null : free[0];`) so the pool is
      defined once. Its behaviour and signature are unchanged, and `lowestFreeNumber` keeps throwing
      `NoFreeCustomerNumber` on an empty pool.
- [ ] `freeNumbers` ignores duplicates in `takenNumbers` and entries above `quotaN` or below `1`,
      exactly as `findLowestFreeNumber` does today — the caller passes what the register happens to
      contain, and neither can make a slot inside the range more or less free.
- [ ] A full register gives `[]`; a `quotaN` of `0` gives `[]`; an empty `takenNumbers` gives
      `[1..quotaN]`.
- [ ] The same module exports
      `assertFreeNumber(requested: number, takenNumbers: ReadonlyArray<number>, quotaN: number): number`,
      returning `requested` when it is free.
- [ ] `assertFreeNumber` throws `CustomerNumberTaken(requested)` when an active customer holds it —
      the error that already exists, because this is the same fact the unique index reports.
- [ ] `assertFreeNumber` throws a **new** typed error `CustomerNumberOutOfRange` when `requested` is
      not an integer, is below `1`, or is above `quotaN`. It carries `{ customerNumber, quotaN }`.
      This is not hypothetical: US-14 lets staff lower `N` while a registration form is open.
      It is a **separate code** even though it is the **same sentence** (see US-024.4): the retry
      loop in `registerCustomer` catches `CustomerNumberTaken` by type and retries it, so a quota
      violation wearing that code would be retried as if it were a lost race.
- [ ] `CustomerNumberOutOfRange` is added to `DomainErrorCode` in `src/domain/errors.ts` and therefore
      to `TIERS` in `src/app/notice-tier.ts`, where it is a **`refusal`** — the form is right there and
      the staff member can settle it by picking again.
- [ ] The module stays pure: no I/O, no `Date`, no import from Next.js, React or Prisma.
- [ ] Strict TDD, invariant-breaking test first, one named test per rule. Named cases:
      `[1,2,4]` with `quotaN` 5 gives `[3,5]`; a gap left by archiving is in the pool; a taken number
      is refused; `0`, `-1`, `quotaN + 1` and `1.5` are all out of range; the number `quotaN` itself is
      in range; the pool is ascending even when `takenNumbers` is not sorted.
- [ ] Domain coverage stays at 100%.
- [ ] `npm run lint` and `npm run typecheck` pass.

### US-024.2: `proposeRegistration` hands out the whole pool (application)

**Description:** As a staff member, I want the form to know every number it may offer me, so the
dropdown is a fact about the register rather than a guess.

**Acceptance Criteria:**

- [ ] `RegistrationProposal` in `src/application/customers/propose-registration.ts` gains
      `readonly freeNumbers: ReadonlyArray<number>` — the pool from US-024.1, ascending.
- [ ] `customerNumber` **stays** and keeps its meaning and its `number | null` type: it is the option
      the dropdown opens on, and three other screens (`/kunden`, `/warteliste`,
      `/kunden/neu`'s `FreeSlotBanner`) already ask this proposal only "is a slot free, and which".
      Its doc comment is updated to say it is the first of `freeNumbers` and that the two are computed
      from one call, so they cannot disagree.
- [ ] `proposeRegistration` calls `freeNumbers` **once** and derives `customerNumber` from the result.
      No second scan of the register.
- [ ] A full register gives `freeNumbers: []` **and** `customerNumber: null` — still not a thrown
      error, because the screen has to render either way.
- [ ] `NoSettingsInForce` still propagates unchanged; the four existing callers and their
      `catch` behaviour are untouched.
- [ ] TDD against hand-written fakes; no mocking library. Named tests for: the pool skips every active
      number; an archived household's number is in the pool; the pool is bounded by the quota in force
      and not by the highest number in the register; a full register gives an empty pool and a null
      proposal; `freeNumbers[0]` equals `customerNumber` whenever one exists.
- [ ] Application coverage stays at 100%.
- [ ] `npm run lint` and `npm run typecheck` pass.

### US-024.3: `registerCustomer` honours a chosen number (application)

**Description:** As a staff member, I want the number I picked to be the number that is saved, and to
be told plainly when it is not available, rather than quietly given a different one.

**Acceptance Criteria:**

- [ ] `RegisterCustomerInput` gains `readonly customerNumber?: number` — the slot staff chose. Left
      out, everything behaves exactly as it does today.
- [ ] **Absent:** the existing behaviour is untouched — lowest free number, and the `MAX_ATTEMPTS`
      retry loop on `CustomerNumberTaken` that moves to the next free slot.
- [ ] **Present:** the number is checked with `assertFreeNumber` and used as given. **No retry** — a
      second attempt could only produce a different number, and substituting a number a staff member
      did not choose is the one outcome this feature exists to prevent. `CustomerNumberTaken` from the
      repository's unique index propagates to the caller unchanged.
- [ ] Everything else about the registration is identical either way: same transaction, same first
      card at index 1, same `ACTIVE` status, same `reminderCount: 0`, same `countsAtIssue` snapshot.
- [ ] The audit entry is **unchanged**. `customerNumber` is already in `REGISTERED_FIELDS`, and
      whether the rule or a human chose the slot is not something a later reader can act on. No new
      field, no new event.
- [ ] `registerFromWaitingList` (US-12.2) inherits the field through `RegisterCustomerInput` and needs
      no change of its own — including its guarantee that a failed registration leaves the queue
      untouched, which must still hold when the failure is `CustomerNumberTaken`.
- [ ] `@throws` documentation on both use cases names `CustomerNumberOutOfRange`.
- [ ] TDD against hand-written fakes. Named tests for: a chosen free number is saved; a chosen number
      held by an active customer is refused and **nothing is written** (no customer, no card, no audit
      entry); a chosen number above the quota in force is refused as out of range; a chosen number
      freed by archiving is accepted; an omitted number still allocates the lowest free one and still
      retries a lost race; a chosen number does **not** retry.
- [ ] Application coverage stays at 100%.
- [ ] `npm run lint` and `npm run typecheck` pass.

### US-024.4: The number dropdown on the registration form (presentation)

**Description:** As a staff member, I want to see the number the household is about to get and change
it in one control, on the screen where I am already typing.

**Acceptance Criteria:**

- [ ] In the `Zuordnung` section of `src/app/kunden/neu/registration-form.tsx`, the read-only
      `Stat` `data-testid="proposed-number"` is **replaced** by a labelled
      `<select name="customerNumber" id="customerNumber" data-testid="customer-number-select">`.
- [ ] The select is a **native** `<select>`, not `src/components/ui/select.tsx`: the action reads
      `customerNumber` out of the `FormData` and a Radix select submits nothing of its own, and a
      native one is type-ahead searchable over 240 options with no JavaScript of ours. Same argument
      the group radios already make in this file.
- [ ] Its options are `proposal.freeNumbers`, ascending, one option per number, `value` and text both
      the number itself.
- [ ] It opens on `proposal.customerNumber` — the lowest free slot — via `defaultValue`. It is
      **uncontrolled**, so a refused save leaves the staff member's choice on screen (#91).
- [ ] `<label htmlFor="customerNumber">` carries `de.customers.fields.customerNumber`
      („Kundennummer"), matching the `Field` pattern this form already uses — not a nested
      `<label><span>`, which leaves an unnamed combobox in the accessibility snapshot.
- [ ] A hint line under it, `data-testid="free-number-count"`, says how many numbers are free and that
      the lowest is preselected. It is inflected at one („1 freie Nummer", „213 freie Nummern").
- [ ] When the register is full (`customerNumber === null`) the select is **disabled** and renders no
      options; the existing full-register `Alert` and its waiting-list button are the message, and the
      submit button stays disabled as it is today.
- [ ] The select matches the height of the form's `Input`s so the `Zuordnung` row keeps one baseline —
      `radix-nova` defaults differ, see `docs/ui_conversion_guide.md`.
- [ ] `customerNumber` is added to the `registrationForm` Zod schema in `registration-input.ts`, read
      as a positive integer string. A blank or non-numeric value is refused with
      `de.customers.errors.missingField(de.customers.fields.customerNumber)` — it can only be a
      tampered or stale submission, and it must never fall through to "the system picks one".
- [ ] `de.customers.errors.customerNumberTaken` is **replaced** by
      `customerNumberUnavailable(customerNumber: number): string` — „Die Kundennummer 37 ist nicht
      mehr verfügbar. Bitte eine andere Nummer wählen." The old static string ended „Bitte erneut
      speichern.", which is now wrong advice: a chosen number that is gone fails identically however
      often it is re-submitted. Both errors carry the number, so the message can name it.
- [ ] `customerErrorMessage` returns that **one sentence for both** `CustomerNumberTaken` and
      `CustomerNumberOutOfRange`. A staff member does not act differently on "somebody just took it"
      than on "the quota moved under you" — either way they pick another number — and the repo
      already separates these axes: the code is what the program branches on and what `notice-tier.ts`
      tiers, the sentence is what staff read. Both registration actions get it for free, since they
      share the module.
- [ ] `submitRegistration` and the waiting-list promotion action both pass `form.customerNumber`
      through to their use case. Neither gains a rule of its own.
- [ ] **On a lost race only** (`CustomerNumberTaken`), the action re-reads `proposeRegistration` and
      returns the fresh pool in `RegisterCustomerState`; the form prefers that list over its prop when
      one is present. Without this the form goes on offering a number that provably cannot be saved,
      and the staff member's obvious next move — pick it again — fails identically. Every other
      refusal returns the state it does today.
- [ ] Every German string is a key in `src/i18n/de.ts`. New keys go under `de.customers.assignment`;
      `assignment.proposedNumber` is removed once nothing reads it. No German literal in a component.
- [ ] `RegistrationScreen` still remounts the form when the archive selection changes, and a
      re-registration or a waiting-list promotion shows the same control with the same default — no
      branch on the draft.
- [ ] `document.documentElement.scrollWidth - clientWidth` is `0` at 1920, 1280, 1024, 800 and 390.
- [ ] `npm run lint` and `npm run typecheck` pass.
- [ ] Verified with the `playwright-cli` skill against a **production** build, reading the
      **accessibility snapshot**: the control is announced as a combobox named „Kundennummer" with the
      lowest free number selected, the hint is readable text and not a `title`, and the keyboard can
      reach the control, type `1`,`5` and land on 15.

### US-024.5: E2E — registering on a number nobody proposed

**Description:** As a developer, I want the picked number proved against the built app, because the
whole feature is the difference between what the form offered and what the database stored.

**Acceptance Criteria:**

- [ ] `tests/e2e/registration.spec.ts` is extended (no new spec file): the existing registration flow
      still passes with the dropdown untouched, and the customer it creates still gets the lowest free
      number.
- [ ] Asserts the default: the select's selected option equals the lowest free number, **read from the
      database in the spec** rather than hard-coded — the register is shared with every other spec.
- [ ] Asserts the choice: selecting a higher free number and saving produces a customer holding
      **that** number, checked in the database, with card `<number>k1`.
- [ ] Asserts the pool: a number held by an **active** customer is not among the options; a number
      freed by **archiving** a household is.
- [ ] Asserts the refusal: submitting a `customerNumber` that an active customer holds (posted around
      the select, the way a stale form would) creates **nothing** — a database snapshot before and
      after is identical — and the German message names the taken number.
- [ ] Synthetic data only (Faker), and the spec seeds in a high, otherwise unused number band so no
      other spec's registrations land inside it.
- [ ] `npm run test:e2e` passes in full, with the dev server stopped first.

## Functional Requirements

- **FR-1:** The registration form must offer every customer number in `1..N` that no **active**
  customer holds, in ascending order, as a dropdown.
- **FR-2:** The dropdown must be preselected to the **lowest** free number — the number the system
  allocates today — so a registration that ignores the control is unchanged in behaviour.
- **FR-3:** A number freed by archiving a household must appear in the list. An archived household
  keeps its number as history but does not hold the slot.
- **FR-4:** The number selected when the form is submitted is the number stored. The system must never
  substitute a different one.
- **FR-5:** A submitted number that an active customer holds must be refused, and nothing must be
  written.
- **FR-6:** A submitted number outside `1..N` — including one that fell outside because the quota was
  lowered while the form was open — must be refused too, under its **own error code** but with the
  **same sentence** as FR-5: the number is not available and another must be picked. The distinction
  is for the program, not for the staff member.
- **FR-7:** After a refusal under FR-5 or FR-6 the form must keep everything typed, and the list of
  numbers it offers must no longer include the one that was refused as taken.
- **FR-8:** When the register is full the dropdown must be empty and disabled, and the existing
  full-register message and waiting-list route are unchanged.
- **FR-9:** The rule is identical on all three registration paths: walk-in, re-registration from an
  archived record (US-11.3), and promotion off the waiting list (US-12.4).
- **FR-10:** The audit entry for a registration is unchanged.
- **FR-11:** All German strings live in `src/i18n/de.ts`.

## Non-Goals

- **Not** a way to change an existing customer's number. `US-16` corrects a record; a number is a slot
  the household occupies, and moving one is a different act with different consequences for the card
  in their hand. Nothing here touches `updateDetails`.
- **Not** a reservation. The proposal reserves nothing, exactly as it does today (US-01, §7): the
  partial unique index is still the only authority on a free slot, and the window between reading the
  pool and writing the row is closed by the refusal, not by a lock.
- **Not** a free-text number field. Only numbers the register says are free may be chosen; typing
  `999` must not be a thing the form lets a staff member do in the first place.
- **Not** a searchable combobox, a `Command` palette or a new UI dependency. A native `<select>` is
  already type-ahead searchable.
- **Not** a reason, a note or an audit marker for choosing a number. DF have their reasons; the
  software does not need to hold an opinion about them.
- **Not** a change to how numbers are allocated when none is chosen. The lowest-free rule and its
  retry loop stay exactly as they are.
- **Not** a change to the group choice, the household table, the derived counts or the certificate
  fields.

> **Note (2026-09-01).** The first bullet was superseded by **US-30**: a household on the register may
> now be moved from the number it holds to any free one, from its own section on the record, with a
> new card issued in the same transaction. The reasoning above still holds in full — moving a number
> is a different act from correcting a record, it is emphatically not part of `updateDetails`, and
> that is exactly why US-30 gave it a use case, a section and a confirmation of its own rather than a
> field in the details form. See
> [ADR-016](../docs/architecture/adr/016-a-customer-number-may-be-changed-and-a-card-keeps-the-number-it-was-printed-with.md).

## Design Considerations

- The dropdown **replaces** the „Vorgeschlagene Kundennummer" `Stat` rather than sitting beside it.
  Two controls showing one number is how they start disagreeing, and the word „vorgeschlagen" is what
  the preselection already says.
- It is **not** folded behind a `<details>` the way the group choice is (US-20). The group choice is a
  decision with a default that DF essentially never override; the number is one they asked to be able
  to make, and it is also the field they will want to _read_ before pressing Aufnehmen — a card
  number is the thing the household walks out with. It stays visible.
- The label is „Kundennummer", the field's own name, because it is now a field. The hint below carries
  what „vorgeschlagen" used to: how many are free, and that the lowest is already chosen.
- The hint doubles as the answer to a question DF ask out loud — "how full are we?" — one line above
  the group sizes, which answer the same kind of question about the other axis.
- Keep the hint to one line at 1024 and above. It states two facts; it must not grow into an
  explanation of what a customer number is.

## Technical Considerations

- **240 options is not a performance question.** At DF's quota the pool is at most a few hundred short
  strings in the server-rendered HTML, which is smaller than the household table this form already
  ships. Do not add virtualisation, pagination or a search box for it.
- `proposeRegistration` is called by four screens; only the registration form reads the new field.
  Adding rather than replacing `customerNumber` is what keeps the other three untouched.
- **The re-read on a lost race is deliberately narrow.** It is one extra `proposeRegistration` call in
  the `CustomerNumberTaken` branch of the action, not a refresh on every refusal, and not a client
  poll. `app/` may call a use case; what it may not do is decide anything, and it does not.
- `CustomerNumberOutOfRange` is the 31st `DomainErrorCode`, so `TIERS` in `notice-tier.ts` will fail
  the build until it is tiered. That is the mechanism working, not an obstacle.
- **Two codes, one sentence, and that is not a redundancy to tidy away later.** The codes differ
  because `registerCustomer` catches `CustomerNumberTaken` by type to retry a lost race — merging
  them would make a quota violation retryable. The sentence is one because staff have one move
  either way. `notice-tier.ts` already argues this separation from the other side: a tier must never
  be read back out of a German string, because the string is the thing most likely to be reworded.
- `de.customers.errors.customerNumberTaken` has exactly one reader (`customerErrorMessage`), so
  renaming it to `customerNumberUnavailable` and giving it a parameter is a contained change. Note
  that `customerErrorMessage` is also shared with the record edit (`/kunden/[id]`), which cannot
  raise either code — it never changes a number — so nothing there needs re-wording.
- The retry loop in `registerCustomer` becomes conditional. Keep the loop shape for the absent case
  rather than duplicating the create-and-audit block — one `for(;;)` whose attempt budget is `1` when
  a number was chosen is the smaller diff, if it reads honestly; otherwise an early branch is fine.
  What must not happen is two code paths that write a customer.
- The Zod schema is shared by the registration screen and the waiting-list promotion
  (`registration-input.ts`), so the field is added once and both screens get it. That is why it lives
  there and not in `actions.ts`.

> **Note (2026-09-01).** „`/kunden/[id]` … never changes a number" stopped being true with **US-30**:
> the record gained a „Kundennummer" section that moves a household to another slot, and it reports
> `CustomerNumberTaken` and `CustomerNumberOutOfRange` through that same shared
> `customerErrorMessage`. The point the bullet makes — one sentence for staff, two codes for the code
> — is unchanged, and the shared reader is what made the new screen cost nothing here.

## Success Metrics

- A staff member can register a household on a number of their choosing without leaving the form, and
  the number on the card matches the number in the database.
- A registration that ignores the dropdown produces byte-for-byte the same record it does today.
- Zero registrations land on a number the staff member did not see on screen.
- No duplicate active customer numbers, still guaranteed by the partial unique index.

## Open Questions

- **Should the dropdown say anything about a number's history** — that 37 was freed by archiving
  rather than never used? It is the kind of thing that sounds useful and turns a 240-row list into a
  240-row list of sentences. Left out; revisit only if DF ask for a specific number's past.
- **Should the waiting-list promotion default to something other than the lowest free number?** The
  free-slot banner names a number to the applicant at the head of the queue; if DF start treating that
  as a promise, the promotion form should open on the number the banner named.
- **Should lowering the quota below a number a household already holds be prevented?** It is refused
  today by `QuotaBelowActiveCustomers` on the count, not on the numbers — a register with a gap could
  in principle keep an active customer above the new `N`. Out of scope here; `assertFreeNumber` simply
  reports what it finds.
