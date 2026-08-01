# Per-PRD Ralph batches

One `prd.json` per PRD from [`tasks/`](../../../tasks/), numbered in **build order** (not by user-story
number). Each file is a complete, self-contained Ralph run: its own `branchName`, its own story IDs
starting at `US-001`, its own priorities `1..n`.

[`../prd.json`](../prd.json) is what Ralph actually reads; these files are the batches you copy over
it. It currently holds **batch 20**, the last one. `done/` holds the finished copy of each batch that
has run — the same file with every story's `passes` flipped to `true`.

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

`ralph.sh` archives the finished run to `archive/YYYY-MM-DD-<feature>/` by itself, because the
`branchName` changed since `.last-branch` was written.

**Copy the finished `prd.json` into `done/` before you overwrite it.** The archive `ralph.sh` writes
is named after the branch in `.last-branch` — the batch that just _finished_ — but the `prd.json` it
copies in is whatever the file holds at that moment, which by then is the batch about to _start_
(`ralph.sh` lines 47–57). So the archive folder ends up with the right `progress.txt` and the wrong
`prd.json`. `done/<n>-<feature>.json` is therefore the only record of which stories actually passed,
and it has to be written by hand, before the `cp`:

```bash
cp scripts/ralph/prd.json scripts/ralph/prds/done/19-us-19-fold-archive-search.json
cp scripts/ralph/prds/20-us-20-fold-group-choice.json scripts/ralph/prd.json
```

Leave `.last-branch` alone while you do it: it still names the finished batch, which is exactly what
makes the next run archive that run's `progress.txt` under the right name.

## Four things to get right

**1. Merge before starting the next batch.** `scripts/ralph/CLAUDE.md` step 4 creates the branch
_from `main`_. If the previous PR is not merged, the new branch will not contain the previous batch's
work — US-01 would build against a schema that does not exist. This is the rule that will actually
bite; the rest are cheaper to recover from.

**2. `progress.txt` is reset on every archive**, including the `## Codebase Patterns` section that
Ralph accumulates. Across 16 batches that memory is wiped 16 times. The durable channel is CLAUDE.md
files (step 8 of the agent instructions) — make sure patterns land in `src/domain/CLAUDE.md`,
`src/application/CLAUDE.md` and friends, not only in `progress.txt`. Alternatively, paste the
patterns block into the fresh `progress.txt` before each run.

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

| #   | File                                     | Stories | Branch                                 |
| --- | ---------------------------------------- | ------- | -------------------------------------- |
| 01  | `01-us-14-configure-business-rules.json` | 5       | `ralph/us-14-configure-business-rules` |
| 02  | `02-us-01-register-customer.json`        | 7       | `ralph/us-01-register-customer`        |
| 03  | `03-us-02-issue-customer-card.json`      | 5       | `ralph/us-02-issue-customer-card`      |
| 04  | `04-us-03-week-colour.json`              | 5       | `ralph/us-03-week-colour`              |
| 05  | `05-us-07-portions-and-price.json`       | 3       | `ralph/us-07-portions-and-price`       |
| 06  | `06-us-04-lookup-customer.json`          | 7       | `ralph/us-04-lookup-customer`          |
| 07  | `07-us-05-record-attendance.json`        | 5       | `ralph/us-05-record-attendance`        |
| 08  | `08-us-06-certificate-reminder.json`     | 5       | `ralph/us-06-certificate-reminder`     |
| 09  | `09-us-08-block-unblock-customer.json`   | 6       | `ralph/us-08-block-unblock-customer`   |
| 10  | `10-us-09-reissue-card-after-loss.json`  | 4       | `ralph/us-09-reissue-card-after-loss`  |
| 11  | `11-us-10-archive-customer.json`         | 5       | `ralph/us-10-archive-customer`         |
| 12  | `12-us-13-age-13-reclassification.json`  | 5       | `ralph/us-13-age-13-reclassification`  |
| 13  | `13-us-11-reuse-archived-record.json`    | 5       | `ralph/us-11-reuse-archived-record`    |
| 14  | `14-us-12-waiting-list.json`             | 5       | `ralph/us-12-waiting-list`             |
| 15  | `15-us-15-customer-list.json`            | 4       | `ralph/us-15-customer-list`            |
| 16  | `16-us-16-maintain-customer-record.json` | 5       | `ralph/us-16-maintain-customer-record` |
| 17  | `17-us-17-navigation-shell.json`         | 6       | `ralph/us-17-navigation-shell`         |
| 18  | `18-us-18-waiting-list-signals.json`     | 4       | `ralph/us-18-waiting-list-signals`     |
| 19  | `19-us-19-fold-archive-search.json`      | 3       | `ralph/us-19-fold-archive-search`      |
| 20  | `20-us-20-fold-group-choice.json`        | 3       | `ralph/us-20-fold-group-choice`        |
| 21  | `21-us-22-drop-week-colour-lookup.json`  | 4       | `ralph/us-22-drop-week-colour-lookup`  |
| 22  | `22-us-21-step-through-group.json`       | 4       | `ralph/us-21-step-through-group`       |
| 23  | `23-us-23-group-progress.json`           | 5       | `ralph/us-23-group-progress`           |

110 stories total — the rows sum to it. Every story cites its source PRD section in its
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

All three edit `src/app/ausgabe/page.tsx`, so the "merge before starting the next batch" rule is
load-bearing here for the same reason it was for 19 and 20. **Run them in this order**: 21 frees the
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
