# PRD: US-11 — Find and Reuse an Archived Record on Re-registration

> Source story: `docs/user_stories_mvp.md` §US-11 (Tier 2). Depends on **US-01** (registration) and
> **US-10** (archived records).

## 1. Introduction

People come back. Circumstances change, a certificate lapses and is renewed months later, someone
moves away and returns. FD already knows their household — retyping it wastes time and introduces
errors. This feature lets staff search the archive during registration and pre-fill the form from a
matching record.

The returning customer is nonetheless a **new** customer: new surrogate id, new customer number, fresh
card index starting at `k1`, reminder count 0. The old archived record is retained untouched, which is
what makes US-10's "records are kept indefinitely" promise real.

## 2. Goals

- Find a returning applicant by name and date of birth during registration.
- Pre-fill personal data, address and household members, all editable.
- Never resurrect the old record — always create a new customer.
- Keep the old archived record intact and unmerged.

## 3. User Stories

### US-11.1: Archive search (application + infrastructure)

**Description:** As a staff member, I want to search archived records by name and date of birth so I
can find a returning applicant.

**Acceptance Criteria:**

- [ ] `searchArchivedCustomers(deps, { lastName?, firstName?, birthDate? })` requires at least one
      criterion and rejects an all-empty query with a typed error
- [ ] Matching on names is case-insensitive and diacritic-tolerant enough for German names
      (Müller/Mueller — document the chosen approach; a normalised search column is acceptable)
- [ ] Results include only `ARCHIVED` customers, ordered most recently archived first
- [ ] Each result carries: name, date of birth, address, household size, the number they held, and the
      archive date and reason
- [ ] Results are capped (e.g. 20) with a clear "refine your search" message rather than paginating
- [ ] Repository query is indexed on `lastName` and `birthDate`
- [ ] Integration test with two archived people sharing a last name, and one active customer who must
      **not** appear

### US-11.2: Pre-fill from an archived record (application)

**Acceptance Criteria:**

- [ ] `draftFromArchived(deps, { archivedCustomerId })` returns a registration draft: personal data,
      address and household members (name + birthdate each)
- [ ] The draft carries **no** customer number, no group, no card, no reminder count and no certificate
      — those are decided fresh
- [ ] The draft is a plain value object; it creates nothing and mutates nothing (asserted by a test)
- [ ] Household members are copied as new values, not referenced — a test proves editing the draft
      cannot alter the archived record

### US-11.3: Re-registration path (application)

**Acceptance Criteria:**

- [ ] Registering from a draft goes through the **same** `registerCustomer` use case (US-01.4) — no
      parallel code path
- [ ] The new customer receives a newly allocated lowest-free number, which must **not** be assumed to
      be their old one; a test seeds the situation where the old number is taken and asserts a
      different number is assigned
- [ ] Card index starts at 1 (`<newNumber>k1`)
- [ ] Reminder count starts at 0 and the newly presented certificate's validity is recorded
- [ ] The archived record is untouched: a test asserts its status, number, cards and distribution
      records are byte-identical before and after
- [ ] An optional link from the new customer to the archived predecessor is stored (`previousCustomerId`),
      so staff can see the history — it is display metadata, never a merge

### US-11.4: Search and pre-fill UI (presentation)

**Acceptance Criteria:**

- [ ] The registration screen (US-01.6) has an "Im Archiv suchen" panel taking last name, first name
      and date of birth
- [ ] Results show enough to distinguish people: name, birthdate, address, former number, archive date
      and reason
- [ ] Selecting a result pre-fills the form; every pre-filled field remains editable, and the screen
      states clearly that a **new** number and a **new** card will be issued
- [ ] A visible way to clear the pre-fill and start blank
- [ ] The former number is shown for context but never presented as the number to be assigned
- [ ] Verify in browser using dev-browser skill

### US-11.5: E2E — re-register a returning customer

**Acceptance Criteria:**

- [ ] Playwright spec: register a customer, archive them, then register again via archive search
- [ ] Assert the household is pre-filled, the new number differs from the old one when the old one has
      since been taken, the card is `k1`, and the reminder count is 0
- [ ] Assert the archived record still exists with its own distribution history

## 4. Functional Requirements

- FR-1: During registration, searching by name and date of birth must surface matching archived records.
- FR-2: Confirming a match must pre-fill personal data, address and household members, all editable.
- FR-3: The returning customer must receive a new customer number — never guaranteed to be their old
  one — and a fresh card index starting at `k1`.
- FR-4: The reminder count must start at 0 and the new certificate's validity period must be recorded.
- FR-5: The old archived record must be retained; it must not be overwritten, merged or deleted.
- FR-6: Only archived customers may appear in the archive search results.

## 5. Non-Goals

- No merging of records, ever.
- No automatic duplicate detection against **active** customers during registration.
- No fuzzy/phonetic matching beyond case- and diacritic-insensitivity (no Soundex, no Levenshtein).
- No carry-over of distribution history, reminder count, group or notes to the new customer.
- No bulk re-registration or import.

## 6. Design Considerations

- The riskiest moment is a staff member believing the old record was "reactivated". The pre-fill screen
  must state, unambiguously and in German, that a new customer with a new number is being created.
- Show the archive date and reason in results — the reason ("suspected misuse") may be exactly what
  staff need to see before re-registering someone.

## 7. Technical Considerations

- `previousCustomerId` is a nullable self-referencing FK on `Customer`. It is metadata only; no rule
  ever reads it. Keeping it makes a future "history of this household" view additive.
- Diacritic-tolerant search in SQLite needs either a normalised column written on save or `LIKE` with
  pre-folded values — decide in US-11.1 and document; SQLite has no built-in unaccent.

## 8. Success Metrics

- Re-registering a known four-person household takes under one minute.
- Zero cases of an archived record being modified during re-registration.

## 9. Open Questions

- Should the search also cover **active** customers, to catch the "they're already registered" mistake?
  (Out of scope here per US-01's precondition, but cheap to add and arguably valuable.)
- Should a household member's data be reusable independently, or only whole records?
- How should two archived records for the same person (registered and archived twice) be presented?
  Assumed: both listed, most recent first; staff pick.
