import { beforeEach, describe, expect, it } from "vitest";
import { MissingRequiredField } from "@/domain/errors";
import type { AuditEntry, AuditLog, CertificateTypeRepository, Clock } from "../ports";
import { readCertificateTypes } from "./read-certificate-types";
import { updateCertificateTypes } from "./update-certificate-types";

/**
 * Hand-written fakes, per the testing standard — the application layer is tested against its ports,
 * never against a mocking library.
 */

class FakeCertificateTypeRepository implements CertificateTypeRepository {
  labels: string[];

  constructor(...labels: string[]) {
    this.labels = labels;
  }

  list(): Promise<string[]> {
    return Promise.resolve([...this.labels]);
  }

  replace(labels: ReadonlyArray<string>): Promise<void> {
    this.labels = [...labels];
    return Promise.resolve();
  }
}

class FakeAuditLog implements AuditLog {
  readonly entries: AuditEntry[] = [];

  append(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

function fakeClock(iso: string): Clock {
  return { now: () => new Date(iso) };
}

describe("readCertificateTypes", () => {
  it("reads a stored list back through the domain", async () => {
    const repository = new FakeCertificateTypeRepository("Wohngeldbescheid", "Jobcenter-Bescheid");

    const types = await readCertificateTypes({ certificateTypes: repository });

    // createCertificateTypeList sorts by folded label — proof the read went through it rather than
    // returning the repository's row order untouched.
    expect(types).toEqual(["Jobcenter-Bescheid", "Wohngeldbescheid"]);
  });
});

describe("updateCertificateTypes", () => {
  let repository: FakeCertificateTypeRepository;
  let audit: FakeAuditLog;

  function deps(today = "2026-09-16T08:00:00.000Z") {
    return { certificateTypes: repository, clock: fakeClock(today), audit };
  }

  beforeEach(() => {
    repository = new FakeCertificateTypeRepository("Jobcenter-Bescheid");
    audit = new FakeAuditLog();
  });

  it("refuses the whole list when one label is blank, writing nothing", async () => {
    await expect(updateCertificateTypes(deps(), ["Jobcenter-Bescheid", "  "])).rejects.toThrow(
      MissingRequiredField,
    );

    expect(repository.labels).toEqual(["Jobcenter-Bescheid"]);
    expect(audit.entries).toHaveLength(0);
  });

  it("records the added and removed labels in the entry", async () => {
    await updateCertificateTypes(deps(), ["Wohngeldbescheid"]);

    expect(repository.labels).toEqual(["Wohngeldbescheid"]);
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0].why).toBe("−Jobcenter-Bescheid, +Wohngeldbescheid");
  });

  it("writes nothing when the list is unchanged", async () => {
    await updateCertificateTypes(deps(), ["Jobcenter-Bescheid"]);

    expect(repository.labels).toEqual(["Jobcenter-Bescheid"]);
    expect(audit.entries).toHaveLength(0);
  });

  it("stores a re-spelling without recording a change", async () => {
    // The label is the word the drop-down shows, so the correction is kept — but „jobcenter" and
    // „Jobcenter" are one type, so there is no addition and no removal for the log to name.
    const stored = await updateCertificateTypes(deps(), ["jobcenter-bescheid"]);

    expect(repository.labels).toEqual(["jobcenter-bescheid"]);
    expect(stored).toEqual(["jobcenter-bescheid"]);
    expect(audit.entries).toHaveLength(0);
  });

  it("answers with the stored spelling when the same list is re-submitted", async () => {
    // Not the submitted array: a save that wrote nothing must not report a list nobody stored.
    expect(await updateCertificateTypes(deps(), ["Jobcenter-Bescheid"])).toEqual([
      "Jobcenter-Bescheid",
    ]);
  });

  it("stamps the audit entry with the clock", async () => {
    await updateCertificateTypes(deps("2026-09-16T08:00:00.000Z"), ["Wohngeldbescheid"]);

    expect(audit.entries[0].when).toEqual(new Date("2026-09-16T08:00:00.000Z"));
  });

  it("records the change under a stable event name naming the touched field", async () => {
    await updateCertificateTypes(deps(), ["Wohngeldbescheid"]);

    expect(audit.entries[0].what).toBe("certificateTypes.updated");
    expect(audit.entries[0].changedFields).toEqual(["certificateTypes"]);
  });

  it("returns the list it stored", async () => {
    const stored = await updateCertificateTypes(deps(), [
      "Wohngeldbescheid",
      "Sozialhilfebescheid",
    ]);

    expect(stored).toEqual(["Sozialhilfebescheid", "Wohngeldbescheid"]);
  });
});
