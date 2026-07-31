# PRD: US-18 — Where the Waiting List Speaks

> Not a story from `docs/user_stories_mvp.md`: this is a **placement** change to signals that already
> exist. It adds no business rule, no domain code, no application code and no schema change. It
> depends on **US-12** (waiting list), **US-15** (customer list) and **US-17** (the Kunden hub) — all
> already built.

## 1. Introduction

`/kunden` — "Kunden verwalten" — currently opens with the free-slot banner: a bordered panel that
names the applicant who has waited longest, names the customer number that came free, and offers
"Jetzt registrieren". It was put there by US-17.2 on the reasoning that a freed slot nobody notices
is an applicant who goes on waiting.

That reasoning still holds, but the placement is wrong twice over:

- **The hub is not where the decision is made.** Staff open `/kunden` to find a household, check a
  certificate, filter the register. The banner interrupts that with a decision about somebody who is
  not on the screen, and it does so above the register itself — the thing they came for.
- **The decision is made one screen further on.** The moment the queue actually matters is when a
  staff member is about to take somebody _new_ on: that is when a free number is about to be given to
  a walk-in that an applicant has been waiting for. On `/kunden/neu` the banner is not an
  interruption, it is the question the screen is asking anyway.

So this PRD moves the loud signal to where it is acted on, and leaves the hub with a quiet one: a
small badge beside the existing "Warteliste" link, the same shape as the "Karten neu ausstellen"
badge next to it. `/kunden` then has one row of to-do counts, both read the same way, neither of them
shouting.

The waiting-list screen itself is unchanged.

## 2. Goals

- `/kunden` states **how many people are waiting** and nothing more — one badge, in the row of
  actions, in the same shape as the badge already beside it.
- The free-slot banner is **gone from `/kunden`** entirely: no applicant name, no free number, no
  action button.
- The banner appears on **`/kunden/neu`**, where a registration is about to happen, and only when
  somebody is actually waiting.
- No signal is lost: every fact the banner states is still stated, on `/warteliste` as before and now
  on `/kunden/neu` as well.
- No new use case, no new port method, no new query. Both numbers come from use cases these pages
  already call.

## 3. User Stories

### US-18.1: The waiting-list badge on the Kunden hub (presentation)

**Description:** As a staff member, I want the Kunden-verwalten screen to tell me at a glance how
many people are on the waiting list, so I can see the queue without opening it and without a banner
standing between me and the register.

The badge sits beside the existing `/warteliste` link, exactly where the cards-due badge sits beside
`/karten-neuausstellung`. It is shown **at zero as well**, for the same reason the cards badge is:
"niemand wartet" is the answer staff most often want from it, and a badge that vanishes leaves them
unable to tell "nobody waiting" from "the number failed to load".

**Acceptance Criteria:**

- [ ] `/kunden` renders a badge beside the "Warteliste" link in `HubActions`, styled and positioned
      like the cards-due badge: the same rounded pill, the same neutral grey, the same row
- [ ] It states the number of applicants still waiting — `listWaiting`'s count, which is the same
      list and the same order the waiting-list screen reads (no second query, no new use case)
- [ ] It is rendered at zero too, reading "niemand wartet"
- [ ] German inflects at one: `1 Wartende:r` / `3 Wartende` — the strings live in
      `de.customerList.actions.*`, none inline
- [ ] It carries `data-testid="waiting-list-badge"` so the e2e suite can read it
- [ ] The badge is a link target like the rest of the row — clicking it lands on `/warteliste`
- [ ] Typecheck and lint pass
- [ ] Verify in the browser with the `playwright-cli` skill, reading the **accessibility snapshot**:
      the badge must read as part of the "Warteliste" link, not as a stray number

### US-18.2: A free slot is marked on the badge, in words (presentation)

**Description:** As a staff member, I want the waiting-list badge to look different when a customer
number is actually free, so the queue that can be served right now stands out from the queue that
merely exists.

**This is the one place where this PRD makes a judgement call.** The requested design was "neutral,
but emphasised when free". A colour-only emphasis is not available to us: `docs/ui_conversion_guide.md`
and US-03.4 both say that a marking is never colour alone, on a shared machine under variable
lighting. So the emphasis is an accent _plus_ a word — the badge says why it changed.

**Acceptance Criteria:**

- [ ] When `proposeRegistration` reports a free customer number **and** at least one applicant is
      waiting, the badge reads the count followed by "Platz frei" (e.g. `3 Wartende · Platz frei`)
      and carries a subtle accent — a tinted background and border, never a red alarm
- [ ] Otherwise the badge is the plain neutral pill from US-18.1, count only
- [ ] The accent never appears without the word, and the word never appears without a free number
- [ ] The badge names **no applicant and no customer number** — those belong to the banner, and the
      hub is deliberately not where that decision is made
- [ ] When `proposeRegistration` throws `NoSettingsInForce` the badge still renders its count in the
      neutral state; the page does not become an error screen (the same handling the banner had)
- [ ] `data-testid="waiting-list-badge"` additionally carries `data-free-slot="true" | "false"` so
      the e2e suite can assert the state rather than the colour
- [ ] Strings in `de.customerList.actions.*`; typecheck and lint pass
- [ ] Verify in the browser with the `playwright-cli` skill, in both states

### US-18.3: The free-slot banner leaves the hub and lands on the registration screen (presentation)

**Description:** As a staff member about to register a new household, I want to be told that somebody
has been waiting for the very number I am about to hand out, so a walk-in does not quietly jump the
queue.

**Acceptance Criteria:**

- [ ] `FreeSlotBanner` is removed from `/kunden` — no import, and `/kunden` no longer renders it in
      any state
- [ ] `/kunden/neu` renders `FreeSlotBanner` above the registration form, below the page heading and
      intro, so it is read before the first field is typed
- [ ] It appears **only** when somebody is waiting **and** `proposal.customerNumber` is not null —
      with an empty waiting list there is no banner at all, and with a full register there is no
      number to offer (the form already says the register is full)
- [ ] The head of the queue is `listWaiting`'s first place and nobody else — the same reading
      `/warteliste` makes, so the two screens can never name two different applicants
- [ ] The banner keeps its content unchanged: heading, "Kundennummer N ist frei. Am längsten wartet
      X.", the expired-certificate note where it applies, and "Jetzt registrieren" linking to
      `/warteliste/<entryId>/registrieren`
- [ ] `showListLink` is **true** here: the list is not on view on this screen, so the banner offers
      the way to it
- [ ] The banner does not block, disable or pre-empt the registration form — a walk-in may still be
      registered, this is a statement of fact, not a gate (FD decide who is served, not the software)
- [ ] `/kunden/neu` still renders normally when the waiting list is empty, and the
      `NoSettingsInForce` path is untouched
- [ ] No new strings needed; typecheck and lint pass
- [ ] Verify in the browser with the `playwright-cli` skill: with an empty list, with a waiting list
      and a free number, and with a waiting list and a full register

### US-18.4: The e2e suite follows the signals (e2e)

**Description:** As a maintainer, I want the Playwright suite to assert where each signal now lives,
so the move is a contract and not a coincidence.

**Acceptance Criteria:**

- [ ] `tests/e2e/waiting-list.spec.ts` — the assertion that the banner appears on `/kunden` after an
      archive frees a number is **moved to `/kunden/neu`**, with the same expected text
- [ ] A new assertion: after that same archive, `/kunden` shows **no** `waiting-list-free-slot`
      element in any state
- [ ] `tests/e2e/customer-list.spec.ts` — the badge shows the number of applicants waiting, and
      reads "niemand wartet" on an empty list
- [ ] The badge's `data-free-slot` is `"true"` when a number is free and `"false"` when the register
      is full, asserted through the existing archive fixture rather than by reading a colour
- [ ] The three-actions navigation test still passes: clicking the badge or its link lands on
      `/warteliste`
- [ ] `tests/e2e/home.spec.ts` is unchanged — the Start dashboard never carried either signal
- [ ] The full suite is green

## 4. Functional Requirements

- **FR-1:** `/kunden` must not render `FreeSlotBanner` under any condition.
- **FR-2:** `/kunden` must render a waiting-list badge beside the `/warteliste` link, stating the
  count of applicants still waiting, at zero as well as above it.
- **FR-3:** The count is `listWaiting(waitingListDeps).length` — the page already calls that use
  case. No new use case, no new port method, no `count` query.
- **FR-4:** When a customer number is free and at least one applicant waits, the badge additionally
  states "Platz frei" and carries a subtle accent. Colour is never the only carrier of that state.
- **FR-5:** The badge never names an applicant or a customer number.
- **FR-6:** `/kunden/neu` must render `FreeSlotBanner` above the registration form when — and only
  when — the waiting list is non-empty and `proposeRegistration` returned a non-null
  `customerNumber`.
- **FR-7:** The banner on `/kunden/neu` names the head of `listWaiting` and the proposed customer
  number, and nothing is recomputed on the page.
- **FR-8:** `/warteliste` is untouched: same banner, same conditions, same content.
- **FR-9:** All new German strings live in `src/i18n/de.ts` under `de.customerList.actions`.
- **FR-10:** No page becomes an error screen because settings are missing; `NoSettingsInForce` keeps
  the existing "render without the signal" behaviour.

## 5. Non-Goals

- No change to the waiting-list screen, the waiting-list domain rules, or the arrival order.
- No change to what `listWaiting` or `proposeRegistration` return.
- No count in the navigation bar — `layout.tsx` performs no data read on purpose (US-17.1), and a
  badge there would make every route in the app dynamic.
- No badge on the Start dashboard. It carries no to-do counts today and does not start now.
- No blocking or warning dialog on the registration form. The banner informs; FD decide.
- No new audit entry — nothing here writes anything.
- No filtering of the register by "is waiting"; the waiting list is not part of the register.

## 6. Design Considerations

**The badge is a sibling, not a new pattern.** `HubActions` already renders exactly this shape for
cards due. The waiting-list badge reuses it verbatim in its neutral state, so the two read as one row
of counts rather than two competing widgets. If the markup is worth extracting into a small local
`CountBadge` component, do that — but it stays in `src/app/kunden/page.tsx`; it is not a design
system.

**Why "Platz frei" as a word and not just a colour.** See US-18.2. The project rule is stated in
`docs/ui_conversion_guide.md` and enforced by habit rather than by lint, so it is written into the
acceptance criteria here instead.

**Why the banner is right on `/kunden/neu` and wrong on `/kunden`.** The banner asks a question —
"should this number go to the person in front of you, or to the person who has waited three weeks?"
On the hub, nobody asked it. On the registration screen, that question is the screen. The staff
member is one field away from answering it the wrong way by default.

**Order of landing.** US-18.1 and US-18.2 add the quiet signal; US-18.3 removes the loud one and
re-places it. Landing US-18.3 first would leave `/kunden` with no waiting-list signal at all for the
length of a review. Build in the order given.

## 7. Technical Considerations

- `/kunden/page.tsx` already awaits `listWaiting` and `proposeRegistration` in its `Promise.all`. The
  badge needs both; the banner's `head` binding is what goes away. Do not remove the
  `proposeRegistration` call — the badge's free-slot state depends on it, including its
  `NoSettingsInForce` catch.
- `/kunden/neu/page.tsx` already awaits `proposeRegistration` for the form. It gains one
  `listWaiting` call; run the two concurrently rather than in sequence.
- `waitingListDeps` is exported from `src/app/warteliste/deps.ts` and is already imported across
  route folders by `/kunden` — importing it from `/kunden/neu` is the same, established move.
- `FreeSlotBanner` needs no change at all. It already takes `head`, `customerNumber` and
  `showListLink`.
- Both pages are `dynamic = "force-dynamic"` already, which is required: a wait grows and a
  certificate lapses at midnight with nothing being written.
- This PRD touches `src/app/**`, `src/i18n/de.ts` and `tests/e2e/**` only. A diff that reaches
  `src/domain/**`, `src/application/**`, `src/infrastructure/**` or `prisma/**` is a sign the change
  was misread.

## 8. Success Metrics

- Opening `/kunden` puts the register, not a decision about somebody else, at the top of the screen.
- A staff member registering a walk-in while somebody waits sees the applicant's name before typing
  the first field — measured by the e2e assertion, which is the only measurement this project has.
- The waiting-list count is answerable from `/kunden` without a click.
- Test count goes up, not down: no assertion is deleted, only re-pointed.

## 9. Open Questions

- **Wording of the zero state.** "niemand wartet" is proposed rather than "0 Wartende", matching how
  `waitedValue` prefers "seit heute" to "0 Tage". Confirm with FD when the screen is next reviewed.
- **The accent's exact tint** is left to the implementation, constrained only by "not an alarm
  colour" — red and amber are spoken for by blocked status and expiring certificates.
- Should `/kunden/[id]` (a single household) ever carry the badge? Out of scope here; the answer is
  probably no, because nothing on that screen hands out a number.
