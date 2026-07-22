# PRD: US-14 — Configure the Business Rules

> Source story: `docs/user_stories_mvp.md` §US-14 (Tier 2). Build-order position: **first** — US-01
> cannot assign a customer number without the quota `N`, US-03 cannot derive a week colour without
> the anchor, and US-07 cannot price anything without the per-head prices.

## 1. Introduction

Every number in FD's process — the customer quota, the portions per head, the price per head, the
week-cycle anchor — is currently unknown, and all of them will change over
the years. Hard-coding any of them guarantees a developer call-out for a price rise. This feature
stores them as **configuration data with an effective-from date** and gives staff a screen to edit
them.

Effective-from dating is not gold-plating: a distribution record stores only a `paid` flag and never
an amount (US-05), so the **only** way to answer "what did that customer owe last March" is to look
up the settings version in force on that date.

## 2. Goals

- Every policy value FD might change is editable in the app, with no code deploy.
- Historic distribution records remain interpretable with the values that applied at the time.
- Lowering the quota below reality is impossible.
- Prices are entered and stored in whole cents; nothing touches floating point.
- A fresh database seeds provisional defaults so the app is usable on first boot.

## 3. User Stories

### US-14.1: Settings value objects and the effective-from resolution rule (domain)

**Description:** As a developer, I need a pure module that, given a set of dated setting versions and
a date, returns the values in force on that date, so every other rule reads policy through one seam.

**Acceptance Criteria:**

- [ ] `src/domain/policy/settings.ts` defines the typed settings shape: `quotaN: number`,
      `portionsPerGrownUp: number`, `portionsPerChild: number`,
      `weekAnchor: { isoWeek: string; colour: 'RED' | 'BLUE' }`, `distributionWeekday: 1..7`
      (ISO, Monday = 1), `pricePerGrownUp: Cents` and `pricePerChild: Cents`
- [ ] `resolveSettingsAt(versions, date)` returns the version with the greatest `effectiveFrom` that
      is `<= date`; ties are impossible (see US-14.3 constraint)
- [ ] Given a date **before** the earliest version, it throws a typed `NoSettingsInForce` error
      rather than returning a partial object
- [ ] `priceFor(settings, grownUps, children)` returns
      `grownUps × pricePerGrownUp + children × pricePerChild` — every household size is priceable
- [ ] All values validate on construction: `quotaN >= 1`, portion values `>= 0`, both prices
      non-negative integer cents
- [ ] Tests cover: exact-boundary date (a version effective on that very day is in force), date
      between versions, date before all versions

### US-14.2: `SettingsRepository` port and `readSettings` / `updateSettings` use cases (application)

**Description:** As a developer, I need use cases that read the current settings and write a new
dated version, so the UI never touches persistence directly.

**Acceptance Criteria:**

- [ ] `SettingsRepository` port added to `src/application/ports.ts`:
      `listVersions(): Promise<SettingsVersion[]>`, `append(version): Promise<void>`
- [ ] `readCurrentSettings(deps)` resolves versions against `deps.clock.now()`
- [ ] `updateSettings(deps, input)` appends a **new version** — it never mutates an existing one
- [ ] `updateSettings` rejects with a typed `QuotaBelowActiveCustomers` error when the new `quotaN`
      is lower than the current count of active customers, and the error carries both numbers
- [ ] `updateSettings` rejects a new version whose `effectiveFrom` is earlier than the latest
      existing version (no retroactive rewriting of history)
- [ ] `updateSettings` writes an audit entry (`what`, `when`, `why`) — never an actor
- [ ] The reason is **optional** for a settings edit: the changed fields already say what happened,
      and requiring a sentence collects text typed to get past a validation. It is stored as an
      empty `why`. The changes that turn on a judgement — block (US-08), archive (US-10) — still
      require one
- [ ] Tested against a fake `SettingsRepository`, a fake customer-count port, and a fake clock

### US-14.3: `Setting` persistence and seed migration (infrastructure)

**Description:** As a developer, I need settings versions stored in SQLite so they survive restarts,
seeded with provisional defaults so a fresh install boots into a working app.

**Acceptance Criteria:**

- [ ] Prisma model `SettingsVersion` with `id`, `effectiveFrom DateTime`, the scalar policy fields
      and `pricePerGrownUpCents Int` / `pricePerChildCents Int`
- [ ] Unique constraint on `SettingsVersion.effectiveFrom`
- [ ] All money columns are `Int` (cents). No `Float` or `Decimal` anywhere in the schema
- [ ] Migration committed under `prisma/migrations/`
- [ ] A seed routine inserts the provisional version (see `tasks/README.md` seed table) if and only
      if no version exists; running it twice is a no-op
- [ ] `PrismaSettingsRepository` implements the port; integration-tested against a throwaway db file
- [ ] The placeholder `SchemaMarker` model is removed if this is the first real model

### US-14.4: Settings screen (presentation)

**Description:** As a staff member, I want to edit the quota, portions, prices and week-cycle
settings in the app so FD can adapt without calling a developer.

**Acceptance Criteria:**

- [ ] Route `/einstellungen` shows the currently-in-force values, each labelled in German from
      `src/i18n/de.ts`
- [ ] A Zod schema validates the form; prices are entered as euro (e.g. `2,50`) and converted to
      whole cents before leaving the adapter
- [ ] The two prices are edited as euro fields, one per grown-up and one per child
- [ ] Saving asks for an **effective-from date**, defaulting to today, and offers an **optional**
      reason field labelled as optional
- [ ] Attempting to lower `quotaN` below the active customer count shows the German error naming
      both numbers, and nothing is saved
- [ ] The page lists previous versions with their effective-from dates, read-only
- [ ] Verify in browser using dev-browser skill

### US-14.5: E2E — edit a price and see it applied

**Acceptance Criteria:**

- [ ] Playwright spec: open `/einstellungen`, change the price per grown-up, save effective today,
      reload, and confirm the new value is displayed
- [ ] Spec asserts the quota-too-low path shows an error and leaves the stored value unchanged

## 4. Functional Requirements

- FR-1: The system must store policy values as immutable versions, each with an `effectiveFrom` date.
- FR-2: The system must resolve "the settings in force" for any given date, used by every other feature.
- FR-3: Editable values are: quota `N`, portions per grown-up, portions per child, price per
  grown-up, price per child, the week-cycle anchor, and the distribution weekday. The reminder
  escalation is **not** configurable — FD judges each expired certificate individually (US-06).
- FR-4: The system must refuse a `quotaN` lower than the current number of active customers, and
  explain why, naming both numbers.
- FR-5: The system must store all money as whole cents in integer columns.
- FR-6: The system must refuse a new version dated earlier than the latest existing version.
- FR-7: A fresh database must seed one provisional version so the app is functional on first boot.
- FR-8: Every settings change must append an audit entry recording what changed, when, and why.

## 5. Non-Goals

- No per-week or per-occasion portion overrides — supply adjustments happen at the counter (US-07).
- No role-based restriction on who may edit settings — there is no login.
- No scheduled/future-dated activation UI beyond picking an effective-from date.
- No import/export of settings.
- No deletion or editing of past versions.

## 6. Technical Considerations

- Belongs in `src/domain/policy/`, exactly as reserved in the architecture sketch §4.
- The quota could get by with a plain current value, but uniform effective-from treatment is cheaper
  than maintaining two mechanisms (architecture sketch §5.1).
- `resolveSettingsAt` is the hot path for US-04's counter screen; keep it a pure function over an
  already-loaded array rather than a per-field query.

## 7. Success Metrics

- Changing a price takes under 60 seconds and no deploy.
- Any past distribution record can be priced correctly from stored data alone.
- Zero floating-point money values in the schema or the codebase.

## 8. Open Questions

- **Provisional values.** Quota 240, 2 portions/grown-up, 1 portion/child, price
  200c/grown-up + 100c/child, anchor `2026-W02 = Red`, Thursday. **All must be confirmed with FD.**
- Should an effective-from date in the future be allowed (scheduling a price rise in advance)?
