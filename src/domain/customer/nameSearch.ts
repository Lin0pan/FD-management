/**
 * Name folding for the archive search (US-11.1).
 *
 * Staff searching for a returning household type the name they hear, not the name that was stored:
 * `Mueller` for `Müller`, `WEISS` for `Weiß`, `Sanchez` for `Sánchez`. SQLite has no `unaccent` and
 * its `LIKE` only folds ASCII case, so the comparison cannot be made in the query — the *values* are
 * folded instead, on the way in and on the way out, and the query compares two already-folded
 * strings (tasks/prd-us-11-reuse-archived-record.md §7).
 *
 * German is folded the way Germans spell it without an umlaut key — `ä → ae`, `ö → oe`, `ü → ue`,
 * `ß → ss` — rather than by stripping the diaeresis, because `Mueller` is how the name is actually
 * written and `Muller` is not. Everything else with a diacritic loses it, which is the best that can
 * be done for a name whose alternative spelling nobody agrees on.
 *
 * This is deliberately **not** fuzzy matching. There is no Soundex and no edit distance (PRD §5): a
 * search that guesses would put the wrong household's data into a registration form, and the cost of
 * a miss is that staff type the name again.
 *
 * The module is pure — it is a string function, and it knows nothing of how names are stored.
 */

/**
 * The German letters that are *spelled out* rather than stripped, applied before any diacritic is
 * removed — otherwise `ü` would have already become `u` and `Mueller` would no longer match.
 */
const GERMAN_SPELLINGS: ReadonlyArray<readonly [RegExp, string]> = [
  [/ä/g, "ae"],
  [/ö/g, "oe"],
  [/ü/g, "ue"],
  [/ß/g, "ss"],
];

/**
 * The comparable form of a name: lower-cased, German letters spelled out, remaining diacritics
 * dropped, whitespace collapsed and trimmed.
 *
 * A blank name folds to `""` rather than being refused — whether an empty criterion is acceptable is
 * the search's decision, not this function's.
 */
export function foldName(value: string): string {
  // Composed first, so a "u" that carries a separate combining diaeresis is a single "ü" by the time
  // the spellings below look for one; lower-cased before them, so "Ü" and "ẞ" are folded too.
  const lowered = value.normalize("NFC").toLowerCase();
  const spelled = GERMAN_SPELLINGS.reduce(
    (text, [letter, spelling]) => text.replace(letter, spelling),
    lowered,
  );

  return spelled.normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim();
}
