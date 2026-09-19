# PRD: Past distributions are traceable — the overview and the detail view (US-37)

> Source: `local_only/manually-start-ausgabe/refined-requirements.md`, requirements **C** (overview
> and detail view) and **E-1 to E-4, E-6** (what a row shows and which state it shows). The capture
> those columns read was built in US-35; this PRD is the screen.

## Introduction

Three batches have made a distribution session a thing the software knows: it is started and ended by
hand (US-34), its hand-outs belong to it (US-34), and the households it served are captured as they
stood when it was closed (US-35). None of that is visible anywhere. DF cannot open last Thursday.

This PRD is the two screens that make a past session readable: an **overview** listing sessions
newest first, and a **detail view** of one session listing the households that collected at it.

Two decisions shape the detail view, and both are DF's.

**It shows who was there, and nothing else.** Not the households that did not turn up — the table of
those present is enough (G-2) — and not a list of the blocks and archivings carried out during the
afternoon (G-1). A block is a property of the household, not a transaction of the session, and is
fully readable on the household's own record. This **supersedes** the passage of SPEC-AUSGABE-1.1
that names „Erinnerungen, Sperrungen, …" in the detail view, and it does so deliberately (H-1).

**It shows the state as it stood** (E-2): the name the household had that afternoon, the counts that
were true then, the number and card they held, the certificate date that was on file. Where a session
is still running — or has been reopened — the same screen shows today's live values, because nothing
is frozen until the afternoon is closed (E-5). One screen, two sources, and the rule deciding which is
one line: is this session ended?

The columns are the customer list's own: **Nr., Name, Karte, Gruppe, Erw. + Kinder, Preis, Nachweis
bis, Erinnerungen**, plus the **amount paid**. Nine is a lot, and the customer list already has width
trouble with eight of them — so whether they all stay readable side by side is decided **on the
finished screen**, not here. If one has to go, `Karte` goes first: a card number is made of the
customer number and an issue count, so it partly repeats the first column (H-3).

## Goals

- Every past session is reachable, readable and permanent.
- One page lists the sessions newest first; the running one sits at the top, marked as running.
- One page shows a session's households with what each of them paid.
- An ended session shows the state as it stood; a running or reopened one shows today's.
- Nothing in the detail view restates what the row already shows, and nothing tells DF what a session
  is.

## User stories

### US-37.1: The list of sessions (application)

**Description:** As DF, I want one call to answer what every past afternoon did, so the overview is
one query rather than one per row.

**Acceptance Criteria:**

- [ ] New use case `src/application/distribution/list-distribution-sessions.ts` returning, newest
      first, one row per session that was not discarded: `{ id, startedAt, endedAt, groups,
households, totalPaidCents, running }` (C-2, C-3).
- [ ] `households` and `totalPaidCents` are **aggregated in the store**, not by loading every
      hand-out of every session — a new port method `DistributionRecordRepository.summariseBySession()`
      returning a map, in the shape `CardRepository.highestIndexByNumber` already takes. One query for
      the page, whatever the register's age.
- [ ] A **running** session is in the list, at the top, with `running: true` and provisional figures
      (C-2, C-7). Its `endedAt` is `null` and the screen, not this use case, decides what to print
      there.
- [ ] Discarded sessions never appear (US-34, FR-7).
- [ ] Application coverage stays at 100%; named tests: `lists the newest session first`, `puts the
running session at the top`, `counts what each session took`, `omits a discarded session`.

### US-37.2: One session, with the households that collected at it (application)

**Description:** As DF, I want a session read back with its households as they stood, so the screen
lays out an answer rather than assembling one.

**Acceptance Criteria:**

- [ ] New use case `src/application/distribution/read-distribution-session.ts` taking a session id and
      returning the session plus one row per hand-out: `{ customerId, customerNumber, firstName,
lastName, cardNumber, group, grownUps, children, priceCents, certificateValidUntil,
reminderCount, paidCents, at }` (E-1).
- [ ] **Which state a row carries is decided in one place:** an **ended** session's rows come from the
      `HandoutReceipt` written when it closed (US-35); a **running or reopened** session's rows are
      read live off the customer, household, card and certificate (E-5). One `if`, with a comment
      naming E-5 and no more.
- [ ] `group` is `groupOf(customerNumber)` of whichever number the row carries (ADR-017), and
      `cardNumber` is `formatCardNumber` over whichever card slot and index it carries (ADR-016).
      Neither is stored, on the receipt or anywhere else.
- [ ] `priceCents` and `paidCents` come from the hand-out, always — they are on it, frozen or not
      (E-6).
- [ ] **The household's balance is not returned** (E-6, G-7): the difference on one row is readable
      from the two money columns, and the overall balance is a different question belonging to the
      household's own record.
- [ ] Rows are ordered by **customer number**, the order DF read a register in, not by the time of the
      hand-out. State it in one line on the use case.
- [ ] A session ended **before US-35** has no receipts. Those rows come back with the household's
      live values and a flag saying so, rather than empty columns the screen would have to guess at
      (E-10). One named test covers it.
- [ ] `DistributionSessionNotFound` for an unknown or discarded id.
- [ ] Application coverage stays at 100%; named tests: `shows the name as it stood at an ended
session`, `shows today's name while the session is still running`, `shows today's name again
after the session is reopened`, `shows the household that was served after its number was given
to another`.

### US-37.3: The overview page (presentation)

**Description:** As DF, I want a page listing the distributions we have held, so that last Thursday
is one click away.

**Acceptance Criteria:**

- [ ] New route `/ausgabetermine` — DF's own word, and deliberately not `/ausgaben`, which is one
      letter from the counter screen `/ausgabe` and would be misread in the address bar and in every
      future conversation about the code.
- [ ] One table, newest first: **Datum, Gruppe(n), Haushalte, Summe** (C-3). The running session is
      the first row and is marked as running — a badge, not a colour alone
      (`ui_styling_guide.md` §12) — with its figures labelled provisional in one word, not a sentence.
- [ ] Group(s) wear the same badge as everywhere else in the application (`GROUP_STYLES`,
      `variant="outline"`); a session serving both shows both badges.
- [ ] Each row links to the detail view. Money is formatted through `src/domain/money.ts`; dates
      through `src/i18n/format.ts`.
- [ ] An empty register says so in one line and nothing more — no explanation of what will appear
      here once DF have held a distribution.
- [ ] Reached from `/ausgabe`: the last session's summary (US-34.8) links here, and so does the
      session header while one runs. **Whether a fifth nav item is added is decided on the finished
      screen** — the nav bar is the application's only wayfinding and four items is what US-17 settled
      on, so adding one is a decision with a cost, not a detail.
- [ ] German strings only in `src/i18n/de.ts`, under `distribution.sessions`.
- [ ] Driven and reviewed with the `playwright-cli` skill.

### US-37.4: The detail view (presentation)

**Description:** As DF, I want to open one distribution and see who collected and what they paid, so
that a question about last Thursday is answered from the screen rather than from memory.

**Acceptance Criteria:**

- [ ] New route `/ausgabetermine/[id]`, headed by the session: the date, the start and end times, the
      group(s), the number of households and the total taken.
- [ ] One table, one row per household that collected: **Nr., Name, Karte, Gruppe, Erw. + Kinder,
      Preis, Nachweis bis, Erinnerungen, Betrag** (E-1). Headings are the customer list's own, read
      from the same dictionary keys where they are the same words — a second wording of one column is
      how two screens come to disagree.
- [ ] **No `Status` column** (E-1, G-4): whoever appears in the table was active at the time of their
      hand-out anyway, a blocked household receiving nothing.
- [ ] **No list of absent households and no list of blocks or archivings** (C-6). Nothing on the page
      explains their absence.
- [ ] **The width is decided here, in the browser, not on paper** (E-1, H-3). If nine columns do not
      read side by side at DF's window size, `Karte` is the first to go; the table scrolls inside its
      own container before the page ever scrolls sideways. Record what was decided in
      `docs/guideline/ui_styling_guide.md` if a column is dropped.
- [ ] A **running or reopened** session is viewable here like any other, its figures provisional
      (C-7). It carries the same one-word mark the overview uses; the page does not explain that
      numbers may still change.
- [ ] A session ended before US-35 shows its rows from the household's current record, marked in one
      short line — the only hint on this screen that earns its place, because it says something the
      table cannot: these figures are today's, not that afternoon's.
- [ ] An ended session with no hand-outs says so in one line.
- [ ] Driven and reviewed with the `playwright-cli` skill — the accessibility snapshot is what shows
      whether nine columns still mean anything.

### US-37.5: The state as it stood, proved end to end (e2e)

**Description:** As a developer, I want the freeze proved through the screen, because the capture
built in US-35 has never been read by anything until now.

**Acceptance Criteria:**

- [ ] New `tests/e2e/session-detail.spec.ts`:
  - start a session, serve two households, open the detail view **while it runs** and see them with
    today's values;
  - end it; the figures are unchanged;
  - **then change the household**: correct the surname, renew the certificate, and re-open the detail
    view — the old surname and the old date still stand (E-2, E-3);
  - reopen the session: the detail view follows the record again (E-5, H-2);
  - end it once more: the detail view freezes on the **new** values, because the afternoon was closed
    a second time;
  - archive one household's number and register a new household on it, then re-open the past
    session — the row still names the household that was actually served (E-4).
- [ ] The overview lists the sessions newest first and marks the running one.
- [ ] Both engines pass: `npm run test:e2e` and `npm run test:e2e:webkit`.

### US-37.6: The Betriebsanleitung and the architecture record (documentation)

**Description:** As DF, I want the handout to say where past distributions live, so that the screen
is found without being shown.

**Acceptance Criteria:**

- [ ] `docs/handout/betriebsanleitung.md` gains a German, printable section: where the list of
      Ausgabetermine is, what a row says, what the detail view shows — and the one thing that is not
      obvious from either, that an ended Ausgabe shows the households **as they were then**, so a
      name corrected next week does not change what last week's table says.
- [ ] arc42 updated with the `arc42` skill: **05** (the two use cases, the two routes, the aggregate
      port method), **12** (glossary: _Ausgabetermin-Übersicht_, _Detailansicht_ if the words are
      worth fixing). No new ADR — ADR-020 and ADR-021 already carry the decisions this screen renders,
      and citing them is the rule (`CLAUDE.md`).
- [ ] `tasks/README.md` gains a short note — not a row in the MVP index table, which stops at US-16
      by design — naming US-34 → US-35 → US-36 → US-37 as one chain in that order, since that is the
      one place a reader finds out that US-35 must not be skipped or deferred.
- [ ] `npm run arc42:check` passes.

## Functional requirements

- **FR-1** (C-1): Past sessions are permanently traceable and viewable, and are never deleted.
- **FR-2** (C-2): One overview page lists sessions newest first; a running session sits at the top
  and is marked as running.
- **FR-3** (C-3): Each overview row names the start date, the group(s), the number of households
  served and the total taken.
- **FR-4** (C-4, C-5): Selecting a session opens a detail view listing the households that received
  food at it, each with the payment recorded.
- **FR-5** (C-6, G-1, G-2, H-1): The detail view shows neither the households that did not turn up
  nor the blocks and archivings carried out during the session. This supersedes `[§3]`.
- **FR-6** (C-7): A running session is viewable in the same place, its figures provisional.
- **FR-7** (E-1): Each row shows Nr., Name, Karte, Gruppe, Erw. + Kinder, Preis, Nachweis bis,
  Erinnerungen and the amount paid. There is no Status column.
- **FR-8** (E-2, E-3): An ended session's rows show the state as it stood at that session — the name,
  the counts, the number and group, the certificate date, the card and the price of that afternoon.
- **FR-9** (E-4): A row names the household that was actually served, even after its customer number
  has been archived and given to another household.
- **FR-10** (E-5): While a session runs — including a reopened one — the rows follow the record.
- **FR-11** (E-6, G-7): The price charged and the amount paid stand beside each other; the
  household's balance does not appear.
- **FR-12** (E-10): Sessions ended before the capture existed have no frozen state, and the screen
  says so rather than showing blanks.

## Non-goals

- No editing anything from these screens: a past session is read-only, and a running one is corrected
  at the counter where it is being served.
- No list of absent households, no activity list, no blocks or archivings (C-6).
- No balance in the detail view (E-6).
- No export, no printing, no reporting across sessions beyond what one row states (§3).
- No marking of extra distributions (D-5).
- No change to pricing, balances, certificates, cards, the waiting list or customer numbers.

## Technical considerations

- **No schema change and no new domain rule.** Every fact these screens show was written by US-34 and
  US-35. The only new port method is the aggregate in US-37.1. A story that finds itself editing
  `prisma/` or `src/domain/` has misread the batch.
- **The two sources of a row** (receipt vs. live record) meet in exactly one place, US-37.2. If that
  decision leaks into the component, the screen will show frozen names in one column and live ones in
  another, which is the table E-8 says nobody can check.
- **Nine columns is the risk.** The customer list already has width trouble with eight of them, and
  it was the one this project capped a column on (PR #141). Decide it in the browser, at DF's window
  size, and record the outcome.
- **The detail view is the first read-only table in the application that is not about today.** Its
  emptiness cases are therefore real: a session with no hand-outs, and a session from before the
  capture existed.

## Open questions

Two things are deliberately decided on the finished screen rather than here:

- **How many columns survive** (E-1, H-3), and whether `Karte` is the one that goes.
- **Whether the overview earns a fifth nav item**, or is reached only from the counter screen.
