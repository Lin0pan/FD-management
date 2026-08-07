# Per-PRD Ralph batches

One `prd.json` per PRD from [`tasks/`](../../../tasks/), numbered in **build order** (not by user-story
number). Each file is a complete, self-contained Ralph run: its own `branchName`, its own story IDs
starting at `US-001`, its own priorities `1..n`.

[`../prd.json`](../prd.json) is what Ralph actually reads; these files are the batches you copy over
it. It currently holds **batch 22**, the next one to run. `done/` holds the finished copy of each
batch that has run — the same file with every story's `passes` flipped to `true`.

## Workflow

```bash
cp scripts/ralph/prds/01-us-14-configure-business-rules.json scripts/ralph/prd.json
./scripts/ralph/ralph.sh --tool claude 8        # stories + a little slack

# review, then land it
gh pr create --fill && gh pr merge --squash --auto

# once merged, the next batch:
cp scripts/ralph/prds/02-us-01-register-customer.json scripts/ralph/prd.json
./scripts/ralph/ralph.sh --tool claude 10
```

**Archive the finished batch by hand, before you overwrite `prd.json`.** `ralph.sh` will do it for
you when it notices `branchName` differs from `.last-branch` — but it writes the archive folder under
the name of the batch that just _finished_ while copying in whatever `prd.json` holds at that moment,
which by then is the batch about to _start_ (`ralph.sh` lines 47–57). Left to itself it produces a
folder with the right `progress.txt` and the wrong `prd.json`. So do all five steps yourself, and
point `.last-branch` at the new batch so `ralph.sh` finds nothing to archive:

```bash
# 1. the only record of which stories actually passed
cp scripts/ralph/prd.json scripts/ralph/prds/done/21-us-22-drop-week-colour-lookup.json
# 2. the run's notes, under the finished batch's name, with its own prd.json
mkdir -p scripts/ralph/archive/2026-08-01-us-22-drop-week-colour-lookup
cp scripts/ralph/prd.json scripts/ralph/progress.txt \
   scripts/ralph/archive/2026-08-01-us-22-drop-week-colour-lookup/
# 3. reset progress.txt — see point 2 below about carrying the patterns block over
# 4. load the next batch
cp scripts/ralph/prds/22-us-21-step-through-group.json scripts/ralph/prd.json
# 5. so ralph.sh does not re-archive under the wrong name
echo "ralph/us-21-step-through-group" > scripts/ralph/.last-branch
```

`prd.json` has to be on `main` before the run starts — `scripts/ralph/CLAUDE.md` step 4 cuts the
branch from `main` — so this preparation lands through its own small PR, not on the run's branch.

## Four things to get right

**1. Merge before starting the next batch.** `scripts/ralph/CLAUDE.md` step 4 creates the branch
_from `main`_. If the previous PR is not merged, the new branch will not contain the previous batch's
work — US-01 would build against a schema that does not exist. This is the rule that will actually
bite; the rest are cheaper to recover from.

**2. `progress.txt` is reset on every archive**, including the `## Codebase Patterns` section that
Ralph accumulates. Across 16 batches that memory was wiped 16 times. **Carry the patterns block over
into the fresh `progress.txt`** when you reset it in step 3 above — it is the cheapest way to keep
the tooling gotchas (which server reads which database, why `pkill -f next-server` kills the shell)
from being rediscovered every batch. Drop or reword a bullet that only made sense inside the batch
that wrote it. The durable channel is still the CLAUDE.md files (step 8 of the agent instructions):
patterns about a layer belong in `src/domain/CLAUDE.md`, `src/application/CLAUDE.md` and friends, not
only in `progress.txt`.

**3. Two stories were rehomed** because they cross PRD boundaries and only worked while everything
was in one file:

- The **customer detail page shell** (`/kunden/[id]`) belongs to the US-16 PRD but is the first story
  of batch **09 (US-08)**, because block, reissue and archive all attach their actions to it. Batch 16
  extends that page rather than creating it.
- The **portions/price display** stories belong to the US-07 PRD but run at the end of batch
  **06 (US-04)**, because they render onto the counter screen. Batch 05 is therefore domain and
  application only.

**4. Sizing the iteration count.** Pass roughly `stories + 3`. A batch that runs out of iterations is
harmless — rerun it and Ralph picks up the first story still marked `passes: false`.

## Batches

| #   | File                                         | Stories | Branch                                     |
| --- | -------------------------------------------- | ------- | ------------------------------------------ |
| 01  | `01-us-14-configure-business-rules.json`     | 5       | `ralph/us-14-configure-business-rules`     |
| 02  | `02-us-01-register-customer.json`            | 7       | `ralph/us-01-register-customer`            |
| 03  | `03-us-02-issue-customer-card.json`          | 5       | `ralph/us-02-issue-customer-card`          |
| 04  | `04-us-03-week-colour.json`                  | 5       | `ralph/us-03-week-colour`                  |
| 05  | `05-us-07-portions-and-price.json`           | 3       | `ralph/us-07-portions-and-price`           |
| 06  | `06-us-04-lookup-customer.json`              | 7       | `ralph/us-04-lookup-customer`              |
| 07  | `07-us-05-record-attendance.json`            | 5       | `ralph/us-05-record-attendance`            |
| 08  | `08-us-06-certificate-reminder.json`         | 5       | `ralph/us-06-certificate-reminder`         |
| 09  | `09-us-08-block-unblock-customer.json`       | 6       | `ralph/us-08-block-unblock-customer`       |
| 10  | `10-us-09-reissue-card-after-loss.json`      | 4       | `ralph/us-09-reissue-card-after-loss`      |
| 11  | `11-us-10-archive-customer.json`             | 5       | `ralph/us-10-archive-customer`             |
| 12  | `12-us-13-age-13-reclassification.json`      | 5       | `ralph/us-13-age-13-reclassification`      |
| 13  | `13-us-11-reuse-archived-record.json`        | 5       | `ralph/us-11-reuse-archived-record`        |
| 14  | `14-us-12-waiting-list.json`                 | 5       | `ralph/us-12-waiting-list`                 |
| 15  | `15-us-15-customer-list.json`                | 4       | `ralph/us-15-customer-list`                |
| 16  | `16-us-16-maintain-customer-record.json`     | 5       | `ralph/us-16-maintain-customer-record`     |
| 17  | `17-us-17-navigation-shell.json`             | 6       | `ralph/us-17-navigation-shell`             |
| 18  | `18-us-18-waiting-list-signals.json`         | 4       | `ralph/us-18-waiting-list-signals`         |
| 19  | `19-us-19-fold-archive-search.json`          | 3       | `ralph/us-19-fold-archive-search`          |
| 20  | `20-us-20-fold-group-choice.json`            | 3       | `ralph/us-20-fold-group-choice`            |
| 21  | `21-us-22-drop-week-colour-lookup.json`      | 4       | `ralph/us-22-drop-week-colour-lookup`      |
| 22  | `22-us-21-step-through-group.json`           | 4       | `ralph/us-21-step-through-group`           |
| 23  | `23-us-23-group-progress.json`               | 5       | `ralph/us-23-group-progress`               |
| 24  | `24-us-24-choose-customer-number.json`       | 5       | `ralph/us-24-choose-customer-number`       |
| 25  | `25-us-25-globally-unique-card-numbers.json` | 7       | `ralph/us-25-globally-unique-card-numbers` |
| 26  | `26-us-26-price-cap.json`                    | 7       | `ralph/us-26-price-cap`                    |

129 stories total — the rows sum to it. Every story cites its source PRD section in its
`description`, so an iteration can read the full context when a criterion is ambiguous.

Batches 01–16 are the MVP user stories from `docs/user_stories_mvp.md`. **Batches 17 onwards are not
among them** — 17 is a structural change to how the finished screens are reached, 18 re-places the
waiting-list signals it introduced, and 19 and 20 finish the `/kunden/neu` restyle, so they run after
the MVP rather than in build order with it. Those four touch only `src/app/**`, `src/i18n/de.ts` and
`tests/e2e/**`. If an iteration of any of them finds itself editing `src/domain` or
`src/application`, it has misread the story.

**Batches 21 to 23 are the three changes FD asked for after using the counter**, and they are the
first post-MVP batches that are _not_ presentation-only:

- **21 (US-22)** removes the week-colour date lookup from `/ausgabe` — a **withdrawn requirement**,
  so it edits `docs/user_stories_mvp.md` and `tasks/prd-us-03-week-colour.md` as well as the screen.
  Presentation, e2e and docs only.
- **22 (US-21)** adds Zurück/Weiter, walking today's group by customer number. Domain + application +
  presentation + e2e; **no schema change and no new port method**.
- **23 (US-23)** adds the "x von y abgeholt" tally and the group list behind it. Domain +
  **one new port method** (`listForDay`) + application + presentation + e2e; still no schema change.

**Batch 24 (US-24)** is the fourth post-counter change FD asked for: the registration screen stops
handing out the lowest free customer number as a read-only figure and offers the whole free pool as a
dropdown, still preselected to the lowest. Domain + application + presentation + e2e; **no schema
change and no new port method** — `takenActiveNumbers()` already answers the query. It touches
`src/app/kunden/neu/**` and `src/i18n/de.ts`, so it shares no file with 21–23 and can follow them in
any order.

**Batch 25 (US-25)** is a correction rather than a feature, and it is the only post-MVP batch with a
**schema change**. A customer number is a slot an archived household releases, so the card number
built from it repeats: Customer1 archived on slot 66 leaves `66k1` on a card nobody collected, and
Customer2 registering on slot 66 is handed `66k1` again — the counter answers „Ausgabe frei" to a
former household's card. US-25 makes a card index count the **slot's** whole run instead of the
record's, so Customer2 starts at `66k2` and the existing `OUTDATED_CARD` verdict does the rest.
Domain + schema + infrastructure + application + one German string + e2e + docs. It **must run after
24**, which is what made choosing a reused number easy in the first place.

Two things about 25 that no earlier batch has needed: it **regenerates `prisma/migrations/`** (FD hold
no real data, so history is disposable — CLAUDE.md), which drops the hand-written partial unique index
on `Customer.customerNumber` unless US-002 puts it back; and it adds a **new port method**
(`highestIndexForNumber`), so every hand-written fake `CardRepository` in the application tests has to
gain it before the suite compiles.

**Batch 26 (US-26)** is a new requirement rather than a correction: FD caps what any one household
pays for a distribution at a **Maximalpreis** — 5,00 € today — which the software has never known
about, so it quotes 11,00 € for four grown-ups and three children where FD collects 5,00 €. The
behavioural change is one line in `priceFor`, because every screen that shows a price already derives
it there; the other six stories exist because the cap must be **configurable, versioned and
auditable** like every other policy value. Domain + schema + infrastructure + application-free
(no use case changes at all) + settings screen + e2e + docs.

Its seven stories group the PRD's nine: `§US-26.1` and `§US-26.2` are one story because adding a
required field to `Settings` breaks the repository, the seed, the server action and every test fake
at once, and there is no reason to pay that twice; `§US-26.5` and `§US-26.6` are one because they are
one screen, one dictionary edit and one browser session; and `§US-26.7` — whose code the typecheck
already forces into story 1 — is checked inside the e2e story that registers the household it needs.

Three things about 26 to hold on to. It is the **second batch with a schema change** and regenerates
`prisma/migrations/` for the same reason 25 did — so the hand-written partial unique index on
`Customer.customerNumber` has to be re-added, this time by US-004. The cap is `Cents | null` and an
**empty field means no cap**, which is a different claim from a cap of `0,00 €` (free for everyone);
`formatEuroAmount(0)` is `0,00`, so the renderer branches on `null` before formatting and the e2e
spec asserts the empty field precisely because losing that branch would be silent. And it adds a
member to the `SettingsChange` union, whose `switch` in `src/app/einstellungen/page.tsx` is
exhaustive — the build fails until US-003 handles the new case, which is the mechanism working.

Batches 21 to 23 all edit `src/app/ausgabe/page.tsx`, so the "merge before starting the next batch"
rule is load-bearing here for the same reason it was for 19 and 20. **Run them in this order**: 21 frees the
vertical space, 22 creates `read-group-roster.ts`, and 23 extends that same file rather than adding a
second use case that would load the group a second time.

**19 and 20 are the only batches that edit an existing spec**, and they are the reason the "merge
before starting the next batch" rule matters more than usual here: both change
`tests/e2e/reregistration.spec.ts`, so starting 20 before 19 has merged gives 20 a branch cut from a
`main` that does not have 19's edit, and the two will conflict. `docs/ui_redesign_kunden_neu.md` §12
records why the edits are needed — Playwright cannot reach a control inside a closed `<details>`.

## Regenerating

These files are derived from `../prd.json` by grouping on the cited source PRD. If you edit the
combined file, re-split it rather than hand-editing both — and keep the two rehomed stories in mind,
since they are the only places the grouping is not purely mechanical.
