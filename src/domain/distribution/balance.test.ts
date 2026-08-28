import { describe, expect, it } from "vitest";
import { amountToPay, balanceKind, balanceOf, type PaidRecord } from "./balance";

/** One hand-out, described by the only two amounts the arithmetic reads. */
function handOut(priceCents: number, paidCents: number): PaidRecord {
  return { priceCents, paidCents };
}

describe("balanceOf", () => {
  it("counts a household with no hand-outs as settled", () => {
    expect(balanceOf([])).toBe(0);
  });

  it("leaves the balance where it was on a full payment", () => {
    expect(balanceOf([handOut(500, 500), handOut(200, 200)])).toBe(0);
  });

  it("leaves the shortfall open on a part payment", () => {
    // Week 1 of the worked table: price 5,00 €, paid 2,00 € → 3,00 € owed.
    expect(balanceOf([handOut(500, 200)])).toBe(-300);
  });

  it("leaves a credit when more than the price is paid", () => {
    // Week 3 of the worked table: price 2,00 €, paid 5,00 € → 3,00 € ahead.
    expect(balanceOf([handOut(200, 500)])).toBe(300);
  });

  it("adds two shortfalls up", () => {
    expect(balanceOf([handOut(500, 200), handOut(400, 100)])).toBe(-600);
  });

  it("settles an earlier shortfall from a later payment", () => {
    // Weeks 1 and 2: 3,00 € owed, then 8,00 € handed over against a 5,00 € price.
    expect(balanceOf([handOut(500, 200), handOut(500, 800)])).toBe(0);
  });

  it("sums the same however the hand-outs are ordered", () => {
    const history = [handOut(500, 200), handOut(500, 800), handOut(200, 500)];
    expect(balanceOf([...history].reverse())).toBe(balanceOf(history));
  });
});

describe("amountToPay", () => {
  it("raises the amount to pay by a debt", () => {
    // Week 2: price 5,00 €, 3,00 € owed → 8,00 € asked for.
    expect(amountToPay(500, -300)).toBe(800);
  });

  it("lowers the amount to pay by a credit", () => {
    // Week 5: price 2,00 €, 1,00 € ahead → 1,00 € asked for.
    expect(amountToPay(200, 100)).toBe(100);
  });

  it("leaves nothing to pay when the credit is larger than the price", () => {
    // Week 4: price 2,00 €, 3,00 € ahead → nothing asked for.
    expect(amountToPay(200, 300)).toBe(0);
  });

  it("consumes a credit larger than the price by the week it pays for", () => {
    // The week-4 row of the worked table, and the test that pins the formula: the balance is the
    // sum against the *price*, so a week asking for nothing still eats its own price out of the
    // credit. Summed against the amount asked for instead, 0 − 0 would leave +3,00 € for ever.
    const history = [handOut(200, 500), handOut(200, 0)];
    expect(balanceOf(history)).toBe(100);
    expect(amountToPay(200, balanceOf(history))).toBe(100);
  });

  it("never asks for a negative amount", () => {
    expect(amountToPay(200, 5000)).toBe(0);
    expect(amountToPay(0, 300)).toBe(0);
  });

  it("asks for more than the cap when an old debt sits on top of a capped price", () => {
    // The Maximalpreis (US-26) caps the price, never the amount to pay: a debt is added on top of
    // an already-capped price and is not itself capped. Not a defect to be "fixed" later.
    const cappedPrice = 800;
    expect(amountToPay(cappedPrice, -450)).toBe(1250);
  });
});

describe("balanceKind", () => {
  it("names a positive balance a credit", () => {
    expect(balanceKind(300)).toBe("CREDIT");
  });

  it("names a negative balance a debt", () => {
    expect(balanceKind(-300)).toBe("DEBT");
  });

  it("names a zero balance settled", () => {
    expect(balanceKind(0)).toBe("SETTLED");
  });
});

describe("the worked five-week table", () => {
  it("walks week by week to the balance and the amount asked for", () => {
    const weeks: ReadonlyArray<{ priceCents: number; paidCents: number; asked: number }> = [
      { priceCents: 500, paidCents: 200, asked: 500 },
      { priceCents: 500, paidCents: 800, asked: 800 },
      { priceCents: 200, paidCents: 500, asked: 200 },
      { priceCents: 200, paidCents: 0, asked: 0 },
      { priceCents: 200, paidCents: 100, asked: 100 },
    ];
    const expectedBalances = [-300, 0, 300, 100, 0];

    const soFar: PaidRecord[] = [];
    weeks.forEach((week, index) => {
      const before = balanceOf(soFar);
      expect(amountToPay(week.priceCents, before)).toBe(week.asked);
      soFar.push(handOut(week.priceCents, week.paidCents));
      expect(balanceOf(soFar)).toBe(expectedBalances[index]);
    });
  });
});
