# Every write should say what happened

A UX review of the feedback the application gives after an action that saves, changes or deletes
something — what it did, what was missing, and the one scheme all of it has converged on.

**Status.** All four steps of §6 are built and this document describes the built state.

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
hand-written tint. **It is worn:** twenty-four of the thirty domain codes answer through `Notice`'s
`refusal` tone, and the two readings have not collided anywhere — measured on the live page, the
counter's amber `warn` verdict and an amber refusal never appear as the same element.

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

### 3.1 Nothing at all (6) — all six now answer

| Write                                                  | Control                                         | Observed                                                                                                                                                              |
| ------------------------------------------------------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reissueCardAction` — card reissue after loss          | `kunden/[id]/reissue-controls.tsx`              | Card number went 1k1 → 1k2. Zero `role=status` regions about it. The only banner on screen was `group-saved` left over from a _different_ form.                       |
| `reissueStaleCardAction` — reissue for outgrown counts | `karten-neuausstellung/stale-card-controls.tsx` | Row count 2 → 1. No confirmation. The one status region on the page is the standing note „Das hat keine Eile…", which is not feedback.                                |
| `blockCustomerAction`                                  | `kunden/block-controls.tsx`                     | Status went aktiv → gesperrt. No confirmation.                                                                                                                        |
| `unblockCustomerAction`                                | `kunden/block-controls.tsx`                     | Status went gesperrt → aktiv. No confirmation.                                                                                                                        |
| `archiveCustomerAction`                                | `kunden/archive-controls.tsx`                   | No confirmation. Mitigated: the record re-renders read-only under the archived banner naming the date and reason, which is unmistakable. The weakest case of the six. |
| `removeApplicantAction`                                | `warteliste/remove-applicant-controls.tsx`      | „Mayra Koszewski" vanished from the list. Zero status regions. The worst case of the six — the only evidence is a row missing from a list nobody was looking at.      |

`reissue-state.ts:9-10` stated the omission as a decision: _"There is no `saved` state. A successful
reissue revalidates the customer record and the card view, both of which then render the new number
from the store."_ That is true and it was not enough. The card number changing from `1k1` to `1k2`
further down the page is not an answer to a button; it is a fact the staff member would have to go
and check.

**Built.** Each of the six answers by the mechanism its control's fate allows (§5):

| Write                    | How it answers                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| `reissueCardAction`      | `saved` on the state, carrying the new number — what staff write on the card. `reissue-saved`. |
| `reissueStaleCardAction` | Redirects with the new number; the list states it above the rows. `stale-reissue-saved`.       |
| `blockCustomerAction`    | `saved` on the state, read from `BlockControls` — see below. `block-saved`.                    |
| `unblockCustomerAction`  | The same, in its own words.                                                                    |
| `archiveCustomerAction`  | Navigates back to the screen it was pressed on, which states it. `archive-saved`. See §7.      |
| `removeApplicantAction`  | Redirects; the list states it. `waiting-list-remove-saved`.                                    |

The block was the one that needed more than a `saved`. Both `useActionState`s moved up into
`BlockControls`, because a block replaces its own form: the record revalidates as BLOCKED and
"Sperren" gives way to "Sperre aufheben", so a confirmation held by the block form would unmount in
the render that produced it. The parent survives the swap, and it knows which of the two writes put
the household in the status it is now drawing.

### 3.2 A branch that can never render (1)

`correctServe` returned `{ status: "removed" }` (`ausgabe/actions.ts:126`) and `serve-controls.tsx:177`
handled only `"saved"`. Confirmed live: removing today's hand-out produced zero status regions.

**Built.** The status is gone rather than handled — it never could be handled where it was. `REMOVE`
redirects with the number that was looked up, so the household stays on screen, and the counter
states it at the top: `serve-removed-confirmation`, measured in the viewport because a navigation
lands there. `tests/e2e/serve.spec.ts` now drives it.

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

**Built: `src/app/notice-board.tsx`.** The rule is _the screen shows the answer to the last thing
that was asked, and nothing older_. A control still renders its own notice, beside its own button —
the viewport rule is not negotiable — it just stops rendering it once another control has been
answered. `useNoticeSlot(id, answer)` takes the action state rather than a boolean, which is
load-bearing: `useActionState` hands back a new object per submission, so a control that answers
twice claims the board twice; a boolean would leave a superseded control unable to speak again.

The provider is on the two screens that carry several write controls, `/kunden/[id]` and `/ausgabe`.
A screen without one behaves exactly as before, which is what a card view with a single control
wants. One deliberate exception: the registration confirmation on a record reached with
`?aufgenommen=1` is server-rendered and does not join the board — it is a statement about how the
page was reached rather than an answer from a control on it.

---

## 4. Amber or red

**Built.** The tier is decided from the typed error, not from the sentence, and lives in
`src/app/notice-tier.ts` — a `Record<DomainErrorCode, NoticeTier>` rather than a `switch` with a
default, so a 31st code fails the build until somebody decides what it means. Deciding it from the
sentence was never an option: a German string is the thing most likely to be reworded, and a tier
read back out of one changes when somebody fixes a comma. Every code in `src/domain/errors.ts:13-43`,
sorted.

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

### 4.1 What this cost mechanically

The tier did not cross the server-action boundary: every action returned `{ status: "error", message }`
and threw the typed error away in a `*Message(error)` helper. Three consequences, all discharged:

1. **Fourteen state types across ten `*-state.ts` modules grew the tier.** A `tier` field rather
   than a second discriminant, so `status: "error"` stays and each of the fifteen render sites is one
   token — `tone={state.tier}`. Widening the status would have put a two-arm check and a
   status-to-tone derivation at every one of them, for a distinction the `tier` names outright. The
   modules already existed separately because a `"use server"` file may export nothing but async
   functions, which is why the tier had somewhere to live.
2. **Each `actions.ts` maps the caught `DomainError.code` to the tier** at the point where it already
   maps it to a German sentence, through `tierOf(error)`.
3. **One existing workaround broke, as expected.** `einstellungen/settings-form.tsx` decided which
   field to mark invalid by string-comparing `state.message` back against
   `de.settings.errors.invalidSettings(label)`. `InvalidSettings.field` now travels on
   `SaveSettingsState` as the _input's_ name, which is `docs/ui_redesign_einstellungen.md` §8 step 2's
   first half; §4.2c's per-field mark went with it, and §4.2d — keeping the typed values — did not.

**Six returns have no typed error to read**, being Zod shape failures. They are tiered literally, by
one rule: _did a staff member type the bad value?_ A malformed date or amount in a field they can see
is a refusal, because the form is right there. A malformed **hidden** field — every `surrogateId`
parse — is an error: the form is stale and there is nothing on screen to correct.

---

## 5. Where the message goes when the control disappears

Some of the silent writes destroy the thing that would display their confirmation. No new mechanism
was needed — the codebase already had both, and each write uses the one its control's fate allows:

- **The component survives the revalidate** — the record's reissue re-renders in place, so a `saved`
  status on the state is enough, which is what `SaveFeedback` already does five times on the same
  screen.
- **The component does not survive** — `removeApplicantAction` (the row goes),
  `reissueStaleCardAction` (the row goes), `correctServe`'s `"removed"` (the whole card unmounts) and
  `archiveCustomerAction` (every write control on the record goes). These take the message one level
  up, on the page, by the pattern registration already used: redirect with a flag
  (`kunden/neu/actions.ts:66`), and the page reads it and renders the banner. Three new flags, each
  in a module of its own because a `"use server"` file may export nothing but async functions:
  `karten-neuausstellung/issued-card.ts`, `warteliste/removed-flag.ts`, `ausgabe/removed-flag.ts` and
  `kunden/archived-flag.ts`.
- **Between the two** — block and unblock survive as a _pair_: each replaces the other's form, so the
  states moved up to `BlockControls`, which is the nearest thing that outlives both.

A redirect is also the only reliable way to move the viewport. Measured: `redirect` to the URL the
browser is already on leaves `window.scrollY` exactly where it was, which is why the archive carries
a flag it could otherwise have done without — the outcome it states is at the top of a record whose
control is 2 238px down.

And the rule the counter already learned the hard way (`docs/ui_conversion_guide.md:634`,
`tests/e2e/serve.spec.ts:244`): **the confirmation must stay where the button was pressed.** Measured
live, the hand-out confirmation lands at 472px of a 720px viewport. Any banner added below must be
checked the same way, with `window.scrollY` either side of the click.

`window.scrollY` alone is not the whole check, though — §3.3 found the waiting list failing this rule
with the scroll position untouched, because a revalidate that inserts a row _above_ the form pushes
the button and its answer off the bottom instead. Measure the button's own `getBoundingClientRect()`
either side of the click as well, and scroll it into view before pressing it, or the measurement is
of a viewport Playwright moved rather than one staff would be looking at.

**Fixed.** `add-applicant-form.tsx` asks, after a save, whether its confirmation is actually in the
viewport and scrolls only if it is not. `block: "center"`, not `"nearest"`: the row is inserted in
the same commit, so `"nearest"` scrolls by the minimum the layout claims at that moment and left the
banner eight pixels clipped. Measured after: top 760, bottom 800, in a 900px viewport.

---

## 6. Order of work

1. ✅ **`Notice` + `REFUSAL_ACCENT`**, and the superseded comments rewritten in `accents.ts` and
   `record-forms.tsx`. The record's five saves went green with the comment that had ruled them out,
   because a comment cannot be rewritten a step before the code it describes.
2. ✅ **The remaining white confirmations recoloured** through it. No new strings, no new testids, no
   action changes, no spec edited.
3. ✅ **The seven missing confirmations** — the six silent writes plus `correctServe`'s `"removed"` —
   with new dictionary keys, new `saved` states, four redirect flags for the controls that do not
   survive their own write, and the banner-clearing rule (§3.5). Three e2e tests added and four
   extended; nothing existing changed its meaning.
4. ✅ **The tier carried across the boundary**, twenty-four codes retiered to amber and six left red,
   with the settings per-field fix from `docs/ui_redesign_einstellungen.md` §8 step 2 folded in. No
   test id changed and no existing assertion was renamed: the tier rides on `data-tier`, read off the
   same locator (§4.2 below). Two e2e tests added — one amber, one red.

Step 4 was the only one that touched types and actions. `settings.spec.ts` — which distinguishes
success from refusal purely by which testid is present — was the spec to watch, and it passed
unedited but for the two assertions added to it.

### 6.1 Why the test ids did not change

Every refusal keeps its `<feature>-error` test id in **both** tiers, and the tier goes on a
`data-tier` attribute set by `Notice` on the same element:

```ts
await expect(page.getByTestId("settings-error")).toHaveAttribute("data-tier", "refusal");
```

Precedent: the counter's verdict banner carries `data-verdict={verdict.kind}`
(`ausgabe/counter-lookup.tsx`), read by eight assertions rather than through a per-verdict id.

The reason it is not a new `-refused` id: four specs assert `getByTestId("…-error").toHaveCount(0)`
to mean _nothing was refused_ — `age-13.spec.ts`, `customer-record.spec.ts` twice and
`reissue.spec.ts`. Move amber to a new id and those four go on asserting the absence of an id that no
longer renders, so they pass without testing anything. **So `-error` in a test id means _the answer
was no_, not _the red tier_** — recorded in `docs/ui_conversion_guide.md`, because the two are easy
to take for the same thing.

---

## 7. Open questions

- **Should a refusal keep what was typed?** ⬜ **Still open, and now the only thing in this document
  that is.** Every refusal observed cleared its form: the past-date renewal lost both fields, and the
  rejected settings save reverted `quotaN` from 3 back to 239 — discarding valid edits along with the
  invalid one. Re-measured after step 4 on `/einstellungen`: a rejected `weekAnchorIsoWeek` still
  comes back as the stored `2026-W02`, with the field marked and the words beside it explaining a
  value that is no longer on screen. Step 4 deliberately did not take it on — it is
  `docs/ui_redesign_einstellungen.md` §4.2d, it touches every `defaultValue` on every form, and it is
  a different argument from what colour a refusal is. It is now the higher-value of the two halves it
  was paired with: the field is marked, so the only thing still missing is the value it names.
- **Should the archive keep its own banner?** ✅ **Answered: yes, and the reason turned out not to be
  the one the question assumed.** The record does state the outcome plainly — but it states it at the
  _top_ of the record, and the control is at the foot of it. Measured after archiving from the danger
  zone, the archived banner sat 356px **above** the viewport: the outcome was stated to nobody. What
  the archive needed first was the navigation, and `redirect` to the URL the browser is already on
  moves no scroll at all, so it carries `?archiviert=1` to make the navigation real. Having a flag,
  the screen uses it: the confirmation names the customer number that just came free, which is the
  consequence staff act on — somebody on the waiting list can have it. The standing banner beneath is
  not a repetition of it; it is a fact about the household that will still be true in a year, and the
  two arrive in view together.
- **Two refusals are unreachable through the UI** — `AlreadyServedToday` (the serve button is
  replaced by the correction card) and `ReminderAlreadyLoggedToday` (the button disables itself and
  relabels to „Erinnerung heute bereits erfasst"). Both are good design and neither needs a banner;
  they are listed in §4 because the action can still return them under a double submit.
