import { describe, expect, it } from "vitest";
import {
  CERTIFICATE_TYPE_OTHER,
  certificateTypeMark,
  resolveCertificateType,
} from "./certificate-type-resolver";

/**
 * The two rules the Art-des-Nachweises drop-down is read by (US-33.5). Both are pure and both are
 * shared by four screens, which is what makes them worth a test of their own: a screen reading the
 * pair differently is exactly the drift the one component exists to prevent.
 */

const REQUIRED = "Pflichtfeld";

describe("resolveCertificateType", () => {
  it("takes the chosen type when a configured one is chosen", () => {
    expect(resolveCertificateType("Jobcenter-Bescheid", "")).toBe("Jobcenter-Bescheid");
  });

  it("takes the free text under „Sonstiges“", () => {
    expect(resolveCertificateType(CERTIFICATE_TYPE_OTHER, "Bescheid vom Sozialgericht")).toBe(
      "Bescheid vom Sozialgericht",
    );
  });

  it("hands a blank on rather than refusing it — that is the domain's answer to give", () => {
    expect(resolveCertificateType(CERTIFICATE_TYPE_OTHER, "")).toBe("");
    expect(resolveCertificateType("", "")).toBe("");
  });

  it("ignores free text left behind under a configured choice", () => {
    expect(resolveCertificateType("Wohngeldbescheid", "getippt und verworfen")).toBe(
      "Wohngeldbescheid",
    );
  });
});

describe("certificateTypeMark", () => {
  it("marks the free-text box when „Sonstiges“ was the choice", () => {
    expect(
      certificateTypeMark({ path: "certificateType", problem: REQUIRED }, CERTIFICATE_TYPE_OTHER),
    ).toEqual({ path: "certificateTypeOther", problem: REQUIRED });
  });

  it("marks the select itself when nothing was chosen", () => {
    expect(certificateTypeMark({ path: "certificateType", problem: REQUIRED }, "")).toEqual({
      path: "certificateType",
      problem: REQUIRED,
    });
  });

  it("leaves every other field where the refusal put it", () => {
    expect(certificateTypeMark({ path: "zip", problem: REQUIRED }, CERTIFICATE_TYPE_OTHER)).toEqual(
      {
        path: "zip",
        problem: REQUIRED,
      },
    );
  });

  it("passes a refusal that names no field through untouched", () => {
    expect(certificateTypeMark(null, CERTIFICATE_TYPE_OTHER)).toBeNull();
  });
});
