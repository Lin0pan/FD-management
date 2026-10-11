import { describe, expect, it } from "vitest";
import { CampaignReminderNameTooLong, MissingRequiredField } from "../errors";
import {
  CAMPAIGN_REMINDER_NAME_MAX_LENGTH,
  campaignProgress,
  createCampaignReminderName,
} from "./campaignReminder";

describe("createCampaignReminderName", () => {
  it("refuses a campaign reminder without a name", () => {
    const failing = () => createCampaignReminderName("   ");

    expect(failing).toThrow(MissingRequiredField);
    try {
      failing();
    } catch (error) {
      expect(error).toBeInstanceOf(MissingRequiredField);
      if (error instanceof MissingRequiredField) {
        expect(error.field).toBe("name");
      }
    }
  });

  it("trims the name DF typed", () => {
    expect(createCampaignReminderName("  Weihnachtstüte ")).toBe("Weihnachtstüte");
  });

  it("refuses a name longer than a checkbox label can carry", () => {
    const name = "a".repeat(CAMPAIGN_REMINDER_NAME_MAX_LENGTH + 1);

    const failing = () => createCampaignReminderName(name);

    expect(failing).toThrow(CampaignReminderNameTooLong);
    try {
      failing();
    } catch (error) {
      expect(error).toBeInstanceOf(CampaignReminderNameTooLong);
      if (error instanceof CampaignReminderNameTooLong) {
        expect(error.length).toBe(CAMPAIGN_REMINDER_NAME_MAX_LENGTH + 1);
        expect(error.maxLength).toBe(CAMPAIGN_REMINDER_NAME_MAX_LENGTH);
      }
    }
  });

  it("accepts a name at exactly the maximum length, counted after trimming", () => {
    const name = "a".repeat(CAMPAIGN_REMINDER_NAME_MAX_LENGTH);

    expect(createCampaignReminderName(` ${name} `)).toBe(name);
  });
});

describe("campaignProgress", () => {
  it("counts active and blocked households towards the total", () => {
    const households = [
      { id: 1, status: "ACTIVE" },
      { id: 2, status: "BLOCKED" },
    ] as const;

    expect(campaignProgress(households, new Set())).toEqual({ received: 0, total: 2 });
  });

  it("leaves archived households out of the total", () => {
    const households = [
      { id: 1, status: "ACTIVE" },
      { id: 2, status: "ARCHIVED" },
    ] as const;

    expect(campaignProgress(households, new Set())).toEqual({ received: 0, total: 1 });
  });

  it("counts only ticked households that are still on the register as received", () => {
    const households = [
      { id: 1, status: "ACTIVE" },
      { id: 2, status: "BLOCKED" },
      { id: 3, status: "ARCHIVED" },
      { id: 4, status: "ACTIVE" },
    ] as const;

    // 3 was ticked before it was archived; 99 is not a household at all.
    expect(campaignProgress(households, new Set([2, 3, 99]))).toEqual({ received: 1, total: 3 });
  });
});
