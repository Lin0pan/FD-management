/**
 * The Erwachsene / Kinder filters as the URL carries them (US-46.4): one `kinder=` per ticked box.
 *
 * `undefined` is every box ticked — not filtered — and an empty list is none ticked, which matches
 * nothing. A GET form submits nothing for an unticked box, so „none" needs a value of its own: every
 * dropdown also submits {@link NO_COUNT}, which only counts when no box came with it.
 */

export type CountFilter = ReadonlyArray<number> | undefined;

/** The URL's word for „no box ticked“ — a parameter value, like `status=ACTIVE`, not screen text. */
export const NO_COUNT = "keine";

type RawParam = string | ReadonlyArray<string> | undefined;

function values(raw: RawParam): ReadonlyArray<string> {
  if (raw === undefined) {
    return [];
  }
  return typeof raw === "string" ? [raw] : raw;
}

/** The counts a parameter names; a value that is not a count is dropped, like any unreadable one. */
export function readCounts(raw: RawParam): CountFilter {
  const given = values(raw);
  const counts = [
    ...new Set(given.filter((value) => /^\d+$/.test(value)).map((value) => Number(value))),
  ].sort((a, b) => a - b);
  if (counts.length > 0) {
    return counts;
  }
  return given.includes(NO_COUNT) ? [] : undefined;
}

/**
 * The filter as it should stand in the URL: every listed box ticked is no filter at all (E3), so the
 * dropdown reads „alle“ and the link carries nothing for it.
 */
export function canonicalCounts(filter: CountFilter, listed: ReadonlyArray<number>): CountFilter {
  if (filter === undefined || listed.every((count) => filter.includes(count))) {
    return undefined;
  }
  return filter;
}

/** The parameter's values for a filter — what {@link readCounts} reads back to the same filter. */
export function countValues(filter: CountFilter): ReadonlyArray<string> {
  if (filter === undefined) {
    return [];
  }
  return filter.length === 0 ? [NO_COUNT] : filter.map(String);
}

/**
 * The query string with only the count parameters replaced by their canonical values, or `null`
 * when they already stand that way. Every other parameter passes through as submitted — an
 * unreadable day's text included, which the page shows back rather than drops.
 */
export function canonicalQuery(
  raw: Readonly<Record<string, string | string[] | undefined>>,
  canonical: Readonly<Record<string, CountFilter>>,
): string | null {
  const differs = Object.entries(canonical).some(([name, filter]) => {
    const given = values(raw[name]);
    const wanted = countValues(filter);
    return given.length !== wanted.length || given.some((value, at) => value !== wanted[at]);
  });
  if (!differs) {
    return null;
  }
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(raw)) {
    if (!(name in canonical)) {
      for (const each of values(value)) {
        query.append(name, each);
      }
    }
  }
  for (const [name, filter] of Object.entries(canonical)) {
    for (const each of countValues(filter)) {
      query.append(name, each);
    }
  }
  return query.toString();
}
