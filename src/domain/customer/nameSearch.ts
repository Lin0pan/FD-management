/**
 * Name folding for the archive search (US-11.1).
 *
 * Staff type the name they hear, not the name that was stored: `Mueller` for `Müller`, `WEISS` for
 * `Weiß`. SQLite has no `unaccent` and its `LIKE` folds only ASCII case, so the comparison cannot be
 * made in the query — the values are folded on the way in and on the way out instead
 * (`tasks/prd-us-11-reuse-archived-record.md` §7).
 *
 * Deliberately not fuzzy: no Soundex, no edit distance (PRD §5). A search that guesses would put the
 * wrong household's data into a registration form; the cost of a miss is that staff type it again.
 */

/**
 * The German letters spelled out rather than stripped, applied before any diacritic is removed —
 * otherwise `ü` would already be `u` and `Mueller` would no longer match.
 */
const GERMAN_SPELLINGS: ReadonlyArray<readonly [RegExp, string]> = [
  [/ä/g, "ae"],
  [/ö/g, "oe"],
  [/ü/g, "ue"],
  [/ß/g, "ss"],
];

/**
 * The comparable form of a name: lower-cased, German letters spelled out, remaining diacritics
 * dropped, whitespace collapsed.
 *
 * A blank name folds to `""` rather than being refused — whether an empty criterion is acceptable is
 * the search's decision, not this function's.
 */
export function foldName(value: string): string {
  // Composed first, so a "u" carrying a separate combining diaeresis is a single "ü" by the time the
  // spellings look for one; lower-cased before them, so "Ü" and "ẞ" are folded too.
  const lowered = value.normalize("NFC").toLowerCase();
  const spelled = GERMAN_SPELLINGS.reduce(
    (text, [letter, spelling]) => text.replace(letter, spelling),
    lowered,
  );

  return spelled.normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim();
}
