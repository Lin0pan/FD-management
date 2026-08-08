# PRD: US-17 — Navigation Shell, Customer Hub and Start Dashboard

> Not a story from `docs/archiv/user_stories_mvp.md`: this is a **structural** change to how the finished
> screens are reached. It adds no business rule, no domain code and no schema change. It depends on
> **US-03** (week colour, for the dashboard), **US-12** (waiting list), **US-13** (cards due badge)
> and **US-15** (customer list) — all already built.

## 1. Introduction

The application currently has no navigation. Every screen is reached from the home page, which is a
flat list of seven links, and every sub-screen offers a "Zur Startseite" link back. Getting from the
distribution screen to the waiting list means going through home. As screens were added one story at
a time this was fine; with the MVP screens all present it is the main thing making the app feel like
a pile of pages rather than one program.

This PRD does three things, in one shell:

1. A **persistent top navigation bar** on every screen with four items: Start, Ausgabe, Kunden
   verwalten, Einstellungen.
2. **`/kunden` becomes the "Kunden verwalten" hub** — the customer list it already is, plus the
   links to the three things staff do with customers: register a new one, work the waiting list, and
   reissue outdated cards.
3. The **home page becomes a Start dashboard** — a welcome line, today's date, and when the next
   distribution is and which group collects — instead of the link list, which the nav bar now
   carries.

## 2. Goals

- Any of the four main areas is reachable in one click from any screen.
- Everything staff do with customers hangs off one page, so "where do I go for that?" has one answer.
- The home screen answers the one question staff actually open it for — _when is the next Ausgabe and
  who collects_ — instead of being a menu.
- No screen, route or capability is removed; this is a rearrangement, not a feature cut.
- The shell adds no business logic to `app/` — it links, it marks the current section, and it renders
  values existing use cases already return.

## 3. User Stories

### US-17.1: Navigation bar in the root layout (presentation)

**Description:** As a staff member, I want the four main areas always visible at the top of the
screen, so I can move between them without going through the home page.

The active-section rule is the only thing here with any judgement in it: the hub owns the waiting
list and the reissue list, so those routes must mark **Kunden verwalten** as current — otherwise
staff on `/warteliste` see no section marked and read the bar as broken.

**Acceptance Criteria:**

- [ ] `src/app/nav.tsx` renders a `<nav>` with exactly four links, in this order:
      Start → `/`, Ausgabe → `/ausgabe`, Kunden verwalten → `/kunden`, Einstellungen →
      `/einstellungen`
- [ ] It is rendered in `src/app/layout.tsx` above `{children}`, so it appears on every route
      without any page opting in
- [ ] The current section is visually marked **and** carries `aria-current="page"` — the marking is
      never colour alone (one shared screen, variable lighting; same rule as US-03.4)
- [ ] Section matching is by path prefix, and the hub claims its satellites:
  - `/` marks Start (exact match only — `/` must not match everything)
  - `/ausgabe` and below mark Ausgabe
  - `/kunden`, `/kunden/neu`, `/kunden/<id>`, `/warteliste` and `/karten-neuausstellung` **all**
    mark Kunden verwalten
  - `/einstellungen` and below mark Einstellungen
- [ ] The matching rule is a pure exported function (e.g. `activeSection(pathname)`), unit-tested
      against every route above plus an unknown path (which marks nothing)
- [ ] The bar is present on `/kunden/<id>/karte` too. That screen is the card as it exists
      **digitally**; the physical card is produced by a separate system, so there is no print output
      for the bar to intrude on and no print rule is needed.
- [ ] The bar is usable at narrow widths: it wraps or scrolls, it never pushes page content sideways
- [ ] All four labels come from `src/i18n/de.ts` (`de.nav.*`); no German literal in the component
- [ ] Typecheck and lint pass
- [ ] Verify in browser using dev-browser skill

### US-17.2: `/kunden` becomes the Kunden-verwalten hub (presentation)

**Description:** As a staff member, I want the customer list page to also offer the three customer
actions, so everything about customers is on one page.

The page keeps its URL, its filters and its table exactly as US-15 built them. The only change is a
band of actions above the list.

**Acceptance Criteria:**

- [ ] `/kunden` renders, above the existing filter form, links to:
  - `/kunden/neu` — register a new customer
  - `/warteliste` — the waiting list
  - `/karten-neuausstellung` — reissue outdated cards
- [ ] The reissue link carries the cards-due count badge, in the same neutral style as the current
      home screen (US-13.4: a to-do count, shown at zero too, never styled as an alarm)
- [ ] The count comes from the existing `countCardsDueForReissue` use case — no new application code
- [ ] The page heading changes from "Kundenliste" to **"Kunden verwalten"**, matching the nav label
      exactly — one name for the section, in the bar and on the page. The list itself, its filters,
      its URL parameters and the group-balance line are otherwise untouched.
- [ ] The free-slot banner (US-12) is shown here when a customer number is free and someone is
      waiting, with the same content as on the waiting-list page
- [ ] Absence of settings is not an error: if `proposeRegistration` throws `NoSettingsInForce` the
      banner is simply absent and the page still renders (same handling as the current home page)
- [ ] All new strings in `de.customers.list.*` / `de.nav.*`; none inline
- [ ] Typecheck and lint pass
- [ ] Verify in browser using dev-browser skill

### US-17.3: Start dashboard (presentation)

**Description:** As a staff member, I want the home screen to tell me the date and when the next
distribution is and which group collects, so opening the app answers the question I actually have.

**Acceptance Criteria:**

- [ ] `/` shows a short welcome line and today's date, written out in German long form
      (e.g. `Donnerstag, 30. Juli 2026`), via the existing `germanDate` formatter in `src/i18n/format.ts`
- [ ] The date only — **no clock time**. The dashboard stays a server-rendered page with no client
      component and no ticking state (see §7).
- [ ] It shows the next distribution: its date and the collecting group, as **text plus** colour,
      never colour alone
- [ ] The line is shown on **every** day, however far off the next distribution is. DF distributes
      weekly, so it is never more than six days out, and "when is the next Ausgabe" is the question
      this screen exists to answer — it is not hidden or muted on the quiet days (§6).
- [ ] On a distribution day it says **today** — "Heute ist Ausgabe" and today's group — and must not
      skip to next week. `getWeekColour` already returns today as `nextDistribution` on a
      distribution day, so this is a wording decision in the page, not a calculation.
- [ ] The two wordings are distinct strings in the dictionary (today vs. a future date), so the
      urgency is carried by the text rather than by styling the panel differently
- [ ] The colour shown is **always the colour of the distribution being named** — today's group on a
      distribution day, the next distribution day's group otherwise. The current week's colour is
      never shown on a non-distribution day, and exactly one colour is on screen at a time.
- [ ] This is `nextDistribution.colour` from `getWeekColour`, never `colour` — the two differ on the
      days after a distribution, and taking the wrong one is the likely bug here (see §6). A named
      test covers a day after a distribution, where the two disagree.
- [ ] Every value comes from the existing `getWeekColour` use case; the page performs no date
      arithmetic of its own
- [ ] `NoSettingsInForce` degrades gracefully: the welcome line and date still render, and the
      distribution panel states that the distribution rhythm is not configured yet, with a link to
      `/einstellungen`. An unseeded database must not produce an error page.
- [ ] The free-slot banner (US-12) and the cards-due badge (US-13.4) are **removed** from this
      screen. Both move to the hub, where US-17.2 puts them — neither capability is lost, and the
      dashboard stays a screen to be read rather than a to-do list (see §6).
- [ ] The seven plain link rows are removed; the nav bar carries them now
- [ ] Because the banner and badge are gone, the home page no longer calls `proposeRegistration`,
      `listWaiting` or `countCardsDueForReissue` — `getWeekColour` is its only read
- [ ] `export const dynamic = "force-dynamic"` is kept — the date and the next distribution both
      change at midnight without anything being written
- [ ] New strings under `de.home.*`; the obsolete `de.home.*Link` keys are removed with the links
- [ ] `tasks/prd-us-12-waiting-list.md` and `tasks/prd-us-13-age-13-reclassification.md` §US-13.4 are
      amended: both currently require their signal "on the home screen", which is now the hub. Change
      the location in those documents rather than leaving the record contradicting the code.
- [ ] Typecheck and lint pass
- [ ] Verify in browser using dev-browser skill

### US-17.4: Back-links are removed where the nav replaces them (presentation)

**Description:** As a staff member, I don't want two ways back on every screen, one of which is worse.

**Acceptance Criteria:**

- [ ] The "Zur Startseite" links on the sub-screens are removed where the nav bar now covers the same
      move (`de.*.backToHome` and the keys behind them)
- [ ] Back-links that mean something **more specific** than "go up" are kept, because the bar cannot
      express them — e.g. "Zurück zur Kundenübersicht" from a customer's card, and "Zurück zur
      Warteliste" from the promotion screen. These return to a _record_, not a section.
- [ ] Every removed dictionary key is removed from `de.ts` too — no orphans
- [ ] Typecheck and lint pass

### US-17.5: E2E — the shell (tests/e2e)

**Acceptance Criteria:**

- [ ] `tests/e2e/navigation.spec.ts`: from each of the four sections, every other section is
      reachable by clicking the bar, and the landing page is the expected one
- [ ] The spec asserts `aria-current="page"` is on Kunden verwalten while on `/warteliste` and on
      `/karten-neuausstellung`, not only on `/kunden`
- [ ] `tests/e2e/customer-list.spec.ts` gains: from `/kunden`, each of the three action links reaches
      its page
- [ ] `tests/e2e/home.spec.ts` is rewritten for the dashboard: with a fixed clock it asserts the date
      line, and the next-distribution line for (a) a distribution day, (b) a day _before_ that week's
      distribution and (c) a day _after_ it, using the same fixed-clock mechanism
      `tests/e2e/distribution.spec.ts` already uses
- [ ] Case (c) is the one that matters: on the day after a distribution the next one is in the
      following ISO week, so the asserted colour must be the **opposite** of the current week's — the
      assertion that catches the wrong field being read
- [ ] The specs that assert the free-slot banner and the cards-due badge (`waiting-list.spec.ts`,
      `age-13.spec.ts` or wherever they currently check the home screen) are pointed at `/kunden`
      instead — the assertions stay, only the page they run against changes
- [ ] A spec asserts an unseeded database still renders `/` without an error page
- [ ] All existing e2e specs pass unchanged except where they navigated via a removed home link —
      those steps are updated to use the nav bar

## 4. Functional Requirements

- FR-1: A navigation bar must be present on every screen, with exactly the items Start, Ausgabe,
  Kunden verwalten and Einstellungen, in that order.
- FR-2: The bar must mark which section the current page belongs to, by text or shape as well as
  colour, and expose it as `aria-current="page"`.
- FR-3: `/warteliste`, `/karten-neuausstellung`, `/kunden/neu` and `/kunden/<id>` must all mark
  Kunden verwalten as the current section.
- FR-4: `/kunden` must be headed "Kunden verwalten" — the same words as its nav item.
- FR-5: `/kunden` must offer links to register a customer, to the waiting list, and to card reissue,
  in addition to the customer list it already shows.
- FR-6: The reissue link on `/kunden` must show the number of cards due for reissue, including zero.
- FR-7: The home page must show a welcome line and today's date. It must not show a clock time.
- FR-8: The home page must state, on every day, the date of the next distribution and the group that
  collects — saying "today" when today is a distribution day.
- FR-8a: The group named must always be the one collecting at that named distribution, never the
  colour of the current week when today is not a distribution day.
- FR-9: Group colour must be conveyed by text as well as colour, everywhere in this PRD.
- FR-10: The home page must render without error when no settings version is in force.
- FR-11: The free-slot banner and the cards-due count must be shown on `/kunden` and must not be
  shown on the home page.
- FR-12: No route may be removed, and no existing URL may change.

## 5. Non-Goals

- **No new business logic.** No domain file, no use case, no port, no Prisma model, no migration.
  If this PRD sends you into `src/domain` or `src/application`, something has been misread.
- No user menu, login or "who am I" indicator — DF has no login, and none is being added here.
- No breadcrumbs, no nested second-level nav, no sidebar.
- No search box in the navigation bar; the list's own filters stay where they are.
- No holiday or cancellation calendar on the dashboard — the next distribution is calendar parity
  (US-03 §5), not a schedule with exceptions.
- No dark-mode toggle, no theming work, no restyling of the existing screens beyond the heading
  change on `/kunden`.
- No mobile burger menu — four items fit; the bar wraps instead.
- No audit entries: nothing here changes state.

## 6. Design Considerations

- **Reuse what shadcn/ui already gives us** (added in `61e7060`). The badge on the reissue link and
  the active state on the nav should use the installed components rather than new bespoke classes.
- **The dashboard is not a menu, and not a to-do list either.** Its whole job is to be read: date,
  next distribution, group. Nothing on it needs clicking.
- **The next-distribution line is always there.** It was worth asking whether a distribution six days
  out is furniture staff stop seeing, but a screen that exists to answer "when is the next Ausgabe"
  should not withhold the answer on five days out of seven — a household asking on a Monday is an
  ordinary thing. The emphasis is carried by the wording instead: on the day itself the line says
  _today_, which is a different sentence, not a louder one.
- **`colour` and `nextDistribution.colour` are not the same field, and the difference is the whole
  point.** `getWeekColour` returns both: the colour of the week the looked-up day falls in, and the
  colour of the next distribution. With a Thursday distribution weekday they agree from Monday to
  Thursday, and **disagree from Friday to Sunday** — the next distribution is then in the following
  ISO week, which by the alternation rule is the other colour. So on a Saturday, "this week is Red"
  and "the next Ausgabe is Blue" are both true, and only the second is the answer to the question
  staff are asking. The dashboard therefore reads `nextDistribution` — its date and its colour, as
  one pair — and never mixes in the current week's colour.
- **Where the banner and the badge went.** `tasks/prd-us-12-waiting-list.md` required the free-slot
  banner on the home screen and `tasks/prd-us-13-age-13-reclassification.md` §US-13.4 required the
  cards-due badge there — at a time when the home screen was the only route to anything. Both are
  customer-administration signals, so both now live on the hub (US-17.2), which is one click away
  from every screen via the bar. Neither is dropped; the location in those two PRDs is amended
  rather than contradicted.
- **Group colour** follows the existing convention: the red/blue border-and-tint pair already used by
  the customer list, the counter and the card, always beside the German word.
- The nav bar is the first thing on every screen, so it is also the first thing in the tab order.
  Links, not buttons; no JavaScript needed for the links themselves to work.

## 7. Technical Considerations

- **The clock is the one real constraint, and showing only the date settles it.** `app/` may not read
  the wall clock — the only wall-clock read in the codebase is `src/infrastructure/clock.ts`
  (CLAUDE.md, "Time is injected"). The dashboard takes its `now` from `getWeekColour(deps)` on the
  server, which reads the injected `Clock`, and renders the date from it. Because there is no ticking
  time, the page needs no client component, no hydration-safe seeding and no timer — and it stays
  deterministic under the fixed clock the e2e tests drive it with.
- **Active-section detection needs `usePathname`**, which makes the nav a client component. Keep the
  matching rule in a separate pure module so it is unit-testable without rendering, and keep
  `layout.tsx` itself a server component.
- **`layout.tsx` must stay static.** Do not fetch counts in the layout: a data read there would force
  every route in the app to be dynamic. The cards-due badge belongs on the hub page and the home
  page, which are already `force-dynamic`, not in the bar.
- **The use cases involved all exist**: `getWeekColour` (dashboard), and `listCustomers`,
  `countCardsDueForReissue`, `proposeRegistration`, `listWaiting` (hub). This story calls them; it
  does not change them. The hub inherits the last three from the old home page more or less verbatim.
- The architecture ESLint rules (`fd/domain-boundary`, `fd/application-boundary`) are unaffected —
  everything here is in `app/` and `i18n/`.
- Coverage: `domain/` and `application/` stay untouched, so the 100% gate is unaffected. The only new
  unit test is for the pure `activeSection` matcher.

## 8. Success Metrics

- Any main area is reachable from any screen in one click.
- A staff member opening the app can name today's date, the next distribution date and its group
  without clicking anything.
- The e2e suite passes with no route or capability lost relative to before the change.
- The home page renders on an unseeded database.

## 9. Open Questions

None outstanding. The three questions this PRD was drafted with have all been answered by DF and the
answers are written into the requirements above:

1. The dashboard shows the date but **no clock time** (FR-7).
2. The next-distribution line is shown **every day**, not only near the distribution (FR-8, §6).
3. The group named is **always the next distribution's**, never the current week's (FR-8a, §6).

The free-slot banner and cards-due badge sit on the hub rather than the home screen (FR-11), which
supersedes the home-screen placement in `prd-us-12` and `prd-us-13` §US-13.4 — amending those two
documents is an acceptance criterion of US-17.3.
