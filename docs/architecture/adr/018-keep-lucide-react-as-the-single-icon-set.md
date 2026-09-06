# ADR-018 — Keep lucide-react as the single icon set

- **Status:** Accepted
- **Date:** 2026-09-06
- **Deciders:** the maintainer

## Context

A UI pass over every screen found that controls were under-marked: thirteen `<summary>` disclosures
suppressed the browser's own marker and put nothing in its place, three of them reading as inert
cards; the three most consequential controls in the application were told apart only by reading; and
the counter's walk buttons were two similar-length German words read from a metre away. The remedy in
every case is an icon, so the question of _which_ icon set had to be settled before roughly sixty
glyphs were placed.

The pass was opened with a request to introduce **heroicons**. `lucide-react` was already a
dependency, already named as the icon set in `docs/guideline/ui_styling_guide.md` §1, and — this is
the part that is not a preference — already load-bearing inside four shadcn primitives (`dialog`,
`checkbox`, `dropdown-menu`, `select`), where the glyphs are structural rather than decorative.

The driving quality goal is legibility over five-plus years by a possibly different maintainer
([chapter 1](../01-introduction-and-goals.md)), and the constraint that DF read this application on
one shared machine under variable hall lighting ([chapter 2](../02-architecture-constraints.md)),
which is why a meaning already gets exactly one colour registered in `src/app/accents.ts`. Doing
nothing was not an option for the icons themselves — the under-marked controls were the finding — but
it was a live option for the library, and it is the one taken.

## Considered options

- **Keep `lucide-react` as the only set** — chosen. No new dependency, no rewrite of the four
  primitives, and one drawing grid on every screen. Costs nothing to adopt because it is the status
  quo; the whole value of the pass is in _where_ icons go, not in which foundry drew them.
- **Add heroicons alongside lucide** — rejected. Two sets means two drawing grids on one screen:
  heroicons outline is 24px at 1.5 stroke, lucide is 24px at 2. A heroicons chevron beside the lucide
  chevron that `Select` renders is a visible weight mismatch — the icon version of the
  three-treatments-of-red problem `src/app/notice.tsx` was written to end.
- **Replace lucide with heroicons entirely** — rejected. Coherent, but it means rewriting four shadcn
  primitives we are told never to re-run `shadcn add` over, re-checking every glyph for an equivalent,
  and updating §1 and §7's tone table. It costs about a day and changes nothing DF can see.
- **No icon library at all — inline SVGs per site** — rejected. It hands every future control a
  private drawing decision, which is the drift this ADR exists to prevent, and shadcn's primitives
  would still pull lucide in regardless.

## Decision

The application uses **`lucide-react` and no other icon set**, and adding or swapping one is an
architecture decision recorded here rather than a styling change.

## Consequences

- One drawing grid, one stroke weight and one sizing convention across every screen; `button.tsx`
  sizes any svg child automatically, so a control decides its own icon size.
- Each glyph is bound to a single meaning, registered in `docs/guideline/ui_styling_guide.md` §12 the
  way each colour is registered in `src/app/accents.ts`. A second use that contradicts the first is a
  review finding rather than a matter of taste.
- **The cost is that we are tied to one foundry's vocabulary.** Where lucide has no good glyph for a
  meaning, the answer is to use no icon rather than to import a second set — which is a real
  constraint, not a theoretical one.
- `X` already carries two meanings — a verdict tone on `/ausgabe` and a row control on three other
  screens. It is tolerable only because the two are different roles at different scales that never
  share a screen, and it is the ceiling: a third use needs a different glyph.
- The four shadcn primitives keep working untouched, and the rule against re-running `shadcn add`
  over an edited component stays cheap to honour.
- **What would make us revisit:** lucide becoming unmaintained, a licence change, or a design
  direction that needs filled glyphs (lucide is outline-only). Any of those is a new ADR superseding
  this one, and it is a day's work plus a rewrite of the four primitives — budget it as such.

## More information

- [`docs/guideline/ui_styling_guide.md`](../../guideline/ui_styling_guide.md) §12 — the glyph
  registry, the three roles, the two accessibility rules and the list of places an icon is
  deliberately refused; §1 names the library, §7 tabulates the three `Notice` tones.
- [8. Crosscutting concepts](../08-crosscutting-concepts.md) — "a glyph carries no meaning alone",
  the same argument US-03.4 makes about colour.
- `src/app/disclosure.tsx` — `FoldChevron` and `ControlSummary`, the one place the disclosure
  affordance is defined.
- [ADR-012](012-support-safari-and-chromium-based-browsers-and-gate-both-in-ci.md) — why the native
  `<summary>` marker is suppressed rather than relied on: the two engines draw it differently.
