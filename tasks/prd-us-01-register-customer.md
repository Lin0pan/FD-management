# PRD: US-01 — Register a New Customer

> Source story: `docs/user_stories_mvp.md` §US-01 (Tier 1). Depends on **US-14** (quota `N`).
> Produces the first card via **US-02**.

## 1. Introduction

Registration is where a person becomes a customer. Today it means adding a row to a shared Excel
sheet, with the customer number, the group balance and the household counts all maintained by hand.
This feature captures the applicant's personal data, address, household members and needs
certificate, assigns the lowest free customer number and a group, and creates an active customer with
their first card.

The two subtle rules that make this more than a form: the **customer number is a reusable slot**, not
an identity, and the **grown-up/children counts are derived from birthdates**, never typed.

## 2. Goals

- Register an applicant in one screen, with household members, in under two minutes.
- Assign the lowest free customer number in `1..N`, including numbers freed by archiving.
- Suggest the group with fewer active customers, overridable by staff.
- Make it impossible to store a household count that contradicts the birthdates.
- Reject invalid registrations with a message that says exactly what is wrong.

## 3. User Stories

### US-01.1: `HouseholdComposition` — derive grown-up/children counts (domain)

**Description:** As a developer, I need the grown-up/children split computed from birthdates against
an injected clock, so counts can never drift from reality.

**Acceptance Criteria:**

- [ ] `src/domain/customer/householdComposition.ts` exports
      `composition(members, today): { grownUps: number; children: number }`
- [ ] A member counts as a grown-up **on** their 13th birthday; the day before they are a child
- [ ] Tests cover the day before, the day of, and the day after a 13th birthday
- [ ] Test covers a 29 February birthdate evaluated in a non-leap year (turns 13 on 1 March, per the
      German civil-law convention — document the choice in a comment)
- [ ] An empty member list throws a typed `EmptyHousehold` error rather than returning `{0, 0}`
- [ ] A future birthdate throws a typed `BirthDateInFuture` error
- [ ] No `new Date()` anywhere in the module; `today` is a parameter

### US-01.2: `CustomerNumber` — lowest free slot allocation (domain)

**Description:** As a developer, I need a pure function that picks the lowest free customer number,
so registration order is reproducible and testable.

**Acceptance Criteria:**

- [ ] `src/domain/customer/customerNumber.ts` exports `lowestFreeNumber(takenNumbers, quotaN)`
- [ ] Returns the smallest integer in `1..quotaN` not present in `takenNumbers`
- [ ] Returns a typed `NoFreeCustomerNumber` error result when every number is taken
- [ ] A gap left by an archived customer is filled before any higher number
- [ ] Tests cover: empty list → 1; `[1,2,4]` → 3; full range → error; `quotaN = 1`

### US-01.3: `suggestGroup` — balance Red and Blue (domain)

**Description:** As a staff member, I want the app to suggest the smaller group so Red and Blue stay
roughly equal without me counting.

**Acceptance Criteria:**

- [ ] `src/domain/customer/group.ts` exports the `Group = 'RED' | 'BLUE'` type and
      `suggestGroup({ red, blue })`
- [ ] Returns the group with fewer **active** customers
- [ ] On a tie, returns `'RED'` deterministically (documented — never random)
- [ ] The suggestion is advice only; the function has no authority over what is stored

### US-01.4: `registerCustomer` use case (application)

**Description:** As a developer, I need one transactional use case that turns validated input into an
active customer with a number, a group and a first card.

**Acceptance Criteria:**

- [ ] `CustomerRepository` port added to `src/application/ports.ts` with at least
      `takenActiveNumbers()`, `groupСounts()`, `create(customer)` — names may evolve from the tests
- [ ] `registerCustomer(deps, input)` reads settings (US-14) for `quotaN`, allocates the lowest free
      number, resolves the group (input override wins over the suggestion), and persists the customer
      with status `ACTIVE`, `reminderCount = 0` and card `<number>k1`
- [ ] Rejects with typed errors, one per case: `NoFreeCustomerNumber`, `EmptyHousehold`,
      `BirthDateInFuture`, `MissingRequiredField`
- [ ] The whole operation is a single transaction — a failure leaves no partial customer and does not
      consume a customer number
- [ ] Writes an audit entry (what/when/why, no actor)
- [ ] Tested against fake repositories and a fake clock, including the concurrent-registration case
      where the chosen number was taken between read and write (must surface `NoFreeCustomerNumber`
      or retry, not create a duplicate)

### US-01.5: Customer schema and repository (infrastructure)

**Description:** As a developer, I need the customer, household member, certificate and card tables,
with the slot-vs-identity rule enforced by the database.

**Acceptance Criteria:**

- [ ] Prisma models: `Customer` (surrogate `id Int @id @default(autoincrement())`, `customerNumber Int`,
      `firstName`, `lastName`, `birthDate`, address fields, `group`, `status`, `reminderCount`, `notes`),
      `HouseholdMember` (FK to `Customer.id`), `Certificate` (`type`, `validUntil`, FK), `Card`
      (`index Int`, FK, `issuedAt`)
- [ ] **No `grownUps` / `children` columns exist** — the counts are derived, never stored
- [ ] A partial/filtered unique index enforces _at most one **active** customer per `customerNumber`_;
      archived rows are exempt (architecture sketch §5.3)
- [ ] Every FK targets `Customer.id`, never `customerNumber`
- [ ] Unique constraint on `(customerId, index)` for cards
- [ ] Migration committed; `PrismaCustomerRepository` integration-tested against a throwaway db,
      including a test proving two archived customers may share number `50`

### US-01.6: Registration form (presentation)

**Description:** As a staff member, I want a registration screen that captures everything in one
place and shows me the derived counts as I type.

**Acceptance Criteria:**

- [ ] Route `/kunden/neu` with a Zod-validated server action calling `registerCustomer` and nothing else
- [ ] Fields: first name, last name, date of birth, street, house number, ZIP, city, certificate type,
      certificate valid-until
- [ ] Household members are added and removed as repeatable rows (first name, last name, birthdate);
      the customer themselves is pre-filled as the first member from the personal-data fields
- [ ] Grown-up and children counts are shown as **read-only derived values** that update live; there
      is no input control for them
- [ ] The proposed customer number and suggested group are shown; the group is changeable via a
      Red/Blue control that displays both current group sizes
- [ ] Each rejection renders a specific German message: no free number, missing field, empty
      household, future birthdate
- [ ] On success, redirect to the customer's card view (US-02)
- [ ] All strings from `src/i18n/de.ts`
- [ ] Verify in browser using dev-browser skill

### US-01.7: E2E — register a customer, card issued

**Acceptance Criteria:**

- [ ] Playwright spec registers a two-person household and asserts: customer appears with a number,
      counts show 1 grown-up / 1 child (using birthdates fixed relative to the test clock), card
      number ends in `k1`, status active
- [ ] Spec asserts submitting with an empty household shows the German error and creates nothing
- [ ] Test data is synthetic (Faker) — never real customer or certificate data

## 4. Functional Requirements

- FR-1: The form must capture first name, last name, date of birth, street, house number, ZIP, city,
  certificate type and certificate validity end date.
- FR-2: The form must capture each household member by first name, last name and date of birth; the
  registered customer is one of these members, so a single-person household has exactly one.
- FR-3: The system must display grown-up (13+) and children (<13) counts as derived values that
  cannot be typed in or overridden.
- FR-4: The system must offer the **lowest free** customer number in `1..N`, including numbers freed
  by archiving.
- FR-5: The system must suggest the group with fewer active customers and allow staff to override it.
- FR-6: The system must reject saving when no free number exists, a required field is missing, the
  household is empty, or a date of birth is in the future — each with its own message.
- FR-7: On save, the customer must be `active`, have reminder count `0`, and card number `<number>k1`.
- FR-8: A customer number in use by an active customer must not be offered to another registration.
- FR-9: The customer's stable identity must be a surrogate key, never the customer number.

## 5. Non-Goals

- No duplicate detection against **active** customers (the story's precondition assumes staff know);
  archive search is US-11.
- No waiting-list handling here — a full quota is an error; the waiting list is US-12.
- No contact details (phone, e-mail) — deliberately absent from the agreed field list.
- No physical card printing (US-02, out of MVP scope).
- No history of household compositions.

## 6. Design Considerations

- This is a dense data-entry form; favour a single scrolling column with a sticky summary panel
  showing number, group, counts, portions and price as they resolve.
- Household member rows should be keyboard-addable (Enter adds the next row) — staff type fast.

## 7. Technical Considerations

- `registerCustomer` and `issueFirstCard` share a transaction; the card is not a separate user action.
- The concurrent-number race is real even at four users — rely on the partial unique index as the
  final authority and translate the constraint violation into `NoFreeCustomerNumber`.
- Address is stored as flat German fields (street, house number, ZIP, city), not a formatted blob.

## 8. Success Metrics

- Registering a four-person household takes under two minutes.
- Zero registrations that produce a duplicate active customer number.
- Derived counts always match the birthdates on file, by construction.

## 9. Open Questions

- Is the ZIP code restricted to Delbrück-area codes, or free-form?
- Should the certificate _type_ be a free-text field or a configurable list (e.g. Jobcenter, Sozialamt)?
- Must the registered customer always appear in their own household list, or should the system add
  them implicitly and hide the row?
