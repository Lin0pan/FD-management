import { describe, expect, it } from "vitest";
import { DomainError, InvalidCardNumber } from "../errors";
import { formatCardNumber, nextCardNumber, parseCardNumber, parseCounterQuery } from "./cardNumber";

describe("formatCardNumber", () => {
  it("joins the customer number and the card index with a k", () => {
    expect(formatCardNumber(12, 1)).toBe("12k1");
  });

  it("gives the first card of a registration the index 1", () => {
    expect(formatCardNumber(240, 1)).toBe("240k1");
  });

  it("counts a reissued card on rather than reusing the first number", () => {
    expect(formatCardNumber(7, 2)).toBe("7k2");
  });

  it("does not pad the customer number — the card says what staff type", () => {
    expect(formatCardNumber(1, 1)).toBe("1k1");
  });
});

describe("parseCardNumber", () => {
  it("splits a card number into the customer number and the card index", () => {
    expect(parseCardNumber("50k3")).toEqual({ customerNumber: 50, index: 3 });
  });

  it("accepts an uppercase K, because staff type the number rather than copy it", () => {
    expect(parseCardNumber("50K3")).toEqual({ customerNumber: 50, index: 3 });
  });

  it("ignores whitespace around a number typed at the counter", () => {
    expect(parseCardNumber("  50k3  ")).toEqual({ customerNumber: 50, index: 3 });
  });

  it("reads back exactly what format wrote", () => {
    expect(parseCardNumber(formatCardNumber(240, 12))).toEqual({
      customerNumber: 240,
      index: 12,
    });
  });

  it("rejects an empty entry rather than reading it as customer 0", () => {
    expect(() => parseCardNumber("")).toThrow(InvalidCardNumber);
  });

  it("rejects a bare customer number — 50 is not a card", () => {
    expect(() => parseCardNumber("50")).toThrow(InvalidCardNumber);
  });

  it("rejects a card index without a customer number", () => {
    expect(() => parseCardNumber("k3")).toThrow(InvalidCardNumber);
  });

  it("rejects a k without an index", () => {
    expect(() => parseCardNumber("50k")).toThrow(InvalidCardNumber);
  });

  it("rejects index 0, because the first card a customer holds is k1", () => {
    expect(() => parseCardNumber("50k0")).toThrow(InvalidCardNumber);
  });

  it("rejects customer number 0, because customer numbers start at 1", () => {
    expect(() => parseCardNumber("0k1")).toThrow(InvalidCardNumber);
  });

  it("rejects a padded customer number — 050k3 is a typo, not customer 50", () => {
    expect(() => parseCardNumber("050k3")).toThrow(InvalidCardNumber);
  });

  it("rejects a padded card index for the same reason", () => {
    expect(() => parseCardNumber("50k03")).toThrow(InvalidCardNumber);
  });

  it("rejects trailing characters rather than reading the number out of them", () => {
    expect(() => parseCardNumber("50k3x")).toThrow(InvalidCardNumber);
  });

  it("rejects a negative customer number", () => {
    expect(() => parseCardNumber("-50k3")).toThrow(InvalidCardNumber);
  });

  it("rejects a negative card index", () => {
    expect(() => parseCardNumber("50k-3")).toThrow(InvalidCardNumber);
  });

  it("quotes the entry back so the UI can name what was typed", () => {
    const error = (() => {
      try {
        parseCardNumber("50k3x");
        return undefined;
      } catch (caught) {
        return caught;
      }
    })();

    expect(error).toBeInstanceOf(DomainError);
    expect(error).toBeInstanceOf(InvalidCardNumber);
    if (!(error instanceof InvalidCardNumber)) throw new Error("unreachable");
    expect(error.code).toBe("InvalidCardNumber");
    expect(error.text).toBe("50k3x");
    expect(error.message).toContain("50k3x");
  });
});

describe("parseCounterQuery", () => {
  it("reads a full card number as a customer number and a presented index", () => {
    expect(parseCounterQuery("50k3")).toEqual({ customerNumber: 50, cardIndex: 3 });
  });

  it("reads a bare customer number, which names the current card rather than any index", () => {
    expect(parseCounterQuery("50")).toEqual({ customerNumber: 50, cardIndex: null });
  });

  it("accepts an uppercase K, like the card-number reader staff also use", () => {
    expect(parseCounterQuery("50K3")).toEqual({ customerNumber: 50, cardIndex: 3 });
  });

  it("ignores whitespace around a number typed at the counter", () => {
    expect(parseCounterQuery("  50  ")).toEqual({ customerNumber: 50, cardIndex: null });
  });

  it("rejects an empty entry rather than reading it as customer 0", () => {
    expect(() => parseCounterQuery("")).toThrow(InvalidCardNumber);
  });

  it("rejects customer number 0, because customer numbers start at 1", () => {
    expect(() => parseCounterQuery("0")).toThrow(InvalidCardNumber);
  });

  it("rejects a padded customer number — 050 is a typo, not customer 50", () => {
    expect(() => parseCounterQuery("050")).toThrow(InvalidCardNumber);
  });

  it("rejects a k without an index, so a half-typed card is not read as customer 50", () => {
    expect(() => parseCounterQuery("50k")).toThrow(InvalidCardNumber);
  });

  it("rejects index 0, because the first card a customer holds is k1", () => {
    expect(() => parseCounterQuery("50k0")).toThrow(InvalidCardNumber);
  });

  it("rejects a name or anything that is not a number", () => {
    expect(() => parseCounterQuery("Müller")).toThrow(InvalidCardNumber);
  });

  it("quotes the entry back so the UI can name what was typed", () => {
    const error = (() => {
      try {
        parseCounterQuery("50k3x");
        return undefined;
      } catch (caught) {
        return caught;
      }
    })();

    expect(error).toBeInstanceOf(InvalidCardNumber);
    if (!(error instanceof InvalidCardNumber)) throw new Error("unreachable");
    expect(error.text).toBe("50k3x");
  });
});

describe("nextCardNumber", () => {
  it("counts the index on and keeps the customer number", () => {
    expect(nextCardNumber({ customerNumber: 50, index: 3 })).toEqual({
      customerNumber: 50,
      index: 4,
    });
  });

  it("makes the successor of the first card k2, so no index is skipped", () => {
    expect(nextCardNumber({ customerNumber: 7, index: 1 })).toEqual({
      customerNumber: 7,
      index: 2,
    });
  });

  it("leaves the card it was given untouched", () => {
    const card = { customerNumber: 50, index: 3 };

    nextCardNumber(card);

    expect(card).toEqual({ customerNumber: 50, index: 3 });
  });
});
