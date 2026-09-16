import { describe, expect, it } from "vitest";
import { CertificateTypeTooLong, DuplicateCertificateType, MissingRequiredField } from "../errors";
import {
  CERTIFICATE_TYPE_MAX_LENGTH,
  createCertificateTypeList,
  diffCertificateTypes,
} from "./certificateTypes";

describe("createCertificateTypeList", () => {
  it("trims the spelling it stores", () => {
    expect(createCertificateTypeList([" Jobcenter-Bescheid  "])).toEqual(["Jobcenter-Bescheid"]);
  });

  it("refuses a label that is only spaces", () => {
    const failing = () => createCertificateTypeList(["Wohngeldbescheid", "   "]);

    expect(failing).toThrow(MissingRequiredField);
    try {
      failing();
    } catch (error) {
      expect(error).toBeInstanceOf(MissingRequiredField);
      if (error instanceof MissingRequiredField) {
        expect(error.field).toBe("certificateTypes.1.label");
      }
    }
  });

  it("refuses a label longer than the maximum length", () => {
    const label = "a".repeat(CERTIFICATE_TYPE_MAX_LENGTH + 1);

    const failing = () => createCertificateTypeList([label]);

    expect(failing).toThrow(CertificateTypeTooLong);
    try {
      failing();
    } catch (error) {
      expect(error).toBeInstanceOf(CertificateTypeTooLong);
      if (error instanceof CertificateTypeTooLong) {
        expect(error.length).toBe(CERTIFICATE_TYPE_MAX_LENGTH + 1);
        expect(error.maxLength).toBe(CERTIFICATE_TYPE_MAX_LENGTH);
      }
    }
  });

  it("accepts a label at exactly the maximum length", () => {
    const label = "a".repeat(CERTIFICATE_TYPE_MAX_LENGTH);

    expect(createCertificateTypeList([label])).toEqual([label]);
  });

  it('reads „Jobcenter" and „jobcenter" as one type', () => {
    const failing = () => createCertificateTypeList(["Jobcenter", "jobcenter"]);

    expect(failing).toThrow(DuplicateCertificateType);
    try {
      failing();
    } catch (error) {
      expect(error).toBeInstanceOf(DuplicateCertificateType);
      if (error instanceof DuplicateCertificateType) {
        // The second spelling as typed, not the first — that is the row the form marks.
        expect(error.label).toBe("jobcenter");
      }
    }
  });

  it('reads „Wohngeld" and „wohngeld " as one type', () => {
    expect(() => createCertificateTypeList(["Wohngeld", "wohngeld "])).toThrow(
      DuplicateCertificateType,
    );
  });

  it("sorts umlauts where a German reader expects them", () => {
    // Folded, ä/ö/ü/ß spell out to ae/oe/ue/ss, which sorts "Wäsche" next to "wasch…", not after "z".
    expect(createCertificateTypeList(["Zeugnis", "Wäsche", "Attest"])).toEqual([
      "Attest",
      "Wäsche",
      "Zeugnis",
    ]);
  });

  it('accepts an empty list as "no configured types"', () => {
    expect(createCertificateTypeList([])).toEqual([]);
  });

  it("does not reorder between two saves of the same rows", () => {
    const first = createCertificateTypeList(["Zeugnis", "Attest"]);
    const second = createCertificateTypeList(["Zeugnis", "Attest"]);

    expect(first).toEqual(second);
  });
});

describe("diffCertificateTypes", () => {
  it("reports a re-spelling as no change", () => {
    const previous = createCertificateTypeList(["jobcenter"]);
    const next = createCertificateTypeList(["Jobcenter"]);

    expect(diffCertificateTypes(previous, next)).toEqual([]);
  });

  it("reports a re-spelling to an unrelated word as a removal and an addition", () => {
    const previous = createCertificateTypeList(["Jobcenter"]);
    const next = createCertificateTypeList(["JC"]);

    expect(diffCertificateTypes(previous, next)).toEqual([
      { kind: "removed", label: "Jobcenter" },
      { kind: "added", label: "JC" },
    ]);
  });

  it("reports nothing when both lists are empty", () => {
    expect(
      diffCertificateTypes(createCertificateTypeList([]), createCertificateTypeList([])),
    ).toEqual([]);
  });

  it("reports every label as added when the list was filled from empty", () => {
    const next = createCertificateTypeList(["Attest", "Zeugnis"]);

    expect(diffCertificateTypes(createCertificateTypeList([]), next)).toEqual([
      { kind: "added", label: "Attest" },
      { kind: "added", label: "Zeugnis" },
    ]);
  });

  it("reports every label as removed when the list was emptied", () => {
    const previous = createCertificateTypeList(["Attest", "Zeugnis"]);

    expect(diffCertificateTypes(previous, createCertificateTypeList([]))).toEqual([
      { kind: "removed", label: "Attest" },
      { kind: "removed", label: "Zeugnis" },
    ]);
  });

  it("reports an unchanged label as neither added nor removed among other changes", () => {
    const previous = createCertificateTypeList(["Attest", "Jobcenter"]);
    const next = createCertificateTypeList(["Attest", "JC"]);

    expect(diffCertificateTypes(previous, next)).toEqual([
      { kind: "removed", label: "Jobcenter" },
      { kind: "added", label: "JC" },
    ]);
  });
});
