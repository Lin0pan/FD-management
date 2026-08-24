# ADR-013 — Type calendar days as TT.MM.JJJJ instead of using the native date input

- **Status:** Accepted
- **Date:** 2026-08-21
- **Deciders:** the maintainer, on DF's report from the machine they use

## Context

Every day in this application was an `<input type="date">`, in eight components. The choice was
recorded in [chapter 9](../09-architectural-decisions.md) as "native date inputs are better for
keyboard-heavy entry", and against Chromium that looked true.

The first manual pass in Safari on DF's own MacBook — the pass
[ADR-012](012-support-safari-and-chromium-based-browsers-and-gate-both-in-ci.md) requires — showed it
was not. DF reported two failures while registering a household: Safari refusing the value outright
(_"ungültiger Wert"_), and the application answering an apparently complete field with a **format**
complaint.

Both trace to one property of that control: **the order its segments are typed in belongs to the
operating system, not to the page.** Safari takes it from the macOS region setting; `lang="de"` has
no say. On a Mac that is not set to German, the first segment is a month, so a day typed first is
refused. And when the widget holds an incomplete value it submits the empty string — which the old
validator, a single `^\d{4}-\d{2}-\d{2}$` regex, reported as a badly _formatted_ date. That is what
sent DF looking for a typo that was never there.

Measured while diagnosing it, and worse than the reported bug:

| Typed `15031985` | Chromium                              | WebKit |
| ---------------- | ------------------------------------- | ------ |
| resulting value  | **`1985-12-03`**, valid, no complaint | `""`   |

Chromium **clamped** month 15 to 12 and reported nothing. A birthdate decides whether a household
member is a child, which moves the price — so a silently substituted day is
precisely the class of error [quality goal 2](../01-introduction-and-goals.md#quality-goals) exists to
make impossible, and precisely the spreadsheet failure this register replaced.

The suite saw none of it. All 137 date interactions used Playwright's `fill()`, which assigns the
value onto the element and **bypasses the segment editor entirely** — so 144 green specs said nothing
about the path a human uses, and WebKit could not be made to type into that widget at all.

## Considered options

- **A German text field, parsed in the domain** — chosen. One order on every machine, a refusal where
  the old control guessed, and a value the suite can actually type.
- **Keep the native input and only fix the message** — rejected as insufficient. It would have told
  DF the truth about a blank field, but left the segment order with the OS and left Chromium's
  clamping in place, which is the silent one and the dangerous one.
- **Keep the native input and set `min`/`max`** — rejected. Bounds do not decide segment order, and
  clamping happens inside the range.
- **Three segments (TT | MM | JJJJ)** — rejected. Unambiguous, but three tab stops per date and four
  dates on the registration form is twelve stops at a counter with a queue.
- **A date-picker library** — rejected. [ADR-004](004-pin-the-next-js-major-and-keep-the-core-outside-the-framework.md)'s
  five-year horizon argues against a dependency for ~50 lines, and a calendar is the wrong control
  for a birthdate: nobody wants to page back forty years.
- **Detect the OS region and adapt** — rejected. It makes the application's behaviour depend on a
  setting nobody at DF knows how to inspect, and two staff on two machines would enter dates
  differently.

## Decision

A calendar day is typed as **`TT.MM.JJJJ`** into a text field. Eight digits are masked into a written
day as they arrive, and `src/domain/calendarDay.ts` is the single place that text becomes a `Date`.

An unreadable day is **refused**, never adjusted. A blank field and an unreadable one get different
sentences, because they are different mistakes.

## Consequences

- **The order is ours.** Every machine, every browser, every staff member types a day the same way,
  and the format the field shows is the format the error names — both from one dictionary entry.
- **Nothing is silently substituted.** Month 15 is an error, not December.
- **The suite can type a date.** The regression is covered by two specs in `registration.spec.ts`
  that use `pressSequentially` rather than `fill()`, and they run on **both** engines. Before this,
  no automated test could reach the behaviour in either.
- **The Q8 gap in [chapter 10](../10-quality-requirements.md) narrows sharply.** It existed because
  the macOS date picker was beyond CI's reach; with no native picker left, the last macOS-specific
  widget is gone from the application. The manual Safari pass is still worth doing — it is how this
  was found — but it no longer guards a control CI cannot see.
- **Parsing moved into `domain/`**, where it is gated at 100 % and needs no browser: 22 named tests,
  including the leap-year boundaries the old regex never checked. Two _other_ ad-hoc date parsers
  were folded into it on the way — `dayInput` in `ausgabe/actions.ts`, whose own comment admitted it
  let `2026-13-45` through to an Invalid Date, and the archive search's.
- **DF lose the calendar popover.** For a birthdate that is a gain. For `certificateValidUntil` it is
  a real loss, though that date is also read off a paper certificate, so it is typed in practice.
- **Every date in the specs is written once, in ISO, and passed through `typedDay`** on its way into
  a field (`tests/e2e/day.ts`). Fixtures keep the database's format; only what is typed converts.
- **Mid-string editing puts the cursor at the end**, a limitation of masking on every keystroke. At
  ten characters people retype rather than edit, so it is accepted rather than solved.
- **Revisit if** DF ask for a picker on the certificate date, or if a future field needs a _time_ as
  well as a day — this covers days only.

## More information

- [`src/domain/calendarDay.ts`](../../../src/domain/calendarDay.ts) and its tests — the parser.
- [`src/components/ui/date-input.tsx`](../../../src/components/ui/date-input.tsx) — the mask.
- [ADR-012](012-support-safari-and-chromium-based-browsers-and-gate-both-in-ci.md) — the manual
  Safari pass that found this, and why both engines are gated.
- [Chapter 9](../09-architectural-decisions.md) — the 2026-07-30 row claiming native date inputs
  suited keyboard-heavy entry is superseded by this ADR.
