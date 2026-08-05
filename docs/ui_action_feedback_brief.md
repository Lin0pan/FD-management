# Implementation brief — action feedback

The working instructions for building what `docs/ui_action_feedback_review.md` describes. The review
is the spec; this file is the order of work, the scope boundary and the traps.

**Scope of this round: steps 1–3. Step 4 is deliberately out**, and §"Not this round" says why and
what it will need.

---

## Before anything

Read `docs/ui_action_feedback_review.md` in full. It was written from a live browser pass — every
finding was reproduced in a real browser, with computed colours measured off the DOM. **Do not
re-audit it.** If something in it turns out to be wrong, fix the document in the same commit that
proves it wrong, and say so.

## Two decisions that supersede rules written in the codebase

Settled. Do not re-litigate; implement them and rewrite the comments that say otherwise.

1. **Green covers every successful write, saves included.** This overturns `src/app/accents.ts:48-50`
   and the comment at `src/app/kunden/[id]/record-forms.tsx:122-129`. Both must be rewritten to
   record the new decision rather than left to contradict the code.
2. **Amber becomes a second tier**, for a refusal where nothing is broken. It coexists with amber's
   existing "certificate lapsed" meaning — review §2.2 gives the argument and lists the four comments
   claiming exclusivity that need rewording.

## The three steps

One branch and one PR per step, in order. Each lands green before the next starts.

### Step 1 — one component

`Notice` with tones `success | refusal | error`, plus `REFUSAL_ACCENT` in `src/app/accents.ts`.

- Keep `Confirmation` as the success alias so the five green call sites and every `data-testid`
  survive untouched.
- It absorbs `SaveFeedback` (`record-forms.tsx:111`) and both private `Rejection` copies
  (`serve-controls.tsx:37`, `certificate-controls.tsx:31`).
- No `"use client"` and no hooks — `kunden/[id]/page.tsx:361` renders a confirmation from a server
  component and must keep working.
- Rewrite the superseded comments here, not later.

Pure refactor. Behaviour identical, no spec edited.

### Step 2 — recolour

The seven white confirmations in review §3.3 go green through `Notice`. No new strings, no new
testids, no action changes.

### Step 3 — the missing banners

The six silent writes (§3.1) plus `correctServe`'s `"removed"` branch (§3.2).

- New keys in `src/i18n/de.ts`; no German literals in components.
- New `saved` states on the relevant `*-state.ts` modules.
- Three controls unmount before their own banner could render — removing a waiting-list applicant,
  the stale-card reissue, and `correctServe`'s removal. Review §5 names the two mechanisms already in
  the codebase for this; use them rather than inventing a third.
- **Decide banner-clearing here** (§3.5). Once every write confirms, a stale green banner from one
  form sitting beside a button that just did something else is how someone concludes an action
  succeeded when it never reported. This was observed live and is the one new hazard this round
  introduces.

Additive. New testids follow the existing `<feature>-saved` / `<feature>-error` convention.

## Open questions

Review §7. Answer them as you reach them; ask me if the call is not obvious from the document.
The archive one lands in step 3 — it is the single silent write whose outcome the page already states
plainly, so a green banner on top of the archived banner may be one message too many.

## Constraints this work will run into

From `CLAUDE.md` and `docs/ui_conversion_guide.md`:

- German strings only from `src/i18n/de.ts`.
- `Alert` hardcodes `role="alert"`; every notice passes `role="status"`.
- A confirmation must stay in the viewport where the button was pressed — measure `window.scrollY`
  either side of the click. `tests/e2e/serve.spec.ts:244` guards this for the counter only, so every
  banner added elsewhere needs the check by hand.
- Drive every screen with the `playwright-cli` skill against a **built** app
  (`npm run build && npm run start -- --port 3100`), and read the accessibility snapshot, not a
  screenshot. Restore with `npm run db:demo -- --reset` afterwards.
- Gates before each PR: `npm run lint && npm run typecheck && npm run test:coverage && npm run build`,
  then `npm run test:e2e`. Steps 1–2 should need no spec edited — say so explicitly if one does.
- Small commits, one intent each: a commit either refactors or changes behaviour, never both.
- `main` is ruleset-protected. Land each step via PR, `gh pr merge --squash --auto`.

Update `docs/ui_action_feedback_review.md` as you go so it describes the built state, not the plan.

---

## Not this round — step 4, the amber tier

**Steps 1–3 are done** (PRs #85–#88). Step 4 was split out on purpose: it is roughly as much work as
the three together, and it is the only part that changes types and server actions. The three were
worth living with first — they are what makes the difference visible at the counter, and they carry
no risk to the action contracts.

It has a brief of its own: **`docs/ui_action_feedback_step4_brief.md`**, which carries what this one
did for the first three rounds — the order of work, the decision already taken about test ids, the
open question to settle first, and the four things that moved under review §4.1 while steps 1–3 were
landing.

Until it lands every refusal stays red, which is the status quo, not a regression.
