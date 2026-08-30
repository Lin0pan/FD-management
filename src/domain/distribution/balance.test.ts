import { describe, expect, it } from "vitest";
import {
  amountToPay,
  askedForRecord,
  balanceKind,
  balanceOf,
  type PaidRecord,
  replayPayments,
  standingOf,
} from "./balance";

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

/** One hand-out as the replay sees it: the same two amounts, plus the day it happened. */
function handOutOn(day: string, priceCents: number, paidCents: number) {
  return { date: new Date(day), priceCents, paidCents };
}

describe("standingOf", () => {
  it("marks a payment matching the amount asked as exact", () => {
    expect(standingOf(500, 500)).toBe("EXACT");
  });

  it("marks a shortfall as short", () => {
    expect(standingOf(200, 500)).toBe("SHORT");
  });

  it("marks a payment above the amount asked as over", () => {
    expect(standingOf(700, 500)).toBe("OVER");
  });

  it("marks clearing an old debt as exact, not over", () => {
    // Week 2 of the worked table: the price is 5,00 € but 8,00 € was asked, because 3,00 € was
    // owed. Compared against the *price* the 8,00 € handed over would read as an overpayment and
    // the record would mark a household settling its debt in the colour of one paying ahead.
    const asked = amountToPay(500, -300);

    expect(asked).toBe(800);
    expect(standingOf(800, asked)).toBe("EXACT");
  });

  it("marks paying nothing on a settled account as short", () => {
    expect(standingOf(0, 200)).toBe("SHORT");
  });

  it("marks paying nothing when nothing was asked as exact", () => {
    // Week 4: the credit covered the week, so handing over nothing is exactly what was asked for.
    expect(standingOf(0, 0)).toBe("EXACT");
  });
});

describe("replayPayments", () => {
  it("replays an empty history as nothing", () => {
    expect(replayPayments([])).toEqual([]);
  });

  it("replays a history typed out of order", () => {
    // The rows arrive newest first — which is how a register reads them — and the running balance
    // is only meaningful oldest first, so the replay puts them in order itself.
    const newestFirst = [handOutOn("2026-01-15", 500, 800), handOutOn("2026-01-08", 500, 200)];

    const replayed = replayPayments(newestFirst);

    expect(replayed.map((settlement) => settlement.record.date.toISOString())).toEqual([
      new Date("2026-01-08").toISOString(),
      new Date("2026-01-15").toISOString(),
    ]);
    expect(replayed.map((settlement) => settlement.askedCents)).toEqual([500, 800]);
    expect(replayed.map((settlement) => settlement.balanceAfter)).toEqual([-300, 0]);
  });

  it("sorts a copy, leaving the caller's list as it was", () => {
    const newestFirst = [handOutOn("2026-01-15", 500, 800), handOutOn("2026-01-08", 500, 200)];
    const asPassed = [...newestFirst];

    replayPayments(newestFirst);

    expect(newestFirst).toEqual(asPassed);
  });

  it("states what was asked on the day, not what is asked today", () => {
    // The whole worked five-week table, replayed in one call: each week's asked amount is the one
    // the counter showed *that* day, derived from the balance of the weeks before it alone.
    const history = [
      handOutOn("2026-01-08", 500, 200),
      handOutOn("2026-01-15", 500, 800),
      handOutOn("2026-01-22", 200, 500),
      handOutOn("2026-01-29", 200, 0),
      handOutOn("2026-02-05", 200, 100),
    ];

    const replayed = replayPayments(history);

    expect(replayed.map((settlement) => settlement.askedCents)).toEqual([500, 800, 200, 0, 100]);
    expect(replayed.map((settlement) => settlement.balanceAfter)).toEqual([-300, 0, 300, 100, 0]);
    expect(replayed.map((settlement) => settlement.standing)).toEqual([
      "SHORT",
      "EXACT",
      "OVER",
      "EXACT",
      "EXACT",
    ]);
  });

  it("agrees with the plain sum", () => {
    // Two functions computing one number from the same rows must never be able to disagree: the
    // record's balance is `balanceOf`, and the last row of the history it lists is this replay.
    const history = [
      handOutOn("2026-01-08", 500, 200),
      handOutOn("2026-01-22", 200, 500),
      handOutOn("2026-01-15", 500, 800),
      handOutOn("2026-01-29", 200, 0),
    ];

    expect(replayPayments(history).at(-1)?.balanceAfter).toBe(balanceOf(history));
  });
});

/** One hand-out as `askedForRecord` sees it: a replayable row that a caller can also hold by id. */
function identifiedHandOut(id: number, day: string, priceCents: number, paidCents: number) {
  return { id, date: new Date(day), priceCents, paidCents };
}

describe("askedForRecord", () => {
  const first = identifiedHandOut(1, "2026-01-08", 500, 200);
  const second = identifiedHandOut(2, "2026-01-15", 500, 800);

  it("states the bare price for the first hand-out a household ever had", () => {
    expect(askedForRecord([first, second], first)).toBe(500);
  });

  it("adds the debt the earlier hand-outs left to a later one", () => {
    // 3,00 € was left open on the first, so the second was asked for 8,00 € against a 5,00 € price.
    expect(askedForRecord([first, second], second)).toBe(800);
  });

  it("leaves the record's own payment out of its own asking price", () => {
    // The whole reason this is not "today's amount to pay": the 8,00 € on the second record settled
    // the household, so asked-for-today would be 5,00 € — and the row would read as paying ahead.
    expect(askedForRecord([first, second], second)).not.toBe(500);
    expect(standingOf(second.paidCents, askedForRecord([first, second], second))).toBe("EXACT");
  });

  it("reads the same answer from a history handed over newest first", () => {
    // The rows arrive in whatever order the store returns them; `replayPayments` sorts them itself.
    expect(askedForRecord([second, first], second)).toBe(800);
  });

  it("falls back to the record's own price when the history does not hold it", () => {
    // Not a case the two callers can reach — both pass a record that came out of the very list they
    // pass with it — but the fallback is a stated rule rather than a shrug: a record no history
    // knows about has no earlier rows to be offset by, which is what a settled household is asked.
    const stranger = identifiedHandOut(99, "2026-02-05", 300, 0);

    expect(askedForRecord([first, second], stranger)).toBe(300);
  });
});
