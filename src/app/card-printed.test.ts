import { describe, expect, it } from "vitest";
import { CARD_PRINTED_FIELD, cardPrinted, cardPrintedValue } from "./card-printed";

function form(value?: string): FormData {
  const data = new FormData();
  if (value !== undefined) {
    data.set(CARD_PRINTED_FIELD, value);
  }
  return data;
}

describe("„Karte ist bereits gedruckt“ on the wire", () => {
  it("reads a ticked box as printed", () => {
    expect(cardPrinted.parse(cardPrintedValue(form("on")))).toBe(true);
  });

  it("reads an unticked box, which posts nothing, as not yet printed", () => {
    expect(cardPrinted.parse(cardPrintedValue(form()))).toBe(false);
  });

  it("refuses any other value rather than guessing", () => {
    expect(cardPrinted.safeParse(cardPrintedValue(form("true"))).success).toBe(false);
  });
});
