# PRD: „Aktionserinnerung" — one freely named checkbox per household (US-40)

> Source: `local_only/reminder-field/requirement.md` (refined 11.10.2026, all questions settled with
> DF; German original `requirement-de.md`). The decisions table there (§"Decisions from refinement",
> #1–#14) is cited below as **D1–D14**, the numbered points of §"The requirement in my own words" as
> **R1–R8**.

## Introduction

DF occasionally run **special campaigns**: every household gets something once, on top of the
regular hand-out — a Christmas bag, for example. Not every household comes to the next distribution;
those who miss it get their bag the next time they come, for as long as DF let the campaign run.
Today they keep track on paper.

This batch adds a **campaign reminder**: a single checkbox per household, named by DF (e.g.
„Weihnachtstüte"), switched on and off in the settings. While it is on, every non-archived household
starts as **not yet received**, and DF tick it off at the counter or in the customer record whenever
the household has had its item. The settings show how far the campaign has got („38 von 214
erhalten"). Switching it off deletes every tick.

The feature is deliberately **general-purpose** (D14): mostly used for campaigns, occasionally for
anything else DF want to tick off per household. The settings section is called
**„Aktionserinnerung"**; the checkbox itself carries the name DF gave it.

**It is a note to self (R8).** It is independent of price, hand-out rules, card and verdict, it
blocks nothing, it does not appear on the receipts of distribution sessions, and when a household was
ticked off is not kept.

**Naming in code.** `ReminderLog` already exists (the certificate reminder, US-06). The new concept is
**`CampaignReminder`** everywhere in code — never a bare `Reminder`, never `reminder*` without the
`campaign` prefix.

## Goals

- DF can switch a named campaign reminder on, rename it and switch it off in `/einstellungen`; there
  is never more than one at a time (D2).
- While it is on, every active or blocked household carries a checkbox labelled with DF's name, at the
  counter and in the customer record, ticked and unticked at any time and saved immediately (D1, D3,
  D5).
- At the counter „not yet received" is **prominent**, so it is not overlooked, and blocks nothing
  (D4).
- The settings show „x von y erhalten" and the date it was switched on (D8, D9).
- Switching off asks for confirmation naming the number of ticks that will be lost, then deletes them
  all (D11, D13).
- Switching on, renaming and switching off are audited; the individual tick is not (D12).

## Rules (from the requirement)

- **One reminder at a time** (D2). Switching on while one is on is refused.
- **Which households:** every non-archived one — active and blocked, including a household admitted
  while the campaign runs (D6). The waiting list does not count; it holds no households yet. An
  archived household has no checkbox anywhere and is counted in neither x nor y.
- **Not yet received is the default.** A household with no tick has not received. Nothing is written
  when the reminder is switched on or a household is admitted — the absence of a tick _is_ „not yet
  received".
- **Per household, not per person** (D7). One checkbox.
- **At any time** (D3): with or without a running distribution session. The tick belongs to the
  household, not to a session.
- **Separate from serving** (D4). Serving neither ticks the box nor asks about it.
- **Unticking is as easy as ticking** (D5): no reason, no confirmation, no audit entry.
- **Renaming keeps the ticks** (D10).
- **Manual end only** (D9), no expiry date. Switching off deletes every tick (D13); switching on again
  starts everyone at „not yet received".
- **No history of ticks** (R8): no tick date, not on session receipts, not in the audit log (D12).

## User stories

### US-40.1: The campaign reminder's name and progress (domain)

**Description:** As a developer, I need the rules a campaign reminder's name obeys and the way its
progress is counted stated once, in pure functions, so that the settings and the counter cannot
disagree.

**Acceptance Criteria:**

- [ ] New module `src/domain/campaign/campaignReminder.ts`, TDD first:
  - `createCampaignReminderName(raw: string): CampaignReminderName` — trims; throws the existing
    **`MissingRequiredField`** when blank; throws **`CampaignReminderNameTooLong`** above
    `CAMPAIGN_REMINDER_NAME_MAX_LENGTH = 40` characters (it is a checkbox label at the counter).
    `CampaignReminderName` is a branded string, the shape `CertificateTypeList` uses for its labels.
  - `campaignProgress(households, receivedIds)` — `households` are `{ id, status }` pairs,
    `receivedIds` a `ReadonlySet<number>`; returns `{ received, total }` where `total` counts the
    households whose status is not `ARCHIVED` and `received` counts those of them whose id is in
    `receivedIds`. A tick left on a household that was archived since counts in neither.
- [ ] Named tests: `refuses a campaign reminder without a name`,
      `trims the name DF typed`, `refuses a name longer than a checkbox label can carry`,
      `counts active and blocked households towards the total`,
      `leaves archived households out of the total`,
      `counts only ticked households that are still on the register as received`.
- [ ] Typed errors added to `src/domain/errors.ts`: **`CampaignReminderNameTooLong`**,
      **`CampaignReminderAlreadyActive`** (switching on while one is on) and
      **`CampaignReminderNotActive`** (a write naming a reminder that is no longer the one switched
      on — a stale screen). Each tiered in `TIERS` (`src/app/notice-tier.ts`); the build fails until
      they are. German messages in `de.ts` wherever the existing errors get theirs.
- [ ] Typecheck, lint and `npm run test:coverage` pass (domain at 100%).

### US-40.2: Storing the reminder and its ticks (schema + port + adapter)

**Description:** As a developer, I need the reminder and the households that have received to be
stored, with the database itself refusing a second reminder, so that the rules survive two
workstations pressing the button at once.

**Acceptance Criteria:**

- [ ] `prisma/schema.prisma`, two new models, each with a short `///` comment that cites ADR-023 /
      ADR-024 (written in US-40.9) rather than repeating them:
  - **`CampaignReminder`** — `id`, `name String`, `startedAt DateTime`, `endedAt DateTime?`
    (`null` while it is on). A row is **never deleted**: switching off stamps `endedAt`. Renaming
    updates `name` in place.
  - **`CampaignReminderTick`** — `id`, `reminderId` → `CampaignReminder`, `customerId` → `Customer`,
    `@@unique([reminderId, customerId])`. **No timestamp column** (R8). A row means „received"; no
    row means „not yet received". Both relations are required and carry no `onDelete: Cascade`.
- [ ] Migrations regenerated per CLAUDE.md "Database migrations" (still pre-release — see Open
      questions): delete `prisma/migrations/`, `npx prisma migrate dev --name init`, then **re-add
      both existing hand-written indexes** verbatim with their comments (the partial unique index on
      `Customer.customerNumber` `WHERE "status" <> 'ARCHIVED'` and `one_running_session`) **plus a
      third**: `one_active_campaign_reminder` on `CampaignReminder` `WHERE "endedAt" IS NULL`, built
      the way `one_running_session` is, with a one-line comment. `npm run db:reset`.
- [ ] New port `CampaignReminderRepository` in `src/application/ports.ts`, documented once on the
      port:
  - `findActive(): Promise<CampaignReminder | null>` — `{ id, name, startedAt }`;
  - `start(name: CampaignReminderName, at: Date): Promise<CampaignReminder>`;
  - `rename(id: number, name: CampaignReminderName): Promise<void>`;
  - `end(id: number, at: Date): Promise<void>` — stamps `endedAt` **and deletes every tick of that
    reminder in one transaction**;
  - `receivedCustomerIds(reminderId: number): Promise<ReadonlySet<number>>`;
  - `setReceived(reminderId: number, customerId: number, received: boolean): Promise<void>` —
    idempotent: `true` inserts the tick if missing, `false` deletes it if present.
- [ ] `PrismaCampaignReminderRepository` in `src/infrastructure/prisma/campaign-reminder-repository.ts`.
      A second `start` while one is on fails at the partial index and is translated to
      `CampaignReminderAlreadyActive`.
- [ ] `clearRegister` (`src/infrastructure/prisma/test-support.ts`) deletes ticks and reminders
      before customers, so the integration tests and e2e specs that clear the register keep working.
- [ ] `src/infrastructure/prisma/schema.test.ts`: the tick deletion is the new deliberate exception —
      extend whatever list of deletable models the test keeps (if it keeps one), never by weakening
      the `Cascade` / `SetNull` checks.
- [ ] Infrastructure integration test (throwaway SQLite): start → `findActive` returns it; a second
      `start` is refused; `setReceived` true twice leaves one row, false removes it; `rename` keeps
      the ticks; `end` stamps `endedAt`, deletes exactly that reminder's ticks and leaves
      `findActive` null; starting again afterwards works and reads no ticks.
- [ ] Typecheck, lint and `npm run test:coverage` pass.

### US-40.3: Switching on, renaming, switching off (application)

**Description:** As DF, I want to switch a named reminder on, rename it and switch it off, each
recorded in the audit log, so that a campaign has a clear beginning and end.

**Acceptance Criteria:**

- [ ] New folder `src/application/campaign/`. Deps take `campaignReminders`, `customers`, `clock`,
      `audit` as each needs.
- [ ] `readCampaignReminder(deps)` → `null` when off, else
      `{ id, name, startedAt, received, total }`, `received`/`total` from `campaignProgress` over
      `listWithStatus("ACTIVE")` + `listWithStatus("BLOCKED")` and `receivedCustomerIds`.
- [ ] `startCampaignReminder(deps, { name })` — validates through `createCampaignReminderName`,
      throws `CampaignReminderAlreadyActive` if one is on, writes with `clock.now()`, audits
      `{ what: "campaignReminder.started", changedFields: ["name"], when, why: <name> }`.
- [ ] `renameCampaignReminder(deps, { reminderId, name })` — `CampaignReminderNotActive` if
      `reminderId` is not the active one; the same name re-submitted writes nothing and audits
      nothing; otherwise audits `{ what: "campaignReminder.renamed", changedFields: ["name"], why:
  "„<old>" → „<new>"" }`.
- [ ] `endCampaignReminder(deps, { reminderId })` — `CampaignReminderNotActive` if it is not the
      active one; ends it (ticks deleted by the adapter) and audits
      `{ what: "campaignReminder.ended", changedFields: ["name"], why: "<name> · <n> Häkchen" }`
      where `n` is the `received` figure `readCampaignReminder` shows — the number the confirmation
      named. (The `why` column carrying a description rather than a reason follows
      `updateCertificateTypes`.)
- [ ] Every use case carries a full `@throws` list.
- [ ] TDD against a hand-written fake `CampaignReminderRepository`. Named tests:
      `switches a named reminder on`, `refuses a second reminder while one is on`,
      `reads nobody as received when a reminder has just been switched on`,
      `counts a household registered during the campaign as not yet received`,
      `renames the reminder and keeps the ticks`, `renaming to the same name writes nothing`,
      `switches the reminder off and forgets every tick`,
      `starts everyone at not yet received when switched on again`,
      `refuses to rename or switch off a reminder that is no longer on`,
      `audits switching on, renaming and switching off`.
- [ ] Typecheck, lint and `npm run test:coverage` pass (application at 100%).

### US-40.4: Ticking a household off, and reading its state (application)

**Description:** As DF, I want to tick and untick a household at any time, so that the box always
says whether it has had its item.

**Acceptance Criteria:**

- [ ] `setCampaignReminderReceived(deps, { reminderId, customerId, received })` in
      `src/application/campaign/`:
  - throws `CampaignReminderNotActive` if `reminderId` is not the active reminder (a screen left
    open across a switch-off or a switch-off-and-on must not tick into the new campaign);
  - throws `CustomerNotFound` / `CustomerArchived` as `issueCard` does; a **blocked** household may
    be ticked (D6);
  - writes through `setReceived`; idempotent;
  - **appends no audit entry** (D12, ADR-024) — a test asserts the fake audit log stays empty;
  - needs no running distribution session (D3) — a test runs it with none.
- [ ] `campaignReminderFor(deps, customerId)` in the same folder → `null` when no reminder is on or
      the household is archived, else `{ reminderId, name, received: boolean }`. The one read both
      screens use.
- [ ] `lookupCustomer` (`src/application/customers/lookup-customer.ts`) gains
      `campaignReminder: { reminderId, name, received } | null` on `CounterLookup` — `null` on the
      NOT_FOUND branch and for an archived household — read through `campaignReminderFor`. Its deps
      gain `campaignReminders`; every fake follows.
- [ ] `readCustomer` (the customer record's read) gains the same field the same way.
- [ ] `recordAttendance` is **not touched**: serving neither reads nor writes the tick (D4). A test in
      `record-attendance.test.ts` or the new suite proves a serve leaves the household not received.
- [ ] Composition roots (`src/app/ausgabe/deps.ts`, `src/app/kunden/deps.ts`,
      `src/app/einstellungen/deps.ts`) wire `PrismaCampaignReminderRepository`.
- [ ] Named tests: `ticks off a household at any time`, `unticks a household without asking why`,
      `ticks off a blocked household`, `refuses an archived household`,
      `refuses a tick for a reminder that has been switched off`,
      `serving a household does not tick it off`, `does not audit a single tick`,
      `shows no checkbox while no reminder is on`.
- [ ] Typecheck, lint and `npm run test:coverage` pass.

### US-40.5: „Aktionserinnerung" in the settings (presentation)

**Description:** As DF, I want to switch the reminder on, rename it, see how far the campaign has got
and switch it off, all in the settings.

**Acceptance Criteria:**

- [ ] A new section on `/einstellungen` below „Nachweis-Arten", built as that section is: `<section>`
      behind a rule with its own `<h2>` **„Aktionserinnerung"** (`de.settings.campaignReminder`), its
      own form(s), no settings version written.
- [ ] **Off:** a text input „Name" (test id `campaign-reminder-name`, `maxLength` 40) and a button
      **„Einschalten"** (test id `campaign-reminder-start`). Nothing else — no explanation of what a
      campaign reminder is (CLAUDE.md, "Don't explain the screen"). A placeholder example in the
      free-text box is allowed („z. B. Weihnachtstüte").
- [ ] **On:**
  - the name in the same input, prefilled, with **„Umbenennen"** (test id
    `campaign-reminder-rename`);
  - the progress **„38 von 214 erhalten"** (test id `campaign-reminder-progress`, `tabular-nums`)
    and **„eingeschaltet am 11.10.2026"** (test id `campaign-reminder-since`);
  - **„Ausschalten"** as a closed destructive disclosure (styling guide §6, the archive control's
    shape, **no reason field**): opening it shows the warning sentence
    **„Erinnerung ‚Weihnachtstüte' ausschalten? 38 Häkchen werden gelöscht."** (test id
    `campaign-reminder-end-warning`) and the confirming button (test id
    `campaign-reminder-end`). The count is the progress's `received`, inflected for 1
    („1 Häkchen wird gelöscht").
- [ ] Server actions in `src/app/einstellungen/actions.ts`: Zod-validate, call one use case each,
      revalidate `/einstellungen`, `/ausgabe` and `/kunden` (the record pages). Refusals
      (`MissingRequiredField`, `CampaignReminderNameTooLong`, `CampaignReminderAlreadyActive`,
      `CampaignReminderNotActive`) come back as a `Notice` in German, tiered by `tierOf`; a refused
      name keeps what was typed (styling guide §7: _a refusal keeps everything_).
- [ ] All strings in `src/i18n/de.ts` under `settings.campaignReminder`.
- [ ] Typecheck, lint, `npm run test:coverage` and `npm run test:e2e` pass.
- [ ] Driven and reviewed with the `playwright-cli` skill.

### US-40.6: The checkbox at the counter (presentation)

**Description:** As DF, I want to see at a glance at the counter whether a household has already had
its campaign item, and tick it off there, so that no paper list is needed.

**Acceptance Criteria:**

- [ ] A shared client component `src/app/campaign-reminder-field.tsx`: a native checkbox labelled with
      **DF's name** (e.g. „Weihnachtstüte"), test id `campaign-reminder-received`. Changing it
      submits immediately (`requestSubmit` on change, no save button) through one server action
      `setCampaignReminderReceivedAction` in `src/app/kunden/[id]/actions.ts` — the record's own
      action, imported unchanged by the counter as `updateNotesAction` is. Hidden fields
      `reminderId` and `customerId`. Disabled while pending. A refusal comes back as a `Notice` and
      the box shows the stored state again (styling guide §7, the `defaultChecked` trap).
- [ ] The action Zod-validates, calls `setCampaignReminderReceived` and revalidates `/ausgabe`,
      `/kunden/[id]` and `/einstellungen`. No redirect: the counter's lookup must stay on screen.
- [ ] On `/ausgabe`, after a lookup, when `counter.lookup.campaignReminder` is not null: the field
      in a block of its own **directly below the household card (`counter-customer`) and above the
      certificate and serve controls**, keyed by customer like its neighbours.
- [ ] **„Not yet received" is prominent (D4):** unticked, the block wears a new named accent
      `CAMPAIGN_OUTSTANDING_ACCENT` in `src/app/accents.ts` (styling guide §5 — a new meaning, so a
      new export, never a tint in the screen), a tint no other meaning uses on the counter (not the
      traffic light's, not amber), plus the word **„noch nicht erhalten"** (test id
      `campaign-reminder-outstanding`) and an icon (proposal: lucide `Gift`, `aria-hidden`).
      Ticked, the block is plain: the checked box and the word „erhalten", no accent.
- [ ] Prominent never means blocking: the verdict, the serve button and its keyboard flow are
      unchanged whatever the box says; nothing has to be dismissed.
- [ ] Shown with or without a running distribution session, for active and blocked households; not
      shown for an archived household, a number nobody holds, or while no reminder is on.
- [ ] Typecheck, lint, `npm run test:coverage` and `npm run test:e2e` pass.
- [ ] Driven and reviewed with the `playwright-cli` skill (accessibility snapshot: the checkbox's
      accessible name is DF's name; the outstanding state is announced as text, not only colour).

### US-40.7: The checkbox in the customer record (presentation)

**Description:** As DF, I want the same checkbox in the customer record, so that I can correct a
tick without going to the counter.

**Acceptance Criteria:**

- [ ] `/kunden/[id]` renders `CampaignReminderField` when `readCustomer`'s `campaignReminder` is not
      null, in the record's top area near the household's state — not inside the danger zone and
      not in a fold. Same test ids as at the counter.
- [ ] The record uses the same component, so the prominent unticked state is the same as at the
      counter (one meaning, one look).
- [ ] An archived record shows no checkbox.
- [ ] Typecheck, lint and `npm run test:e2e` pass.
- [ ] Driven and reviewed with the `playwright-cli` skill.

### US-40.8: The whole campaign, proved end to end (e2e)

**Description:** As a developer, I want the campaign's promises proved through the screens: switch
on, tick at the counter and in the record, progress follows, rename keeps ticks, switch off forgets.

**Acceptance Criteria:**

- [ ] New `tests/e2e/campaign-reminder.spec.ts`, **isolated** — „x von y" is a claim about the whole
      register — added to `ISOLATED_SPECS` in `tests/e2e/registers.ts` (ADR-012), `mode: "serial"`,
      emptying the register in its own `beforeAll` and seeding a few households (one blocked, one
      archived) through Prisma with synthetic data:
  - with no reminder on, neither the counter nor the record shows `campaign-reminder-received`;
  - switching on „Weihnachtstüte" in the settings: progress „0 von N erhalten" (N excludes the
    archived household) and today's date;
  - at the counter, **without a running distribution session**, the household shows the box
    labelled „Weihnachtstüte", unticked and `campaign-reminder-outstanding` visible; ticking it
    hides the outstanding word **in the same page load**; reloading keeps it ticked;
  - serving a second household leaves its box unticked (D4);
  - a blocked household shows the box and can be ticked; the archived household shows none;
  - unticking in the record works and the settings progress follows;
  - registering a new household during the campaign: it appears unticked and N grows by one;
  - renaming to „Ostertüte": the counter's label changes, the ticks stay;
  - switching off names the tick count in the warning; afterwards no checkbox anywhere; switching on
    again shows „0 von N erhalten".
- [ ] No other spec's assertions change. If one asserts the exact outline of the settings page, it is
      adjusted deliberately, not by deleting the assertion.
- [ ] Both engines pass: `npm run test:e2e` and `npm run test:e2e:webkit`.

### US-40.9: ADRs, CLAUDE.md, architecture record and Betriebsanleitung (documentation)

**Description:** As a future maintainer, I want the two exceptions this feature makes to the project's
rules recorded where those rules are stated; as DF, I want the handout to explain the feature.

**Acceptance Criteria:**

- [ ] **ADR-023** via the `record-adr` skill: _a campaign reminder's ticks are deleted when it is
      switched off_ — the **fourth** exception to the no-delete rule, argued like ADR-019: a tick is a
      note to self, not customer data; nothing points at it; keeping ticks of ended campaigns would
      be history nobody asked for (R8). Unticking deletes the row too. The reminder row itself is
      never deleted (`endedAt`). Alternatives weighed: keep the ticks under the ended reminder; a
      boolean column on `Customer`.
- [ ] **ADR-024** via the `record-adr` skill: _the individual tick is not audited_ — a second
      deliberate gap in the audit rule beside ADR-020's, argued: it changes no entitlement, no money
      and no record DF are accountable for; ~240 entries per campaign would bury the entries that
      matter. Switching on, renaming and switching off are audited.
- [ ] Both rows added to the chapter 9 decision log.
- [ ] `CLAUDE.md`:
  - **Don'ts → no hard-delete:** „exactly three deliberate exceptions" becomes four, one sentence
    for the campaign reminder's ticks citing ADR-023;
  - **Don'ts → audit entry:** the list gains _switching a campaign reminder on, renaming it or
    switching it off_, and the sentence naming the deliberate gap gains the individual tick
    (ADR-024).
- [ ] arc42 via the `arc42` skill: **05** — `src/domain/campaign/`, `src/application/campaign/`, the
      new port and adapter; **08** if the audit-event list or the deletion exceptions live there;
      **12** — _Aktionserinnerung_ in the glossary.
- [ ] `docs/guideline/ui_styling_guide.md`: §5 lists `CAMPAIGN_OUTSTANDING_ACCENT` in the
      `accents.ts` table; §12 registers the icon used for „noch nicht erhalten".
- [ ] `docs/handout/betriebsanleitung.md` (German, printable): a short section
      **„Aktionserinnerung"** — switching on with a name, ticking at the counter or in the
      Kundenakte, the progress in the settings, that switching off deletes every tick, and that
      serving a household does not tick it off.
- [ ] `scripts/ralph/prds/README.md` gains the batch 40 row and a short paragraph: schema change
      (migrations regenerated, three hand-written indexes), one new port, the fourth delete exception
      and the second audit gap, ADR-023 and ADR-024.
- [ ] `npm run arc42:check` passes.

## Functional requirements

- **FR-1:** `/einstellungen` has a section „Aktionserinnerung" where DF switch on a reminder with a
  name of 1–40 characters. At most one reminder is on at a time.
- **FR-2:** While a reminder is on, every active or blocked household is „not yet received" until
  ticked. A household registered during the campaign starts „not yet received". Archived households
  and the waiting list are not part of it.
- **FR-3:** At the counter (after a lookup) and in the customer record, an active or blocked
  household shows one checkbox labelled with the reminder's name. Changing it saves immediately,
  without a reason, with or without a running distribution session.
- **FR-4:** At the counter, an unticked box is shown prominently (colour, icon and the words „noch
  nicht erhalten") and never blocks or delays serving.
- **FR-5:** Serving a household does not change its tick.
- **FR-6:** The settings show „x von y erhalten" (y = active + blocked households, x = those ticked)
  and the date the reminder was switched on.
- **FR-7:** The reminder can be renamed while on; the ticks are kept.
- **FR-8:** Switching off asks for confirmation naming the number of ticks that will be deleted. After
  it, no checkbox appears anywhere and every tick is gone; switching on again starts everyone at „not
  yet received".
- **FR-9:** Switching on, renaming and switching off each write an audit entry (what and when, never
  who). An individual tick or untick writes none.
- **FR-10:** A tick submitted for a reminder that has since been switched off is refused with a
  German notice, never written into a newer reminder.
- **FR-11:** The reminder does not appear on distribution-session receipts, does not change the
  verdict, the price, the hand-out rules or the card.

## Non-goals

- **No more than one reminder at a time** (D2) — several only if DF ever need them.
- **No list of outstanding households** and **no row in „Zu erledigen"** or tile under
  „Übersichten" (D8).
- **No expiry date** (D9).
- **No per-person quantities** (D7) — DF handle larger households at the counter.
- **No tick date, no tick history, no audit entry per tick** (R8, D12).
- **Nothing on session receipts** (R8); `HandoutReceipt` is not touched.
- **No coupling to serving** (D4): the serve flow neither ticks nor asks.
- **No column in the customer list** (`/kunden`) — not asked for.

## Design considerations

- Settings sketch:

  ```
  ───────────────────────────────────────────
  Aktionserinnerung
  Name [Weihnachtstüte          ] [Umbenennen]
  38 von 214 erhalten · eingeschaltet am 11.10.2026
  ▸ Ausschalten
  ```

- Counter sketch (unticked, prominent; ticked, plain):

  ```
  ┌ Erika Muster ─────────────── BLAU ┐
  └───────────────────────────────────┘
  ┌ 🎁 ☐ Weihnachtstüte — noch nicht erhalten ┐   ← CAMPAIGN_OUTSTANDING_ACCENT
  └───────────────────────────────────────────┘
  [certificate controls] [serve controls]
  ```

- Reuse `Notice`, `useNoticeSlot`, the destructive-disclosure shape of the archive control, and the
  native-checkbox pattern of `src/app/card-printed-field.tsx` (including the `defaultChecked` ref).
- The checkbox label is DF's name and nothing else; the state word carries the meaning, the colour
  and icon repeat it (CLAUDE.md, "An icon is a second channel").

## Technical considerations

- **Why the tick is stored:** handing over a bag happens outside the software; the only source is
  DF's statement. A stored fact like `Card.printedAt`, not a derivable value — so not a "derive,
  don't store" exception.
- **Absence means „not yet received".** Switching on writes one row and nothing per household; a new
  registration needs no hook. This is why the tick is a row per received household rather than a
  column on `Customer`.
- **The tick rows key on `reminderId`**, so a stale screen cannot tick into a later campaign
  (`CampaignReminderNotActive`), and switching off is one `deleteMany` by reminder id.
- **One active reminder is enforced by the database**, through a partial unique index added by hand
  as `one_running_session` is — the application check alone loses a race between two workstations.
- **Every hand-written fake changes:** `lookupCustomer` and `readCustomer` gain a dependency, so their
  fakes in the application tests gain a `CampaignReminderRepository` in the story that adds it
  (US-40.4) or nothing compiles.
- **Cost:** `readCampaignReminder` reads the active and blocked register (~240 rows) on each
  settings load; the counter reads one reminder and one tick. Fine at this size; do not cache.
- **Story order matters for the e2e:** the settings section (US-40.5) exists before the counter and
  record (US-40.6/40.7), so their browser checks can switch a reminder on through the UI.

## Success metrics

- DF stop keeping a paper list for the Christmas bag.
- At the counter, staff can tell within one glance whether the household has had its item.
- The settings progress matches the number of ticked boxes in the e2e spec.

## Open questions

- **Re-confirm pre-release status before the run.** Last confirmed 2026-08-24. If DF already hold
  real data, US-40.2 must **append** a migration creating the two tables and the partial index
  instead of regenerating the history.
- Accent tint and icon for „noch nicht erhalten": a distinct tint and `Gift` are proposed; settle
  them in the `playwright-cli` review and in one look in real Safari.
