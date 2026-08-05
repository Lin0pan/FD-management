# Implementation brief — step 4, the amber tier

The working instructions for the last step of `docs/ui_action_feedback_review.md`: carrying the
refusal tier across the server-action boundary, so that "the household is already in that group"
stops being painted the same red as "customer not found".

The review is the spec — §4 lists every code and its tier, §4.1 what it costs mechanically. This
file is the order of work, the decisions already taken, and the traps.

## Before anything

Read `docs/ui_action_feedback_review.md` in full, plus `src/app/notice.tsx`,
`src/app/notice-board.tsx` and `src/app/accents.ts`.

The review **describes the built state**, not a plan: steps 1–3 landed in PRs #85–#88. **Do not
re-audit it.** If something in it turns out to be wrong, fix the document in the same commit that
proves it wrong, and say so.

## What is already waiting

Everything on the rendering side was built in step 1 and has been unused since:

- `Notice` has a `refusal` tone. Nothing selects it yet.
- `REFUSAL_ACCENT` is in `accents.ts`, with the argument for why amber's two readings — a lapsed
  certificate, and a refused act — do not collide.
- The four comments that once claimed amber meant only "a certificate lapsed" already state both.

So this step is: **decide the tier from the typed error, get it onto the state, and pass it to the
tone.**

## The three parts

1. **The tier on the state.** Every action returns `{ status: "error", message }` and throws the
   typed error away in a `*Message(error)` / `messageFor(error)` helper. The `*-state.ts` modules
   need `status: "refused" | "error"` or a `tier` field — recount them, the set moved in step 3.
   Each `actions.ts` maps `DomainError.code` to the tier at the point where it already maps it to a
   German sentence.
2. **All 30 codes in `src/domain/errors.ts` retiered** per review §4 — 24 amber, 6 red, plus the
   untyped `errors.unknown` fallbacks as red.
3. **The per-field settings fix** from `docs/ui_redesign_einstellungen.md` §8 step 2, folded in.
   The `rejects()` helper in `einstellungen/settings-form.tsx` decides which field to mark invalid
   by string-comparing `state.message` back against the dictionary; its own comment calls that
   "deliberately temporary", and it breaks the moment the tier moves onto the state.

## Settled: the test ids do not change

**Every refusal keeps its `<feature>-error` test id, in both tiers. The tier goes on a data
attribute** — `data-tier="refusal" | "error"` — set by `Notice` on the same element that carries
`data-testid`, so a spec reads it off one locator:

```ts
await expect(page.getByTestId("settings-error")).toHaveAttribute("data-tier", "refusal");
```

This has direct precedent: the counter's verdict banner carries `data-verdict={verdict.kind}`
(`ausgabe/counter-lookup.tsx`), and eight assertions read it that way rather than through a
per-verdict test id.

The reason it is **not** a new `-refused` test id: four specs assert
`getByTestId("…-error").toHaveCount(0)` to mean _nothing was refused_ —
`age-13.spec.ts:341`, `customer-record.spec.ts:255` and `:312`, `reissue.spec.ts:187`. Move amber to
a new id and those four go on asserting the absence of an id that no longer renders, so they pass
without testing anything. Four specs silently green for the wrong reason is worse than any amount of
renaming.

What follows from it:

- **No existing spec assertion needs renaming.** The five positive `-error` assertions —
  `registration.spec.ts:120` (`EmptyHousehold`), `reminders.spec.ts:227`
  (`ReminderAlreadyLoggedToday`), `archive.spec.ts:252` (`MissingAuditReason`),
  `waiting-list.spec.ts:175` (`NoFreeCustomerNumber`), `settings.spec.ts:74` (`InvalidSettings`) —
  are all on codes that become amber, and all keep working unchanged.
- **Add `data-tier` assertions where the tier is the point**, at minimum one amber and one red, so
  the tiering is covered rather than merely shipped.
- `-error` in a test id now means _the answer was no_, not _the red tier_. Say so in
  `docs/ui_conversion_guide.md`, or the next reader will take the two for the same thing.
- `settings.spec.ts` distinguishes success from refusal purely by which test id is present
  (`settings-saved` vs `settings-error`), because `settings-form.tsx` renders one element whose tone
  and test id flip together. That keeps working; don't disturb it.

## What moved under this during steps 1–3

The review's §4.1 was written before those steps landed. Four things it does not describe:

- **Four writes redirect instead of returning a state** — the stale-card reissue, the waiting-list
  removal, `correctServe`'s `REMOVE`, and the archive. Their _refusals_ still come back as state, so
  the tiering is unaffected; the shape is just not what §4.1 pictures.
- **`notice-board.tsx` exists.** `useNoticeSlot(id, answer)` takes the action state object, not a
  boolean, and relies on `useActionState` handing back a new object per submission. A reshaped state
  must keep that property, or a control that answers twice goes silent the second time.
- **Block and unblock share their states** in `BlockControls`, which picks the visible form's own
  answer over the other's. A tier has to survive that pick.
- **Several states gained a `saved`** in step 3, so the unions are wider than §4.1 describes.

## Still open — decide it before touching a state module

**Should a refusal keep what was typed?** Every refusal observed cleared its form: the past-date
renewal lost both fields, and the rejected settings save reverted `quotaN` from 3 back to 239,
discarding valid edits along with the invalid one (review §7). A message saying "nothing was saved"
beside a form that has silently reset is worse than either alone. Ask if the call is not obvious
from the document.

## Constraints this work will run into

- German strings only from `src/i18n/de.ts`.
- `Alert` hardcodes `role="alert"`; every notice passes `role="status"`.
- A confirmation or a refusal must stay in the viewport where the button was pressed. Measure
  `window.scrollY` **and** the button's own `getBoundingClientRect()` either side of the click — the
  waiting list failed this rule with the scroll untouched, because a revalidate inserted a row above
  the form.
- Drive every screen with the `playwright-cli` skill against a **built** app
  (`npm run build && npm run start -- --port 3100`), and read the accessibility snapshot, not a
  screenshot. Restore with `npm run db:demo -- --reset` afterwards.
- Gates before the PR: `npm run lint && npm run typecheck && npm run test:coverage && npm run build`,
  then `npm run test:e2e` (108 tests as of #88).
- Small commits, one intent each. `main` is ruleset-protected; land via PR with
  `gh pr merge --squash --auto`.

## When it lands

Update `docs/ui_action_feedback_review.md` so it describes the built state — §4 and §4.1 become
past tense, §6 step 4 is ticked, and the status line at the top loses its caveat. Then drop the
§ "Not this round" section from `docs/ui_action_feedback_brief.md`, and this file with it: both
exist to describe work that is no longer outstanding.
