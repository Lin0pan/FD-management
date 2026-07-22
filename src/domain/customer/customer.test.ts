import { faker } from "@faker-js/faker";
import { describe, expect, it } from "vitest";
import { BirthDateInFuture, EmptyHousehold, MissingRequiredField } from "../errors";
import {
  createCustomerDetails,
  type CustomerDetailsInput,
  type HouseholdMemberDetails,
} from "./customer";

/**
 * Synthetic data only, per the testing standard — never a real name, address or certificate. The
 * seed keeps a failure reproducible: the same run always produces the same household.
 */
faker.seed(20260722);

const TODAY = new Date("2026-07-22T09:00:00.000Z");

function member(overrides: Partial<HouseholdMemberDetails> = {}): HouseholdMemberDetails {
  return {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    birthDate: new Date("1990-04-05T00:00:00.000Z"),
    ...overrides,
  };
}

function detailsInput(overrides: Partial<CustomerDetailsInput> = {}): CustomerDetailsInput {
  return {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    birthDate: new Date("1985-03-11T00:00:00.000Z"),
    address: {
      street: faker.location.street(),
      houseNumber: faker.location.buildingNumber(),
      zip: faker.location.zipCode("#####"),
      city: faker.location.city(),
    },
    certificate: { type: "Jobcenter", validUntil: new Date("2027-01-31T00:00:00.000Z") },
    householdMembers: [member()],
    notes: "",
    ...overrides,
  };
}

describe("createCustomerDetails", () => {
  it("keeps the personal data, address, certificate and household it was given", () => {
    const input = detailsInput();

    const details = createCustomerDetails(input, TODAY);

    expect(details.firstName).toBe(input.firstName);
    expect(details.lastName).toBe(input.lastName);
    expect(details.birthDate).toEqual(input.birthDate);
    expect(details.address).toEqual(input.address);
    expect(details.certificate).toEqual(input.certificate);
    expect(details.householdMembers).toHaveLength(1);
    expect(details.householdMembers[0].firstName).toBe(input.householdMembers[0].firstName);
  });

  it("stores every text field trimmed, so a stray space cannot pass as a value", () => {
    const details = createCustomerDetails(
      detailsInput({
        firstName: "  Anna  ",
        householdMembers: [member({ lastName: "  Meier " })],
        notes: "  bringt Korb mit  ",
      }),
      TODAY,
    );

    expect(details.firstName).toBe("Anna");
    expect(details.householdMembers[0].lastName).toBe("Meier");
    expect(details.notes).toBe("bringt Korb mit");
  });

  it("accepts an empty note — a household need not come with a remark", () => {
    const details = createCustomerDetails(detailsInput({ notes: "   " }), TODAY);

    expect(details.notes).toBe("");
  });

  it.each([
    ["firstName", detailsInput({ firstName: "" })],
    ["lastName", detailsInput({ lastName: "  " })],
    ["address.street", detailsInput({ address: { ...detailsInput().address, street: "" } })],
    [
      "address.houseNumber",
      detailsInput({ address: { ...detailsInput().address, houseNumber: "" } }),
    ],
    ["address.zip", detailsInput({ address: { ...detailsInput().address, zip: "" } })],
    ["address.city", detailsInput({ address: { ...detailsInput().address, city: "" } })],
    [
      "certificate.type",
      detailsInput({ certificate: { type: " ", validUntil: new Date("2027-01-31") } }),
    ],
  ])("rejects a registration without %s", (field, input) => {
    const failure = (() => {
      try {
        createCustomerDetails(input, TODAY);
        return undefined;
      } catch (error: unknown) {
        return error;
      }
    })();

    expect(failure).toBeInstanceOf(MissingRequiredField);
    expect((failure as MissingRequiredField).field).toBe(field);
  });

  it("names the household row whose first name is missing, not the form as a whole", () => {
    const input = detailsInput({ householdMembers: [member(), member({ firstName: "" })] });

    const failure = (() => {
      try {
        createCustomerDetails(input, TODAY);
        return undefined;
      } catch (error: unknown) {
        return error;
      }
    })();

    expect((failure as MissingRequiredField).field).toBe("householdMembers.1.firstName");
  });

  it("names the household row whose last name is missing", () => {
    const input = detailsInput({ householdMembers: [member({ lastName: "  " })] });

    const failure = (() => {
      try {
        createCustomerDetails(input, TODAY);
        return undefined;
      } catch (error: unknown) {
        return error;
      }
    })();

    expect((failure as MissingRequiredField).field).toBe("householdMembers.0.lastName");
  });

  it("rejects a household with no members at all", () => {
    expect(() => createCustomerDetails(detailsInput({ householdMembers: [] }), TODAY)).toThrow(
      EmptyHousehold,
    );
  });

  it("rejects a household member born after today", () => {
    const input = detailsInput({
      householdMembers: [member({ birthDate: new Date("2026-07-23T00:00:00.000Z") })],
    });

    expect(() => createCustomerDetails(input, TODAY)).toThrow(BirthDateInFuture);
  });

  it("rejects a customer born after today, even when the household rows are all in the past", () => {
    const input = detailsInput({ birthDate: new Date("2026-07-23T00:00:00.000Z") });

    expect(() => createCustomerDetails(input, TODAY)).toThrow(BirthDateInFuture);
  });

  it("accepts a customer born today", () => {
    const input = detailsInput({ birthDate: new Date("2026-07-22T23:00:00.000Z") });

    expect(createCustomerDetails(input, TODAY).birthDate).toEqual(
      new Date("2026-07-22T23:00:00.000Z"),
    );
  });

  it("copies the household rows, so a later change to the input cannot alter the record", () => {
    const rows = [member()];
    const details = createCustomerDetails(detailsInput({ householdMembers: rows }), TODAY);

    rows.push(member());

    expect(details.householdMembers).toHaveLength(1);
  });
});
