import { faker } from "@faker-js/faker";
import { describe, expect, it } from "vitest";
import {
  BirthDateInFuture,
  EmptyHousehold,
  InvalidCustomerRecord,
  MissingRequiredField,
  NotesTooLong,
} from "../errors";
import {
  createCustomerDetails,
  createHouseholdMembers,
  createNotes,
  createPersonalDetails,
  NOTES_MAX_LENGTH,
  parseCustomerStatus,
  replaceHouseholdMember,
  type CustomerDetailsInput,
  type HouseholdMemberDetails,
  type PersonalDetails,
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

describe("createHouseholdMembers", () => {
  it("keeps the rows it was given, trimmed, so a stray space cannot pass as a name", () => {
    const members = createHouseholdMembers(
      [member({ firstName: "  Anna  ", lastName: " Meier " })],
      TODAY,
    );

    expect(members).toEqual([
      { firstName: "Anna", lastName: "Meier", birthDate: new Date("1990-04-05T00:00:00.000Z") },
    ]);
  });

  it("names the household row whose name is missing, not the household as a whole", () => {
    try {
      createHouseholdMembers([member(), member({ firstName: "   " })], TODAY);
      expect.unreachable("createHouseholdMembers should have rejected the blank name");
    } catch (error: unknown) {
      expect((error as MissingRequiredField).field).toBe("householdMembers.1.firstName");
    }
  });

  it("rejects a household with no members at all", () => {
    expect(() => createHouseholdMembers([], TODAY)).toThrow(EmptyHousehold);
  });

  it("rejects a member born after today", () => {
    const rows = [member({ birthDate: new Date("2026-07-23T00:00:00.000Z") })];

    expect(() => createHouseholdMembers(rows, TODAY)).toThrow(BirthDateInFuture);
  });

  it("accepts a member born today — a newborn belongs to the household at once", () => {
    const rows = [member({ birthDate: new Date("2026-07-22T00:00:00.000Z") })];

    expect(createHouseholdMembers(rows, TODAY)).toHaveLength(1);
  });

  it("copies the rows, so a later change to the input cannot alter the household", () => {
    const rows = [member()];

    const members = createHouseholdMembers(rows, TODAY);
    rows.push(member());

    expect(members).toHaveLength(1);
  });
});

describe("createPersonalDetails", () => {
  function personalInput(overrides: Partial<PersonalDetails> = {}): PersonalDetails {
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
      ...overrides,
    };
  }

  it("keeps every field it was given, trimmed", () => {
    const details = createPersonalDetails(
      personalInput({
        firstName: "  Anna  ",
        lastName: " Meier ",
        address: { street: " Hauptweg ", houseNumber: " 3 ", zip: " 33129 ", city: " Delbrück " },
      }),
      TODAY,
    );

    expect(details.firstName).toBe("Anna");
    expect(details.lastName).toBe("Meier");
    expect(details.address).toEqual({
      street: "Hauptweg",
      houseNumber: "3",
      zip: "33129",
      city: "Delbrück",
    });
  });

  it("names the field that was left blank, so the form can mark the input", () => {
    try {
      createPersonalDetails(personalInput({ lastName: "  " }), TODAY);
      expect.unreachable("createPersonalDetails should have rejected the blank name");
    } catch (error: unknown) {
      expect((error as MissingRequiredField).field).toBe("lastName");
    }
  });

  it("names the address part that was left blank", () => {
    const address = { street: "Hauptweg", houseNumber: "3", zip: "", city: "Delbrück" };

    try {
      createPersonalDetails(personalInput({ address }), TODAY);
      expect.unreachable("createPersonalDetails should have rejected the blank zip");
    } catch (error: unknown) {
      expect((error as MissingRequiredField).field).toBe("address.zip");
    }
  });

  it("rejects a birthdate that lies after today", () => {
    const input = personalInput({ birthDate: new Date("2026-07-23T00:00:00.000Z") });

    expect(() => createPersonalDetails(input, TODAY)).toThrow(BirthDateInFuture);
  });

  it("accepts a birthdate of today", () => {
    const input = personalInput({ birthDate: new Date("2026-07-22T23:00:00.000Z") });

    expect(createPersonalDetails(input, TODAY).birthDate).toEqual(
      new Date("2026-07-22T23:00:00.000Z"),
    );
  });
});

describe("createNotes", () => {
  it("keeps the text as written, including its line breaks", () => {
    expect(createNotes("Klingel defekt\nBitte anrufen")).toBe("Klingel defekt\nBitte anrufen");
  });

  it("accepts an empty note — most households need none", () => {
    expect(createNotes("")).toBe("");
  });

  it("trims the surrounding whitespace, so a note of blanks is no note at all", () => {
    expect(createNotes("   \n  ")).toBe("");
  });

  it("accepts a note of exactly the maximum length", () => {
    expect(createNotes("x".repeat(NOTES_MAX_LENGTH))).toHaveLength(NOTES_MAX_LENGTH);
  });

  it("rejects a note one character past the maximum, naming both lengths", () => {
    try {
      createNotes("x".repeat(NOTES_MAX_LENGTH + 1));
      expect.unreachable("createNotes should have rejected the over-long note");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(NotesTooLong);
      expect((error as NotesTooLong).length).toBe(NOTES_MAX_LENGTH + 1);
      expect((error as NotesTooLong).maxLength).toBe(NOTES_MAX_LENGTH);
    }
  });

  it("measures the trimmed text, so trailing blanks alone cannot break the limit", () => {
    expect(createNotes(`${"x".repeat(NOTES_MAX_LENGTH)}      `)).toHaveLength(NOTES_MAX_LENGTH);
  });
});

describe("replaceHouseholdMember", () => {
  const was = { firstName: "Anna", lastName: "Meier", birthDate: new Date("1985-03-11") };
  const becomes = { firstName: "Anna", lastName: "Schmidt", birthDate: new Date("1985-03-11") };

  it("restates the row that held the old name, leaving the rest of the household alone", () => {
    const child = member({ firstName: "Jonas", lastName: "Meier" });

    const members = replaceHouseholdMember([was, child], was, becomes);

    expect(members).toEqual([becomes, child]);
  });

  it("restates only the first matching row — one person cannot live in the household twice", () => {
    const members = replaceHouseholdMember([was, { ...was }], was, becomes);

    expect(members).toEqual([becomes, was]);
  });

  it("matches on the birthdate too, so two namesakes are not confused for one", () => {
    const namesake = { ...was, birthDate: new Date("2011-03-11") };

    const members = replaceHouseholdMember([namesake, was], was, becomes);

    expect(members).toEqual([namesake, becomes]);
  });

  it("leaves the household untouched when no row was the person described", () => {
    const others = [member(), member()];

    expect(replaceHouseholdMember(others, was, becomes)).toEqual(others);
  });

  it("copies the rows, so a later change to the input cannot alter the household", () => {
    const rows = [was];

    const members = replaceHouseholdMember(rows, was, becomes);
    rows.push(member());

    expect(members).toHaveLength(1);
  });
});

describe("parseCustomerStatus", () => {
  it("reads ACTIVE back from a stored row", () => {
    expect(parseCustomerStatus("ACTIVE")).toBe("ACTIVE");
  });

  it("reads BLOCKED back from a stored row", () => {
    expect(parseCustomerStatus("BLOCKED")).toBe("BLOCKED");
  });

  it("reads ARCHIVED back from a stored row", () => {
    expect(parseCustomerStatus("ARCHIVED")).toBe("ARCHIVED");
  });

  it("rejects an unknown status rather than treating the household as active", () => {
    try {
      parseCustomerStatus("GESPERRT");
      expect.unreachable("parseCustomerStatus should have rejected the value");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(InvalidCustomerRecord);
      expect((error as InvalidCustomerRecord).field).toBe("status");
      expect((error as InvalidCustomerRecord).value).toBe("GESPERRT");
    }
  });
});
