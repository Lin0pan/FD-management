# Every write should say what happened

A UX review of the feedback the application gives after an action that saves, changes or deletes
something — what exists today, what is missing, and the one scheme all of it should converge on.

Companion to `docs/ui_conversion_guide.md`, which owns the styling rules this document works within
(rule 9 on literal colours, the `role="status"` override, the accessibility-snapshot workflow). It
does not restate them.

**Method.** Every `"use server"` action was traced to the component that calls it and to the branch
that renders its answer. Then the application was built and driven with `playwright-cli` against
`data/fd.db` on 05.08.2026 — every write below was actually performed in a browser, the accessibility
snapshot read rather than a screenshot, and computed background colours measured off the live DOM.
Where this document says "nothing", nothing appeared on screen. `playwright-cli console` reported
zero errors on every route visited.

---

## 1. The finding in one paragraph

The application performs **19 writes**. Six of them tell the staff member nothing at all, and a
seventh produces a result its own component can never render. Of the thirteen that do respond, only
**six** wear the green confirmation; the other seven report success in a white box with no icon that
reads as body text. And every refusal, from "the household is already in that group" to "customer not
found", is painted the same red — the application has no way to say _"nothing is broken, the rules
just say no"_, which is the most common thing it has to say at a counter with a queue at it.

## 2. The scheme

Three tiers, one component, one meaning per colour.

| Tier      | Means                                                   | Icon            | Accent                                   | Example                                       |
| --------- | ------------------------------------------------------- | --------------- | ---------------------------------------- | --------------------------------------------- |
| **Green** | It happened.                                            | `Check`         | `border-green-600/40 bg-green-600/10`    | „Ausgabe um 11:50 Uhr erfasst."               |
| **Amber** | It did not happen, and nothing is broken — here is why. | `TriangleAlert` | `border-amber-500/40 bg-amber-500/10`    | „Der Haushalt gehört bereits zur Gruppe Rot." |
| **Red**   | It did not happen and something is wrong.               | `CircleAlert`   | `border-destructive/40 bg-destructive/5` | „Unbekannter Fehler."                         |

All three are `role="status"`, not `role="alert"` — an answer to a button the staff member pressed is
not an alarm, and the shadcn `Alert` hardcodes `role="alert"` (`src/components/ui/alert.tsx:30`), so
the override is required. The word always carries the meaning and the colour only repeats it; a
colour is a distinction only some of the staff can make (US-03.4).

Green and amber have no theme token — `src/app/globals.css` defines exactly one chromatic token,
`--destructive`. Both are therefore literal palette classes and belong in `src/app/accents.ts`
alongside `GROUP_STYLES`, `FREE_SLOT_ACCENT` and `CONFIRMATION_ACCENT`, which is the register of
permitted literals.

### 2.1 What changes about green

**Settled and built.** `src/app/accents.ts` used to rule a save _out_ of green:

> It is _not_ worn by a save. Editing a note or a spelling on an existing record is feedback that
> something took, not the completion of an act — those stay the neutral `<Alert role="status">` in
> `kunden/[id]/record-forms.tsx`, and the boundary is drawn there.

**That decision is superseded.** Every successful write gets green, saves included. The argument
against it was that a save is not an act and green would mark nothing having happened; the argument
for it is what the live pass showed. On `/kunden/253` three saves in a row produced three identical
banners on `lab(100 0 0)` — plain white, no icon, no border tint, the same surface as the card behind
them. The distinction the old rule protects is real but it is not one a volunteer at a counter needs
to make, and it is being paid for with the thing they do need: a confirmation that reads as a
confirmation at a glance.

Both places that recorded the old rule were rewritten with the change rather than left to contradict
it: `CONFIRMATION_ACCENT`'s own comment and the one inside `SaveFeedback`. A comment cannot be
rewritten a step before the code it describes, which is why the record's five saves went green with
it, a step ahead of the two in §3.3 that followed with the recolour.

### 2.2 Amber does not collide with the lapsed certificate

Amber was reserved application-wide for "a certificate lapsed", asserted in four separate comments
(`kunden/archive-controls.tsx`, `kunden/neu/archive-search-panel.tsx`,
`kunden/neu/registration-screen.tsx`, `warteliste/remove-applicant-controls.tsx`) and used as row
chrome in `kunden/page.tsx:97-101` and as the counter's `warn` verdict
(`ausgabe/counter-lookup.tsx:56`).

The two readings coexist because they are never the same element and never the same grammar: a
lapsed certificate is **standing state**, attached to a row or a verdict and true until somebody
changes it; a refusal is an **answer to a button**, gone on the next render. The counter's amber
`warn` tone is in fact already the first reading of "the rules say be careful", so this extends a
precedent rather than inventing one. **Built:** the four comments claiming exclusivity now state both
readings, and `accents.ts` carries `REFUSAL_ACCENT` so there is one definition instead of a fifth
hand-written tint. Nothing wears it yet — the tone exists on `Notice`, and the tier that would select
it is step 4.

### 2.3 One component

**Built.** `src/app/notice.tsx` replaced the four shapes that were doing this job: `Confirmation`
(then `src/app/confirmation.tsx`), `SaveFeedback` (`record-forms.tsx:111`), **three** near-identical
private `Rejection` copies (`serve-controls.tsx:37`, `certificate-controls.tsx:31` and
`block-controls.tsx:40` — the audit below missed the third) and eight hand-written
`<Alert variant="destructive" role="status">` blocks. That is why red had three treatments:
red-on-white with no icon, red-on-white with a `CircleAlert`, and red-on-white with a
`bg-destructive/5` tint.

```tsx
<Notice tone="success" | "refusal" | "error" text={…} testId={…} />
```

No `"use client"` and no hooks, so server and client components can both render it — the property
`Confirmation` already had and depends on (`kunden/[id]/page.tsx:361` is a server component).
`Confirmation` stayed as the success alias, so the five existing call sites and their `data-testid`s
were untouched. `docs/ui_conversion_guide.md` asked for exactly this extraction, and now records it.

Two things were deliberately left hand-written, because neither is an answer to a button: the
confirmation _steps_ inside the archive and removal disclosures (a warning before an act, not after
one) and `/ausgabe`'s `ErrorNote`, which is a `role="alert"` about the installation rather than about
a click. `settings-form.tsx` renders success and refusal through one element whose tone flips, so it
converted with the recolour rather than with the extraction.

---

## 3. The audit

Nineteen writes. **Observed** is what the browser actually showed on 05.08.2026.

### 3.1 Nothing at all (6)

| Write                                                  | Control                                         | Observed                                                                                                                                                              |
| ------------------------------------------------------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reissueCardAction` — card reissue after loss          | `kunden/[id]/reissue-controls.tsx`              | Card number went 1k1 → 1k2. Zero `role=status` regions about it. The only banner on screen was `group-saved` left over from a _different_ form.                       |
| `reissueStaleCardAction` — reissue for outgrown counts | `karten-neuausstellung/stale-card-controls.tsx` | Row count 2 → 1. No confirmation. The one status region on the page is the standing note „Das hat keine Eile…", which is not feedback.                                |
| `blockCustomerAction`                                  | `kunden/block-controls.tsx`                     | Status went aktiv → gesperrt. No confirmation.                                                                                                                        |
| `unblockCustomerAction`                                | `kunden/block-controls.tsx`                     | Status went gesperrt → aktiv. No confirmation.                                                                                                                        |
| `archiveCustomerAction`                                | `kunden/archive-controls.tsx`                   | No confirmation. Mitigated: the record re-renders read-only under the archived banner naming the date and reason, which is unmistakable. The weakest case of the six. |
| `removeApplicantAction`                                | `warteliste/remove-applicant-controls.tsx`      | „Mayra Koszewski" vanished from the list. Zero status regions. The worst case of the six — the only evidence is a row missing from a list nobody was looking at.      |

`reissue-state.ts:9-10` states the omission as a decision: _"There is no `saved` state. A successful
reissue revalidates the customer record and the card view, both of which then render the new number
from the store."_ That is true and it is not enough. The card number changing from `1k1` to `1k2`
two screens away is not an answer to a button; it is a fact the staff member would have to go and
check.

### 3.2 A branch that can never render (1)

`correctServe` returns `{ status: "removed" }` (`ausgabe/actions.ts:126`) and `serve-controls.tsx:177`
handles only `"saved"`. Confirmed live: removing today's hand-out produced zero status regions.

Note the mechanical trap before fixing it — removing the record makes `todaysRecord` null, so the
entire `already-served` card unmounts, taking the `useActionState` holding `"removed"` with it. The
message cannot live inside that component at all. See §5.

### 3.3 Success reported, but not as a confirmation (7)

All measured at `background-color: lab(100 0 0)` — white — with no icon and no border tint.

**All seven are green.** The five on the customer record went with the comment that had ruled them
out (§2.1); the other two are single elements that flip a variant between success and refusal, and
converted with the recolour.

| Write                    | Control                                     | Text                                                   |
| ------------------------ | ------------------------------------------- | ------------------------------------------------------ |
| `updateHouseholdAction`  | `kunden/[id]/household-editor.tsx`          | „Gespeichert."                                         |
| `updateDetailsAction`    | `kunden/[id]/details-editor.tsx`            | „Gespeichert."                                         |
| `updateNotesAction`      | `kunden/[id]/notes-editor.tsx`              | „Gespeichert."                                         |
| `changeGroupAction`      | `kunden/[id]/group-control.tsx`             | „Gespeichert."                                         |
| `renewCertificateAction` | `kunden/[id]/renewal-form.tsx`              | „Nachweis gespeichert. Erinnerungen zurückgesetzt: 0." |
| `addApplicantAction`     | `warteliste/add-applicant-form.tsx:108-114` | „Testine Rueckmeldung steht jetzt auf der Warteliste." |
| `saveSettings`           | `einstellungen/settings-form.tsx:338-348`   | „Gespeichert. Die neuen Werte gelten ab sofort."       |

**One of them is green and nobody sees it.** Measured on the recolour pass, with the button scrolled
into view first, as §5's rule requires: pressing „Auf die Warteliste setzen" leaves `window.scrollY`
where it was (482), but the applicant's new row is inserted into the list _above_ the form, which
pushes the button from 816px down to 961px and its confirmation to 905px — both past the bottom of a
900px viewport. The white box had the same fate, so this is not the recolour's doing, but it is the
counter's scroll bug (`docs/ui_conversion_guide.md:634`) arriving by the other route: there, focus
moved the viewport away from the message; here, the message is pushed out from under a viewport that
never moved. **Step 3 owns it**, with the rest of the question of where a banner goes.

`changeGroupAction` is the case that most deserves green: moving a household between RED and BLUE
takes effect immediately, even for a distribution the same day, and the record it changes looks
almost identical afterwards.

`addApplicantAction` deserves a separate mention: somebody has just been put on a waiting list, which
is a completed act by the old rule's own definition, and it is white. The old boundary was already
not being held.

### 3.4 Already right (5)

| Write                        | Control                                                | Text                                                                  |
| ---------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| `submitRegistration`         | redirect `?aufgenommen=1` → `kunden/[id]/page.tsx:361` | „Kunde erfolgreich hinzugefügt." — measured green, with icon          |
| `submitPromotedRegistration` | same                                                   | same                                                                  |
| `recordServe`                | `ausgabe/serve-controls.tsx:123`                       | „Ausgabe um 11:50 Uhr erfasst." — green, in viewport (top 472 of 720) |
| `correctServe` (SET_PAID)    | `ausgabe/serve-controls.tsx:177`                       | „Eintrag aktualisiert." — green                                       |
| `logReminder`                | `ausgabe/certificate-controls.tsx:99`                  | „Erinnerung erfasst. Bisherige Erinnerungen: 3." — green              |
| `recordRenewal`              | `ausgabe/certificate-controls.tsx:78`                  | „Nachweis gespeichert…" — green                                       |

These are the reference. Note they are all on `/ausgabe` plus the registration — the two screens that
had a conversion pass with a `playwright-cli` review behind them.

### 3.5 One more thing the live pass turned up

**Confirmations do not clear when a different form on the same screen is used.** After the group
move on `/kunden/266`, the „Gespeichert." banner was still on screen through a card reissue and a
block, because each `useActionState` holds its own last result and nothing resets it. Today that is
merely untidy. Once every write confirms, it becomes a hazard: a stale green banner from one form
sitting next to a button that just did something else is exactly how a staff member concludes an
action succeeded when it never reported.

Whatever adds the missing banners must also decide when one goes away. The simplest rule that
matches the existing code: a form that already remounts on save (`record-state.ts`'s `saves` counter,
`waiting-list-state.ts`'s `savedCount`) clears its own banner; screens carrying several forms should
render at most one banner at a time.

---

## 4. Amber or red

The tier has to be decided from the typed error, not from the sentence. Every code in
`src/domain/errors.ts:13-43`, sorted.

### Amber — the staff member can resolve this at the counter

_A rule refused a well-formed request:_

| Code                         | What it says                                   |
| ---------------------------- | ---------------------------------------------- |
| `AlreadyServedToday`         | this household already collected today         |
| `ReminderAlreadyLoggedToday` | a reminder is already logged for today         |
| `CertificateStillValid`      | there is nothing to renew yet                  |
| `CertificateExpired`         | the certificate has lapsed                     |
| `NotClearToServe`            | the verdict above says no                      |
| `RecordNoLongerCorrectable`  | that hand-out is too old to change             |
| `GroupUnchanged`             | the household is already in that group         |
| `CustomerArchived`           | archived records are read-only                 |
| `CustomerNotArchived`        | that record is not archived                    |
| `IllegalStatusTransition`    | not blockable / not blocked / not archivable   |
| `NoFreeCustomerNumber`       | the register is full — go via the waiting list |
| `CustomerNumberTaken`        | that number is in use                          |
| `QuotaBelowActiveCustomers`  | the new maximum is under the active count      |
| `WrongGroupForWeek`          | this is not that group's week                  |

_The input needs fixing, and the form is right there:_

| Code                          | What it says                          |
| ----------------------------- | ------------------------------------- |
| `MissingAuditReason`          | a reason is required                  |
| `MissingRequiredField`        | a field is empty                      |
| `EmptyHousehold`              | a household needs at least one person |
| `BirthDateInFuture`           | that birthdate is in the future       |
| `CertificateValidUntilInPast` | „gültig bis" is in the past           |
| `NotesTooLong`                | the note is over the limit            |
| `InvalidSettings`             | a settings value breaks an invariant  |
| `InvalidEuroAmount`           | that is not an amount                 |
| `InvalidCustomerRecord`       | the record as typed is not valid      |
| `EmptySearchQuery`            | nothing to search for                 |

### Red — something is wrong, and typing again will not fix it

| Code                         | What it says                        |
| ---------------------------- | ----------------------------------- |
| `CustomerNotFound`           | the record is gone                  |
| `WaitingListEntryNotFound`   | the entry is gone                   |
| `DistributionRecordNotFound` | the hand-out record is gone         |
| `NoSettingsInForce`          | the application is not configured   |
| `InvalidCardNumber`          | a stored card number does not parse |
| `CardIndexTaken`             | a card index collided               |
| _(untyped)_ `errors.unknown` | anything not caught above           |

Thirty codes, plus the untyped fallback. The four not-found codes and `NoSettingsInForce` are red
because they mean the screen is describing something that no longer exists — a reload or a colleague
is needed, not another attempt.

### 4.1 What this costs mechanically

The tier does not currently cross the server-action boundary. Every action returns
`{ status: "error", message }` and throws the typed error away in a `*Message(error)` helper. Three
consequences:

1. The ten `*-state.ts` modules need the tier on the state — either `status: "refused" | "error"` or
   a `tier` field. They already exist as separate modules precisely because a `"use server"` file may
   export nothing but async functions, so this is the right place for it.
2. Each `actions.ts` maps the caught `DomainError.code` to the tier at the point where it already
   maps it to a German sentence.
3. **One existing workaround breaks.** `einstellungen/settings-form.tsx:82` decides which field to
   mark invalid by string-comparing `state.message` back against
   `de.settings.errors.invalidSettings(label)`. Its own comment calls it "deliberately temporary" and
   points at `docs/ui_redesign_einstellungen.md` §8 step 2, which puts the field on
   `SaveSettingsState`. That step should be done as part of this work, not around it.

---

## 5. Where the message goes when the control disappears

Three of the six silent writes destroy the thing that would display their confirmation. There is no
new mechanism needed — the codebase already has both:

- **The component survives the revalidate** — block, unblock, archive and the record's reissue all
  re-render in place. `useActionState` returning a `saved` status is enough; this is what
  `SaveFeedback` already does five times on the same screen.
- **The component does not survive** — `removeApplicantAction` (the row goes), `reissueStaleCardAction`
  (the row goes), `correctServe`'s `"removed"` (the whole card unmounts). These need the message one
  level up, on the page. The pattern is already in the codebase: registration redirects with
  `?aufgenommen=1` (`kunden/neu/actions.ts:66`) and the page reads the flag and renders the banner
  (`kunden/[id]/page.tsx:607`). A page-level region above the list, fed the same way, is the smallest
  thing that works and the one staff will actually see.

And the rule the counter already learned the hard way (`docs/ui_conversion_guide.md:634`,
`tests/e2e/serve.spec.ts:244`): **the confirmation must stay where the button was pressed.** Measured
live, the hand-out confirmation lands at 472px of a 720px viewport. Any banner added below must be
checked the same way, with `window.scrollY` either side of the click.

`window.scrollY` alone is not the whole check, though — §3.3 found the waiting list failing this rule
with the scroll position untouched, because a revalidate that inserts a row _above_ the form pushes
the button and its answer off the bottom instead. Measure the button's own `getBoundingClientRect()`
either side of the click as well, and scroll it into view before pressing it, or the measurement is
of a viewport Playwright moved rather than one staff would be looking at.

---

## 6. Suggested order of work

1. **`Notice` + `REFUSAL_ACCENT`**, and rewrite the superseded comments in `accents.ts` and
   `record-forms.tsx`. Pure refactor: `Confirmation` keeps its signature, the five green call sites
   and every `data-testid` are untouched.
2. **Recolour the eight white confirmations to green** through it. Still no new strings, no new
   testids, no action changes.
3. **Add the seven missing confirmations** — the six silent writes plus `correctServe`'s `"removed"`.
   New dictionary keys in `src/i18n/de.ts`, new `saved` states, and the page-level region for the
   three vanishing controls. Decide banner-clearing here (§3.5).
4. **Carry the tier across the boundary** and retier every refusal to amber, folding in the settings
   per-field fix from `docs/ui_redesign_einstellungen.md` §8 step 2.

Steps 1–2 are a restyle and should not need a spec edited. Step 3 is additive; new testids follow the
existing `<feature>-saved` / `<feature>-error` convention. Step 4 is the only one that touches types
and actions, and `settings.spec.ts` — which distinguishes success from refusal purely by which
testid is present — is the spec to watch.

---

## 7. Open questions

- **Should a refusal keep what was typed?** Every refusal observed cleared its form: the past-date
  renewal lost both fields, and the rejected settings save reverted `quotaN` from 3 back to 239 —
  discarding valid edits along with the invalid one. `docs/ui_conversion_guide.md` already lists this
  as `/einstellungen` step 2. It is a feedback problem too: a message saying "nothing was saved" next
  to a form that has silently reset is worse than either alone. Not in scope above; worth deciding
  before step 4.
- **Should the archive keep its own banner?** It is the one silent write whose outcome the page
  states plainly. A green confirmation on top of the archived banner may be one message too many.
- **Two refusals are unreachable through the UI** — `AlreadyServedToday` (the serve button is
  replaced by the correction card) and `ReminderAlreadyLoggedToday` (the button disables itself and
  relabels to „Erinnerung heute bereits erfasst"). Both are good design and neither needs a banner;
  they are listed in §4 because the action can still return them under a double submit.
