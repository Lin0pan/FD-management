import { faker } from "@faker-js/faker";
import { beforeEach, describe, expect, it } from "vitest";
import type { IssuedCard } from "@/domain/card/card";
import {
  createCustomerDetails,
  type CustomerStatus,
  type RegisteredCustomer,
} from "@/domain/customer/customer";
import type { GroupCounts } from "@/domain/customer/group";
import {
  CampaignReminderAlreadyActive,
  CampaignReminderNameTooLong,
  CampaignReminderNotActive,
  CustomerArchived,
  CustomerNotFound,
  MissingRequiredField,
} from "@/domain/errors";
import type {
  ArchivedCustomer,
  AuditEntry,
  AuditLog,
  CampaignReminder,
  CampaignReminderRepository,
  Clock,
  CustomerRepository,
} from "../ports";
import { campaignReminderFor } from "./campaign-reminder-for";
import { endCampaignReminder } from "./end-campaign-reminder";
import { readCampaignReminder } from "./read-campaign-reminder";
import { renameCampaignReminder } from "./rename-campaign-reminder";
import { setCampaignReminderReceived } from "./set-campaign-reminder-received";
import { startCampaignReminder } from "./start-campaign-reminder";

/** Hand-written fakes and synthetic data only. */

faker.seed(20261011);

const REGISTERED = new Date("2026-09-01T10:00:00.000Z");
const SWITCHED_ON = new Date("2026-11-30T09:00:00.000Z");

interface StoredReminder {
  readonly id: number;
  name: string;
  readonly startedAt: Date;
  endedAt: Date | null;
}

/** Keeps every reminder ever switched on, as the adapter does, and refuses a second active one. */
class FakeCampaignReminderRepository implements CampaignReminderRepository {
  readonly reminders: StoredReminder[] = [];
  readonly ticks = new Map<number, Set<number>>();

  findActive(): Promise<CampaignReminder | null> {
    const active = this.reminders.find((reminder) => reminder.endedAt === null);
    return Promise.resolve(
      active ? { id: active.id, name: active.name, startedAt: active.startedAt } : null,
    );
  }

  start(name: string, at: Date): Promise<CampaignReminder> {
    if (this.reminders.some((reminder) => reminder.endedAt === null)) {
      return Promise.reject(new CampaignReminderAlreadyActive());
    }
    const stored = { id: this.reminders.length + 1, name, startedAt: at, endedAt: null };
    this.reminders.push(stored);
    return Promise.resolve({ id: stored.id, name, startedAt: at });
  }

  rename(reminderId: number, name: string): Promise<void> {
    this.stored(reminderId).name = name;
    return Promise.resolve();
  }

  end(reminderId: number, at: Date): Promise<void> {
    this.stored(reminderId).endedAt = at;
    this.ticks.delete(reminderId);
    return Promise.resolve();
  }

  receivedCustomerIds(reminderId: number): Promise<ReadonlySet<number>> {
    return Promise.resolve(new Set(this.ticks.get(reminderId)));
  }

  setReceived(reminderId: number, customerId: number, received: boolean): Promise<void> {
    const ticked = this.ticks.get(reminderId) ?? new Set<number>();
    if (received) {
      ticked.add(customerId);
    } else {
      ticked.delete(customerId);
    }
    this.ticks.set(reminderId, ticked);
    return Promise.resolve();
  }

  private stored(reminderId: number): StoredReminder {
    const stored = this.reminders.find((reminder) => reminder.id === reminderId);
    if (!stored) {
      throw new Error(`no reminder ${reminderId} in the fake`);
    }
    return stored;
  }
}

/** A register the campaign reads and nothing else; every write belongs to another suite. */
class FakeCustomerRepository implements CustomerRepository {
  readonly holders: RegisteredCustomer[] = [];

  listWithStatus(status: CustomerStatus): Promise<ReadonlyArray<RegisteredCustomer>> {
    return Promise.resolve(this.holders.filter((customer) => customer.status === status));
  }

  findById(id: number): Promise<RegisteredCustomer | null> {
    return Promise.resolve(this.holders.find((customer) => customer.id === id) ?? null);
  }

  list(): Promise<ReadonlyArray<RegisteredCustomer>> {
    return Promise.reject(new Error("the customer list has a suite of its own"));
  }

  findByCustomerNumber(): Promise<RegisteredCustomer | null> {
    return Promise.reject(new Error("the lookup has a suite of its own"));
  }

  takenActiveNumbers(): Promise<ReadonlyArray<number>> {
    return Promise.reject(new Error("number allocation has a suite of its own"));
  }

  groupCounts(): Promise<GroupCounts> {
    return Promise.reject(new Error("group counts have a suite of their own"));
  }

  searchArchived(): Promise<ReadonlyArray<ArchivedCustomer>> {
    return Promise.reject(new Error("the archive search has a suite of its own"));
  }

  create(): Promise<RegisteredCustomer> {
    return Promise.reject(new Error("registration has a suite of its own"));
  }

  updateHousehold(): Promise<void> {
    return Promise.reject(new Error("the household editor has a suite of its own"));
  }

  updateDetails(): Promise<void> {
    return Promise.reject(new Error("the details editor has a suite of its own"));
  }

  updateNotes(): Promise<void> {
    return Promise.reject(new Error("the notes have a suite of their own"));
  }

  changeCustomerNumber(): Promise<IssuedCard> {
    return Promise.reject(new Error("the number change has a suite of its own"));
  }

  setStatus(): Promise<void> {
    return Promise.reject(new Error("blocking has a suite of its own"));
  }

  archive(): Promise<void> {
    return Promise.reject(new Error("archiving has a suite of its own"));
  }
}

class FakeAuditLog implements AuditLog {
  readonly entries: AuditEntry[] = [];

  append(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

function fakeClock(at: Date): Clock {
  return { now: () => at };
}

function household(id: number, status: CustomerStatus = "ACTIVE"): RegisteredCustomer {
  const self = {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    birthDate: new Date("1979-06-02T00:00:00.000Z"),
  };
  const details = createCustomerDetails(
    {
      ...self,
      address: {
        street: faker.location.street(),
        houseNumber: faker.location.buildingNumber(),
        zip: faker.location.zipCode("#####"),
        city: faker.location.city(),
      },
      certificate: { type: "Jobcenter", validUntil: new Date("2027-03-31T00:00:00.000Z") },
      householdMembers: [self],
      notes: "",
    },
    REGISTERED,
  );
  return {
    id,
    customerNumber: id,
    status,
    blockReason: status === "BLOCKED" ? "Hausverbot" : null,
    archiveReason: status === "ARCHIVED" ? "Weggezogen" : null,
    archivedAt: status === "ARCHIVED" ? REGISTERED : null,
    reminderCount: 0,
    details,
    card: {
      customerNumber: id,
      index: 1,
      issuedAt: REGISTERED,
      reason: "FIRST_ISSUE",
      countsAtIssue: { grownUps: 1, children: 0 },
      printedAt: REGISTERED,
    },
    registeredOn: REGISTERED,
    previousCustomerId: null,
  };
}

describe("the campaign reminder", () => {
  let campaignReminders: FakeCampaignReminderRepository;
  let customers: FakeCustomerRepository;
  let audit: FakeAuditLog;

  function deps(at = SWITCHED_ON) {
    return { campaignReminders, customers, clock: fakeClock(at), audit };
  }

  beforeEach(() => {
    campaignReminders = new FakeCampaignReminderRepository();
    customers = new FakeCustomerRepository();
    audit = new FakeAuditLog();
    customers.holders.push(household(1), household(2), household(3, "BLOCKED"));
  });

  it("reads no reminder while none is on", async () => {
    expect(await readCampaignReminder(deps())).toBeNull();
  });

  it("switches a named reminder on", async () => {
    const started = await startCampaignReminder(deps(), { name: "  Weihnachtstüte " });

    expect(started).toEqual({ id: 1, name: "Weihnachtstüte", startedAt: SWITCHED_ON });
    expect(await readCampaignReminder(deps())).toEqual({
      id: 1,
      name: "Weihnachtstüte",
      startedAt: SWITCHED_ON,
      received: 0,
      total: 3,
    });
  });

  it("refuses a name that is blank or too long, switching nothing on", async () => {
    await expect(startCampaignReminder(deps(), { name: "   " })).rejects.toThrow(
      MissingRequiredField,
    );
    await expect(startCampaignReminder(deps(), { name: "x".repeat(41) })).rejects.toThrow(
      CampaignReminderNameTooLong,
    );

    expect(campaignReminders.reminders).toHaveLength(0);
    expect(audit.entries).toHaveLength(0);
  });

  it("refuses a second reminder while one is on", async () => {
    await startCampaignReminder(deps(), { name: "Weihnachtstüte" });

    await expect(startCampaignReminder(deps(), { name: "Ostertüte" })).rejects.toThrow(
      CampaignReminderAlreadyActive,
    );
    expect(campaignReminders.reminders).toHaveLength(1);
    expect(audit.entries).toHaveLength(1);
  });

  it("reads nobody as received when a reminder has just been switched on", async () => {
    await startCampaignReminder(deps(), { name: "Weihnachtstüte" });

    expect(await readCampaignReminder(deps())).toMatchObject({ received: 0, total: 3 });
  });

  it("counts ticked households, and an archived one in neither figure", async () => {
    customers.holders.push(household(4, "ARCHIVED"));
    const { id } = await startCampaignReminder(deps(), { name: "Weihnachtstüte" });
    await campaignReminders.setReceived(id, 1, true);
    await campaignReminders.setReceived(id, 3, true);
    await campaignReminders.setReceived(id, 4, true);

    expect(await readCampaignReminder(deps())).toMatchObject({ received: 2, total: 3 });
  });

  it("counts a household registered during the campaign as not yet received", async () => {
    const { id } = await startCampaignReminder(deps(), { name: "Weihnachtstüte" });
    await campaignReminders.setReceived(id, 1, true);

    customers.holders.push(household(5));

    expect(await readCampaignReminder(deps())).toMatchObject({ received: 1, total: 4 });
  });

  it("renames the reminder and keeps the ticks", async () => {
    const { id } = await startCampaignReminder(deps(), { name: "Weihnachtstüte" });
    await campaignReminders.setReceived(id, 2, true);

    await renameCampaignReminder(deps(), { reminderId: id, name: "Ostertüte" });

    expect(await readCampaignReminder(deps())).toEqual({
      id,
      name: "Ostertüte",
      startedAt: SWITCHED_ON,
      received: 1,
      total: 3,
    });
  });

  it("refuses a blank new name, renaming nothing", async () => {
    const { id } = await startCampaignReminder(deps(), { name: "Weihnachtstüte" });

    await expect(renameCampaignReminder(deps(), { reminderId: id, name: " " })).rejects.toThrow(
      MissingRequiredField,
    );
    expect(campaignReminders.reminders[0].name).toBe("Weihnachtstüte");
  });

  it("renaming to the same name writes nothing", async () => {
    const { id } = await startCampaignReminder(deps(), { name: "Weihnachtstüte" });
    campaignReminders.rename = () => Promise.reject(new Error("the same name must not be written"));

    await renameCampaignReminder(deps(), { reminderId: id, name: " Weihnachtstüte  " });

    expect(audit.entries.map((entry) => entry.what)).toEqual(["campaignReminder.started"]);
  });

  it("switches the reminder off and forgets every tick", async () => {
    const { id } = await startCampaignReminder(deps(), { name: "Weihnachtstüte" });
    await campaignReminders.setReceived(id, 1, true);
    await campaignReminders.setReceived(id, 2, true);
    const switchedOff = new Date("2027-01-08T15:00:00.000Z");

    await endCampaignReminder(deps(switchedOff), { reminderId: id });

    expect(await readCampaignReminder(deps())).toBeNull();
    expect(await campaignReminders.receivedCustomerIds(id)).toEqual(new Set());
    expect(campaignReminders.reminders[0]).toMatchObject({ id, endedAt: switchedOff });
  });

  it("starts everyone at not yet received when switched on again", async () => {
    const first = await startCampaignReminder(deps(), { name: "Weihnachtstüte" });
    await campaignReminders.setReceived(first.id, 1, true);
    await endCampaignReminder(deps(), { reminderId: first.id });

    const second = await startCampaignReminder(deps(), { name: "Weihnachtstüte" });

    expect(second.id).not.toBe(first.id);
    expect(await readCampaignReminder(deps())).toMatchObject({ received: 0, total: 3 });
  });

  it("refuses to rename or switch off a reminder that is no longer on", async () => {
    const first = await startCampaignReminder(deps(), { name: "Weihnachtstüte" });
    await endCampaignReminder(deps(), { reminderId: first.id });

    await expect(
      renameCampaignReminder(deps(), { reminderId: first.id, name: "Ostertüte" }),
    ).rejects.toThrow(CampaignReminderNotActive);
    await expect(endCampaignReminder(deps(), { reminderId: first.id })).rejects.toThrow(
      CampaignReminderNotActive,
    );

    // A screen read before the switch-off and the switch-on again must not reach the newer one.
    await startCampaignReminder(deps(), { name: "Ostertüte" });
    await expect(
      renameCampaignReminder(deps(), { reminderId: first.id, name: "Neujahr" }),
    ).rejects.toThrow(CampaignReminderNotActive);
    await expect(endCampaignReminder(deps(), { reminderId: first.id })).rejects.toThrow(
      CampaignReminderNotActive,
    );
    expect(await readCampaignReminder(deps())).toMatchObject({ name: "Ostertüte" });
    expect(audit.entries).toHaveLength(3);
  });

  it("audits switching on, renaming and switching off", async () => {
    const renamedAt = new Date("2026-12-01T09:00:00.000Z");
    const switchedOff = new Date("2027-01-08T15:00:00.000Z");
    const { id } = await startCampaignReminder(deps(), { name: "Weihnachtstüte" });
    await renameCampaignReminder(deps(renamedAt), { reminderId: id, name: "Ostertüte" });
    await campaignReminders.setReceived(id, 1, true);
    await campaignReminders.setReceived(id, 3, true);

    await endCampaignReminder(deps(switchedOff), { reminderId: id });

    expect(audit.entries).toEqual([
      {
        what: "campaignReminder.started",
        changedFields: ["name"],
        when: SWITCHED_ON,
        why: "Weihnachtstüte",
      },
      {
        what: "campaignReminder.renamed",
        changedFields: ["name"],
        when: renamedAt,
        why: "„Weihnachtstüte“ → „Ostertüte“",
      },
      {
        what: "campaignReminder.ended",
        changedFields: ["name"],
        when: switchedOff,
        why: "Ostertüte · 2 Häkchen",
      },
    ]);
  });
});

describe("ticking a household off", () => {
  let campaignReminders: FakeCampaignReminderRepository;
  let customers: FakeCustomerRepository;
  let audit: FakeAuditLog;

  // No distribution session in these deps at all: a tick needs none (D3).
  function deps() {
    return { campaignReminders, customers, clock: fakeClock(SWITCHED_ON), audit };
  }

  async function switchedOn(name = "Weihnachtstüte"): Promise<number> {
    const { id } = await startCampaignReminder(deps(), { name });
    audit.entries.length = 0;
    return id;
  }

  beforeEach(() => {
    campaignReminders = new FakeCampaignReminderRepository();
    customers = new FakeCustomerRepository();
    audit = new FakeAuditLog();
    customers.holders.push(household(1), household(2, "BLOCKED"), household(3, "ARCHIVED"));
  });

  it("ticks off a household at any time", async () => {
    const reminderId = await switchedOn();

    await setCampaignReminderReceived(deps(), { reminderId, customerId: 1, received: true });
    await setCampaignReminderReceived(deps(), { reminderId, customerId: 1, received: true });

    expect(await campaignReminderFor(deps(), 1)).toEqual({
      reminderId,
      name: "Weihnachtstüte",
      received: true,
    });
    expect(await readCampaignReminder(deps())).toMatchObject({ received: 1, total: 2 });
  });

  it("unticks a household without asking why", async () => {
    const reminderId = await switchedOn();
    await setCampaignReminderReceived(deps(), { reminderId, customerId: 1, received: true });

    await setCampaignReminderReceived(deps(), { reminderId, customerId: 1, received: false });

    expect(await campaignReminderFor(deps(), 1)).toMatchObject({ received: false });
  });

  it("ticks off a blocked household", async () => {
    const reminderId = await switchedOn();

    await setCampaignReminderReceived(deps(), { reminderId, customerId: 2, received: true });

    expect(await campaignReminderFor(deps(), 2)).toMatchObject({ received: true });
  });

  it("refuses an archived household", async () => {
    const reminderId = await switchedOn();

    await expect(
      setCampaignReminderReceived(deps(), { reminderId, customerId: 3, received: true }),
    ).rejects.toThrow(CustomerArchived);
    await expect(
      setCampaignReminderReceived(deps(), { reminderId, customerId: 99, received: true }),
    ).rejects.toThrow(CustomerNotFound);
    expect(await campaignReminders.receivedCustomerIds(reminderId)).toEqual(new Set());
  });

  it("refuses a tick for a reminder that has been switched off", async () => {
    const first = await switchedOn();
    await endCampaignReminder(deps(), { reminderId: first });
    const second = await switchedOn("Ostertüte");

    await expect(
      setCampaignReminderReceived(deps(), { reminderId: first, customerId: 1, received: true }),
    ).rejects.toThrow(CampaignReminderNotActive);
    expect(await campaignReminders.receivedCustomerIds(second)).toEqual(new Set());
  });

  it("does not audit a single tick", async () => {
    const reminderId = await switchedOn();

    await setCampaignReminderReceived(deps(), { reminderId, customerId: 1, received: true });
    await setCampaignReminderReceived(deps(), { reminderId, customerId: 1, received: false });

    expect(audit.entries).toEqual([]);
  });

  it("shows no checkbox while no reminder is on", async () => {
    expect(await campaignReminderFor(deps(), 1)).toBeNull();
  });

  it("shows no checkbox for an archived household", async () => {
    await switchedOn();

    expect(await campaignReminderFor(deps(), 3)).toBeNull();
    expect(await campaignReminderFor(deps(), 99)).toBeNull();
  });
});
