import { faker } from "@faker-js/faker";
import { describe, expect, it } from "vitest";
import { BirthDateInFuture, CertificateExpired, MissingRequiredField } from "../errors";
import type { NeedsCertificate } from "./customer";
import {
  createWaitingListDetails,
  inArrivalOrder,
  nextInLine,
  type WaitingApplicant,
  type WaitingListDetails,
} from "./waitingList";

function at(isoDate: string, time = "00:00:00.000"): Date {
  return new Date(`${isoDate}T${time}Z`);
}

function certificateValidUntil(isoDate: string): NeedsCertificate {
  return { type: "Jobcenter", validUntil: at(isoDate) };
}

/** An applicant reduced to what the ordering rule turns on: when they joined, and their id. */
function applicant(id: number, addedOn: Date, validUntil = "2030-12-31"): WaitingApplicant {
  return { id, addedOn, certificate: certificateValidUntil(validUntil) };
}

describe("nextInLine", () => {
  it("names the only applicant on a list of one", () => {
    const only = applicant(1, at("2026-07-01"));

    expect(nextInLine([only], at("2026-07-20"))).toEqual({
      kind: "NEXT_IN_LINE",
      entry: only,
      certificateExpired: false,
    });
  });

  it("names the applicant who joined earliest, whatever order the list arrives in", () => {
    const first = applicant(9, at("2026-05-04"));
    const later = applicant(2, at("2026-06-04"));
    const latest = applicant(5, at("2026-07-04"));

    expect(nextInLine([latest, first, later], at("2026-07-20"))).toMatchObject({ entry: first });
    expect(nextInLine([later, latest, first], at("2026-07-20"))).toMatchObject({ entry: first });
  });

  it("breaks a same-day tie by insertion id, not by the order the rows came back in", () => {
    const sameMoment = at("2026-06-04", "09:15:00.000");
    const earlierInsertion = applicant(3, sameMoment);
    const laterInsertion = applicant(7, sameMoment);

    expect(nextInLine([laterInsertion, earlierInsertion], at("2026-07-20"))).toMatchObject({
      entry: earlierInsertion,
    });
    expect(nextInLine([earlierInsertion, laterInsertion], at("2026-07-20"))).toMatchObject({
      entry: earlierInsertion,
    });
  });

  it("still names the longest-waiting applicant when their certificate expired while they waited", () => {
    const expiredAtTheHead = applicant(1, at("2026-01-04"), "2026-06-30");
    const validBehindThem = applicant(2, at("2026-02-04"));

    expect(nextInLine([expiredAtTheHead, validBehindThem], at("2026-07-20"))).toEqual({
      kind: "NEXT_IN_LINE",
      entry: expiredAtTheHead,
      certificateExpired: true,
    });
  });

  it("counts a certificate as still valid on its last day", () => {
    const head = applicant(1, at("2026-01-04"), "2026-07-20");

    expect(nextInLine([head], at("2026-07-20"))).toMatchObject({ certificateExpired: false });
  });

  it("counts a certificate as expired the day after its last day", () => {
    const head = applicant(1, at("2026-01-04"), "2026-07-20");

    expect(nextInLine([head], at("2026-07-21"))).toMatchObject({ certificateExpired: true });
  });

  it("reports an empty waiting list as a result of its own rather than as nothing at all", () => {
    expect(nextInLine([], at("2026-07-20"))).toEqual({ kind: "WAITING_LIST_EMPTY" });
  });
});

describe("inArrivalOrder", () => {
  it("puts the applicants in the order they joined, ties by insertion id", () => {
    const sameMoment = at("2026-06-04", "09:15:00.000");
    const first = applicant(9, at("2026-05-04"));
    const secondByTie = applicant(3, sameMoment);
    const thirdByTie = applicant(7, sameMoment);
    const last = applicant(1, at("2026-07-04"));

    expect(inArrivalOrder([last, thirdByTie, first, secondByTie])).toEqual([
      first,
      secondByTie,
      thirdByTie,
      last,
    ]);
  });

  it("leaves the caller's list untouched", () => {
    const first = applicant(1, at("2026-05-04"));
    const second = applicant(2, at("2026-06-04"));
    const asRead = [second, first];

    inArrivalOrder(asRead);

    expect(asRead).toEqual([second, first]);
  });

  it("orders an empty list into an empty list", () => {
    expect(inArrivalOrder([])).toEqual([]);
  });
});

faker.seed(20260727);

/** Synthetic throughout, per the testing standard — no real applicant ever appears in a fixture. */
const APPLICANT = {
  firstName: faker.person.firstName(),
  lastName: faker.person.lastName(),
  address: {
    street: faker.location.street(),
    houseNumber: faker.location.buildingNumber(),
    zip: faker.location.zipCode("#####"),
    city: faker.location.city(),
  },
};

/** A complete, admissible application — each test spoils exactly the one field it is about. */
function application(overrides: Partial<WaitingListDetails> = {}): WaitingListDetails {
  return {
    firstName: APPLICANT.firstName,
    lastName: APPLICANT.lastName,
    birthDate: at("1988-03-17"),
    address: { ...APPLICANT.address },
    contactNote: "erreichbar über die Nachbarin",
    certificate: certificateValidUntil("2027-01-31"),
    ...overrides,
  };
}

describe("createWaitingListDetails", () => {
  it("refuses an applicant whose certificate has already expired", () => {
    const lapsed = application({ certificate: certificateValidUntil("2026-07-19") });

    expect(() => createWaitingListDetails(lapsed, at("2026-07-20"))).toThrow(CertificateExpired);
  });

  it("admits an applicant on the last day their certificate is valid", () => {
    const lastDay = application({ certificate: certificateValidUntil("2026-07-20") });

    expect(createWaitingListDetails(lastDay, at("2026-07-20"))).toMatchObject({
      firstName: APPLICANT.firstName,
    });
  });

  it("refuses an application that leaves an identifying field blank", () => {
    const blanked: ReadonlyArray<[string, Partial<WaitingListDetails>]> = [
      ["firstName", { firstName: "  " }],
      ["lastName", { lastName: "" }],
      ["address.street", { address: { ...application().address, street: " " } }],
      ["address.houseNumber", { address: { ...application().address, houseNumber: "" } }],
      ["address.zip", { address: { ...application().address, zip: "" } }],
      ["address.city", { address: { ...application().address, city: "" } }],
      ["certificate.type", { certificate: { type: " ", validUntil: at("2027-01-31") } }],
    ];

    for (const [field, override] of blanked) {
      expect(() => createWaitingListDetails(application(override), at("2026-07-20"))).toThrow(
        new MissingRequiredField(field),
      );
    }
  });

  it("refuses an applicant born after the day they applied", () => {
    const tomorrow = application({ birthDate: at("2026-07-21") });

    expect(() => createWaitingListDetails(tomorrow, at("2026-07-20"))).toThrow(BirthDateInFuture);
  });

  it("trims what staff typed, and keeps a missing contact note as no note at all", () => {
    const untidy = application({
      firstName: ` ${APPLICANT.firstName} `,
      lastName: `${APPLICANT.lastName} `,
      contactNote: "   ",
    });

    expect(createWaitingListDetails(untidy, at("2026-07-20"))).toEqual({
      firstName: APPLICANT.firstName,
      lastName: APPLICANT.lastName,
      birthDate: at("1988-03-17"),
      address: { ...APPLICANT.address },
      contactNote: "",
      certificate: { type: "Jobcenter", validUntil: at("2027-01-31") },
    });
  });
});
