"use client";

import * as React from "react";

import { Input } from "./input";

/**
 * A day field DF type into: eight digits become `TT.MM.JJJJ` as they arrive.
 *
 * Not `<input type="date">`, and the reason is in `src/domain/calendarDay.ts` and ADR-013 — briefly,
 * that control lets the **operating system** decide which segment is typed first, and Chromium
 * silently clamps an impossible month instead of refusing it. This field's order is the same on
 * every machine, and what cannot be read is refused by the domain rather than guessed at.
 *
 * No German lives here: `components/ui` is the primitive layer and holds no strings, so the caller
 * passes the placeholder from `src/i18n/de.ts` like any other label.
 */

/**
 * Insert the dots as digits arrive: `11021985` → `11.02.1985`, `110` → `11.0`.
 *
 * Everything that is not a digit is dropped — which is what makes a paste of `11/02/1985` or
 * `11.02.1985` land correctly either way — and anything past the eighth digit is ignored, so the
 * field cannot grow past a day.
 *
 * Deliberately **lazy** about the trailing dot: two digits render as `11`, not `11.`. An eagerly
 * appended dot has to be deleted twice on backspace, which is worse at a counter than typing one.
 */
export function maskCalendarDay(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)]
    .filter((part) => part !== "")
    .join(".");
}

type DateInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "type" | "value" | "onChange" | "defaultValue" | "inputMode"
> & {
  /** Controlled: the masked text the parent holds. Leave undefined for an uncontrolled field. */
  value?: string;
  /** Called with the **masked** text, so a parent mirroring this value stores what is displayed. */
  onChange?: (value: string) => void;
  /** Uncontrolled starting text; masked on the way in, so a prefill may arrive unformatted. */
  defaultValue?: string;
};

function DateInput({
  value,
  onChange,
  defaultValue = "",
  ...props
}: DateInputProps): React.ReactElement {
  const [ownValue, setOwnValue] = React.useState(() => maskCalendarDay(defaultValue));
  const controlled = value !== undefined;
  const shown = controlled ? value : ownValue;

  function handleChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const masked = maskCalendarDay(event.target.value);
    if (!controlled) {
      setOwnValue(masked);
    }
    onChange?.(masked);
  }

  return (
    <Input
      // `text`, not `date`: the whole point is that the value is ours to read, not the browser's.
      type="text"
      // A digit keypad on a touch device; harmless on a desktop, where the mask does the work.
      inputMode="numeric"
      // Ten characters is a whole day. The mask enforces it too, so this is belt and braces for a
      // paste that arrives before React sees it.
      maxLength={10}
      // A browser offering a remembered street name inside a birthdate helps nobody.
      autoComplete="off"
      value={shown}
      onChange={handleChange}
      {...props}
    />
  );
}

export { DateInput };
