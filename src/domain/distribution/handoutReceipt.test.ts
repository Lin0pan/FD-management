import { faker } from "@faker-js/faker";
import { describe, expect, it } from "vitest";
import type { IssuedCard } from "../card/card";
import { formatCardNumber } from "../card/cardNumber";
import { groupOf } from "../customer/group";
import { receiptFor, type ReceiptInput } from "./handoutReceipt";

/**
 * Synthetic data only, per the testing standard — never a real name, address or certificate. The
 * seed keeps a failure reproducible: the same run always produces the same household.
 */
faker.seed(20260920);

/** The instant the afternoon was closed. Every receipt below is read off the register at it. */
const ENDED_AT = new Date("2026-01-08T17:30:00.000Z");

/** A card as the store hands one over — printed under the slot its holder still occupies. */
function card(overrides: Partial<IssuedCard> = {}): IssuedCard {
  return {
    customerNumber: 38,
    index: 1,
    issuedAt: new Date("2025-03-04T00:00:00.000Z"),
    reason: "FIRST_ISSUE",
    countsAtIssue: { grownUps: 2, children: 1 },
    ...overrides,
  };
}

function input(overrides: Partial<ReceiptInput> = {}): ReceiptInput {
  return {
    customer: {
      customerNumber: 38,
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      certificateValidUntil: new Date("2026-04-30T00:00:00.000Z"),
      reminderCount: 2,
    },
    members: [
      { birthDate: new Date("1988-06-17T00:00:00.000Z") },
      { birthDate: new Date("1990-11-02T00:00:00.000Z") },
      { birthDate: new Date("2016-02-29T00:00:00.000Z") },
    ],
    card: card(),
    at: ENDED_AT,
    ...overrides,
  };
}

describe("receiptFor", () => {
  it("captures the name as it is spelled at the end of the session", () => {
    const corrected = { ...input().customer, firstName: "Jasmin", lastName: "Kowalczyk" };

    const receipt = receiptFor(input({ customer: corrected }));

    expect(receipt.firstName).toBe("Jasmin");
    expect(receipt.lastName).toBe("Kowalczyk");
  });

  it("captures the counts as they stand at the end of the session, not as printed on the card", () => {
    // The card claims two grown-ups and one child; the household is two grown-ups and one child
    // whose 13th birthday has since passed, so the counts part company with what was printed.
    const printed = card({ countsAtIssue: { grownUps: 2, children: 1 } });
    const members = [
      { birthDate: new Date("1988-06-17T00:00:00.000Z") },
      { birthDate: new Date("1990-11-02T00:00:00.000Z") },
      { birthDate: new Date("2012-09-30T00:00:00.000Z") },
    ];

    const receipt = receiptFor(input({ card: printed, members }));

    expect(receipt.grownUps).toBe(3);
    expect(receipt.children).toBe(0);
  });

  it("captures the card's own slot, not the holder's current one", () => {
    // The household moved from 37 to 24 (US-30) and the card in the pocket still says 37k2.
    const moved = { ...input().customer, customerNumber: 24 };

    const receipt = receiptFor(
      input({ customer: moved, card: card({ customerNumber: 37, index: 2 }) }),
    );

    expect(receipt.cardCustomerNumber).toBe(37);
    expect(receipt.cardIndex).toBe(2);
    expect(formatCardNumber(receipt.cardCustomerNumber, receipt.cardIndex)).toBe("37k2");
  });

  it("derives the group from the captured number", () => {
    const receipt = receiptFor(input({ customer: { ...input().customer, customerNumber: 37 } }));

    expect(groupOf(receipt.customerNumber)).toBe("RED");
    expect("group" in receipt).toBe(false);
  });

  it("counts a child who turns 13 after the session as a child", () => {
    const members = [
      { birthDate: new Date("1988-06-17T00:00:00.000Z") },
      // The session was closed on 08.01.2026: one of them turned 13 that day, the other turns 13
      // the day after and is still a child on the receipt.
      { birthDate: new Date("2013-01-08T00:00:00.000Z") },
      { birthDate: new Date("2013-01-09T00:00:00.000Z") },
    ];

    const receipt = receiptFor(input({ members }));

    expect(receipt.grownUps).toBe(2);
    expect(receipt.children).toBe(1);
  });

  it("captures the certificate date and the reminder count on file at the end of the session", () => {
    const validUntil = new Date("2026-02-28T00:00:00.000Z");

    const receipt = receiptFor(
      input({
        customer: { ...input().customer, certificateValidUntil: validUntil, reminderCount: 3 },
      }),
    );

    expect(receipt.certificateValidUntil).toEqual(validUntil);
    expect(receipt.reminderCount).toBe(3);
  });
});
