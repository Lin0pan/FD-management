# ADR-019 — Keep the certificate-type list out of the versioned settings history

- **Status:** Accepted
- **Date:** 2026-09-17
- **Deciders:** the maintainer

## Context

Four screens ask what kind of proof of need a household brought — registration, the renewal on a
customer record, the renewal at the counter, and the waiting list — and all four asked it as an empty
text box. The same half a dozen answers were retyped from memory by four people, so „Jobcenter-Bescheid",
„Jobcenter Bescheid", „JC-Bescheid" and „jobcenter" arrived as one kind of notice recorded four ways
with nothing able to tell that they are one. US-33 replaces the box with a list DF maintain
themselves, and where that list is stored had to be settled before any of it was built.

The obvious home is `SettingsVersion`, which already holds every value DF configure
([ADR-005](005-keep-business-rules-as-dated-append-only-settings-data.md)). But that history is
append-only for exactly one reason: a hand-out recorded last March must still be priceable with the
rule that was in force then. A certificate's type prices nothing. It is stored as **text** on the
`Certificate` row — and on `WaitingListEntry` — and no rule, screen or query resolves that text back
through a list. Versioning the vocabulary would therefore append a policy version every time DF add a
word, filling the Änderungsverlauf with entries that re-price nothing and burying the changes that do.

The pull to fold it in anyway is strong, because "everything DF configure is a settings version" is a
tidy sentence and this is the one thing that breaks it. That is what this record is for:
[legibility over five-plus years](../01-introduction-and-goals.md#quality-goals) is the first quality
goal, and a later tidy-up that moves the list into the versioned history would cost DF a policy
version per word and gain nothing.

## Considered options

- **A standalone `CertificateType` table, edited in place and audited on change** — chosen. The list
  is a vocabulary, and a vocabulary is a current set, not a timeline.
- **A child table on `SettingsVersion`, like the egg staircase**
  ([ADR-014](014-store-the-egg-allowance-as-versioned-threshold-rows.md)) — rejected. The egg rule
  earns its versioning because a past hand-out's eggs must stay re-derivable; a type does not, because
  it was written onto the record. Adding a word would append a policy version.
- **A standalone table that is append-only, with an `active` flag instead of a delete** — rejected. It
  adds a state to the settings screen that nothing else reads, and it buys history only for a row
  nothing points at. A removed type's spelling already survives where it matters: on the records saved
  with it.
- **A hard-coded list in the source** — rejected. DF would need a developer and a deploy to record a
  new kind of notice, and „policy values are data" is the project's standing rule.
- **A `<datalist>` on the existing free-text input** — rejected. It is less code and does suggest, but
  a suggestion is exactly what a person in a hurry ignores, so the variants would keep arriving; and
  WebKit's rendering of it is not something the e2e suite can assert on.
- **Learn the list from what staff type** — rejected for the opposite reason: every typo would become
  a permanent entry, which is the sprawl being removed.

## Decision

The Nachweis-Arten live in a **`CertificateType` table of their own** — one unique `label` column, no
relations, no version history — read by `readCertificateTypes` and written by `updateCertificateTypes`,
which validates through `createCertificateTypeList`, replaces the whole set in one transaction and
appends **one audit entry** naming the labels added and removed
([ADR-006](006-record-what-when-and-why-in-the-audit-log-never-who.md)). It is not a `SettingsVersion`
field and adding a word appends no policy version. The second half of the decision is the deletion:
**a `CertificateType` row is deleted**, and this is the one exception to
[ADR-010](010-never-hard-delete-a-record-archive-and-let-the-database-refuse.md) besides a household's
member rows — and not for the same reason. Member rows are replaced because no history of past
compositions is kept; a `CertificateType` row is deleted because **nothing references it**. A
certificate carries its type as text, not as a foreign key, so removing the row destroys no history
and leaves every record that names that type exactly as it was saved.

## Consequences

- **Adding a word costs nothing.** No policy version is appended, so the Änderungsverlauf keeps
  meaning "what a hand-out would have cost", which is the only question it was built to answer.
- **The list has no history beyond the audit log.** What the vocabulary was on a given day is
  reconstructable only from the `certificateTypes.updated` entries, and only as a sequence of
  additions and removals. There is no version view of it and no plan for one.
- **A saved type is a snapshot**, in the sense `grownUpsAtIssue` is. Removing or re-spelling a type
  rewrites, hides and invalidates nothing: a record saved with „Wohngeldbescheid" goes on displaying
  it after DF remove that row, and the counter still serves on it.
- **A removed type cannot be resolved back to a list entry.** Nothing resolves one, so nothing breaks —
  but it does mean a certificate's type can be a word the list no longer holds, and no screen flags it.
- **`onDelete` never arises**, because the table has no relations at all;
  `src/infrastructure/prisma/schema.test.ts` is untouched by this table and keeps guarding every other.
- **An empty list is a configuration, not an absence.** It means only „Sonstiges" is offered — which is
  today's free-text box — and nothing may report it as "not configured". The seed ships no types on
  purpose: DF's vocabulary is theirs to type and we would be guessing at it.
- **Two spellings of one word are refused at the fold, not at the index.** `@unique` on `label` catches
  the identical spelling; „Jobcenter" against „jobcenter" is `createCertificateTypeList`'s to catch,
  because SQLite cannot fold in an index.
- Revisit if a type ever acquires a **rule** of its own — a validity period, a reminder interval, an
  eligibility consequence. That would make it a policy value, and policy values are versioned; today a
  type is a word, and every rule that reads a certificate reads its date.

## More information

- [ADR-005 — keep business rules as dated, append-only settings data](005-keep-business-rules-as-dated-append-only-settings-data.md)
  (the history this list is deliberately outside of)
- [ADR-010 — never hard-delete a record](010-never-hard-delete-a-record-archive-and-let-the-database-refuse.md)
  (amended by this decision: a second exception, on a different argument)
- [ADR-014 — store the egg allowance as versioned threshold rows](014-store-the-egg-allowance-as-versioned-threshold-rows.md)
  (the other list DF configure, and the one that does need versioning)
- [Chapter 5 — inside each layer](../05-building-block-view.md#level-2--inside-each-layer),
  [chapter 8 — configuration as data](../08-crosscutting-concepts.md#configuration-as-data)
- `tasks/prd-us-33-certificate-types-from-settings.md`
- `src/domain/policy/certificateTypes.ts`, `src/application/settings/update-certificate-types.ts`,
  `src/infrastructure/prisma/certificate-type-repository.ts`,
  `src/app/einstellungen/certificate-type-table.tsx`, `src/app/certificate-type-field.tsx`
- Commits `f2f2b82`, `5308827`, `430d206`, `53d2980`, `54a907a`, `0a44fb1`, `d3db1be`
