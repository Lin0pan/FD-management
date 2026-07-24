import { faker } from "@faker-js/faker";
import { beforeEach, describe, expect, it } from "vitest";
import type { IssuedCard } from "@/domain/card/card";
import {
  createCustomerDetails,
  type CustomerStatus,
  type HouseholdMemberDetails,
  type NewCustomer,
  type RegisteredCustomer,
} from "@/domain/customer/customer";
import type { GroupCounts } from "@/domain/customer/group";
import {
  BirthDateInFuture,
  CustomerArchived,
  CustomerNumberTaken,
  EmptyHousehold,
  InvalidCustomerRecord,
  MissingRequiredField,
  CustomerNotFound,
  NoFreeCustomerNumber,
  NoSettingsInForce,
} from "@/domain/errors";
import { createSettings, type SettingsInput, type SettingsVersion } from "@/domain/policy/settings";
import type {
  AuditEntry,
  AuditLog,
  CardRepository,
  Clock,
  CustomerRepository,
  SettingsRepository,
} from "../ports";
import { issueCard } from "./issue-card";
import { proposeRegistration } from "./propose-registration";
import { readCard } from "./read-card";
import { readCustomer } from "./read-customer";
import { registerCustomer, type RegisterCustomerInput } from "./register-customer";

/**
 * Hand-written fakes, per the testing standard, and synthetic data only — never a real name, address
 * or certificate. The seed keeps a failing run reproducible.
 */

faker.seed(20260722);

const TODAY = "2026-07-22T09:00:00.000Z";

class FakeSettingsRepository implements SettingsRepository {
  readonly versions: SettingsVersion[] = [];

  constructor(...versions: SettingsVersion[]) {
    this.versions.push(...versions);
  }

  listVersions(): Promise<SettingsVersion[]> {
    return Promise.resolve([...this.versions]);
  }

  append(version: SettingsVersion): Promise<void> {
    this.versions.push(version);
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

/**
 * A register that behaves like the database will: `stealNext` lets another registration claim the
 * chosen number in the moment between the read and the write, which is what makes the concurrency
 * test meaningful rather than a mocked assertion.
 */
class FakeCustomerRepository implements CustomerRepository {
  readonly created: RegisteredCustomer[] = [];
  private nextId = 1;
  /** How many more writes a concurrent registration beats to the chosen number. */
  private stealsLeft = 0;

  constructor(
    private readonly taken: number[] = [],
    private readonly counts: GroupCounts = { red: 0, blue: 0 },
  ) {}

  /** Have another registration take the chosen number, just before this one writes it, `times` over. */
  stealNext(times: number): void {
    this.stealsLeft = times;
  }

  takenActiveNumbers(): Promise<ReadonlyArray<number>> {
    return Promise.resolve([...this.taken]);
  }

  groupCounts(): Promise<GroupCounts> {
    return Promise.resolve(this.counts);
  }

  findById(id: number): Promise<RegisteredCustomer | null> {
    return Promise.resolve(this.created.find((customer) => customer.id === id) ?? null);
  }

  findByCustomerNumber(customerNumber: number): Promise<RegisteredCustomer | null> {
    const holders = this.created.filter((customer) => customer.customerNumber === customerNumber);
    const active = holders.find((customer) => customer.status !== "ARCHIVED");
    if (active !== undefined) {
      return Promise.resolve(active);
    }
    const archived = holders.filter((customer) => customer.status === "ARCHIVED");
    return Promise.resolve(archived.at(-1) ?? null);
  }

  create(customer: NewCustomer): Promise<RegisteredCustomer> {
    if (this.stealsLeft > 0) {
      this.stealsLeft -= 1;
      this.taken.push(customer.customerNumber);
      return Promise.reject(new CustomerNumberTaken(customer.customerNumber));
    }
    this.taken.push(customer.customerNumber);
    const registered: RegisteredCustomer = { ...customer, id: this.nextId };
    this.nextId += 1;
    this.created.push(registered);
    return Promise.resolve(registered);
  }
}

/**
 * A card store that behaves like the table will: cards are kept per customer and `currentCard`
 * answers with the highest index rather than the last one written, so a test can leave a gap in the
 * run — the shape a hand-fixed database or a future deletion would leave — and the use case still
 * has to count on from the top.
 */
class FakeCardRepository implements CardRepository {
  readonly cards = new Map<number, IssuedCard[]>();

  /** Put cards on record without going through the use case, e.g. to leave a gap in the indices. */
  place(customerId: number, ...indices: number[]): void {
    for (const index of indices) {
      this.cardsOf(customerId).push({
        index,
        issuedAt: new Date(TODAY),
        reason: "FIRST_ISSUE",
      });
    }
  }

  currentCard(customerId: number): Promise<IssuedCard | null> {
    const highest = this.cardsOf(customerId).reduce<IssuedCard | null>(
      (current, card) => (current === null || card.index > current.index ? card : current),
      null,
    );
    return Promise.resolve(highest);
  }

  listCards(customerId: number): Promise<ReadonlyArray<IssuedCard>> {
    // Highest index first, like the adapter's `orderBy`, and deliberately not insertion order — a
    // card placed into a gap must still come back below the one that supersedes it.
    return Promise.resolve([...this.cardsOf(customerId)].sort((a, b) => b.index - a.index));
  }

  issue(customerId: number, card: IssuedCard): Promise<IssuedCard> {
    this.cardsOf(customerId).push(card);
    return Promise.resolve(card);
  }

  private cardsOf(customerId: number): IssuedCard[] {
    const cards = this.cards.get(customerId) ?? [];
    this.cards.set(customerId, cards);
    return cards;
  }
}

/** A repository that fails for a reason no retry can mend. */
class BrokenCustomerRepository extends FakeCustomerRepository {
  override create(): Promise<RegisteredCustomer> {
    return Promise.reject(new Error("database unavailable"));
  }
}

function fakeClock(iso: string): Clock {
  return { now: () => new Date(iso) };
}

function settingsInput(overrides: Partial<SettingsInput> = {}): SettingsInput {
  return {
    quotaN: 240,
    portionsPerGrownUp: 2,
    portionsPerChild: 1,
    weekAnchor: { isoWeek: "2026-W02", colour: "RED" },
    distributionWeekday: 4,
    pricePerGrownUp: 200,
    pricePerChild: 100,
    ...overrides,
  };
}

function version(overrides: Partial<SettingsInput> = {}): SettingsVersion {
  return {
    recordedAt: new Date("2026-01-01T00:00:00.000Z"),
    settings: createSettings(settingsInput(overrides)),
  };
}

function member(overrides: Partial<HouseholdMemberDetails> = {}): HouseholdMemberDetails {
  return {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    birthDate: new Date("1990-04-05T00:00:00.000Z"),
    ...overrides,
  };
}

function registerInput(overrides: Partial<RegisterCustomerInput> = {}): RegisterCustomerInput {
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
    householdMembers: [member(), member({ birthDate: new Date("2020-06-01T00:00:00.000Z") })],
    notes: "",
    ...overrides,
  };
}

/**
 * A customer as the register already holds them, built without going through registration — the
 * status is the point of these, and registration only ever produces `ACTIVE`.
 */
function storedCustomer(status: CustomerStatus): NewCustomer {
  return {
    details: createCustomerDetails(registerInput(), new Date(TODAY)),
    customerNumber: 50,
    group: "RED",
    status,
    reminderCount: 0,
    card: { index: 1, issuedAt: new Date(TODAY), reason: "FIRST_ISSUE" },
  };
}

describe("registerCustomer", () => {
  let customers: FakeCustomerRepository;
  let settings: FakeSettingsRepository;
  let audit: FakeAuditLog;

  function deps(today = TODAY) {
    return { customers, settings, clock: fakeClock(today), audit };
  }

  beforeEach(() => {
    customers = new FakeCustomerRepository();
    settings = new FakeSettingsRepository(version());
    audit = new FakeAuditLog();
  });

  it("gives a first customer number 1 and hands back the persisted record", async () => {
    const customer = await registerCustomer(deps(), registerInput());

    expect(customer.id).toBe(1);
    expect(customer.customerNumber).toBe(1);
    expect(customers.created).toHaveLength(1);
  });

  it("fills the gap an archived customer left before any higher number", async () => {
    customers = new FakeCustomerRepository([1, 2, 4]);

    const customer = await registerCustomer(deps(), registerInput());

    expect(customer.customerNumber).toBe(3);
  });

  it("allocates within the quota in force today, not a hard-coded limit", async () => {
    settings = new FakeSettingsRepository(version({ quotaN: 2 }));
    customers = new FakeCustomerRepository([1, 2]);

    await expect(registerCustomer(deps(), registerInput())).rejects.toThrow(NoFreeCustomerNumber);
  });

  it("registers the customer as active with no reminders and a first card", async () => {
    const customer = await registerCustomer(deps(), registerInput());

    expect(customer.status).toBe("ACTIVE");
    expect(customer.reminderCount).toBe(0);
    expect(customer.card.index).toBe(1);
  });

  it("stamps the first card with the clock, so the card and the audit entry agree", async () => {
    const customer = await registerCustomer(deps(TODAY), registerInput());

    expect(customer.card.issuedAt).toEqual(new Date(TODAY));
    expect(audit.entries[0].when).toEqual(new Date(TODAY));
  });

  it("suggests the smaller group when staff made no choice", async () => {
    customers = new FakeCustomerRepository([], { red: 10, blue: 8 });

    const customer = await registerCustomer(deps(), registerInput({ group: undefined }));

    expect(customer.group).toBe("BLUE");
  });

  it("lets an explicit group win over the suggestion", async () => {
    customers = new FakeCustomerRepository([], { red: 10, blue: 8 });

    const customer = await registerCustomer(deps(), registerInput({ group: "RED" }));

    expect(customer.group).toBe("RED");
  });

  it("stores no household counts — they are derived from the birthdates", async () => {
    const customer = await registerCustomer(deps(), registerInput());

    expect(Object.keys(customer)).not.toContain("grownUps");
    expect(Object.keys(customer.details)).not.toContain("children");
  });

  it("keeps the whole household, the customer's address and the certificate", async () => {
    const input = registerInput();

    const customer = await registerCustomer(deps(), input);

    expect(customer.details.householdMembers).toHaveLength(2);
    expect(customer.details.address.city).toBe(input.address.city);
    expect(customer.details.certificate.type).toBe("Jobcenter");
  });

  it("rejects a registration with a required field left blank", async () => {
    await expect(registerCustomer(deps(), registerInput({ lastName: " " }))).rejects.toThrow(
      MissingRequiredField,
    );
  });

  it("rejects a registration with an empty household", async () => {
    await expect(registerCustomer(deps(), registerInput({ householdMembers: [] }))).rejects.toThrow(
      EmptyHousehold,
    );
  });

  it("rejects a registration with a birthdate after today", async () => {
    const input = registerInput({
      householdMembers: [member({ birthDate: new Date("2026-07-23T00:00:00.000Z") })],
    });

    await expect(registerCustomer(deps(), input)).rejects.toThrow(BirthDateInFuture);
  });

  it("rejects a registration when no settings version is in force yet", async () => {
    settings = new FakeSettingsRepository();

    await expect(registerCustomer(deps(), registerInput())).rejects.toThrow(NoSettingsInForce);
  });

  it("writes nothing at all when the registration is rejected", async () => {
    await registerCustomer(deps(), registerInput({ householdMembers: [] })).catch(() => undefined);

    expect(customers.created).toHaveLength(0);
    expect(audit.entries).toHaveLength(0);
  });

  it("consumes no customer number when the write fails", async () => {
    customers = new BrokenCustomerRepository();

    await registerCustomer(deps(), registerInput()).catch(() => undefined);

    await expect(customers.takenActiveNumbers()).resolves.toEqual([]);
  });

  it("does not retry a failure that is not a lost race", async () => {
    customers = new BrokenCustomerRepository();

    await expect(registerCustomer(deps(), registerInput())).rejects.toThrow("database unavailable");
    expect(audit.entries).toHaveLength(0);
  });

  it("moves to the next free number when another registration took the chosen one", async () => {
    customers.stealNext(1);

    const customer = await registerCustomer(deps(), registerInput());

    expect(customer.customerNumber).toBe(2);
    expect(customers.created).toHaveLength(1);
  });

  it("never creates a duplicate when the race is lost repeatedly", async () => {
    customers.stealNext(3);

    const failure = await registerCustomer(deps(), registerInput()).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(CustomerNumberTaken);
    expect(customers.created).toHaveLength(0);
    expect(audit.entries).toHaveLength(0);
  });

  it("records the registration under a stable event name, with no actor", async () => {
    await registerCustomer(deps(), registerInput());

    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0].what).toBe("customer.registered");
    expect(Object.keys(audit.entries[0])).not.toContain("who");
  });

  it("names what registration decided, not what staff typed", async () => {
    await registerCustomer(deps(), registerInput());

    expect(audit.entries[0].changedFields).toEqual(["customerNumber", "group", "status", "card"]);
  });

  it("records an empty why — a registration needs no justification", async () => {
    await registerCustomer(deps(), registerInput());

    expect(audit.entries[0].why).toBe("");
  });
});

describe("issueCard", () => {
  let customers: FakeCustomerRepository;
  let cards: FakeCardRepository;
  let audit: FakeAuditLog;

  function deps(today = TODAY) {
    return { customers, cards, clock: fakeClock(today), audit };
  }

  /** Put a customer of the given status in the register and hand back their id. */
  async function customerWith(status: CustomerStatus): Promise<number> {
    const customer = await customers.create(storedCustomer(status));
    return customer.id;
  }

  beforeEach(() => {
    customers = new FakeCustomerRepository();
    cards = new FakeCardRepository();
    audit = new FakeAuditLog();
  });

  it("issues index 1 to a customer who holds no card yet", async () => {
    const customerId = await customerWith("ACTIVE");

    const card = await issueCard(deps(), { customerId, reason: "FIRST_ISSUE" });

    expect(card.index).toBe(1);
  });

  it("issues the index after the current card, invalidating it by being higher", async () => {
    const customerId = await customerWith("ACTIVE");
    cards.place(customerId, 1);

    const card = await issueCard(deps(), { customerId, reason: "LOST" });

    expect(card.index).toBe(2);
    await expect(cards.currentCard(customerId)).resolves.toEqual(card);
  });

  it("counts on from the highest index, not the number of cards, when the run has a gap", async () => {
    const customerId = await customerWith("ACTIVE");
    cards.place(customerId, 1, 4);

    const card = await issueCard(deps(), { customerId, reason: "STALE_COUNTS" });

    expect(card.index).toBe(5);
  });

  it("leaves the earlier cards on record — the history is how a reissue is explained", async () => {
    const customerId = await customerWith("ACTIVE");
    cards.place(customerId, 1);

    await issueCard(deps(), { customerId, reason: "LOST" });

    expect(cards.cards.get(customerId)?.map((card) => card.index)).toEqual([1, 2]);
  });

  it("stamps the card with the injected clock, so it and the audit entry agree", async () => {
    const customerId = await customerWith("ACTIVE");

    const card = await issueCard(deps(), { customerId, reason: "FIRST_ISSUE" });

    expect(card.issuedAt).toEqual(new Date(TODAY));
    expect(audit.entries[0].when).toEqual(new Date(TODAY));
  });

  it("keeps the reason on the card, so a later reissue can be explained", async () => {
    const customerId = await customerWith("ACTIVE");

    const card = await issueCard(deps(), { customerId, reason: "OTHER" });

    expect(card.reason).toBe("OTHER");
  });

  it("records the issue under a stable event name, with the reason as the why", async () => {
    const customerId = await customerWith("ACTIVE");

    await issueCard(deps(), { customerId, reason: "LOST" });

    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0].what).toBe("customer.card.issued");
    expect(audit.entries[0].changedFields).toEqual(["card"]);
    expect(audit.entries[0].why).toBe("LOST");
  });

  it("issues to a blocked customer — a block turns them away, it does not unregister them", async () => {
    const customerId = await customerWith("BLOCKED");

    const card = await issueCard(deps(), { customerId, reason: "LOST" });

    expect(card.index).toBe(1);
  });

  it("refuses a card to an archived customer, whose slot may already be someone else's", async () => {
    const customerId = await customerWith("ARCHIVED");

    await expect(issueCard(deps(), { customerId, reason: "LOST" })).rejects.toThrow(
      CustomerArchived,
    );
  });

  it("writes neither card nor audit entry when the customer is archived", async () => {
    const customerId = await customerWith("ARCHIVED");

    await issueCard(deps(), { customerId, reason: "LOST" }).catch(() => undefined);

    expect(cards.cards.get(customerId)).toBeUndefined();
    expect(audit.entries).toHaveLength(0);
  });

  it("refuses an id that belongs to nobody rather than issuing a card into the void", async () => {
    await expect(issueCard(deps(), { customerId: 404, reason: "LOST" })).rejects.toThrow(
      CustomerNotFound,
    );
  });
});

describe("proposeRegistration", () => {
  let customers: FakeCustomerRepository;
  let settings: FakeSettingsRepository;

  function deps(today = TODAY) {
    return { customers, settings, clock: fakeClock(today) };
  }

  beforeEach(() => {
    customers = new FakeCustomerRepository();
    settings = new FakeSettingsRepository(version());
  });

  it("proposes number 1 for the very first customer", async () => {
    const proposal = await proposeRegistration(deps());

    expect(proposal.customerNumber).toBe(1);
  });

  it("proposes the gap an archived customer left, not the next number up", async () => {
    customers = new FakeCustomerRepository([1, 2, 4]);

    const proposal = await proposeRegistration(deps());

    expect(proposal.customerNumber).toBe(3);
  });

  it("proposes no number when the register is full, so the screen can still render", async () => {
    settings = new FakeSettingsRepository(version({ quotaN: 2 }));
    customers = new FakeCustomerRepository([1, 2]);

    const proposal = await proposeRegistration(deps());

    expect(proposal.customerNumber).toBeNull();
    expect(proposal.quotaN).toBe(2);
  });

  it("suggests the smaller group and shows both sizes it was decided from", async () => {
    customers = new FakeCustomerRepository([1, 2, 3], { red: 2, blue: 1 });

    const proposal = await proposeRegistration(deps());

    expect(proposal.suggestedGroup).toBe("BLUE");
    expect(proposal.groupCounts).toEqual({ red: 2, blue: 1 });
  });

  it("reports the day the form must judge the household against", async () => {
    const proposal = await proposeRegistration(deps());

    expect(proposal.today).toEqual(new Date(TODAY));
  });

  it("refuses to propose anything when no settings have been recorded", async () => {
    settings = new FakeSettingsRepository();

    await expect(proposeRegistration(deps())).rejects.toThrow(NoSettingsInForce);
  });
});

describe("readCustomer", () => {
  let customers: FakeCustomerRepository;
  let settings: FakeSettingsRepository;
  let audit: FakeAuditLog;

  function deps(today = TODAY) {
    return { customers, settings, clock: fakeClock(today), audit };
  }

  beforeEach(() => {
    customers = new FakeCustomerRepository();
    settings = new FakeSettingsRepository(version());
    audit = new FakeAuditLog();
  });

  it("derives the card number from the slot and the card index", async () => {
    const registered = await registerCustomer(deps(), registerInput());

    const view = await readCustomer(deps(), registered.id);

    expect(view.cardNumber).toBe("1k1");
    expect(view.customer.id).toBe(registered.id);
  });

  it("derives the household counts from the birthdates as of today", async () => {
    const registered = await registerCustomer(
      deps(),
      registerInput({
        householdMembers: [
          member({ birthDate: new Date("1990-04-05T00:00:00.000Z") }),
          member({ birthDate: new Date("2020-06-01T00:00:00.000Z") }),
        ],
      }),
    );

    const view = await readCustomer(deps(), registered.id);

    expect(view.composition).toEqual({ grownUps: 1, children: 1 });
  });

  it("counts a member who turned 13 since the registration as a grown-up", async () => {
    const registered = await registerCustomer(
      deps(),
      registerInput({
        householdMembers: [member({ birthDate: new Date("2013-08-01T00:00:00.000Z") })],
      }),
    );

    const view = await readCustomer(deps("2026-08-01T09:00:00.000Z"), registered.id);

    expect(view.composition).toEqual({ grownUps: 1, children: 0 });
  });

  it("derives the standard portions and price from the counts and the settings in force", async () => {
    const registered = await registerCustomer(
      deps(),
      registerInput({
        householdMembers: [
          member({ birthDate: new Date("1990-04-05T00:00:00.000Z") }),
          member({ birthDate: new Date("2020-06-01T00:00:00.000Z") }),
        ],
      }),
    );

    const view = await readCustomer(deps(), registered.id);

    // 1 grown-up + 1 child under the seeded 2/1 portions and 200c/100c prices.
    expect(view.allowance.portions).toBe(3);
    expect(view.allowance.priceCents).toBe(300);
  });

  it("refuses an id that belongs to nobody rather than showing an empty card", async () => {
    await expect(readCustomer(deps(), 404)).rejects.toThrow(CustomerNotFound);
  });
});

describe("readCard", () => {
  let customers: FakeCustomerRepository;
  let cards: FakeCardRepository;
  let settings: FakeSettingsRepository;
  let audit: FakeAuditLog;

  function deps(today = TODAY) {
    return { customers, cards, settings, clock: fakeClock(today), audit };
  }

  function registerDeps(today = TODAY) {
    return { customers, settings, clock: fakeClock(today), audit };
  }

  /**
   * Register a customer and put their first card in the card store.
   *
   * `registerCustomer` writes customer and card in one transaction through the customer repository
   * (US-01.4), so the card never passes through `FakeCardRepository` — the fake has to be told, or
   * the two halves of the fake database disagree in a way the real one cannot.
   */
  async function registered(
    overrides: Partial<RegisterCustomerInput> = {},
  ): Promise<RegisteredCustomer> {
    const customer = await registerCustomer(registerDeps(), registerInput(overrides));
    cards.place(customer.id, customer.card.index);
    return customer;
  }

  beforeEach(() => {
    customers = new FakeCustomerRepository();
    cards = new FakeCardRepository();
    settings = new FakeSettingsRepository(version());
    audit = new FakeAuditLog();
  });

  it("shows the number of the card the customer holds today", async () => {
    const customer = await registered();

    const view = await readCard(deps(), customer.id);

    expect(view.cardNumber).toBe("1k1");
  });

  it("shows the highest-indexed card as the current one after a reissue", async () => {
    const customer = await registered();
    await issueCard(deps(), { customerId: customer.id, reason: "LOST" });

    const view = await readCard(deps(), customer.id);

    expect(view.cardNumber).toBe("1k2");
    expect(view.card.reason).toBe("LOST");
  });

  it("names the numbers the current card replaced, newest first", async () => {
    const customer = await registered();
    await issueCard(deps(), { customerId: customer.id, reason: "LOST" });
    await issueCard(deps(), { customerId: customer.id, reason: "STALE_COUNTS" });

    const view = await readCard(deps(), customer.id);

    expect(view.superseded.map((entry) => entry.number)).toEqual(["1k2", "1k1"]);
  });

  it("keeps the reason a superseded card was issued for, which its number cannot say", async () => {
    const customer = await registered();
    await issueCard(deps(), { customerId: customer.id, reason: "LOST" });

    const view = await readCard(deps(), customer.id);

    expect(view.superseded[0].card.reason).toBe("FIRST_ISSUE");
  });

  it("replaces nothing when the household is on its first card", async () => {
    const customer = await registered();

    const view = await readCard(deps(), customer.id);

    expect(view.superseded).toEqual([]);
  });

  it("derives the household counts from the birthdates rather than a stored number", async () => {
    const customer = await registered({
      householdMembers: [
        member({ birthDate: new Date("1990-04-05T00:00:00.000Z") }),
        member({ birthDate: new Date("2020-06-01T00:00:00.000Z") }),
      ],
    });

    const view = await readCard(deps(), customer.id);

    expect(view.composition).toEqual({ grownUps: 1, children: 1 });
  });

  it("counts a member who turned 13 since the card was issued as a grown-up", async () => {
    const customer = await registered({
      householdMembers: [member({ birthDate: new Date("2013-08-01T00:00:00.000Z") })],
    });

    const view = await readCard(deps("2026-08-01T09:00:00.000Z"), customer.id);

    expect(view.composition).toEqual({ grownUps: 1, children: 0 });
  });

  it("carries the name and the group the card is printed with", async () => {
    const customer = await registered({ firstName: "Mira", lastName: "Aalto", group: "BLUE" });

    const view = await readCard(deps(), customer.id);

    expect(view.firstName).toBe("Mira");
    expect(view.lastName).toBe("Aalto");
    expect(view.group).toBe("BLUE");
  });

  it("derives the standard portions and price for the card's household", async () => {
    const customer = await registered({
      householdMembers: [
        member({ birthDate: new Date("1990-04-05T00:00:00.000Z") }),
        member({ birthDate: new Date("2020-06-01T00:00:00.000Z") }),
      ],
    });

    const view = await readCard(deps(), customer.id);

    // 1 grown-up + 1 child under the seeded 2/1 portions and 200c/100c prices.
    expect(view.allowance.portions).toBe(3);
    expect(view.allowance.priceCents).toBe(300);
  });

  it("refuses an id that belongs to nobody rather than showing an empty card", async () => {
    await expect(readCard(deps(), 404)).rejects.toThrow(CustomerNotFound);
  });

  it("refuses a customer with no card on file rather than inventing a number", async () => {
    const customer = await registerCustomer(registerDeps(), registerInput());

    await expect(readCard(deps(), customer.id)).rejects.toThrow(InvalidCustomerRecord);
  });
});
