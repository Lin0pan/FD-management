# PRD: The distribution session is started and ended by hand (US-34)

> Source: `local_only/manually-start-ausgabe/refined-requirements.md`, requirements **A** (starting
> and ending), **B** (hand-outs belong to a session) and **D-3** (the group tally), from DF's
> SPEC-AUSGABE-1.1 and their answers F-1…F-16, G-1…G-8, H-1…H-3, J-1 of 19.09.2026. The German
> `refined-requirements-de.md` is the version DF signed off; where the two disagree, it is right.
>
> **A and B ship together** (§4 of the requirements): without A there is no session for B's hand-outs
> to belong to, and without B a session is a row nothing reads. That is why this is one PRD and the
> largest batch the project has run.

## Introduction

The software derives everything about a distribution from the calendar. Settings hold a week anchor
(„KW 02/2026 war Rot") and a distribution weekday; from those follows which group collects "today",
and four rules hang off that: the eligibility check at the counter, the group tally, the no-show
count and the correction window („nur am selben Kalendertag").

The real process does not follow the calendar. DF merge the two groups for a while when the register
is thin, cancel a distribution, or hold an extra one — and each time, the calendar and the afternoon
that actually happened part company. A cancelled Thursday shifts the colour of every week after it as
far as the software is concerned, and shifts nothing at all as far as DF are concerned.

So the basis stops being the calendar and becomes **the session that actually took place**: a staff
member presses a button to start it, chooses which group or groups it serves, and presses a button to
end it. Every hand-out belongs to exactly one session. „Einmal pro Kalendertag" becomes „einmal pro
Ausgabetermin"; „korrigierbar bis Mitternacht" becomes „korrigierbar bis die Ausgabe beendet ist";
„falsche Gruppe" is judged against the groups of the running session rather than against the parity
of the calendar week.

What DF get afterwards: a screen that says what is happening now rather than what the calendar
predicts, a merged distribution that needs no configuration at all (start one session for both
groups), and an afternoon that can run past midnight without splitting a household's collection in
two.

**This PRD does not remove the week anchor.** It stops the four rules reading it; US-36 takes the
values out of settings and deletes the arithmetic. Between the two, the settings screen still holds
an anchor that only the Start screen's „nächste Ausgabe" line still reads. That is a deliberate
intermediate state, and it is one batch long.

## Goals

- A distribution is started and ended by a human being, and by nothing else.
- At most one session runs at a time, the same one on every workstation.
- The group(s) a session serves are chosen at the start, proposed from the last session that took
  place, and fixed for its duration.
- Every hand-out and every certificate reminder belongs permanently to exactly one session.
- A household collects at most once per session, and everything about that collection stays
  correctable until the session is ended.
- Ending a session freezes its hand-outs and writes one audit entry; a session started by mistake
  can be discarded without leaving any paperwork at all.
- The most recently ended session can be reopened, with a reason, while no new one has started.
- No screen ever states a group that is not the running session's.

## User stories

### US-34.1: A session is a domain value with rules of its own (domain)

**Description:** As a developer, I want the session's rules — which groups it may serve, which group
is proposed next, whether it may be discarded or reopened — to be one pure module, so that no screen
and no adapter decides any of them.

**Acceptance Criteria:**

- [ ] New module `src/domain/distribution/session.ts`. Pure: it imports nothing from Next.js, React
      or Prisma, does no I/O and reads no clock.
- [ ] `SessionGroups = ReadonlyArray<Group>`, made only by `createSessionGroups(groups)`, which
      **de-duplicates**, orders **RED before BLUE** — the order `GROUPS` in
      `src/domain/customer/group.ts` already states and `de.customers.list.groupBalance` already
      prints — and throws `MissingRequiredField("groups")` for an empty set. The type is the
      invariant: a reader may rely on the order and on there being no duplicate.
- [ ] `formatSessionGroups(groups)` / `parseSessionGroups(stored)` — comma-separated, `RED`,
      `BLUE` or `RED,BLUE`. SQLite has no array type; `AuditEntry.changedFields` already stores a
      list this way, and the comment cites that rather than re-arguing it. `parseSessionGroups`
      throws `InvalidSessionGroups(stored)` on anything else, because the value re-enters the domain
      from a column.
- [ ] `servesGroup(groups, group): boolean` — the one question the counter asks of a session.
- [ ] `DistributionSession`: `{ id: number; startedAt: Date; endedAt: Date | null; groups:
SessionGroups }`, and `isRunning(session)` is `endedAt === null`. A discarded session is never
      handed to the domain at all — the store filters it out — so there is no third state here.
- [ ] `proposeGroups(lastSession: DistributionSession | null): SessionGroups | null` (A-4):
      the group that was **not** up last time; both again when both were; `null` when there is no
      session on record, which the screen renders as nothing preselected. This one function is what
      carries a merged period forward by itself and what stops a cancelled week shifting the cycle —
      the comment says so in one line and does not re-tell the calendar's story.
- [ ] `canDiscard(session, { handouts, reminders })`: true only while a running session holds neither
      (A-12). The counts are passed in; the rule does not know what a hand-out is.
- [ ] `canReopen(session, mostRecentlyEnded)`: true only when `session` **is** the most recently
      ended session and nothing is running (B-9).
- [ ] New errors in `src/domain/errors.ts`, in the file's existing shape (a `readonly code`, the
      offending values as readonly fields): `InvalidSessionGroups`, `NoDistributionSessionRunning`,
      `DistributionSessionAlreadyRunning`, `DistributionSessionNotEmpty`,
      `DistributionSessionNotReopenable`, `AlreadyServedInSession`, `ReminderAlreadyLoggedInSession`.
      `AlreadyServedToday` and `ReminderAlreadyLoggedToday` are **replaced** by the last two, not
      kept beside them.
- [ ] Written test-first, one named test per rule, each named after the rule:
  - `proposes the group that was not up last time`
  - `proposes both groups again after a session that served both`
  - `preselects nothing when no session has ever taken place`
  - `refuses a session that serves no group`
  - `reads a stored RED,BLUE as both groups`
  - `refuses to discard a session that has served somebody`
  - `refuses to reopen anything but the most recent session`
- [ ] Domain coverage stays at 100%; `npm run test:coverage` passes.

### US-34.2: The attendance rules turn on the session, not the calendar (domain)

**Description:** As a developer, I want „once per session" and „correctable until the session ends"
to replace „once per day" and „correctable today", so that an afternoon running past midnight is one
collection and a second distribution on the same day is a second.

**Acceptance Criteria:**

- [ ] `src/domain/distribution/attendance.ts` is rewritten around the session:
      `recordForSession(recordsForCustomer, sessionId)`, `canRecord(recordsForCustomer, sessionId)`
      returning `"OK" | AlreadyServedInSession`, and `canCorrect(session)` — a record is amendable
      exactly while **its own** session is running (B-6, B-8).
- [ ] `berlinDayKey` **stays** and keeps its comment: `noShows.ts` still matches attended days against
      calendar distributions until US-36 retires it. Removing it here breaks the no-show count.
- [ ] `src/domain/distribution/counterVerdict.ts`: `CounterInput.weekColour: WeekColour` becomes
      `sessionGroups: SessionGroups`, and `servedToday` becomes `servedInSession`. The precedence is
      otherwise **unchanged** (B-11), including the two orders the module already documents as
      deliberately opposite between the read and the write path.
- [ ] `WRONG_GROUP` carries `{ group: Group; sessionGroups: SessionGroups }`; a session serving both
      groups can never produce it.
- [ ] `ALREADY_SERVED_TODAY` is renamed `ALREADY_SERVED`. The union is exhaustive-switched in the UI,
      so the rename is a compile error everywhere it must be read — that is the mechanism working.
- [ ] Written test-first: `serves a household once per session, however long it runs`,
      `serves the same household again at a second session on the same day`,
      `refuses a household whose group the session does not serve`,
      `serves every household when the session serves both groups`,
      `keeps a record correctable while its session runs`,
      `refuses to correct a record whose session has ended`.
- [ ] Domain coverage stays at 100%.

### US-34.3: The session table, the port and the adapter (schema + infrastructure)

**Description:** As DF, I want a started session to survive a restart and a crash, so that a power
cut in the middle of an afternoon does not lose which group is being served.

**Acceptance Criteria:**

- [ ] New model `DistributionSession` in `prisma/schema.prisma`: `id`, `startedAt DateTime`,
      `endedAt DateTime?`, `discardedAt DateTime?`, `groups String`, `@@index([startedAt])`.
- [ ] **A discarded session is stamped, never deleted** — `discardedAt` is written and every read
      filters it out. The model comment says why in two lines: the project deletes nothing
      (ADR-010), and `WaitingListEntry` already keeps removed rows for exactly this reason. DF get no
      paperwork for a misclick because no **audit entry** is written (A-13), which is a different
      thing from the row not existing.
- [ ] `DistributionRecord` gains `sessionId Int` with `onDelete: Restrict` stated out loud, gains
      `@@unique([customerId, sessionId])` and `@@index([sessionId])`, and **loses `dayKey` and
      `@@unique([customerId, dayKey])`**: once-per-day is not a rule any more, and a column no rule
      reads is one a later reader will take for one.
- [ ] `ReminderLog` gains `sessionId Int` (`onDelete: Restrict`) and `@@unique([customerId,
sessionId])`, and loses `loggedOn`. One reminder per session (B-5), backstopped by the database
      exactly as one per day was.
- [ ] **At most one running session, enforced by the database** (A-5). Prisma cannot express a
      partial unique index, so it is hand-written at the end of the regenerated migration, beside the
      one on `Customer.customerNumber`:
      `CREATE UNIQUE INDEX "one_running_session" ON "DistributionSession" ("startedAt" IS NOT NULL) WHERE "endedAt" IS NULL AND "discardedAt" IS NULL;`
      The indexed expression is constant-by-construction, which is the point: every running row
      collides. If SQLite refuses the expression, the fallback is a nullable `runningMarker Int?`
      column carrying `1` while running and `NULL` otherwise with `@@unique([runningMarker])` —
      documented as a key the constraint needs, in the sense `Customer.firstNameFolded` is one, and
      **not** as a second answer to `endedAt IS NULL`. Whichever is used, an integration test proves
      a second running session is refused.
- [ ] Migrations are **regenerated, not stacked** (pre-release, ADR-009): delete
      `prisma/migrations/`, `npx prisma migrate dev --name init`, then `npm run db:reset`. **Re-add
      by hand** the partial unique index on `Customer.customerNumber` — regenerating drops it and the
      slot rule would then rest on application code alone. `schema.test.ts` catches a miss.
- [ ] New port `DistributionSessionRepository` in `src/application/ports.ts`, documented once, on the
      port:
      `findRunning(): Promise<DistributionSession | null>` · `lastEnded(): Promise<DistributionSession | null>` ·
      `start(groups, at): Promise<DistributionSession>` (throws `DistributionSessionAlreadyRunning`
      when one is already running — the adapter is the final authority, as `create` is for a customer
      number) · `end(id, at)` · `discard(id, at)` · `reopen(id)`.
- [ ] `DistributionRecordRepository.listForDay(dayKey)` becomes `listForSession(sessionId)`;
      `ReminderLogRepository.findOnDay(customerId, loggedOn)` becomes
      `findInSession(customerId, sessionId)`; `ReminderLogEntry.loggedOn` becomes `sessionId`.
      Every hand-written fake in the application tests gains them in this story or the suite does not
      compile.
- [ ] New adapter `src/infrastructure/prisma/distribution-session-repository.ts`; the record and
      reminder adapters follow their ports.
- [ ] Integration tests against a throwaway SQLite file, in the shape of
      `distribution-record-repository.test.ts`: a session round-trips; a second `start` is refused
      while one runs; `discard` hides the row from `findRunning` and `lastEnded`; two hand-outs for
      one customer in one session are refused by the constraint; `listForSession` returns only that
      session's rows.
- [ ] `src/infrastructure/prisma/test-support.ts`'s `clearRegister` deletes the new children first,
      and `tests/e2e/seeding.ts`'s `releaseNumbers` keeps its delete order the schema's relation list.
- [ ] `prisma/seed.ts` seeds **no** session — a register with a session already running would put DF
      in the middle of an afternoon nobody started. `prisma/demo-seed.ts` seeds one ended session with
      a few hand-outs, so the demo build shows the screens with something in them.
- [ ] `npm run build` passes after `npm run db:reset`.

### US-34.4: Starting, discarding, ending and reopening a session (application)

**Description:** As DF, I want the four things I can do to a session to be four small use cases, so
that each one is guarded in the same place its rule lives.

**Acceptance Criteria:**

- [ ] Four files in `src/application/distribution/`, one business action each:
      `start-distribution-session.ts`, `discard-distribution-session.ts`,
      `end-distribution-session.ts`, `reopen-distribution-session.ts`; plus
      `read-distribution-session.ts` answering what the screens need — the running session, the last
      ended one, and `proposeGroups`' proposal for the start form.
- [ ] `startDistributionSession({ groups })` refuses with `DistributionSessionAlreadyRunning` when one
      is running, stamps `startedAt` from the `Clock`, and writes **no audit entry** (A-13).
- [ ] `discardDistributionSession()` refuses with `DistributionSessionNotEmpty` when the running
      session holds a hand-out or a reminder, stamps `discardedAt`, and writes **no audit entry**.
      The counts come from `listForSession` and the reminder store, not from a flag.
- [ ] `endDistributionSession()` refuses with `NoDistributionSessionRunning` when none runs, stamps
      `endedAt`, and returns a `SessionSummary` — `{ households: number; totalPaidCents: Cents }`,
      derived from that session's records (A-11). Nothing about who did **not** turn up is counted or
      returned.
- [ ] Ending writes **one** audit entry (A-13): `what: "distribution.session.ended"`,
      `changedFields: ["startedAt", "endedAt", "groups"]`, `when` the end instant, and `why` the
      machine-written value this log already uses for changes that ask for no reason —
      `startedAt=<ISO>, groups=RED,BLUE, households=87, totalPaid=43500`. A discarded session is
      nowhere in the log, and no session appears in it that began and never ended.
- [ ] `reopenDistributionSession({ reason })` requires a trimmed non-empty reason
      (`MissingAuditReason`), refuses with `DistributionSessionNotReopenable` unless the target is the
      most recently ended session and nothing is running, clears `endedAt`, and writes
      `what: "distribution.session.reopened"` with the reason as `why`. B-6 then applies again.
- [ ] TDD against hand-written fakes (never a mock library); application coverage stays at 100%.
- [ ] Named tests: `refuses a second session while one is running`, `discards a session nobody was
served at`, `refuses to discard a session that served somebody`, `counts what was taken when
the session ends`, `writes one audit entry naming the start and the end`, `writes nothing to
the log when a session is discarded`, `refuses to reopen a session with another one running`,
      `refuses a reopening with no reason`.

### US-34.5: Every hand-out and every reminder belongs to the running session (application)

**Description:** As DF, I want nothing to be recordable outside a session, so that a booking can
never end up belonging to no afternoon.

**Acceptance Criteria:**

- [ ] `recordAttendance` loads the running session first and throws `NoDistributionSessionRunning`
      when there is none (B-1). **The guard order is load-bearing and its comment is updated, not
      deleted:** session → once-per-session (`canRecord`) → eligibility (`evaluateAtCounter` against
      the session's groups) → the payment. Asked in any other order the counter reads the wrong
      sentence back.
- [ ] The record is written with `sessionId`. The price still comes through `describeAllowance` at
      the recording instant (B-13) and the balance is still derived (B-14) — neither changes.
- [ ] `correctAttendance` loads the record's **own** session and refuses with
      `RecordNoLongerCorrectable` unless it is running (B-6, B-8). The error keeps its shape but names
      the session rather than the day. Removing a hand-out makes the household unserved in that
      session again, with no code of its own (B-7): the constraint is `(customerId, sessionId)` and
      the row is gone.
- [ ] `recordReminder` writes `sessionId`, refuses a second reminder in the same session with
      `ReminderAlreadyLoggedInSession`, and refuses outside a session like the hand-out does (B-5).
- [ ] `lookupCustomer` takes the running session, throws `NoDistributionSessionRunning` when there is
      none — the screen will not offer the lookup, and a hand-typed URL is not the screen's to refuse
      — and feeds `sessionGroups` and `servedInSession` to the verdict. `TodaysRecordView` becomes
      `SessionRecordView` and `reminderLoggedToday` becomes `reminderLoggedInSession`; the three money
      figures on it are unchanged.
- [ ] `getWeekColour` is **no longer called by any use case**. It survives for the Start screen until
      US-36; nothing else may call it.
- [ ] Application coverage stays at 100%. Named tests: `refuses a hand-out with no session running`,
      `records against the running session`, `serves a BLUE household at a session serving both
groups`, `turns a RED household away from a BLUE session`, `lets a record be corrected while
its session runs`, `refuses to correct a record whose session has ended`, `allows a household
served yesterday to collect at today's session`.

### US-34.6: The group tally follows the session (application)

**Description:** As DF, I want „87 von 120 Haushalten abgeholt" to count the households this session
serves, so the figure means something on a merged afternoon and on an extra distribution.

**Acceptance Criteria:**

- [ ] `readGroupRoster` takes the running session instead of resolving a week colour: members are the
      `ACTIVE` and `BLOCKED` households whose group **the session serves** (both groups means every
      household), and `servedInSession` comes from `listForSession`.
- [ ] `GroupRosterView.group: WeekColour` becomes `groups: SessionGroups`. The counting rule in
      `groupProgress` is untouched (D-3): a blocked household stays out of the expected count unless
      it has already collected.
- [ ] Free slots and expected counts are read **per group** where both are served, so the screen can
      state „Rot: 43 von 60 · Blau: 44 von 60" rather than one merged fraction — the register's own
      reading, and the one that shows a group falling behind.
- [ ] `readGroupRoster` is not called at all when no session runs; the screen decides that, and the
      use case throws `NoDistributionSessionRunning` if asked anyway.
- [ ] Application coverage stays at 100%; named tests including `covers both groups at a merged
session` and `counts a blocked household that already collected`.

### US-34.7: Starting and ending the session on the distribution screen (presentation)

**Description:** As a DF staff member, I want to start the afternoon with one press and end it with
one, so that the screen says what is happening rather than what the calendar predicted.

**Acceptance Criteria:**

- [ ] `/ausgabe` shows, while a session runs, a **session header** stating that one is running and
      which group(s) it serves (A-8), in the place the week-colour banner stood. **The week-colour
      banner is removed from this screen in this story**: on a Tuesday session it would read „Heute
      ist keine Ausgabe" over a counter serving customers, which is the one plainly false thing the
      screen could say.
- [ ] The group(s) are named in words and wear the same badge the Kundenliste and a customer's record
      wear (`GROUP_STYLES`, `variant="outline"`) — one glyph and one colour mean one thing
      application-wide (`docs/guideline/ui_styling_guide.md` §12).
- [ ] With no session running, the screen offers **„Ausgabe starten"** with a group choice: three
      options — „Rot", „Blau", „Rot und Blau" — as a native radio group, one **preselected** from
      `proposeGroups` and none preselected when there is no session on record (A-3, A-4).
- [ ] Deviating from the proposal asks for nothing: no reason, no confirmation, no sentence
      explaining that it is allowed (A-3, and `ui_styling_guide.md` §8).
- [ ] While a session runs the screen offers **„Ausgabe beenden"**, which **confirms** in a dialog
      naming what is being closed: how many households were served and the total taken (A-11). The
      dialog says **nothing** about households that did not turn up — that is the normal case, not a
      warning.
- [ ] While the running session holds nothing, the screen also offers **„Ausgabe verwerfen"**
      (A-12), which disappears the moment the first hand-out or reminder is recorded. It confirms in
      one dialog and says that nothing will be recorded about it.
- [ ] The group(s) cannot be changed while the session runs (A-9): there is no control for it, and
      nothing on the screen explains its absence.
- [ ] All German strings live in `src/i18n/de.ts` under `distribution.session`; no German literal
      enters a component. `de.distribution.banner.*` and the verdict wording
      `alreadyServedToday: "Heute bereits ausgegeben"` → `alreadyServed: "Bereits ausgegeben"`
      are updated with it.
- [ ] Driven and reviewed with the `playwright-cli` skill — the accessibility snapshot, not a
      screenshot (`ui_styling_guide.md` §11).

### US-34.8: The screen with no session running (presentation)

**Description:** As a DF staff member, I want the distribution screen between afternoons to offer the
start and show me what the last one did, so that I can see at a glance whether I forgot to end it.

**Acceptance Criteria:**

- [ ] With no session running, `/ausgabe` shows the start form (US-34.7) and a **summary of the last
      session**: when it started and ended, which group(s), how many households, the total taken
      (B-10).
- [ ] **The counter lookup is not offered** while no session runs, and neither is the group tally:
      there is nothing to record against. A household can still be looked up through
      `/kunden` at any time (B-10) — the screen does not say so; the nav bar is how DF get there.
- [ ] Beside the last session's summary stands **„Ausgabe wieder öffnen"** (B-9), a closed disclosure
      requiring a reason before it saves, in the shape of the block and archive controls. It is
      offered only for the most recently ended session and only while nothing is running.
- [ ] A `?nummer=` still in someone's history with no session running is **inert**, not an error —
      the same treatment `?datum=` got in US-22.
- [ ] Driven and reviewed with the `playwright-cli` skill.

### US-34.9: A running session on the Start screen (presentation)

**Description:** As a DF staff member, I want a running session to be unmissable on the Start screen,
so that a session forgotten on Thursday evening is noticed on Friday morning.

**Acceptance Criteria:**

- [ ] `/` states a running session prominently (A-7): the group(s) it serves, when it started, and a
      link to `/ausgabe`. It is a panel, not a line: the Start screen has one thing to say when a
      session is running and this is it.
- [ ] With no session running, the Start screen is exactly what it is today — greeting, date, the
      „nächste Ausgabe" line. That line is removed in US-36, not here.
- [ ] Nothing on this panel explains what a session is or what ending one does (`ui_styling_guide.md`
      §8): it states a fact and links to the screen that acts on it.
- [ ] The page stays a plain server component with no client boundary — the panel renders from the
      injected `Clock` and the session repository, and nothing ticks.
- [ ] Driven and reviewed with the `playwright-cli` skill.

### US-34.10: The existing specs run inside a session (e2e)

**Description:** As a developer, I want every spec that serves a household to start a session first,
so the suite proves the new rule rather than being rewritten around it.

**Acceptance Criteria:**

- [ ] New helper `tests/e2e/session.ts`: `startSession(page, groups)` and `endSession(page)`, driving
      the real controls — never writing to the database behind the screen, which would prove nothing
      about the rule the screen is the front of.
- [ ] Every spec that records a hand-out or a reminder opens a session first and ends it after:
      `counter.spec.ts`, `serve.spec.ts`, `balance.spec.ts`, `group-progress.spec.ts`,
      `reminders.spec.ts`, `age-13.spec.ts`, `eggs.spec.ts`, `price-cap.spec.ts`,
      `allowance.spec.ts` and `distribution.spec.ts` as applicable. **Assertions about the week
      colour are replaced by assertions about the session's group(s)**, not deleted.
- [ ] Specs that assumed „today is a RED week" now start a RED session and say so. A spec that needs
      both groups starts one session serving both, which is a thing the suite could not express
      before.
- [ ] `home.spec.ts` keeps its „nächste Ausgabe" assertions (they go in US-36) and gains the running
      session panel.
- [ ] Both engines pass: `npm run test:e2e` and `npm run test:e2e:webkit` (ADR-012). No spec branches
      on `browserName`.

### US-34.11: The session loop, end to end (e2e)

**Description:** As DF, I want the whole afternoon proved in one spec, so that the rules that replaced
the calendar are checked together rather than one at a time.

**Acceptance Criteria:**

- [ ] New `tests/e2e/session.spec.ts` covering, in one page load where the requirement demands it:
  - starting a session preselects the group the last one did not serve, and the staff member may
    deviate;
  - a second session cannot be started while one runs (the control is not offered);
  - a household of the served group collects; a household of the other group is turned away;
  - the same household cannot collect twice in the session, and **can** collect again at a second
    session started the same day;
  - the hand-out is correctable and removable while the session runs; a removed household may be
    recorded afresh;
  - **the group tally on the same page** rises when a hand-out is recorded, without navigating —
    the coupling a suite of per-form tests cannot see;
  - ending confirms with the households served and the total taken, and afterwards the hand-outs
    can no longer be corrected;
  - a session holding nothing can be discarded, and a session holding a hand-out cannot;
  - the last ended session can be reopened with a reason, its hand-outs become correctable again,
    and ending it a second time closes them again;
  - blocking and unblocking a household work while a session runs and after it has ended (B-12).
- [ ] Both engines pass.

### US-34.12: Record ADR-020 and update what it makes wrong (documentation)

**Description:** As the next developer, I want the reason the calendar stopped deciding written down
once, so that nobody re-derives it from the code.

**Acceptance Criteria:**

- [ ] **ADR-020** via the `record-adr` skill: _„The distribution session, not the calendar, is what a
      hand-out belongs to"_. Context: merged groups, cancelled weeks and extra distributions make the
      calendar a poor model of what happened; four rules hung off it. Decision: a session is started
      and ended by hand, at most one runs, it names the group(s) it serves, and every hand-out and
      reminder belongs to exactly one. Consequences: „once per day" and the same-day correction window
      go; a session may run past midnight; the week anchor and the distribution weekday have no reader
      left and are removed in US-36; a session ended by mistake is reopened rather than edited; a
      discarded session is stamped rather than deleted, because ADR-010 holds.
- [ ] It **supersedes nothing formally** but makes `tasks/prd-us-03-week-colour.md` and
      `tasks/prd-us-05-record-attendance.md` partly wrong. Each gains a dated note at the top naming
      this PRD — as batch 21 did for the withdrawn week-colour lookup. Do not rewrite their bodies.
- [ ] arc42 chapters updated in the same PR, driven with the `arc42` skill: **05** (the new domain
      module, the four use cases, the new adapter), **06** (the counter's runtime scenario, whose
      documented guard order changes), **08** (the „same day" concept and where time enters), **09**
      (the ADR-020 row), **12** (glossary: _Ausgabetermin_, _laufende Ausgabe_; _Wochenfarbe_ is
      marked as on its way out, not yet removed).
- [ ] `docs/handout/betriebsanleitung.md` gains a section, in German and printable, on starting and
      ending an Ausgabe: what the group choice means, that a session must be ended, that a forgotten
      one shows on the Start screen, that a mistake is discarded while empty and reopened afterwards.
- [ ] Root `CLAUDE.md`'s „Don't skip the audit entry on a state change" list gains ending and
      reopening a session; nothing else in it changes in this batch.
- [ ] `npm run arc42:check` passes (the ADR is in the chapter 9 log, statuses agree, no dead links).

## Functional requirements

- **FR-1** (A-1, A-2): A session is started by a staff member, who chooses the group(s) it serves:
  `RED`, `BLUE` or both.
- **FR-2** (A-3, A-4): One choice is preselected, derived from the last session that took place — the
  group that was not up then, both when both were, nothing when there is no session on record.
  Deviating requires no reason and produces no warning.
- **FR-3** (A-5, A-6): At most one session runs at a time, application-wide and identically on every
  workstation. The database refuses a second.
- **FR-4** (A-9): The group(s) of a running session cannot be changed.
- **FR-5** (A-10): Only a human ends a session. Nothing ends one at midnight, after a timeout, or
  when the next is started.
- **FR-6** (A-11): Ending is confirmed with the number of households served and the total taken.
  Absent households are not reported.
- **FR-7** (A-12): A running session holding no hand-out and no reminder may be discarded. It leaves
  no audit entry and is invisible to every later read.
- **FR-8** (A-13): Ending writes exactly one audit entry, carrying the start, the end and the
  group(s). A session that has not ended is nowhere in the log.
- **FR-9** (A-7, A-8): A running session is stated on the distribution screen and prominently on the
  Start screen.
- **FR-10** (B-1): A hand-out can be recorded only while a session is running.
- **FR-11** (B-2): A household is eligible when its group is among the running session's; with both,
  every household is.
- **FR-12** (B-3): Every hand-out belongs permanently to exactly one session.
- **FR-13** (B-4, B-5): A household receives food at most once per session, and at most one
  certificate reminder per session.
- **FR-14** (B-6, B-7): Hand-outs, their payments and their reminders stay editable and removable
  until the session is ended. A removed hand-out makes the household unserved in that session again.
- **FR-15** (B-8): Ending freezes the session's hand-outs against editing.
- **FR-16** (B-9): The most recently ended session may be reopened while none is running, with a
  reason, written to the audit log; FR-14 then applies again. Older sessions stay locked for good.
- **FR-17** (B-10): With no session running, the distribution screen shows the start control and the
  last session's summary, and offers no lookup.
- **FR-18** (B-11): Every other reason to refuse or annotate a hand-out keeps its precedence:
  unknown number, archived, blocked, wrong group, outdated card, already served, expired certificate
  (serve and remind, never refuse).
- **FR-19** (B-12): Blocking, unblocking, archiving, master data, card issues and number changes are
  not hand-outs: they stay available while a session runs and are not locked when it ends.
- **FR-20** (B-13, B-14): A hand-out's price follows the policy in force when it is recorded; the
  household's balance stays derived and is stored nowhere.
- **FR-21** (D-3): The group tally counts the running session's group(s), per group when both are
  served, with the existing counting rule unchanged.

## Non-goals

- No scheduling, announcing or reminding of an upcoming session.
- No marking of extra distributions — a Sonderausgabe is an ordinary session (D-5).
- No list of absent households and no activity list anywhere (C-6).
- No session overview or detail view: that is US-37.
- No capture of the household's state as it stood: that is US-35, and it **must follow immediately**.
- No change to the no-show count or to the settings screen: that is US-36.
- No recording of quantities, goods or donations; no cash handling beyond the amount paid.
- No login, and therefore still no „who" in the audit log.
- No representation of the calling blocks („jetzt 1 bis 30").

## Technical considerations

- **Build order is inside-out** and stories 1–6 must land before any screen story: the domain, then
  the schema and the port, then the use cases, then the screens, then the specs, then the documents.
- **This batch regenerates `prisma/migrations/`** — the ninth to do so. The hand-written partial
  unique index on `Customer.customerNumber` must be re-added, and a second hand-written index arrives
  beside it (US-34.3). `schema.test.ts` is what catches a miss.
- **Two port methods change name and shape** (`listForDay` → `listForSession`, `findOnDay` →
  `findInSession`), so every hand-written fake in `src/application/**/*.test.ts` gains them in the
  story that introduces them or nothing compiles.
- **The e2e suite is the largest hidden cost.** Ten specs record a hand-out, and every one of them
  needs a session started first. That is why US-34.10 is a story of its own and not a line in
  US-34.11.
- **`getWeekColour` survives this batch with one caller** — the Start screen's „nächste Ausgabe" line.
  A story that finds itself deleting `weekColour.ts` has picked up US-36's work.

## Open questions

Nothing is open in the requirements (§6). Two things are deliberately decided **on the finished
screen** rather than here:

- **How a running session appears on the Start screen** (A-7). „Prominent" is an effect, not a design
  instruction.
- **Where the end and discard controls sit on `/ausgabe`** so that neither is ever pressed by
  accident while the queue is moving — and neither is a prompt the queue has to dismiss.
