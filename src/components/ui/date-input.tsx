"use client";

import * as React from "react";

import { Input } from "./input";

/**
 * A day field DF type into: eight digits become `TT.MM.JJJJ` as they arrive. Not
 * `<input type="date">` — ADR-013 has the reason.
 *
 * No German here: `components/ui` is the primitive layer and holds no strings, so the caller passes
 * the placeholder from `src/i18n/de.ts` like any other label.
 */

/**
 * Insert the dots as digits arrive: `11021985` → `11.02.1985`. Non-digits are dropped, which is what
 * makes a paste of `11/02/1985` land either way, and anything past the eighth digit is ignored.
 *
 * Deliberately **lazy** about the trailing dot: an eagerly appended one has to be deleted twice on
 * backspace, which is worse at a counter than typing one.
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
      // Ten characters is a whole day; the mask enforces it too, so this catches a paste that
      // arrives before React sees it.
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
