# PRD: The Ausgabe screen, redesigned — one mask, no scrolling (US-41)

> **Source of truth for the look:** the Design canvas **„Ausgabe-Screen Redesign"**,
> https://claude.ai/artifact/SKRE5hmzii8WrkrNxrvsbP. Read it with the Artifact tool
> (`action: "read"`, then `path: "project/<file>"`), never WebFetch. The artboards cited below:
>
> | Artboard                   | What it shows                                                         |
> | -------------------------- | --------------------------------------------------------------------- |
> | `Main.dc.html`             | household looked up (certificate expired, reminder open) + group list |
> | `Leer.dc.html`             | the empty mask right after a hand-out was recorded                    |
> | `Maske.dc.html`            | the mask as one component; the tweak `zustand` switches the state     |
> | `Z1-Nachweis.dc.html`      | certificate expired — reminder logged, renewal form open in place     |
> | `Z2-Bereits.dc.html`       | already served — correct the amount / remove the entry                |
> | `Z3-Gesperrt.dc.html`      | blocked — refusal chip, block reason above the note                   |
> | `Z4-Hinweise.dc.html`      | rare notes — stale card, missed hand-outs, note being edited          |
> | `Z5-Fehler.dc.html`        | invalid amount in „Gezahlt"                                           |
> | `Z6-NichtGefunden.dc.html` | number not found                                                      |
> | `Z7-OhneAktion.dc.html`    | ordinary case — clear to serve, no campaign reminder, balance settled |
>
> The DF request behind it: `local_only/re-design-ausgabe-screen/description.md` and `mockup.png`
> (local only, not committed). **Where this PRD and the canvas disagree on look, the canvas wins;
> where they disagree on behaviour, this PRD wins** — the canvas is a static mock and does not
> know the rules the use cases enforce.

## Introduction

DF want everything a staff member needs at the counter on **one screen, without scrolling**. Today
`/ausgabe` stacks seven cards — session header, group tally, lookup, a full-width verdict banner,
household details, certificate controls, payment, danger zone — and on DF's MacBook Air the serve
button sits below the fold for most households.

The redesign replaces those cards with **one „Ausgabemaske"** built on a 12-column grid, plus a
header line above it and the **full list of the session's households** below it. The governing
principle (canvas note „Prinzip"): **every state swaps content inside a fixed place — no state adds
a new card.**

- The action button sits **beside the lookup**: `Kundennummer` · `Nachschlagen` · `Ausgabe erfassen`
  · status chip.
- „Ausgabe frei" shows **no chip** — the green button is the signal. A chip appears **only for an
  exception**, directly beside the button (amber hint, grey info, red refusal).
- The paid amount is entered **in the tile row** („Gezahlt (von 4,00 €)"), pre-filled with the
  amount to pay.
- The certificate row turns into the renewal form **in place**; the note turns into a text area **in
  place**; removing an entry, blocking and archiving open **in the footer**.

Nothing about the rules changes. Every verdict, price, balance, reminder and audit entry is what it
is today. This is a re-layout of `src/app/ausgabe/` plus three derived read fields and one domain
helper.

## Goals

- At a 1440 × 800 viewport (MacBook Air, Safari) the **whole mask** is visible without scrolling
  for every state on the canvas. The group list starts just below it.
- One look-up-and-serve takes the same keystrokes as today or fewer: type the number, Enter, click
  „Ausgabe erfassen" (or correct „Gezahlt" first).
- A booking can never land on the wrong household because the number field was edited but not
  looked up (decision 1 below).
- The screen matches the canvas: layout, order, wording, colours, icons.
- Every existing rule, audit entry and refusal keeps working. The e2e suite is green on Chromium
  **and** WebKit.

## Decisions taken while writing this PRD (12.10.2026)

1. **A number that was edited but not looked up disables „Ausgabe erfassen".** As soon as the
   value in `Kundennummer` differs from the query the household on screen was looked up with, the
   button is grey and disabled (same look as `Leer.dc.html`). The household stays visible. Enter or
   „Nachschlagen" looks the new number up and enables the button again. _(This was left open on the
   canvas.)_
2. **A merged afternoon (Rot und Blau)** shows both group badges in the header and one tally per
   group („12 von 100 Rot · 8 von 98 Blau abgeholt"). The list below the mask is **one table**
   holding both groups, sorted by customer number. The `Gruppe` column tells them apart.
3. **No block date.** The canvas shows „Sperrgrund · seit 21.09.2026". No block date is stored, so
   the box reads **„Sperrgrund"** alone, with the reason below it.
4. Verdicts the canvas does not draw take the **refusal look of `Gesperrt`**: red chip, button
   grey and disabled, „Gezahlt" disabled and empty. These are `WRONG_GROUP` („Falsche Gruppe"),
   `OUTDATED_CARD` („Karte ungültig") and `ARCHIVED` („Archiviert"). They use the existing headlines
   from `de.distribution.counter.verdicts`.
5. **„Ausgabe verwerfen"** (discarding a session nobody has been served at, US-34) is not on the
   canvas. It stays offered **beside „Ausgabe beenden"** in the header, as the same outline button,
   only while `canDiscard`.
6. The answers that today appear beside a card — the overpayment question, a refused write, the
   confirmations after a hand-out, a removal or an archiving — appear **in the status slot beside
   the action button** (the canvas's „fester Platz"). The one exception is a refused field, which
   marks the field itself (Z5).

## The mask, state by state

This table is the behavioural core. „Chip" is the status element right of the action button.

| State (verdict)                              | Chip (tone, icon, text)                           | Action button                               | „Gezahlt" tile                                                                       | Canvas         |
| -------------------------------------------- | ------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------ | -------------- |
| nothing looked up yet / just served          | none — or the green confirmation after a hand-out | „Ausgabe erfassen", grey, disabled          | not shown (no household)                                                             | `Leer`         |
| `CLEAR_TO_SERVE`                             | **none**                                          | „Ausgabe erfassen", green `bg-green-700`, ✓ | enabled, pre-filled `amountToPay`, „(von {amountToPay})"                             | `Z7`           |
| `CLEAR_TO_SERVE_CERTIFICATE_EXPIRED`         | amber, `TriangleAlert`, „Nachweis abgelaufen"     | green — still serves (US-06)                | as above                                                                             | `Main`, `Z1`   |
| `ALREADY_SERVED`                             | grey, `Check`, „Bereits ausgegeben · {time} Uhr"  | **„Betrag speichern"**, outline, no icon    | enabled, pre-filled `paidCents`, „(von {askedCents})"                                | `Z2`           |
| `BLOCKED`                                    | solid red `bg-red-700` white, `X`, „Gesperrt"     | „Ausgabe erfassen", grey, disabled          | disabled, empty, faded                                                               | `Z3`           |
| `WRONG_GROUP` / `OUTDATED_CARD` / `ARCHIVED` | solid red, `X`, existing headline                 | grey, disabled                              | disabled, empty, faded                                                               | — (decision 4) |
| `NOT_FOUND`                                  | grey, `CircleHelp`, „Nummer nicht gefunden"       | grey, disabled                              | — (no household rows at all)                                                         | `Z6`           |
| invalid amount after submit                  | none                                              | unchanged                                   | red ring, label red, „Kein gültiger Betrag. Bitte so eingeben: 4,00" under the input | `Z5`           |
| number edited but not looked up (decision 1) | unchanged                                         | grey, disabled                              | unchanged                                                                            | —              |

## User stories

Each story is one PR-sized unit on branch `feat/us-41-counter-screen-redesign` (or one Ralph
batch). Story numbers follow the repo's `US-<n>.<m>` convention.

### US-41.1: Calendar week and last hand-out (domain)

**Description:** As a developer, I need the ISO calendar week of a day and the date of a household's
most recent hand-out as pure functions, so that the header and the mask derive both rather than
store them.

**Acceptance Criteria:**

- [ ] `isoWeek(day: CalendarDay): { week: number; year: number }` beside the existing calendar-day
      helpers in `src/domain/calendarDay.ts` (or a sibling module). TDD first. Named boundary tests:
      `counts the Thursday rule: 1 January 2026 is in week 1`,
      `puts 31 December 2026 in week 53`, `puts 1 January 2027 in week 53 of 2026`,
      `puts 4 January 2027 in week 1 of 2027`, `handles 29 February 2028`.
- [ ] `lastHandoutAt(records): Date | null` in `src/domain/distribution/attendance.ts`. It returns
      the latest `at` over a household's distribution records, or `null` when there are none.
      Tests: `has no last hand-out before the first one`,
      `takes the latest of several hand-outs`, `counts a hand-out made today`.
- [ ] No wall-clock read and no import outside `domain/` (`fd/domain-boundary`).
- [ ] Typecheck, lint and `npm run test:coverage` pass (domain at 100%).

### US-41.2: What the counter reads (application)

**Description:** As a developer, I need the lookup and the session's household list to carry every
field the new mask and list show, read in the same pass as today, so the page computes nothing.

**Acceptance Criteria:**

- [ ] `CounterCustomerView` (`src/application/customers/lookup-customer.ts`) gains:
  - `certificateType: string` — the household's Bedarfsnachweis label as stored.
  - `certificateState: CertificateState` — `certificateState(validUntil, today)` from
    `src/domain/customer/certificate.ts`, judged at the same instant as the verdict.
  - `lastHandoutAt: Date | null` — `lastHandoutAt` over the records already loaded for the balance.
    No extra query (US-04.3).
- [ ] New use case `readCounterRoster(deps)` in `src/application/distribution/`. It returns the
      running session's households as `CustomerListRow` (the Kundenliste's own row type, from
      `list-customers.ts`) plus `servedInSession: boolean` per row. The row set is every
      non-archived household whose group the session serves, sorted by customer number. The
      tallies are those `readGroupRoster` returns today. **Reuse, don't duplicate:** build on
      `listCustomers` (group filter, archived excluded) and the served-in-session logic
      `readGroupRoster` already has. If `readGroupRoster` has no other caller afterwards, replace
      it rather than keeping both.
      `@throws {NoDistributionSessionRunning}` and `{NoSettingsInForce}`, as today.
- [ ] TDD against hand-written fakes. Named tests: `lists only the groups the session serves`,
      `lists both groups at a merged afternoon`, `leaves archived households off the list`,
      `keeps blocked households on the list`, `marks a household served at this session`,
      `does not mark a household served at an earlier session`,
      `states the last hand-out of a household served today as today`,
      `has no last hand-out for a household never served`.
- [ ] Typecheck, lint and `npm run test:coverage` pass (application at 100%).

### US-41.3: The header line

**Description:** As a staff member, I want the date, the calendar week, the group(s) and how many
households have collected on one line above the mask, so I see the afternoon's state without a card
of its own. (`Main.dc.html`, top.)

**Acceptance Criteria:**

- [ ] One flex row outside any card, wrapping on narrow screens:
      `h1` „Ausgabe" (unchanged, `text-3xl font-semibold`) · date and week in `text-lg
text-muted-foreground tabular-nums`, e.g. „Mo 12.10.2026 · KW 42" · group badge(s)
      (`GROUP_STYLES`, slightly larger: `text-sm px-2.5`) · tally „**2** von 100 Haushalten
      abgeholt" (count `font-semibold`). Right-aligned (`ml-auto`): ghost link „Ausgabetermine" →
      `/ausgabetermine`, then outline button „Ausgabe beenden", then „Ausgabe verwerfen" only while
      `canDiscard` (decision 5).
- [ ] The date is the running session's `startedAt` day, not the wall clock, so an afternoon that
      runs past midnight keeps its date. The week comes from `isoWeek`.
- [ ] A merged session shows both badges and the tally per group, joined with „ · " (decision 2,
      reuse `de.distribution.progress.summaries`).
- [ ] „Ausgabe beenden" and „Ausgabe verwerfen" keep their confirmation step (the existing
      `RunningSessionControls` disclosures). The confirmation opens **below the header row**, and
      the end confirmation still states households and total paid.
      Test ids `session-end-open`, `session-end-confirm`, `session-end-submit`,
      `session-discard-*`, `session-past-link`, `session-groups` stay on their elements.
- [ ] `SessionHeader` and `GroupProgressCard` are gone from `/ausgabe`. `group-progress` moves to the
      tally text.
- [ ] Between afternoons (`StartSessionForm`, `LastSessionCard`) nothing changes.
- [ ] German strings in `src/i18n/de.ts` only (weekday abbreviation, „KW", tally sentence).
- [ ] Typecheck and lint pass.
- [ ] Verify in browser using the playwright-cli skill.

### US-41.4: Row 1 — lookup, action, status

**Description:** As a staff member, I want to type a number, press Enter and book the hand-out with
the button right beside the field, with any exception stated next to that button. (`Main`, `Leer`,
`Z2`, `Z3`, `Z6`; the state table above.)

**Acceptance Criteria:**

- [ ] One `<section aria-label="Ausgabemaske">` card (`rounded-xl ring-1`, padding `px-6 py-5`,
      `gap-[18px]` between rows) holds everything in US-41.4 to US-41.7.
- [ ] Row 1, `flex flex-wrap items-end gap-3`:
  - label „Kundennummer" over input `#counter-input` (`h-12 w-[150px] text-2xl font-semibold
tabular-nums`, `inputMode="numeric"`, autofocus). Testid `counter-input` stays.
  - outline button „Nachschlagen" with `Search` (`h-12`, `text-base`).
  - the action button (`h-12 px-[22px] text-lg font-semibold`), `Check` icon when it reads
    „Ausgabe erfassen", testid `serve-button`, or `correct-save` while it reads „Betrag speichern".
  - the status slot (`h-12 rounded-[10px] px-4 text-base font-semibold`, icon `size-5`).
- [ ] **After a lookup the field shows the query** that was looked up (e.g. `127` or `127k1`),
      focused with its text selected, so typing the next number replaces it. **After a hand-out**
      the field is empty and focused (`Leer`). The `key`-remount trick that refocuses after a
      server-action redirect stays.
- [ ] Enter in `Kundennummer` = look up (GET `?nummer=`), as today. The serve form is a separate
      `<form id>`. The action button and the „Gezahlt" input join it through the `form` attribute.
      `guardEnter` stays on „Gezahlt": Enter there never books.
- [ ] **Decision 1:** while the field's value (trimmed) differs from the looked-up query, the
      action button is disabled. A small client component owns this comparison. The server action
      still re-checks the verdict (FR-8), and this is a courtesy on top of that.
- [ ] The status slot renders the state table. `data-testid="counter-verdict"` with
      `data-verdict={kind}` sits on the slot **for every verdict**, including `CLEAR_TO_SERVE`.
      There the slot is visually empty and holds `counter-verdict-headline` „Ausgabe frei" as
      `sr-only` text, so screen readers still hear the verdict and the existing assertions hold.
- [ ] The chip text for an expired certificate is the short „Nachweis abgelaufen" (new `de.ts` key).
      The `ALREADY_SERVED` chip appends „ · {time} Uhr". The block reason is **not** in the chip
      (it moves to US-41.7).
- [ ] Answers that arrive in the slot instead of a chip (decision 6):
  - after a hand-out: green confirmation (`CONFIRMATION_ACCENT`, `Check`), the existing
    `serve.recorded` sentence plus the link „Korrigieren" (`Leer.dc.html`). Testids
    `serve-recorded-confirmation`, `serve-recorded-correct`.
  - after a removal or an archiving: the existing confirmations (`serve-removed-confirmation`,
    `archive-saved`).
  - the overpayment question (`serve.overpayment.question`) with its confirm button
    „Ja, Betrag so buchen" (`serve-confirm-overpayment` / `correct-confirm-overpayment`).
  - a refused write (`serve-error`, `data-tier`).
  - an unreadable number (`counter-error`, `errors.notANumber`).
    One answer at a time, via the existing `NoticeBoard`.
- [ ] The full-width `VerdictBanner` is gone. `statementFor`'s exhaustive `never` switch stays and
      now feeds the chip.
- [ ] Typecheck and lint pass.
- [ ] Verify in browser using the playwright-cli skill, for each row of the state table.

### US-41.5: Row 2 and 3 — the household and the tiles

**Description:** As a staff member, I want the name, the card and the group on one line, and the
counts, eggs, payment, balance and campaign reminder as tiles below it, so I read them in one
glance. (`Main.dc.html`, rows 2–3; `Z7`, `Z5`.)

**Acceptance Criteria:**

- [ ] Row 2 (12-col grid, `border-t pt-4`, `items-end`):
  - cols 1–6: small label „Name", then `h2` **„Nachname, Vorname"** (`text-[28px] font-semibold`,
    wraps). Testid `counter-name`. The text changes from „First Last", so update its specs.
  - cols 7–8: label „Karte", the card number at the same size, `tabular-nums`. Testid
    `counter-card-number`.
  - cols 9–12, right-aligned: group badge (`counter-group`), status word (`counter-status`,
    `STATUS_CHROME` — plain grey „aktiv", red pill „gesperrt"), ghost link „Zur Kundenübersicht" →
    `/kunden/{id}` (`counter-record-link`).
  - The separate Kundennummer tile (`counter-customer-number`) is removed: the number stands in the
    input. Rewrite the specs that asserted it to read `counter-input` or the card number.
- [ ] The stale-card note (`counter-stale-card`, existing text) sits right under row 2, `text-xs
text-muted-foreground` (`Z4`).
- [ ] Row 3 (12-col grid). Tiles are `rounded-lg bg-muted/60 px-3 py-1.5`, label `text-xs
text-muted-foreground`, value `text-2xl font-semibold tabular-nums` (`Stat`, extended if needed):
  - cols 1–3: „Erwachsene", „Kinder" (`w-24` each; `counter-grown-ups`, `counter-children`).
  - cols 4–6: „Eier" (`counter-eggs`).
  - cols 7–12, `justify-between`: on the left the **„Gezahlt" tile** and the **„Saldo" tile**; on
    the right the **campaign tile**.
- [ ] **„Gezahlt" tile** (`w-40`, white, `ring-1 ring-zinc-300`): label „Gezahlt" plus
      „(von 4,00 €)" (`aria-describedby`), then the input (`text-[22px] font-semibold text-right`,
      `inputMode="decimal"`, selected on focus) and a „€" suffix. Name `betrag`. Testid
      `serve-amount` while serving, `correct-amount` while correcting. It replaces both the
      `Zu zahlen` tile and the old „Betrag" field. Keyed on its default cents, as `AmountField` is
      today. States per the state table. An invalid amount (`Z5`) marks the tile red and shows the
      message under the input. That is the existing `notAnAmount` text, rendered through
      `FieldRejection` rather than the slot.
- [ ] **„Saldo" tile** (`w-[164px]`): signed value via `balanceValue`, tinted by `BALANCE_STYLES`
      (debt red-tinted „−10,00 €"; settled „ausgeglichen" in `text-lg`). Testid `counter-balance`.
- [ ] **Campaign tile** (`w-40`, only while a reminder is on, `CampaignReminderField` restyled):
      label = the reminder's name (ellipsis when long) over a 22px checkbox. Unticked:
      `CAMPAIGN_OUTSTANDING_ACCENT` ring plus `BellRing` before the name. Ticked: plain `bg-muted/60`,
      no icon. Saves immediately, as today. **No reminder on:** a bordered, transparent tile reading
      „keine Aktionserinnerung" in `text-muted-foreground` (new `de.ts` key, `Z7`). An archived
      household shows neither.
- [ ] Typecheck and lint pass.
- [ ] Verify in browser using the playwright-cli skill.

### US-41.6: Row 4 — last hand-out and certificate

**Description:** As a staff member, I want to see when the household last collected, which
certificate they have and until when, and how often they were reminded, and to log a reminder or
record a new certificate right there. (`Main`, `Z1`, `Z2`, `Z4`.)

**Acceptance Criteria:**

- [ ] Row 4 (12-col grid, `border-t pt-3.5`), each fact a label (`text-xs muted`) over a value
      (`text-base font-medium tabular-nums`):
  - cols 1–3 „Letzte Ausgabe": `lastHandoutAt` as `dd.MM.yyyy`, or „heute, 15:42 Uhr" when it was
    at the running session, or „noch keine" when null (new keys). Below it, only when
    `consecutiveNoShows > 0`: „3 Ausgaben in Folge verpasst" (`counter-no-shows`, `text-xs`, `Z4`).
  - cols 4–6 „Bedarfsnachweis": `certificateType`.
  - cols 7–9 „Nachweis gültig bis": the date (`counter-certificate-valid-until`), plus a badge
    „abgelaufen" (red tint) when `EXPIRED`, or „läuft bald ab" (amber tint) when `EXPIRING_SOON`.
    These are the tints the Kundenliste uses.
  - cols 10–12 „Erinnerungen an den Nachweis": the count (`counter-reminder-count`). While the
    certificate is expired, two small outline buttons follow (`h-7 text-[13px]`):
    „Erinnerung erfassen" (`reminder-button`; once logged this session it becomes a green chip
    „Erinnerung erfasst" with `Check`, `reminder-confirmation`) and „Neuer Nachweis" with
    `FoldChevron`.
- [ ] „Neuer Nachweis" turns cols 4–9 **in place** into the renewal form (`Z1`): Bedarfsnachweis
      (`CertificateTypeField`, `h-8`), „gültig bis" (`DateInput`, `h-8`), primary button „Nachweis
      speichern" (`renewal-save`), ghost button „Abbrechen", and under them the existing hint
      „Erinnerungen werden dabei auf 0 zurückgesetzt." Field refusals mark their fields as today.
      After a successful save the row closes, shows the new date, and states `renewal.saved` in the
      status slot.
- [ ] `CertificateControls`' card and its large amber button are gone. The reminder and renewal
      actions, their rules and their audit entries are unchanged.
- [ ] Typecheck and lint pass.
- [ ] Verify in browser using the playwright-cli skill.

### US-41.7: Row 5 — note, block reason and the footer

**Description:** As a staff member, I want the note readable and editable in place, the block
reason above it when there is one, and the rare, heavy actions set apart at the bottom right.
(`Main`, `Z2`, `Z3`, `Z4`.)

**Acceptance Criteria:**

- [ ] Row 5 (`border-t pt-3.5`, column `gap-2`):
  - only when blocked: a box (`rounded-lg border border-red-700/35 px-3 py-2 max-w-[75ch]`) titled
    „Sperrgrund" (`text-xs font-semibold text-red-700`) over the reason verbatim
    (`whitespace-pre-line`), or `blocked.noReason` (decision 3). Testid `counter-verdict-detail`
    moves here.
  - label „Bemerkung", then the note (`counter-notes`, `text-[15px] leading-normal max-w-[65ch]
whitespace-pre-line`; `noNotes` when empty).
  - **Edit in place** (`Z4`): „Bemerkung bearbeiten" (`SquarePen`, small outline) swaps the paragraph
    for a 3-row textarea with „Bemerkung speichern" (primary) and „Abbrechen" (ghost). The button is
    hidden while editing. It is not offered for an archived household. Keyed by customer, as today.
- [ ] Footer, on the same line as „Bemerkung bearbeiten", pushed right (`ml-auto pl-5 border-l`):
  - „Eintrag entfernen" (`Undo2`, red outline on a red tint, `FoldChevron`), only while served
    today (`Z2`).
  - „Sperren" / „Sperre aufheben" (`Ban`, red text, `FoldChevron`).
  - „Archivieren" (`Archive`, red text, `FoldChevron`), hidden for an archived household.
    Each opens its existing confirmation **under the footer, right-aligned**, in a box with
    `border-red-700/35` (`Z2`: „Diesen Eintrag wirklich entfernen? Der Saldo steht danach wieder
    bei: −6,00 €." + destructive button „Ja, entfernen", testid `correct-remove`). Only one is
    open at a time.
- [ ] `BlockControls` and `ArchiveControls` are shared with `/kunden/[id]`. Give them a compact
      summary for the counter footer (a prop), and **leave the record screen unchanged**. Every
      `<summary>` a spec clicks keeps its testid and is clicked for real (`ui_styling_guide.md` §10).
- [ ] The danger-zone card („dangerHeading") is gone from `/ausgabe`.
- [ ] Every write here still writes its audit entry (block, unblock, archive, removal). No rule moves
      into a component.
- [ ] Typecheck and lint pass.
- [ ] Verify in browser using the playwright-cli skill.

### US-41.8: The session's households below the mask

**Description:** As a staff member, I want the full list of the afternoon's households under the
mask, with the same columns as „Kunden verwalten" plus whether they have collected today, so I see
who is still missing and can jump to anyone with one click. (`Main.dc.html` bottom, `Leer.dc.html`.)

**Acceptance Criteria:**

- [ ] A card with heading `h2` „Gruppe Rot" (merged: „Gruppen Rot und Blau") and the household count
      beside it in muted text („100 Haushalte").
- [ ] A table with exactly these columns: Nr. (right) · Name · Karte · Gruppe · Status · Erw. +
      Kinder (right) · Preis (right) · Nachweis bis · Erinnerungen (right) · **Heute**. The first
      nine render **the same cells as the Kundenliste**. Extract `CustomerRow`'s cells from
      `src/app/kunden/page.tsx` into a shared component rather than copying them, so the two lists
      cannot drift. „Heute" shows a badge „abgeholt" (`Check`, `CONFIRMATION_ACCENT`) for a
      household served at this session, and nothing otherwise.
- [ ] The name links to **`/ausgabe?nummer={customerNumber}`** (look this household up), not to the
      record. Testids `group-member-{n}` (on the link) and `served-{n}` stay.
- [ ] Rows come from `readCounterRoster` (US-41.2), sorted by number. Blocked households are listed;
      archived ones are not. A session serving nobody shows the existing `progress.empty` sentence
      instead of the table.
- [ ] The table scrolls horizontally inside its card on narrow widths. No row tinting.
- [ ] Typecheck and lint pass.
- [ ] Verify in browser using the playwright-cli skill.

### US-41.9: Fit on one screen, migrate the specs, update the docs

**Description:** As DF, I want the mask proven to fit my MacBook's screen and the rest of the suite
proven unchanged in behaviour.

**Acceptance Criteria:**

- [ ] New e2e spec `tests/e2e/counter-fit.spec.ts`, viewport **1440 × 800**, on both engines. For
      `Main` (expired certificate, campaign reminder open, two-line note), `Z2` and `Z3`, assert that
      the bottom edge of `section[aria-label="Ausgabemaske"]` is ≤ 800 px after the lookup, with no
      scrolling.
- [ ] New e2e assertions for decision 1: look up A, type B without Enter, then `serve-button` is
      disabled. Press Enter and B's button is enabled.
- [ ] The existing specs that touch `/ausgabe` (`counter`, `serve`, `balance`, `reminders`,
      `session`, `group-progress`, `campaign-reminder`, `block`, `archive`, `eggs`, `no-shows`,
      `price-cap`, `age-13`, `card-number`, `number-group`, `reissue`, …) are migrated — **each in
      the story that breaks it**, so the suite is green after every story (Ralph batch 41). **Each
      migrated assertion still proves the same contract.** Expected edits: `toHaveCount(0)` on
      `serve-button` becomes `toBeDisabled()`; the name order; the removed Kundennummer tile; the
      group list no longer being a fold. Never branch on `browserName`.
- [ ] `npm run test:e2e` and `npm run test:e2e:webkit` green.
- [ ] Docs in the same PR:
  - `docs/handout/betriebsanleitung.md`: the Ausgabe chapter describes the new screen (German).
  - `docs/architecture/05-building-block-view.md`: `src/app/ausgabe/` components and
    `readCounterRoster`, via the `arc42` skill.
  - `docs/guideline/ui_styling_guide.md`: §12 still says the counter has „five verdict tones" in a
    coloured box. Update it for the chip and its rule of no chip on „Ausgabe frei". Register
    `Undo2` for „Eintrag entfernen" if its wording there no longer fits.
- [ ] One look in real Safari on a Mac (date picker in the renewal form, the fit at DF's
      resolution).
- [ ] Typecheck, lint, unit and e2e pass.

## Functional requirements

- FR-1: While a session runs, `/ausgabe` shows, top to bottom: the header line, the Ausgabemaske, and
  the session's household list. No other card.
- FR-2: The mask's layout and visual states follow the canvas artboards listed above. The
  state table in this PRD is binding for behaviour.
- FR-3: „Ausgabe frei" shows no chip. Every other verdict shows exactly one chip beside the action
  button, with a word and an icon (never colour alone, US-03.4).
- FR-4: „Ausgabe erfassen" is enabled only when the verdict permits serving **and** the number field
  still holds the query the household was looked up with.
- FR-5: „Gezahlt" is pre-filled with the amount to pay (or, when correcting, the amount paid), is
  selected on focus, and never submits on Enter.
- FR-6: Every write keeps its current use case, refusal, confirmation text and audit entry.
- FR-7: The header's date is the running session's start day, with its ISO week.
- FR-8: The household list shows the Kundenliste's nine columns plus „Heute", for every
  non-archived household of the session's group(s), and each name looks that household up.
- FR-9: At 1440 × 800 the whole mask is visible without scrolling in every canvas state.
- FR-10: Between afternoons the screen is unchanged (start form, last session).

## Non-goals

- No rule changes: verdicts, price, cap, eggs, balance, reminders, campaign and audit stay as they are.
- No timestamps on notes. The mockup has them, and DF said „zunächst nicht notwendig".
- No stored block date (decision 3), no new schema column, no migration.
- No change to `/kunden/[id]`, `/kunden`, the between-afternoons screen or `/ausgabetermine`.
- No change to which households a session serves.
- No keyboard shortcuts beyond today's (Enter looks up).
- No colouring of the Eier tile or the last-hand-out date. The mockup's yellow and green were not
  carried onto the canvas.

## Design considerations

- Stack as today: shadcn primitives, Tailwind, `lucide-react`. The canvas's hex values map onto the
  existing tokens and accents (`zinc` ↔ `muted`/`border`, `GROUP_STYLES`, `BALANCE_STYLES`,
  `CONFIRMATION_ACCENT`, `CAMPAIGN_OUTSTANDING_ACCENT`, green-700 / amber-500 / red-700 traffic
  light). Do not add colours.
- Icons stay within the §12 registry (`Search`, `Check`, `TriangleAlert`, `X`, `CircleHelp`,
  `BellRing`, `SquarePen`, `Undo2`, `Ban`, `Archive`, `ChevronDown`). No new glyph.
- `SHELL` width (`max-w-6xl`) as on every screen. The canvas is drawn at that width.
- „Don't explain the screen on the screen": the only hint kept is the renewal's side effect.

## Technical considerations

- **Two forms, one row.** The lookup is a server-rendered GET form. The serve/correct form is a
  client form. The action button and the „Gezahlt" input live in different rows, so join them to
  the serve form with the HTML `form="…"` attribute instead of nesting. Check this in WebKit: a
  `form`-attributed submit button inside another form's DOM subtree must submit its own form.
- Decision 1 needs the looked-up query on the client: pass `nummer` down. A small client wrapper
  around the input and the button compares the two values.
- `data-verdict` must be present for every verdict (US-41.4), because many specs wait on it.
- `CounterCustomerView` gains three fields. The lookup still issues no second query.
- Shared Kundenliste cells (US-41.8) live in `src/app/kunden/` (or `src/app/`) and are imported by
  both pages. No logic in them.
- Removing the old components (`VerdictBanner`, `CustomerDetails`, `GroupProgressCard`,
  `SessionHeader`, the card wrappers in `ServeControls` / `CertificateControls`) is part of the
  change. Leave no dead code.
- Commit hygiene: restyle and behaviour in separate commits where possible (CLAUDE.md „Git").
  Decision 1 is a behaviour change and gets its own commit.

## Success metrics

- DF serve a whole afternoon without scrolling the mask on the MacBook Air.
- A look-up-and-serve takes ≤ 3 interactions in the ordinary case (number, Enter, click).
- No booking against the wrong household is reported.
- The e2e suite is green on both engines with no weakened assertion.

## Open questions

- **Red carries three meanings on a Rot afternoon:** the group badge, debt in „Saldo", and an
  expired certificate. The canvas keeps it, and so does this PRD. Revisit if DF report confusion.
- Should the list row of the household currently looked up be highlighted? The canvas does not, so
  this PRD does not either.
- „Ausgabe verwerfen" placement (decision 5) is not on the canvas. Confirm with DF during review.
