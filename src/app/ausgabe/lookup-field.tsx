"use client";

/**
 * The Kundennummer field and the one thing it tells the action button: whether the number in it is
 * still the one the household on screen was looked up with (US-41.4, decision 1). While it is not,
 * the button greys out, so a hand-out cannot land on the household still shown under a number that
 * names someone else. A courtesy only — the use case re-checks the verdict before writing (FR-8).
 */

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

interface LookupContext {
  readonly query: string;
  readonly edited: boolean;
  readonly onType: (value: string) => void;
}

const Context = createContext<LookupContext | null>(null);

function useLookup(): LookupContext {
  const context = useContext(Context);
  if (context === null) {
    throw new TypeError("the counter's number field rendered outside LookupProvider");
  }
  return context;
}

/**
 * **Keyed by the page on the query and the hand-out just recorded**, which remounts the field: a
 * `redirect` out of a server action is a soft navigation, and `autoFocus` fires only on mount.
 */
export function LookupProvider({
  query,
  children,
}: {
  /** The `?nummer=` the screen answers, or `""` with nothing looked up. */
  query: string;
  children: React.ReactNode;
}): React.ReactElement {
  const [typed, setTyped] = useState(query);
  const context: LookupContext = {
    query,
    edited: typed.trim() !== query.trim(),
    onType: setTyped,
  };
  return <Context.Provider value={context}>{children}</Context.Provider>;
}

/** Whether the field has moved off the looked-up query without a new lookup. */
export function useLookupEdited(): boolean {
  return useLookup().edited;
}

/**
 * Opens on the query with its text selected, so typing the next number replaces it. Uncontrolled,
 * and read once on mount: a number typed before hydration has fired no `onChange`.
 */
export function NumberField(): React.ReactElement {
  const { query, onType } = useLookup();
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const field = ref.current;
    if (field === null) {
      return;
    }
    onType(field.value);
    if (field.value === query) {
      field.select();
    }
  }, [onType, query]);

  return (
    <Input
      ref={ref}
      defaultValue={query}
      onChange={(event) => onType(event.target.value)}
      // Not `type="number"`: a card number carries a `k`, and a spinner means nothing.
      type="text"
      name="nummer"
      id="counter-input"
      inputMode="numeric"
      autoComplete="off"
      autoFocus
      data-testid="counter-input"
      className="h-12 w-[150px] text-2xl font-semibold tabular-nums md:text-2xl"
    />
  );
}
