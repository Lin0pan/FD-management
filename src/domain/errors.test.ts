import { describe, expect, it } from "vitest";
import {
  AlreadyServedInSession,
  CardNumberTaken,
  DistributionSessionAlreadyRunning,
  DistributionSessionNotEmpty,
  DistributionSessionNotFound,
  DistributionSessionNotReopenable,
  DomainError,
  MissingAuditReason,
  NoDistributionSessionRunning,
  OverpaymentNotConfirmed,
  ReminderAlreadyLoggedInSession,
} from "./errors";

/**
 * `MissingAuditReason` is raised by the state changes that turn on a human judgement (US-08, US-10).
 * Covered here so the rule stays stated while its callers are still to be written.
 */
describe("MissingAuditReason", () => {
  it("names the change that arrived without a reason", () => {
    const error = new MissingAuditReason("customer.archived");

    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe("MissingAuditReason");
    expect(error.what).toBe("customer.archived");
    expect(error.message).toContain("customer.archived");
  });
});

/**
 * `CardNumberTaken` is raised by the repository that owns the `(customerNumber, index)` constraint
 * (US-25.3), which is still to be written. It is covered here so the rule it stands for — a card
 * number names one physical card for good — stays stated while its caller is on its way.
 */
describe("CardNumberTaken", () => {
  it("names the card number that was already issued on the slot", () => {
    const error = new CardNumberTaken(66, 1);

    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe("CardNumberTaken");
    expect(error.customerNumber).toBe(66);
    expect(error.index).toBe(1);
    expect(error.message).toContain("66k1");
  });
});

/**
 * `OverpaymentNotConfirmed` (US-29.4), kept here for the two amounts it carries — which is what lets
 * the question on screen name them rather than ask about something unspecified.
 */
describe("OverpaymentNotConfirmed", () => {
  it("names the amount handed over and the amount that was asked for", () => {
    const error = new OverpaymentNotConfirmed(5000, 800);

    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe("OverpaymentNotConfirmed");
    expect(error.paidCents).toBe(5000);
    expect(error.amountToPayCents).toBe(800);
    expect(error.message).toContain("5000");
    expect(error.message).toContain("800");
  });
});

/**
 * The six session errors of US-34.1, and the seventh a session read back by id needs (US-37.2). The
 * first six are covered here so each rule stays stated until its caller arrives with the session
 * table and the four use cases (US-34.3 to US-34.5).
 */
describe("the distribution session errors", () => {
  it("names the session a household was already served at", () => {
    const error = new AlreadyServedInSession(12);

    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe("AlreadyServedInSession");
    expect(error.sessionId).toBe(12);
    expect(error.message).toContain("12");
  });

  it("names the household and the session a reminder is already logged in", () => {
    const error = new ReminderAlreadyLoggedInSession(4, 12);

    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe("ReminderAlreadyLoggedInSession");
    expect(error.customerId).toBe(4);
    expect(error.sessionId).toBe(12);
    expect(error.message).toContain("12");
  });

  it("states the absence itself when nothing is running", () => {
    const error = new NoDistributionSessionRunning();

    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe("NoDistributionSessionRunning");
  });

  it("names the session already under way when a second is started", () => {
    const error = new DistributionSessionAlreadyRunning(12);

    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe("DistributionSessionAlreadyRunning");
    expect(error.runningId).toBe(12);
    expect(error.message).toContain("12");
  });

  it("names what a session holds that is being discarded", () => {
    const error = new DistributionSessionNotEmpty(12, 3, 1);

    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe("DistributionSessionNotEmpty");
    expect(error.sessionId).toBe(12);
    expect(error.handouts).toBe(3);
    expect(error.reminders).toBe(1);
    expect(error.message).toContain("3");
    expect(error.message).toContain("1");
  });

  it("names the session that may not be reopened", () => {
    const error = new DistributionSessionNotReopenable(11);

    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe("DistributionSessionNotReopenable");
    expect(error.sessionId).toBe(11);
    expect(error.message).toContain("11");
  });

  it("names the session an id resolved to none of", () => {
    const error = new DistributionSessionNotFound(37);

    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe("DistributionSessionNotFound");
    expect(error.sessionId).toBe(37);
    expect(error.message).toContain("37");
  });
});
