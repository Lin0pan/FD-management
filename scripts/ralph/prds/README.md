# Per-PRD Ralph batches

One `prd.json` per PRD from [`tasks/`](../../../tasks/), numbered in **build order** (not by user-story
number). Each file is a complete, self-contained Ralph run: its own `branchName`, its own story IDs
starting at `US-001`, its own priorities `1..n`.

The combined 81-story file lives at [`../prd.json`](../prd.json) — that is what Ralph actually reads.
These files are the batches you copy over it.

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

## Four things to get right

**1. Merge before starting the next batch.** `scripts/ralph/CLAUDE.md` step 3 creates the branch
_from `main`_. If the previous PR is not merged, the new branch will not contain the previous batch's
work — US-01 would build against a schema that does not exist. This is the rule that will actually
bite; the rest are cheaper to recover from.

**2. `progress.txt` is reset on every archive**, including the `## Codebase Patterns` section that
Ralph accumulates. Across 16 batches that memory is wiped 16 times. The durable channel is CLAUDE.md
files (step 7 of the agent instructions) — make sure patterns land in `src/domain/CLAUDE.md`,
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

81 stories total. Every story cites its source PRD section in its `description`, so an iteration can
read the full context when a criterion is ambiguous.

## Regenerating

These files are derived from `../prd.json` by grouping on the cited source PRD. If you edit the
combined file, re-split it rather than hand-editing both — and keep the two rehomed stories in mind,
since they are the only places the grouping is not purely mechanical.
