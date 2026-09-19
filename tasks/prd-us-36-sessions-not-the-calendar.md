# PRD: The derived rules follow sessions, not the calendar (US-36)

> Source: `local_only/manually-start-ausgabe/refined-requirements.md`, requirement **D** —
> `[DF F-2]`, `[DF F-3]`, `[DF G-5]` and `[§1.1]`, `[§1.2]`. D-3 (the group tally) shipped with
> US-34; D-4, D-5 and D-6 require no code and are stated here as functional requirements so that a
> later reader finds them decided rather than open.
>
> The requirements' order of work puts this **immediately after the core** (§4): D-1 and D-2 correct
> and remove behaviour that exists today, and every week it stays produces a false no-show count.

## Introduction

After US-34 and US-35, two things still read the calendar.

**The no-show count.** „How many of their own distributions has this household missed in a row" is
counted by walking backwards through the calendar a fortnight at a time, asking the week anchor which
colour each week carried and the attendance history whether the household came. Every cancelled week
in that walk is counted as a miss nobody made. The count now walks **sessions that actually took
place** instead, which is the figure DF thought they were reading all along.

**The settings screen.** It still holds a week anchor („KW 02/2026 war Rot") and a distribution
weekday. After US-34 nothing reads the weekday at all, and the anchor is read by exactly one line on
the Start screen. Both are removed without replacement (D-2): a settings value with no effect is one
that eventually gets maintained wrongly, and a screen that predicts „die nächste Ausgabe ist am
Donnerstag (Rot)" is making a promise the software no longer has any way to keep.

So the software stops predicting when the next distribution is and what colour a week carries. It
knows what happened and what is happening, and that is all it claims.

What goes with the anchor is a satisfying amount of code: `weekColour.ts`'s ISO-week arithmetic,
`distributionDay.ts`, `get-week-colour.ts`, three settings columns, two form controls, two variants
of the settings-history union, and `berlinDayKey`, whose last caller was the no-show walk. What stays
is `startOfUtcDay`, which the certificate comparison needs and which belongs beside the other
calendar-day helpers rather than in a module about a cycle that no longer exists.

## Goals

- A no-show is a session the household's group was served at, that they did not collect at — not a
  week the calendar says was theirs.
- A cancelled distribution produces no no-shows, and a merged one produces them for both groups.
- The week anchor and the distribution weekday leave the settings screen, the schema and the domain.
- No screen predicts a future distribution or names a week's colour.
- A household's group is still derived from its customer number and still shown everywhere it is
  shown today.

## User stories

### US-36.1: A no-show is a session that was missed (domain)

**Description:** As DF, I want the no-show figure to count the afternoons that actually happened, so
that the number beside a household means what I think it means.

**Acceptance Criteria:**

- [ ] `src/domain/distribution/noShows.ts` is rewritten around sessions. Its input becomes
      `{ sessions, attendedSessionIds, customerGroup, registeredOn }` — no settings, no weekday, no
      anchor, no clock.
- [ ] A session counts against a household when **all four** hold (D-1): it has **ended**; its groups
      include the household's group; it **started after** the household joined the register; and it
      holds no hand-out for that household. The running session never counts.
- [ ] `consecutiveNoShows` walks the ended sessions newest first and stops at the first one the
      household collected at, or at their registration. `0` still means both „came last time" and
      „has not seen a session yet" — the same thing as far as archiving goes.
- [ ] A **discarded** session is never in the input at all: the store filters it out, so the rule does
      not have to know the state exists.
- [ ] The module's comment keeps the two things it already says and that stay true — the figure is
      **display only**, no threshold lives here and nothing automatic follows from any value; and a
      **block is deliberately not excluded**. It drops the three calendar boundaries, which the four
      conditions above replace, and it does not narrate that it used to count weeks.
- [ ] `berlinDayKey` and the Berlin-day matching leave `attendance.ts` with their last caller. Check
      with `grep -rn berlinDayKey src/ tests/` that nothing is left.
- [ ] Written test-first, one named test per rule:
  - `counts a session the household's group was served at and they missed`
  - `does not count a session that served only the other group`
  - `counts a session that served both groups`
  - `does not count the session that is still running`
  - `does not count a session that started before the household joined`
  - `stops counting at the last session they collected at`
  - `answers zero for a household that has not seen a session yet`
- [ ] Domain coverage stays at 100%.

### US-36.2: Counting no-shows reads the ended sessions (application)

**Description:** As a developer, I want the seam that both screens read to load the sessions rather
than the settings, so the rule has nothing left to resolve a policy for.

**Acceptance Criteria:**

- [ ] `DistributionSessionRepository` gains `listEnded(): Promise<ReadonlyArray<DistributionSession>>`
      — every ended, non-discarded session, **most recent first**, ordering being the adapter's job.
      At one distribution a week this is a few hundred rows over the software's whole life, which is
      why there is no narrower query and the port says so in one line.
- [ ] `countNoShows` takes the sessions and the household's attended session ids instead of resolving
      settings at a date. Its `SettingsRepository` dependency goes.
- [ ] `lookupCustomer` and the customer record pass the ids off the records they already load — no
      second query (US-04.3 still holds).
- [ ] Application coverage stays at 100%; a named test proves a cancelled week produces no no-show,
      which is the bug this story exists to fix.

### US-36.3: The week anchor and the distribution weekday leave the domain (domain)

**Description:** As a developer, I want the alternation arithmetic gone rather than unused, so that
nobody finds a working week-colour function and starts calling it again.

**Acceptance Criteria:**

- [ ] `Settings` loses `weekAnchor` and `distributionWeekday`; `createSettings` loses their
      validation; `WeekAnchor`, `IsoWeekday` and `WeekColour` are deleted. `Group` in
      `src/domain/customer/group.ts` is the only type for the two halves from now on, and its comment
      — which currently explains why `Group` and `WeekColour` are deliberately different types —
      loses that paragraph rather than keeping an argument about a type that no longer exists.
- [ ] `src/domain/distribution/weekColour.ts` and `src/domain/distribution/distributionDay.ts` are
      **deleted**. `startOfUtcDay` moves to `src/domain/calendarDay.ts`, which is where a helper about
      calendar days belongs; `isoWeekdayOf`, `isoWeekOf`, `colourOf` and the ISO-week parsing go with
      the files.
- [ ] `settings-diff.ts` loses the `weekAnchorIsoWeek`, `weekAnchorColour` and `distributionWeekday`
      variants of `SettingsChange`. The union is switched exhaustively on the settings screen, so
      every removal is a compile error until the screen is updated — that is the mechanism working.
- [ ] `InvalidSettings` keeps its shape; only the fields it can name shrink.
- [ ] Every affected test is updated rather than deleted where the rule survives; `weekColour.test.ts`
      and `distributionDay.test.ts` go with their modules.
- [ ] Domain coverage stays at 100%.

### US-36.4: The three columns leave the schema and the settings (schema + infrastructure + application)

**Description:** As DF, I want the two values I can no longer act on to disappear from the settings,
so that I am not maintaining a rhythm the software does not use.

**Acceptance Criteria:**

- [ ] `SettingsVersion` loses `weekAnchorIsoWeek`, `weekAnchorColour` and `distributionWeekday`.
      Migrations regenerated, not stacked (ADR-009); **re-add by hand** the partial unique index on
      `Customer.customerNumber` and the one-running-session index from US-34.3; `npm run db:reset`.
- [ ] `settings-repository.ts`, `prisma/seed.ts` and `prisma/demo-seed.ts` stop writing them. The seed
      stays idempotent.
- [ ] `updateSettings` and `readCurrentSettings` follow; `src/application/distribution/
get-week-colour.ts` is **deleted** along with its tests.
- [ ] `tasks/README.md`'s seed table loses the „Week-cycle anchor" and „Distribution weekday" rows.
- [ ] Integration and application suites pass; coverage stays at 100% on the two pure layers.

### US-36.5: The screens stop predicting (presentation)

**Description:** As a DF staff member, I want the screens to tell me what is happening rather than
what the calendar thinks will happen, so that nothing on screen can be wrong about next Thursday.

**Acceptance Criteria:**

- [ ] `/einstellungen` loses the week-anchor and weekday controls, and the Änderungsverlauf loses
      their three change kinds. The remaining grid is re-spanned so nothing is left with a hole in it
      — the same tidy-up US-27 did when the portion allowance left.
- [ ] `/` loses the „Die nächste Ausgabe findet am … statt (Rot)" line and the „Heute ist Ausgabetag"
      line with it (D-2). What is left: the greeting, the date, and — when one is running — the
      running-session panel from US-34.9. `de.home.distribution.*` goes with them, except
      `notConfigured`, which still has quota and prices to be missing.
- [ ] `/ausgabe` has no reference to a week or a weekday left. Check with
      `grep -rniE "wochenfarbe|weekcolour|weekanchor|distributionweekday|nächste ausgabe" src/` that
      nothing survives — a leftover string is the failure mode here, exactly as a surviving `Stat` was
      in US-27.
- [ ] No hint is written explaining that the rhythm is no longer configured
      (`docs/guideline/ui_styling_guide.md` §8): a control that is gone needs no epitaph.
- [ ] Driven and reviewed with the `playwright-cli` skill.

### US-36.6: The suite stops asserting a colour it cannot know (e2e)

**Description:** As a developer, I want the specs to prove the new rule, so that a no-show count is
checked against sessions rather than against a pinned clock.

**Acceptance Criteria:**

- [ ] `settings.spec.ts` loses the anchor and weekday assertions and keeps everything else;
      `home.spec.ts` loses the next-distribution assertions and keeps the date, the greeting and the
      running-session panel.
- [ ] A spec proves the no-show count over sessions: a household misses two sessions of its own group
      and reads `2`; a session serving only the other group in between changes nothing; a session
      that is still running is not counted.
- [ ] Both engines pass: `npm run test:e2e` and `npm run test:e2e:webkit`.

### US-36.7: The documents stop describing a cycle (documentation)

**Description:** As the next developer, I want the withdrawn requirement recorded where it was
written, so that the week colour is not re-implemented from a document that still asks for it.

**Acceptance Criteria:**

- [ ] `tasks/prd-us-03-week-colour.md` is marked **withdrawn** at the top, dated, naming US-34 and
      this PRD — the treatment batch 21 gave the withdrawn week-colour lookup. Its body is not
      rewritten. `docs/archiv/user_stories_mvp.md`'s US-03 gets the same one-line note; the archive is
      not otherwise edited.
- [ ] arc42 updated with the `arc42` skill: **08** (the week-colour concept and the „same calendar
      day" notion both go; what replaces them is the session), **05** (the deleted modules and use
      case), **12** (glossary: _Wochenfarbe_, _Ausgabetag_ removed or marked historical), **11** if a
      risk row mentioned the anchor. ADR-020's consequences already predicted this removal, so
      **no new ADR is written** — a story that writes one has misread the batch.
- [ ] `docs/handout/betriebsanleitung.md`: the settings section stops describing the two values, and
      the section on Fehlzeiten says what the figure now counts.
- [ ] `npm run arc42:check` passes.

## Functional requirements

- **FR-1** (D-1): A no-show is an **ended** session whose groups include the household's, that
  started after the household joined the register, and that holds no hand-out for them. The running
  session never counts.
- **FR-2** (D-1): The figure is display only. No threshold, no automatic archive, nothing derived
  from any value — unchanged.
- **FR-3** (D-1, G-2): The figure is nowhere readable case by case, the detail view not listing the
  absent. DF accept this.
- **FR-4** (D-2, F-2): The week anchor and the distribution weekday are removed from settings, the
  schema and the domain, without replacement.
- **FR-5** (D-2): No screen states what colour a week carries or when the next distribution is.
- **FR-6** (D-3): The group tally refers to the running session's group(s) — already shipped in
  US-34, restated here so the requirement is traceable.
- **FR-7** (D-4, §1.1): Merging the groups is not a state in the software. It is the repeated choice
  of both groups at the start of a session, tied to no threshold of active customers, and it is DF's
  decision alone.
- **FR-8** (D-5, F-6, G-5): An extra distribution is an ordinary session. Marking one is out of
  scope, and DF knowingly accept the two consequences: the cycle proposal offers both groups again
  after an extra distribution that served both, and whoever missed an extra distribution collects a
  no-show without having missed a regular one.
- **FR-9** (D-6): A household's group is still `groupOf(customerNumber)` (ADR-017) and is shown
  everywhere it is shown today. Only the statement „this week is RED" disappears.

## Non-goals

- No replacement for the anchor: nothing predicts, schedules or announces a distribution (§3).
- No marking of extra distributions.
- No excluding of blocked periods from the no-show count — that would hide the pattern the count
  exists to show and needs a block history the record does not keep.
- No reporting across sessions beyond the no-show count.
- No change to how a household's group is decided.

## Technical considerations

- **The order within the batch is outside-in for the removal half and inside-out for the rule half:**
  the no-show rule is rebuilt first (1, 2), then the anchor is taken out of the domain (3), the schema
  (4) and the screens (5). Built the other way round, story 3 would break every caller at once.
- **This is the eleventh batch to regenerate `prisma/migrations/`**, and the second that has two
  hand-written indexes to put back.
- **The exhaustive `switch` on `SettingsChange` is the safety net** for story 3: the build fails until
  the settings screen stops rendering the three removed kinds.
- **The failure mode of a removal is a survivor** — a dictionary key, a comment, a test helper, a
  `Stat`. Story 5 makes the `grep` an acceptance criterion for exactly that reason, as US-27 did.

## Open questions

None. One consequence is worth watching after DF's first real sessions (§6 of the requirements): D-5
knowingly accepts two inaccuracies while extra distributions go unmarked, and neither will be felt
until the first one happens.
