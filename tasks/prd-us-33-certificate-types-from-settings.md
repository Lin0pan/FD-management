# PRD: Pick the Art des Nachweises instead of typing it (US-33)

> Source: DF's request, September 2026 — "there are usually the same types of Bedarfsnachweis coming
> again and again, so let us define them in the settings and pick them from a drop-down." Clarified in
> four answers, recorded under §_Settled before this was written_.

## Introduction

Four screens ask what kind of proof of need a household brought, and all four ask it as an empty text
box: the registration form (`/kunden/neu`), the renewal on a customer record (`/kunden/[id]`), the
renewal at the counter (`/ausgabe`) and the waiting-list applicant form (`/warteliste`). The same half
a dozen answers are typed into that box week after week — a Jobcenter notice, a Wohngeld notice, a
pension statement — and each one is typed afresh, by four different people, from memory.

That produces two problems, and only the first is the one DF named. The **typing** is tedious. The
**variants** are worse: „Jobcenter-Bescheid", „Jobcenter Bescheid", „JC-Bescheid" and „jobcenter"
are one kind of notice recorded four ways, and nothing in the software can tell that they are. It is
the same failure mode the register already has one answer to — a spelling nobody agreed on, retyped
until it drifts.

So the fix is a small vocabulary DF maintain themselves: a list of Nachweis-Arten on the settings
screen, and a drop-down wherever the type is asked for. Not a closed list — a staff member standing
at the counter with a household holding a notice nobody has seen before must not have to abandon a
half-filled form to go and configure one. The drop-down therefore carries the configured types **and
a „Sonstiges" option** that opens a free-text field, and what they type there is stored as the
certificate's type without silently joining the list. The rare case stays possible; the common case
stops being typed.

**The list is not a policy version.** The settings screen's existing values are append-only for one
reason: a hand-out recorded last March must still be priceable with the rule that applied then
(ADR-005). A certificate's type has never needed that — it is stored as a string on the `Certificate`
row, so a record from last March already says what kind of notice it was without anybody resolving
anything. Versioning the vocabulary would append a policy version every time DF add a word, filling
the settings history with entries that changed no rule. The list is therefore a table of its own,
edited in place and audited on every change (ADR-019, §US-33.9).

What DF get afterwards: a card on `/einstellungen` where rows are added and removed like the egg
staircase, and four screens where the Art des Nachweises is one click.

## Goals

- DF maintain the list of Nachweis-Arten themselves, on `/einstellungen`, with no deploy.
- Every screen that asks for an Art des Nachweises offers those types in a native drop-down, in one
  consistent order and one consistent wording.
- A type nobody has configured is still recordable, in the same form, without leaving it.
- Adding or removing a type is recorded in the audit log, like every other state change.
- Removing a type from the list never rewrites, hides or invalidates a record already saved with it.
- No use case signature changes: what reaches the domain is still a certificate with a `type` string.

## User Stories

### US-33.1: The vocabulary is a validated domain value (domain)

**Description:** As a developer, I want the list of Nachweis-Arten to be a value with rules of its
own, so that no screen and no adapter has to decide what counts as a duplicate.

**Acceptance Criteria:**

- [ ] New module `src/domain/policy/certificateTypes.ts`, beside `eggs.ts` — the second list-valued
      thing DF configure, and the first that is not a policy value (its opening comment says so and
      cites ADR-019 rather than repeating the argument).
- [ ] `CertificateTypeList = ReadonlyArray<string>`, made only by `createCertificateTypeList(labels)`.
      The type is the invariant: a reader may rely on the order and on there being no duplicate.
- [ ] `createCertificateTypeList` **trims** each label and returns the trimmed spelling. Leading and
      trailing space is a typo, not a distinction.
- [ ] A label that is blank after trimming throws `MissingRequiredField` naming
      `certificateTypes.<index>.label`, with the index **as it was typed**, so the form marks the row
      on screen — the rule and the wording `createEggRule` already follows.
- [ ] A label longer than `CERTIFICATE_TYPE_MAX_LENGTH` (80 characters, exported) throws
      `CertificateTypeTooLong(length, maxLength)`, in the shape of `NotesTooLong`.
- [ ] Two labels that **fold to the same string** throw `DuplicateCertificateType(label)`, carrying
      the second spelling as typed. Folding is `foldName` from `src/domain/customer/nameSearch.ts`,
      reused rather than rewritten: it lower-cases, maps `ä → ae` and `ß → ss` and drops remaining
      diacritics, which is exactly the set of differences that make two spellings one word here. A
      one-line comment says why a name-folding helper is the right one; it does not re-explain what
      it does.
- [ ] The returned list is **sorted by the folded label**, ascending. Staff type rows in whatever
      order they think of and the drop-down must not change order between two saves; sorting is part
      of constructing the value, as it is for the egg rule.
- [ ] An **empty list is legitimate** and means only „Sonstiges" is offered — never read as "not
      configured", exactly as an empty egg rule is not.
- [ ] `diffCertificateTypes(previous, next)` returns `ReadonlyArray<CertificateTypeChange>` —
      `{ kind: "added" | "removed"; label: string }` — in the list's own order, matched **by folded
      label**. Re-spelling „jobcenter" as „Jobcenter" is therefore not a change; re-spelling it as
      „JC" is a removal and an addition, which is what it is.
- [ ] `DuplicateCertificateType` and `CertificateTypeTooLong` are added to `src/domain/errors.ts`
      following the file's existing shape (a `code`, the offending values as readonly fields).
- [ ] Written test-first, one named test per rule, each named after the rule rather than the
      function:
  - `trims the spelling it stores`
  - `refuses a label that is only spaces`
  - `reads „Jobcenter" and „jobcenter" as one type`
  - `reads „Wohngeld" and „wohngeld " as one type`
  - `sorts umlauts where a German reader expects them`
  - `accepts an empty list as "no configured types"`
  - `reports a re-spelling as no change`
- [ ] Domain coverage stays at 100%; `npm run test:coverage` passes.

### US-33.2: The list is stored in a table of its own (infrastructure)

**Description:** As DF, I want the types I configure to survive a restart, so that the list is
something the software keeps rather than something I retype.

**Acceptance Criteria:**

- [ ] New `CertificateType` model in `prisma/schema.prisma`: `id Int @id @default(autoincrement())`,
      `label String @unique`.
- [ ] **No relation to anything**, and the model comment says why that is the point: a certificate
      stores its type as a string, so nothing points at this row and removing one destroys no record.
      That is what makes the row deletable at all, under a project rule that otherwise deletes nothing
      (see §US-33.9 and ADR-019). It also means `onDelete` does not arise here and
      `src/infrastructure/prisma/schema.test.ts` is untouched.
- [ ] The comment states the division of labour the egg rule already states: `@unique` catches the
      identical spelling, and the fold-level duplicate is `createCertificateTypeList`'s — the database
      cannot fold in an index and is not asked to.
- [ ] The migration is **regenerated**, not stacked: delete `prisma/migrations/`,
      `npx prisma migrate dev --name init`, then `npm run db:reset`. The project is still pre-release,
      and a corrective migration onto a schema nobody has run would describe a system that never
      existed. **Re-add by hand** the partial unique index on `Customer.customerNumber` at the end of
      `migration.sql` — regenerating drops it, and the slot rule would then rest on application code
      alone.
- [ ] New port `CertificateTypeRepository` in `src/application/ports.ts`:

  ```ts
  list(): Promise<ReadonlyArray<string>>;
  replace(labels: ReadonlyArray<string>): Promise<void>;
  ```

  Documented once, on the port: `replace` is the whole set in one transaction — delete every row,
  insert the new set — because add, remove and re-spell arrive together from one form, and half a
  saved list is a vocabulary nobody typed.

- [ ] New adapter `src/infrastructure/prisma/certificate-type-repository.ts` implementing it.
- [ ] Integration test `certificate-type-repository.test.ts` against a throwaway SQLite file, in the
      shape of `settings-repository.test.ts`: round-trips a list, replaces a list (the removed row is
      gone and the kept row is still there), and returns `[]` from an empty table.
- [ ] `prisma/seed.ts` seeds **no** certificate types. DF's actual vocabulary is theirs to type and we
      would be guessing at it; an empty list already behaves exactly like today's free-text box. The
      seed stays idempotent and still writes no audit entry.
- [ ] `prisma/demo-seed.ts` seeds a small plausible set, so the demo build shows the drop-down doing
      something. Synthetic, and clearly demo data.
- [ ] `npm run lint`, `npm run typecheck` and `npm run build` pass.

### US-33.3: Reading and changing the list (application)

**Description:** As DF, I want a change to the list recorded like every other change I make, so the
log still accounts for everything the software knows.

**Acceptance Criteria:**

- [ ] New use case `src/application/settings/read-certificate-types.ts`, exporting
      `readCertificateTypes(deps): Promise<CertificateTypeList>` — the stored labels through
      `createCertificateTypeList`, so a hand-edited database cannot put a duplicate into a drop-down.
- [ ] New use case `src/application/settings/update-certificate-types.ts`, exporting
      `updateCertificateTypes(deps, labels): Promise<CertificateTypeList>`. It validates through the
      domain, writes via `replace`, and appends one audit entry. Nothing is written unless validation
      passes.
- [ ] The audit entry is `what: "certificateTypes.updated"`, `changedFields: ["certificateTypes"]`,
      `when` from the injected clock, and `why` **machine-written** from `diffCertificateTypes`:
      added labels prefixed `+`, removed labels prefixed `−`, joined by `, `. There is no reason
      field on the screen — the changed labels are the whole story, which is the same argument
      `updateSettings` makes for its optional one, and `AuditEntry.why` already documents this use.
- [ ] A save that changes nothing (the same list re-submitted) writes **no** audit entry and no rows.
      The log records changes, and a form saved twice is not two of them.
- [ ] Both use cases are driven test-first against hand-written fakes, in the shape of
      `src/application/settings/settings.test.ts`. Named tests include:
  - `refuses the whole list when one label is blank, writing nothing`
  - `records the added and removed labels in the entry`
  - `writes nothing when the list is unchanged`
  - `reads a stored list back through the domain`
- [ ] Application coverage stays at 100%; `npm run test:coverage` passes.

### US-33.4: The list is maintained on the settings screen (presentation)

**Description:** As DF, I want to add and remove Nachweis-Arten where I already change everything else
about how we run, so there is one place I go to configure the software.

**Acceptance Criteria:**

- [ ] New card „Arten des Nachweises" on `/einstellungen`, its own `<Card>` below the egg rule and
      **outside** the policy `<form>` — it is not a policy value and must not append a settings
      version. A short comment in the component says that; it does not re-argue ADR-019.
- [ ] New client component `src/app/einstellungen/certificate-type-table.tsx`, modelled on
      `egg-rule-table.tsx`: one row per type, a text input per row, a remove control per row
      (`X`, `aria-label` from `de.ts`), and one „Art hinzufügen" control (`Plus`) appending a blank
      row. Both glyphs are already registered in `docs/guideline/ui_styling_guide.md` §12 — no new
      icon, and therefore no ADR.
- [ ] It holds **no rule**: which lists are legal is `createCertificateTypeList`'s. Re-checking a
      duplicate here would be a second answer the save could disagree with.
- [ ] New server action `saveCertificateTypes` in `src/app/einstellungen/actions.ts`: Zod gives the
      submitted rows a shape, blank rows are dropped with their positions put back (as the egg rule's
      already are, so an error index still points at the row on screen), and typed domain errors are
      turned into German sentences via `summarise`/`tierOf` — `DuplicateCertificateType` and
      `CertificateTypeTooLong` each get their own, quoting the offending label.
- [ ] A refusal marks the offending input through `marking(…)`/`FieldRejection`, the same mechanism
      the egg rows use. A saved change shows the existing save feedback.
- [ ] All German strings live under `de.settings.certificateTypes.*` in `src/i18n/de.ts` — heading,
      column heading, the add and remove labels, the save button, the saved confirmation and the
      error sentences. No literal in the component.
- [ ] **No explanatory hint under the card at all.** The screen shows a list of types and a way to
      add one; a sentence saying that is what `docs/guideline/ui_styling_guide.md` §8 rules out. What
      removing a type does to records already saved with it was tried as the one line the card may
      carry and taken out again on review: `docs/handout/betriebsanleitung.md` says it where it is
      read once, and on screen it was one more sentence DF do not need.
- [ ] Verified with the `playwright-cli` skill against a production build: the accessibility snapshot
      of `/einstellungen` shows the card as a named region with one textbox per type, each with its
      own accessible name, and the add and remove controls named in German.

### US-33.5: One control asks for the Art des Nachweises (presentation)

**Description:** As a staff member, I want to pick the kind of notice from a list, and still be able
to record one that is not on it, without leaving the form I am filling in.

**Acceptance Criteria:**

- [ ] New client component `src/app/certificate-type-field.tsx` — one control, used by all four
      screens, so the four cannot drift into four different behaviours.
- [ ] It renders a **native `<select>`** styled with `selectClass(height)`, height a prop (`h-8` on
      the registration form, `h-9` elsewhere as the screens require). Native for the reasons
      `src/app/select.ts` already records: Radix's select submits nothing inside a form and neither
      `selectOption` nor `toHaveValue` reaches it.
- [ ] The options are, in order: the configured types in the order the domain sorted them, then
      „Sonstiges" carrying a sentinel value exported from a non-`"use server"` module
      (`CERTIFICATE_TYPE_OTHER`, e.g. `"__other__"`).
- [ ] Choosing „Sonstiges" reveals a text input named `certificateTypeOther` directly beneath, with
      its own visible label from `de.ts` and focus moved into it. Choosing a configured type hides it
      again and the typed text is not submitted.
- [ ] **Prefill never silently substitutes.** Given an incoming value (an archived record's draft,
      US-11.3, or a waiting-list entry being promoted, US-12.4): if it matches a configured type by
      **fold**, that option is selected and the spelling shown is the configured one; if it matches
      nothing, „Sonstiges" is selected and the incoming value stands in the free-text field. A type
      DF removed last month therefore still arrives intact in the form that was pre-filled from it.
- [ ] With an **empty** configured list the control is „Sonstiges" preselected and the text field
      open — behaviour identical to today's plain input, so nothing is blocked before DF have
      configured anything.
- [ ] The select carries `name="certificateType"`, so every existing refusal path that points at the
      field `certificateType` still points at a control. When the free-text field is the one in error,
      the mark and the summary link point at **it**, not at the select.
- [ ] New shared resolver in a plain (non-`"use server"`) module beside the component:
      `resolveCertificateType(selected, other): string` — returns `other` when `selected` is the
      sentinel, `selected` otherwise. One function, imported by four actions, so "which field wins"
      is answered once. It does **not** validate: blank is the domain's refusal to make, and making
      it here would be a second answer.
- [ ] Verified with the `playwright-cli` skill: the accessibility snapshot shows a combobox with the
      configured options plus „Sonstiges", and the free-text box appears in the snapshot only after
      „Sonstiges" is chosen.

### US-33.6: The four screens that ask, ask with it (presentation)

**Description:** As a staff member, I want the same drop-down wherever the software asks for an Art
des Nachweises, so I never have to remember which screen wants it typed.

**Acceptance Criteria:**

- [ ] `src/app/kunden/neu/registration-form.tsx`: the `certificateType` `Field` is replaced by
      `CertificateTypeField`. The configured list is read on the server page and passed down as a
      prop — the form is a client component and must not fetch.
- [ ] `src/app/kunden/[id]/renewal-form.tsx`: the renewal's type input is replaced likewise, list
      passed from the record page.
- [ ] `src/app/ausgabe/certificate-controls.tsx`: the counter's renewal input is replaced likewise,
      list passed from the counter page.
- [ ] `src/app/warteliste/add-applicant-form.tsx` **and**
      `src/app/warteliste/[entryId]/registrieren/page.tsx`: both replaced likewise, the promotion form
      pre-filling from the entry under §US-33.5's prefill rule.
- [ ] Each of the five server actions (`kunden/neu/actions.ts`, `kunden/[id]/actions.ts`,
      `ausgabe/actions.ts`, `warteliste/actions.ts`,
      `warteliste/[entryId]/registrieren/actions.ts`) reads `certificateTypeOther` from the form data
      and resolves the pair through `resolveCertificateType` **before** the value enters its Zod
      schema. `certificateType` stays `z.string()` in `registration-input.ts` and in
      `warteliste/actions.ts` — the shape on the wire is unchanged from the schema's point of view.
- [ ] **No use case, port or domain signature changes in this story.** What reaches
      `registerCustomer`, `renewCertificate` and `addToWaitingList` is the same certificate with the
      same `type` string it took before.
- [ ] A blank free text under „Sonstiges" is refused by the existing `MissingRequiredField`
      (`certificateType`) path, and the refusal marks the free-text input (§US-33.5).
- [ ] `de.customers.fields.certificateType` („Art des Nachweises") is reused as the label on all
      four; the „Sonstiges" option and the free-text label are new keys, said once.
- [ ] Verified with the `playwright-cli` skill on all four screens against a production build.
- [ ] `npm run lint`, `npm run typecheck` and `npm run build` pass.

### US-33.7: The loop, proved over both engines (e2e)

**Description:** As the next developer, I want the round trip from settings to a saved certificate
proved end to end, so that a change to either end cannot quietly break the other.

**Acceptance Criteria:**

- [ ] New spec `tests/e2e/certificate-types.spec.ts`, over registers of its own
      (`tests/e2e/registers.ts`, ADR-012), passing under both `npm run test:e2e` and
      `npm run test:e2e:webkit`.
- [ ] It proves, in order: a type added on `/einstellungen` appears as an option on `/kunden/neu`; a
      household registered with it shows that type on its record; „Sonstiges" with free text saves the
      typed string; and a type **removed** from the settings list afterwards leaves that household's
      record showing the type it was saved with.
- [ ] **The settings card is proved without navigating away from it**: adding a row and removing
      another in one save, then asserting the list the card itself re-renders. A `page.goto` would
      reseed it from the server and prove nothing about the panel.
- [ ] `tests/e2e/registration-form.ts`'s `fillEligibility` learns the control: it selects a configured
      type when `eligibility.certificateType` matches one, and otherwise picks „Sonstiges" and types
      it. `Eligibility` keeps its shape, so **no existing spec changes** — the ten specs that fill a
      registration today keep passing untouched, which is the check that the control is a drop-in.
- [ ] No `browserName` branch anywhere in `src/`.
- [ ] Synthetic data only (Faker); no real Nachweis wording from DF's actual case files.

### US-33.8: The handout says how to maintain the list (documentation)

**Description:** As DF, I want the Betriebsanleitung to cover the new list, so the person who has to
add a type in a year does not have to ask.

**Acceptance Criteria:**

- [ ] `docs/handout/betriebsanleitung.md` gains a short German section under the settings chapter:
      how to add a type, how to remove one, that removing one changes no record already saved, and
      that „Sonstiges" exists for a notice that is not on the list.
- [ ] Written for DF, not for a developer: no field names, no file paths, no talk of audit entries.
- [ ] It stays printable and in the document's existing voice and heading depth.

### US-33.9: Record the decision and update what it makes wrong (documentation)

**Description:** As the next developer, I want the reason the vocabulary sits outside the versioned
settings to be written down, so nobody folds it back in as a tidy-up.

**Acceptance Criteria:**

- [ ] **ADR-019** written with the `record-adr` skill: _Keep the certificate-type list out of the
      versioned settings history_. Context: `SettingsVersion` is append-only so a past hand-out can be
      re-priced (ADR-005); a certificate's type is already stored on the record. Decision: a standalone
      `CertificateType` table, edited in place, audited on change. Consequences: adding a word no
      longer appends a policy version; the list has no history beyond the audit log; a type removed
      cannot be resolved back to a list entry, which is fine because nothing resolves it.
- [ ] The ADR states the **second half of the decision explicitly**: a `CertificateType` row is
      **deleted**, and this is the one other exception to the project's no-deletes rule. The argument
      is of the required kind and is not the household-members one: nothing references the row, so
      deleting it destroys no history — a certificate carries its type as text, not as a foreign key.
- [ ] `CLAUDE.md`'s _Don'ts_ names that exception beside the household-members one, in one clause,
      citing ADR-019 rather than restating it.
- [ ] `docs/architecture/09-architecture-decisions.md` gains the ADR-019 row, with the status
      matching the ADR's own. `npm run arc42 check` (`arc42.py check`) passes.
- [ ] `docs/architecture/05-building-block-view.md` is updated with the `arc42` skill: `policy/`'s row
      mentions the certificate-type vocabulary, `settings/`'s row mentions reading and replacing it,
      the infrastructure table gains `certificate-type-repository.ts`, and `/einstellungen`'s row
      says it maintains the list as well as the policy values.
- [ ] Any chapter a reading turns up as **wrong** rather than merely incomplete is fixed in the same
      PR; a gap that needs DF's input is left as a marked `> **TODO:**` rather than filled with a
      plausible guess.

## Functional Requirements

- **FR-1:** The system must hold a list of Nachweis-Arten, maintained by DF on `/einstellungen`,
  independent of the append-only settings versions.
- **FR-2:** A type is a single free-text label, trimmed, at most 80 characters, and not blank.
- **FR-3:** Two labels that fold to the same string (case, umlauts, diacritics) are one type and the
  second is refused, naming the row as typed.
- **FR-4:** The list is stored and offered in one stable order — ascending by folded label.
- **FR-5:** An empty list is a legitimate configuration and is never reported as "not configured".
- **FR-6:** Every screen that asks for an Art des Nachweises must offer the configured types in a
  native drop-down: registration, record renewal, counter renewal, waiting-list applicant and
  waiting-list promotion.
- **FR-7:** Each of those drop-downs must also offer „Sonstiges", which reveals a free-text field; the
  text typed there is stored as the certificate's type.
- **FR-8:** A type recorded through „Sonstiges" must **not** be added to the configured list.
- **FR-9:** A pre-filled form whose incoming type is not a configured type must select „Sonstiges" and
  show the incoming value in the free-text field — never substitute a different type, never blank it.
- **FR-10:** Adding or removing a type must append one audit entry naming the added and removed
  labels; a save that changes nothing must write nothing.
- **FR-11:** Removing a type from the list must not alter, hide or invalidate any `Certificate` or
  `WaitingListEntry` already saved with it, and such a record must keep displaying its stored type.
- **FR-12:** Re-spelling an entry in the list must not rewrite records already saved with the old
  spelling — a stored type is a snapshot of what was on file that day.
- **FR-13:** A blank free-text under „Sonstiges" must be refused with the existing missing-field
  message, marking the free-text input.
- **FR-14:** All new user-facing strings must live in `src/i18n/de.ts`.

## Non-Goals

- **No retroactive clean-up.** Nothing migrates, normalises or rewrites the types already stored on
  existing certificates and waiting-list entries. They are snapshots.
- **No "did you mean?"** The control does not offer to fold a free-typed value into a near-matching
  configured type, and does not warn that it looks like one.
- **No auto-learning.** A type typed under „Sonstiges" never joins the list, not after one use and not
  after ten. DF decide what is a type.
- **No usage counts or ordering by frequency.** The order is alphabetical, full stop; a most-used-first
  list is a second answer to "what order are these in" and reorders under staff's hands.
- **No per-type rules.** A type carries no validity period, no reminder interval and no eligibility
  consequence. It is a word, and every rule that reads a certificate reads its date.
- **No history for the list itself.** There is no version view of the vocabulary; the audit log is the
  record of what changed, as it is for a block or an archiving.
- **No document uploads.** US-16 already ruled that out and this does not reopen it.
- **No new icon set, and no new glyph** — `Plus` and `X` are already registered.
- **No change to how certificates expire, remind or gate a hand-out** (US-06, US-15).

## Design Considerations

- **The card on `/einstellungen`** mirrors the egg-rule card: a small table, a remove control per row,
  one add control. It is a familiar shape on that screen, and it is the shape DF have already used.
- **The control is one component, not four.** Four screens asking the same question with four
  hand-rolled selects is four places for the „Sonstiges" behaviour to drift.
- **Native `<select>` is not a preference** — `src/app/select.ts` records why, and its type-ahead over
  240 registration options is the same type-ahead that makes a ten-type list fast.
- **„Sonstiges" sits last**, after the configured types. It is the exception and reads as one.
- **No hint text** on any of the four forms. The label already says „Art des Nachweises" and the
  options say what is on offer; `ui_styling_guide.md` §8 rules out restating that. The settings card
  carries exactly one line, because "removing this changes no saved record" is a consequence the
  screen genuinely cannot show.

## Technical Considerations

- **The domain reuses `foldName`.** It lives under `customer/` because that is what first needed it,
  and it is the right fold here for the same reason it was there: SQLite folds neither umlauts nor
  Unicode case, and two spellings of one German word must compare equal. No second fold.
- **The migration is regenerated, not stacked** — pre-release (`CLAUDE.md`, _Database migrations_).
  The hand-written partial unique index on `Customer.customerNumber` must be re-added afterwards, and
  `npm run db:reset` run, or the settings screen will report that nothing is configured.
- **`replace` is one transaction.** Add, remove and re-spell arrive together from one form.
- **The list is read on the server and passed down.** Every one of the four forms is a client
  component; none of them fetches.
- **`resolveCertificateType` lives outside a `"use server"` module.** Those may export nothing but
  async functions — the same constraint that put `registration-input.ts` beside its action.
- **The new spec gets registers of its own** (ADR-012), because it writes settings that other specs
  read.
- **Watch the second-panel rule.** The settings card is asserted after its own save, without a
  `page.goto`; a reload would prove only that the server has the row.

## Settled before this was written

Four questions were put and answered before drafting; the answers are requirements above, and the
reasoning is recorded here so it is not re-opened as a preference.

1. **Where the list lives** — a table of its own, audited, _not_ a field of `SettingsVersion`. The
   append-only history exists to re-price a past hand-out; a certificate's type is already on the
   record. Versioning the vocabulary would append a policy version for every word DF add. (ADR-019.)
2. **A type that is not on the list** — the drop-down carries „Sonstiges" with a free-text field. A
   closed list would send a staff member mid-registration away to the settings screen, losing the
   half-filled form, and would make an empty list block registration entirely. A list that learns
   from free text was refused for the opposite reason: every typo would become a permanent entry,
   which is the variant sprawl this story exists to end.
3. **Removing a type in use** — allowed, and records keep the text they were saved with. The stored
   string is a snapshot in the sense `grownUpsAtIssue` is. Blocking the removal until the records are
   corrected would leave DF with a removal they cannot complete; keeping the row as "inactive" would
   add a state to the screen that nothing reads.
4. **Scope** — all four places that ask: registration, the record's renewal, the counter's renewal,
   and the waiting list (its applicant form and its promotion form).

A `<datalist>` on the existing text input was considered and refused. It is less code and gives
suggestions, but a suggestion is exactly what a staff member can ignore — the variants would keep
arriving — and WebKit's rendering of it is not something the e2e suite can assert on.

## Success Metrics

- Recording a repeat Art des Nachweises is one click, with no typing, on all four screens.
- After DF have configured their list, new certificates carry configured spellings; „Sonstiges" is the
  exception rather than the path of least resistance.
- Removing a type never produces a record that displays a blank or a wrong Art des Nachweises.
- Domain and application coverage stay at 100%; both e2e engines green.

## Open Questions

- **What are DF's actual types?** The seed deliberately ships none. Worth asking them for their five
  or six so the first configuration is a review rather than a blank page — but it is a data question,
  not a code one, and it does not block this work.
- **Should the customer list filter by Art des Nachweises?** A configured vocabulary makes that
  possible for the first time (US-15 filters by certificate _state_ today). Nobody has asked; left out.
- **Should a type be re-spellable without it reading as a removal and an addition in the audit log?**
  Today a fold-preserving re-spelling is no change at all and anything else is both. That is honest
  and needs no edit-in-place concept; revisit only if DF find the log confusing.
