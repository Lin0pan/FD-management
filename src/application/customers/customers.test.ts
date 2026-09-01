import { faker } from "@faker-js/faker";
import { beforeEach, describe, expect, it } from "vitest";
import type { IssuedCard, NewCard } from "@/domain/card/card";
import {
  createCustomerDetails,
  type CustomerStatus,
  type HouseholdMemberDetails,
  type NewCustomer,
  type PersonalDetails,
  type RegisteredCustomer,
} from "@/domain/customer/customer";
import { lowestFreeNumber } from "@/domain/customer/customerNumber";
import { foldName } from "@/domain/customer/nameSearch";
import { groupOf, type GroupCounts } from "@/domain/customer/group";
import { composition } from "@/domain/customer/householdComposition";
import { berlinDayKey } from "@/domain/distribution/attendance";
import type {
  DistributionRecord,
  NewDistributionRecord,
} from "@/domain/distribution/distributionRecord";
import {
  BirthDateInFuture,
  CardNumberTaken,
  CustomerArchived,
  CustomerNumberOutOfRange,
  CustomerNumberTaken,
  EmptyHousehold,
  EmptySearchQuery,
  CustomerNotArchived,
  IllegalStatusTransition,
  InvalidCustomerRecord,
  MissingAuditReason,
  MissingRequiredField,
  CustomerNotFound,
  NoFreeCustomerNumber,
  NoSettingsInForce,
} from "@/domain/errors";
import type { Cents } from "@/domain/money";
import { createSettings, type SettingsInput, type SettingsVersion } from "@/domain/policy/settings";
import type {
  ArchivedCustomer,
  ArchiveSearchQuery,
  AuditEntry,
  AuditLog,
  CardIssueCounts,
  CardRepository,
  Clock,
  CustomerRepository,
  DistributionRecordRepository,
  SettingsRepository,
} from "../ports";
import { archiveCustomer } from "./archive-customer";
import { blockCustomer } from "./block-customer";
import { draftFromArchived } from "./draft-from-archived";
import { issueCard } from "./issue-card";
import { proposeRegistration } from "./propose-registration";
import { readCard } from "./read-card";
import { readCustomer } from "./read-customer";
import { registerCustomer, type RegisterCustomerInput } from "./register-customer";
import { reissueCard } from "./reissue-card";
import { MAX_ARCHIVE_SEARCH_RESULTS, searchArchivedCustomers } from "./search-archived-customers";
import { unblockCustomer } from "./unblock-customer";

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
 * Whether an archived household answers to what was typed: every criterion given must match, a name
 * on a folded prefix and the birthdate exactly. A criterion nobody filled in narrows nothing.
 */
function matchesArchiveQuery(customer: ArchivedCustomer, query: ArchiveSearchQuery): boolean {
  const startsWith = (stored: string, typed: string | undefined): boolean =>
    typed === undefined || foldName(stored).startsWith(foldName(typed));
  return (
    startsWith(customer.details.lastName, query.lastName) &&
    startsWith(customer.details.firstName, query.firstName) &&
    (query.birthDate === undefined ||
      customer.details.birthDate.getTime() === query.birthDate.getTime())
  );
}

/**
 * A register that behaves like the database will: `stealNext` lets another registration claim the
 * chosen number in the moment between the read and the write, which is what makes the concurrency
 * test meaningful rather than a mocked assertion.
 */
class FakeCustomerRepository implements CustomerRepository {
  readonly created: RegisteredCustomer[] = [];
  /** How often the register was asked for its taken numbers — a proposal asks once (US-31.3). */
  reads = 0;
  /** How often the old group query was asked. Nothing derives a balance from it any more. */
  groupCountReads = 0;
  private nextId = 1;
  /** How many more writes a concurrent registration beats to the chosen number. */
  private stealsLeft = 0;
  /** How many more writes another card lands on the card number this one was about to print. */
  private cardStealsLeft = 0;

  constructor(
    private readonly taken: number[] = [],
    private readonly counts: GroupCounts = { red: 0, blue: 0 },
  ) {}

  /** Have another registration take the chosen number, just before this one writes it, `times` over. */
  stealNext(times: number): void {
    this.stealsLeft = times;
  }

  /**
   * Have the card number this registration was about to print turn out to be spent, `times` over —
   * what the database says when the slot's run was read stale (US-25). It is a different fault from
   * `stealNext`: the number is this registration's, and only the card on it was lost.
   */
  stealCardNext(times: number): void {
    this.cardStealsLeft = times;
  }

  takenActiveNumbers(): Promise<ReadonlyArray<number>> {
    this.reads += 1;
    // Derived from live status, like the real partial index: a customer holds their slot while they
    // are ACTIVE or BLOCKED and releases it only when ARCHIVED, so a block never frees a number.
    // `taken` carries the seeded numbers and any a concurrent registration stole.
    const held = this.created
      .filter((customer) => customer.status !== "ARCHIVED")
      .map((customer) => customer.customerNumber);
    return Promise.resolve([...this.taken, ...held]);
  }

  groupCounts(): Promise<GroupCounts> {
    this.groupCountReads += 1;
    return Promise.resolve(this.counts);
  }

  findById(id: number): Promise<RegisteredCustomer | null> {
    return Promise.resolve(this.created.find((customer) => customer.id === id) ?? null);
  }

  /**
   * No use case in this file browses the register (US-15.1); the method is here because the port
   * has it. Answering with nothing is honest — nothing here asks the list a question.
   */
  list(): Promise<ReadonlyArray<RegisteredCustomer>> {
    return Promise.resolve([]);
  }

  listWithStatus(status: CustomerStatus): Promise<ReadonlyArray<RegisteredCustomer>> {
    return Promise.resolve(
      this.created
        .filter((customer) => customer.status === status)
        .sort((a, b) => a.customerNumber - b.customerNumber),
    );
  }

  /**
   * Matches the way the adapter's query does: archived rows only, names compared as folded prefixes,
   * the birthdate exactly, most recently archived first, and never more than `limit` rows. The fold
   * is the domain's, so the fake and the database cannot drift into two notions of a matching name.
   */
  searchArchived(
    query: ArchiveSearchQuery,
    limit: number,
  ): Promise<ReadonlyArray<ArchivedCustomer>> {
    const matches = this.created
      .filter(
        (customer): customer is ArchivedCustomer =>
          customer.status === "ARCHIVED" &&
          customer.archiveReason !== null &&
          customer.archivedAt !== null,
      )
      .filter((customer) => matchesArchiveQuery(customer, query))
      .sort((a, b) => b.archivedAt.getTime() - a.archivedAt.getTime());
    return Promise.resolve(matches.slice(0, limit));
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
      // A concurrent registration wins the number; it now belongs to no created row, so it lives in
      // `taken` where `takenActiveNumbers` still counts it.
      this.taken.push(customer.customerNumber);
      return Promise.reject(new CustomerNumberTaken(customer.customerNumber));
    }
    if (this.cardStealsLeft > 0) {
      this.cardStealsLeft -= 1;
      // The customer row is refused with the card, as the database refuses the whole transaction:
      // the number stays free and nothing is created.
      return Promise.reject(new CardNumberTaken(customer.customerNumber, customer.card.index));
    }
    const registered: RegisteredCustomer = {
      ...customer,
      // The store fills the slot in: the card a registration prints is on the number it
      // just took (US-30).
      card: { ...customer.card, customerNumber: customer.customerNumber },
      id: this.nextId,
      blockReason: null,
      archiveReason: null,
      archivedAt: null,
      // A brand-new customer holds exactly one card, so the first card is the current one — the same
      // derivation the adapter makes from the run of cards on file.
      registeredOn: customer.card.issuedAt,
    };
    this.nextId += 1;
    this.created.push(registered);
    return Promise.resolve(registered);
  }

  updateHousehold(id: number, members: ReadonlyArray<HouseholdMemberDetails>): Promise<void> {
    const index = this.created.findIndex((customer) => customer.id === id);
    if (index === -1) {
      return Promise.reject(new CustomerNotFound(id));
    }
    const held = this.created[index];
    this.created[index] = {
      ...held,
      details: { ...held.details, householdMembers: [...members] },
    };
    return Promise.resolve();
  }

  updateDetails(
    id: number,
    details: PersonalDetails,
    household: ReadonlyArray<HouseholdMemberDetails>,
  ): Promise<void> {
    const index = this.created.findIndex((customer) => customer.id === id);
    if (index === -1) {
      return Promise.reject(new CustomerNotFound(id));
    }
    const held = this.created[index];
    this.created[index] = {
      ...held,
      details: { ...held.details, ...details, householdMembers: [...household] },
    };
    return Promise.resolve();
  }

  updateNotes(id: number, notes: string): Promise<void> {
    const index = this.created.findIndex((customer) => customer.id === id);
    if (index === -1) {
      return Promise.reject(new CustomerNotFound(id));
    }
    const held = this.created[index];
    this.created[index] = { ...held, details: { ...held.details, notes } };
    return Promise.resolve();
  }

  /** Only {@link changeCustomerNumber}'s own suite moves a household between slots (US-30). */
  changeCustomerNumber(): Promise<IssuedCard> {
    return Promise.reject(new Error("a registration takes a number; moving one has its own suite"));
  }

  setStatus(id: number, status: CustomerStatus, blockReason: string | null): Promise<void> {
    const index = this.created.findIndex((customer) => customer.id === id);
    if (index === -1) {
      return Promise.reject(new CustomerNotFound(id));
    }
    this.created[index] = { ...this.created[index], status, blockReason };
    return Promise.resolve();
  }

  // Like the adapter's single statement: the status, the reason and the instant land together, the
  // block reason is cleared with them, and everything else on the row — the number above all — is
  // left exactly as it was, so a test can prove the archive removes nothing.
  archive(id: number, reason: string, archivedAt: Date): Promise<void> {
    const index = this.created.findIndex((customer) => customer.id === id);
    if (index === -1) {
      return Promise.reject(new CustomerNotFound(id));
    }
    this.created[index] = {
      ...this.created[index],
      status: "ARCHIVED",
      blockReason: null,
      archiveReason: reason,
      archivedAt,
    };
    return Promise.resolve();
  }
}

/**
 * A card store that behaves like the table will: cards are kept per customer and `currentCard`
 * answers with the highest index rather than the last one written, so a test can leave a gap in the
 * run — the shape a hand-fixed database or a future deletion would leave — and the use case still
 * has to count on from the top.
 *
 * It is handed the register because a card's slot is *read off the customer row* rather than passed
 * in (US-25) — that is what makes `Card.customerNumber` unable to disagree with the household's, and
 * a fake that let a caller state the slot could be told one the household does not hold.
 */
class FakeCardRepository implements CardRepository {
  readonly cards = new Map<number, IssuedCard[]>();
  private readonly register: FakeCustomerRepository;

  constructor(register: FakeCustomerRepository) {
    this.register = register;
  }

  /** Put cards on record without going through the use case, e.g. to leave a gap in the indices. */
  place(customerId: number, ...indices: number[]): void {
    for (const index of indices) {
      this.cardsOf(customerId).push({
        // Placed cards sit on the slot their household holds, like every card the store writes.
        customerNumber: this.printedSlotOf(customerId),
        index,
        issuedAt: new Date(TODAY),
        reason: "FIRST_ISSUE",
        // What was printed on a card placed straight onto the run is beside the point of these
        // tests — they are about which index falls due — so every placed card prints the shape
        // `storedCustomer` builds: one grown-up, one child.
        countsAtIssue: { grownUps: 1, children: 1 },
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

  /**
   * The same question of every slot at once (US-30.4), grouped by the number the card was **printed
   * under** rather than by the household holding it today — which is the adapter's `groupBy`, and
   * the only reading that survives a household moving off a slot and leaving its run behind.
   *
   * A slot nobody has ever had a card on is absent, exactly as it is from the aggregate.
   */
  highestIndexByNumber(): Promise<ReadonlyMap<number, number>> {
    const highest = new Map<number, number>();
    for (const cards of this.cards.values()) {
      for (const card of cards) {
        highest.set(
          card.customerNumber,
          Math.max(highest.get(card.customerNumber) ?? 0, card.index),
        );
      }
    }
    return Promise.resolve(highest);
  }

  /**
   * The highest index ever printed on the slot, across every household that has held it — the
   * archived ones included, which is the only reason the method exists (US-25).
   */
  highestIndexForNumber(customerNumber: number): Promise<number> {
    let highest = 0;
    for (const [customerId, cards] of this.cards) {
      if (this.slotOf(customerId) !== customerNumber) {
        continue;
      }
      for (const card of cards) {
        highest = Math.max(highest, card.index);
      }
    }
    return Promise.resolve(highest);
  }

  // The adapter counts in SQL; the fake counts in memory. Both count the customer's own rows rather
  // than the index they have reached, so neither reports a household as having been through cards
  // that a predecessor on the slot held.
  issueCounts(customerId: number): Promise<CardIssueCounts> {
    const cards = this.cardsOf(customerId);
    return Promise.resolve({
      cardsIssued: cards.length,
      reissuesForLoss: cards.filter((card) => card.reason === "LOST").length,
    });
  }

  // The slot is filled in here rather than passed in, as the adapter fills it in from the customer
  // row inside the write's own transaction — so no caller can file a card under a number its
  // household does not hold.
  issue(customerId: number, card: NewCard): Promise<IssuedCard> {
    const issued = { ...card, customerNumber: this.printedSlotOf(customerId) };
    this.cardsOf(customerId).push(issued);
    return Promise.resolve(issued);
  }

  private cardsOf(customerId: number): IssuedCard[] {
    const cards = this.cards.get(customerId) ?? [];
    this.cards.set(customerId, cards);
    return cards;
  }

  /**
   * The slot a card written for this customer is printed under. An id the register does not know
   * stands in as -1, which no household holds — the adapter's `UNKNOWN_SLOT` by another name.
   */
  private printedSlotOf(customerId: number): number {
    return this.slotOf(customerId) ?? -1;
  }

  /** The slot the household holds, or `null` for an id the register does not know. */
  private slotOf(customerId: number): number | null {
    const customer = this.register.created.find((held) => held.id === customerId);
    return customer?.customerNumber ?? null;
  }
}

/**
 * A hand-out history that counts what was done to it. `reissueCard` has no distribution repository
 * in its dependencies at all, so it is handed one here purely so the test can state the rule as
 * behaviour: a replacement card leaves the record of what the household has already collected
 * exactly as it found it (US-09.1). A use case that ever grew a write would fail these counters.
 */
class FakeDistributionRecordRepository implements DistributionRecordRepository {
  readonly records: DistributionRecord[] = [];
  writes = 0;

  constructor(...records: DistributionRecord[]) {
    this.records.push(...records);
  }

  listForCustomer(customerId: number): Promise<ReadonlyArray<DistributionRecord>> {
    return Promise.resolve(this.records.filter((record) => record.customerId === customerId));
  }

  listForDay(dayKey: string): Promise<ReadonlyArray<DistributionRecord>> {
    return Promise.resolve(this.records.filter((record) => berlinDayKey(record.date) === dayKey));
  }

  findById(recordId: number): Promise<DistributionRecord | null> {
    return Promise.resolve(this.records.find((record) => record.id === recordId) ?? null);
  }

  create(record: NewDistributionRecord): Promise<DistributionRecord> {
    this.writes += 1;
    const stored = { ...record, id: this.records.length + 1 };
    this.records.push(stored);
    return Promise.resolve(stored);
  }

  setPayment(recordId: number, paidCents: Cents): Promise<DistributionRecord> {
    this.writes += 1;
    const index = this.records.findIndex((record) => record.id === recordId);
    const updated = { ...this.records[index], paidCents };
    this.records[index] = updated;
    return Promise.resolve(updated);
  }

  remove(recordId: number): Promise<void> {
    this.writes += 1;
    this.records.splice(
      this.records.findIndex((record) => record.id === recordId),
      1,
    );
    return Promise.resolve();
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
    weekAnchor: { isoWeek: "2026-W02", colour: "RED" },
    distributionWeekday: 4,
    pricePerGrownUp: 200,
    pricePerChild: 100,
    priceCap: null,
    eggRule: [],
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

/** The household row the customer themselves is — the one every legitimate household contains. */
function self(person: {
  firstName: string;
  lastName: string;
  birthDate: Date;
}): HouseholdMemberDetails {
  return { firstName: person.firstName, lastName: person.lastName, birthDate: person.birthDate };
}

function registerInput(overrides: Partial<RegisterCustomerInput> = {}): RegisterCustomerInput {
  const input: RegisterCustomerInput = {
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
    householdMembers: [],
    notes: "",
    ...overrides,
  };

  // The applicant is themselves a household member, so the default household is them and one child.
  // A test that overrides the rows is saying who lives there, and puts the applicant among them.
  return {
    ...input,
    householdMembers: overrides.householdMembers ?? [
      self(input),
      member({ birthDate: new Date("2020-06-01T00:00:00.000Z") }),
    ],
  };
}

/** A registration whose household is the applicant themselves and whoever else is named here. */
function registerInputWith(
  others: ReadonlyArray<HouseholdMemberDetails>,
  overrides: Partial<RegisterCustomerInput> = {},
): RegisterCustomerInput {
  const input = registerInput(overrides);
  return { ...input, householdMembers: [self(input), ...others] };
}

/**
 * A customer as the register already holds them, built without going through registration — the
 * status is the point of these, and registration only ever produces `ACTIVE`.
 *
 * `members` are the people who live *with* the customer, where a test turns on who they are — the
 * customer's own row is always the first and is added here, because a household without it is one
 * the domain refuses. The default is `registerInput`'s: the customer and one child.
 */
function storedCustomer(
  status: CustomerStatus,
  members?: ReadonlyArray<HouseholdMemberDetails>,
): NewCustomer {
  const input = registerInput();
  const details = createCustomerDetails(
    members === undefined ? input : { ...input, householdMembers: [self(input), ...members] },
    new Date(TODAY),
  );
  return {
    details,
    customerNumber: 50,
    status,
    reminderCount: 0,
    card: {
      index: 1,
      issuedAt: new Date(TODAY),
      reason: "FIRST_ISSUE",
      countsAtIssue: composition(details.householdMembers, new Date(TODAY)),
    },
    previousCustomerId: null,
  };
}

describe("registerCustomer", () => {
  let customers: FakeCustomerRepository;
  let cards: FakeCardRepository;
  let settings: FakeSettingsRepository;
  let audit: FakeAuditLog;

  function deps(today = TODAY) {
    return { customers, cards, settings, clock: fakeClock(today), audit };
  }

  /**
   * Point the fakes at a register. The card store is built with it rather than beside it because it
   * reads a card's slot off the customer row (US-25), so a store left over from a register a test
   * replaced would answer for households that are no longer there.
   */
  function useRegister(register: FakeCustomerRepository): void {
    customers = register;
    cards = new FakeCardRepository(register);
  }

  /** A household that held `customerNumber`, printed `indices` on it, and has since left. */
  async function archivedHolder(customerNumber: number, ...indices: number[]): Promise<void> {
    const held = await customers.create({ ...storedCustomer("ACTIVE"), customerNumber });
    cards.place(held.id, ...indices);
    await customers.archive(held.id, "zog fort", new Date(TODAY));
  }

  beforeEach(() => {
    useRegister(new FakeCustomerRepository());
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
    useRegister(new FakeCustomerRepository([1, 2, 4]));

    const customer = await registerCustomer(deps(), registerInput());

    expect(customer.customerNumber).toBe(3);
  });

  it("allocates within the quota in force today, not a hard-coded limit", async () => {
    settings = new FakeSettingsRepository(version({ quotaN: 2 }));
    useRegister(new FakeCustomerRepository([1, 2]));

    await expect(registerCustomer(deps(), registerInput())).rejects.toThrow(NoFreeCustomerNumber);
  });

  it("registers the customer as active with no reminders and a first card", async () => {
    const customer = await registerCustomer(deps(), registerInput());

    expect(customer.status).toBe("ACTIVE");
    expect(customer.reminderCount).toBe(0);
    expect(customer.card.index).toBe(1);
  });

  it("prints the household counts on the first card, derived as of the registration", async () => {
    const customer = await registerCustomer(deps(), registerInput());

    // registerInput's household is one grown-up and one child; nothing typed says so.
    expect(customer.card.countsAtIssue).toEqual({ grownUps: 1, children: 1 });
  });

  it("stores no count on the record itself — only on the card that was printed", async () => {
    const customer = await registerCustomer(deps(), registerInput());

    expect(Object.keys(customer)).not.toContain("grownUps");
    expect(Object.keys(customer.details)).not.toContain("grownUps");
  });

  it("stamps the first card with the clock, so the card and the audit entry agree", async () => {
    const customer = await registerCustomer(deps(TODAY), registerInput());

    expect(customer.card.issuedAt).toEqual(new Date(TODAY));
    expect(audit.entries[0].when).toEqual(new Date(TODAY));
  });

  it("puts an allocated household in the recommended group", async () => {
    // RED holds two slots and BLUE one, so the balance recommends BLUE — and the household is put
    // on the lowest free *even* number rather than on the lowest free number, which is 1.
    useRegister(new FakeCustomerRepository([2, 5, 7]));

    const customer = await registerCustomer(deps(), registerInput());

    expect(customer.customerNumber).toBe(4);
    expect(groupOf(customer.customerNumber)).toBe("BLUE");
  });

  it("writes no group anywhere — the number is the whole of it", async () => {
    const customer = await registerCustomer(deps(), registerInput());

    expect(Object.keys(customer)).not.toContain("group");
    expect(Object.keys(customer.card)).not.toContain("groupAtIssue");
    expect(groupOf(customer.card.customerNumber)).toBe(groupOf(customer.customerNumber));
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
    useRegister(new BrokenCustomerRepository());

    await registerCustomer(deps(), registerInput()).catch(() => undefined);

    await expect(customers.takenActiveNumbers()).resolves.toEqual([]);
  });

  it("does not retry a failure that is not a lost race", async () => {
    useRegister(new BrokenCustomerRepository());

    await expect(registerCustomer(deps(), registerInput())).rejects.toThrow("database unavailable");
    expect(audit.entries).toHaveLength(0);
  });

  it("retries within the same group after losing a number", async () => {
    // The balance recommends BLUE and the registration settles on 4; another one takes it first.
    // The second attempt stays in BLUE and moves to 6 — re-deciding the group would find RED and
    // BLUE level at two apiece, allocate 1, and put the household in a week nobody chose for them.
    useRegister(new FakeCustomerRepository([2, 5, 7]));
    customers.stealNext(1);

    const customer = await registerCustomer(deps(), registerInput());

    expect(customer.customerNumber).toBe(6);
    expect(customers.created).toHaveLength(1);
  });

  it("crosses to the other group only when the one it started in has run out", async () => {
    // A quota of 4 leaves RED slots 1 and 3 and BLUE slots 2 and 4. RED and BLUE are level, so the
    // registration starts in RED on 3 — the only RED slot free — and loses it. There is nothing
    // left of the group it started in, and refusing a household while a slot stands empty is what
    // the waiting list is for; it is not this state (R-26).
    settings = new FakeSettingsRepository(version({ quotaN: 4 }));
    useRegister(new FakeCustomerRepository([1, 2]));
    customers.stealNext(1);

    const customer = await registerCustomer(deps(), registerInput());

    expect(customer.customerNumber).toBe(4);
    expect(groupOf(customer.customerNumber)).toBe("BLUE");
  });

  it("registers the household on the number staff chose", async () => {
    const customer = await registerCustomer(deps(), registerInput({ customerNumber: 17 }));

    expect(customer.customerNumber).toBe(17);
    // The rest of the registration is the same registration: nothing about it branches on who
    // picked the slot.
    expect(customer.status).toBe("ACTIVE");
    expect(customer.reminderCount).toBe(0);
    expect(customer.card.index).toBe(1);
  });

  it("refuses a chosen number an active customer holds, writing nothing", async () => {
    useRegister(new FakeCustomerRepository([17]));

    await expect(registerCustomer(deps(), registerInput({ customerNumber: 17 }))).rejects.toThrow(
      CustomerNumberTaken,
    );
    expect(customers.created).toHaveLength(0);
    expect(audit.entries).toHaveLength(0);
  });

  it("refuses a chosen number above the quota in force as out of range", async () => {
    settings = new FakeSettingsRepository(version({ quotaN: 10 }));

    await expect(registerCustomer(deps(), registerInput({ customerNumber: 11 }))).rejects.toThrow(
      CustomerNumberOutOfRange,
    );
    expect(customers.created).toHaveLength(0);
  });

  it("accepts a chosen number that archiving freed", async () => {
    const held = await customers.create({ ...storedCustomer("ACTIVE"), customerNumber: 17 });
    await customers.archive(held.id, "zog fort", new Date(TODAY));

    const customer = await registerCustomer(deps(), registerInput({ customerNumber: 17 }));

    expect(customer.customerNumber).toBe(17);
  });

  it("substitutes no other number when a chosen one is lost in a race", async () => {
    customers.stealNext(1);

    const failure = await registerCustomer(deps(), registerInput({ customerNumber: 17 })).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(CustomerNumberTaken);
    expect(customers.created).toHaveLength(0);
    expect(audit.entries).toHaveLength(0);
  });

  it("records the same entry whether staff chose the number or the rule allocated it", async () => {
    await registerCustomer(deps(), registerInput({ customerNumber: 17 }));

    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0].what).toBe("customer.registered");
    expect(audit.entries[0].changedFields).toEqual(["customerNumber", "group", "status", "card"]);
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

  it("links to no predecessor when the form was filled in from blank", async () => {
    const customer = await registerCustomer(deps(), registerInput());

    expect(customer.previousCustomerId).toBeNull();
  });

  it("writes card index 1 on a slot no household has ever held", async () => {
    const customer = await registerCustomer(deps(), registerInput({ customerNumber: 17 }));

    // Not a constant any more: 1 is what the rule answers for a slot whose run is empty.
    expect(customer.card.index).toBe(1);
  });

  it("writes k2 on a slot whose archived household walked away holding k1", async () => {
    await archivedHolder(17, 1);

    const customer = await registerCustomer(deps(), registerInput({ customerNumber: 17 }));

    expect(customer.card.index).toBe(2);
  });

  it("writes k4 on a slot whose archived household reached k3", async () => {
    await archivedHolder(17, 1, 2, 3);

    const customer = await registerCustomer(deps(), registerInput({ customerNumber: 17 }));

    expect(customer.card.index).toBe(4);
  });

  it("does not retry a card number taken between the read and the write", async () => {
    // A retry moves to another slot, which is the wrong answer here: the number is already this
    // registration's, and what was read stale is the run of cards printed on it.
    customers.stealCardNext(1);

    const failure = await registerCustomer(deps(), registerInput()).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(CardNumberTaken);
    expect(customers.created).toHaveLength(0);
    expect(audit.entries).toHaveLength(0);
  });

  it("re-reads the card run for the slot a lost race moved the registration to", async () => {
    await archivedHolder(1, 1, 2, 3);
    await archivedHolder(3, 1, 2, 3, 4, 5);
    // The first attempt settles on slot 1 and loses it; the second lands on slot 3 — the next one
    // of the same group — whose run is a different one. An index read before the number was
    // settled would print 1k4 as 3k4.
    customers.stealNext(1);

    const customer = await registerCustomer(deps(), registerInput());

    expect(customer.customerNumber).toBe(3);
    expect(customer.card.index).toBe(6);
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
  async function customerWith(
    status: CustomerStatus,
    members?: ReadonlyArray<HouseholdMemberDetails>,
  ): Promise<number> {
    const customer = await customers.create(storedCustomer(status, members));
    return customer.id;
  }

  beforeEach(() => {
    customers = new FakeCustomerRepository();
    cards = new FakeCardRepository(customers);
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

  it("counts on from the slot's highest index, not the holder's — the archived cards count", async () => {
    // Both households sit on slot 50: the one who left printed three cards there, and the one who
    // holds it now has none of their own. Counting the record's cards would hand out 50k1 again.
    const predecessor = await customerWith("ARCHIVED");
    cards.place(predecessor, 1, 2, 3);
    const customerId = await customerWith("ACTIVE");

    const card = await issueCard(deps(), { customerId, reason: "FIRST_ISSUE" });

    expect(card.index).toBe(4);
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

  it("prints the household counts on the card as they stand at the issue", async () => {
    const customerId = await customerWith("ACTIVE");

    const card = await issueCard(deps(), { customerId, reason: "FIRST_ISSUE" });

    expect(card.countsAtIssue).toEqual({ grownUps: 1, children: 1 });
  });

  it("prints the counts of the day it was issued, not of the day the household was registered", async () => {
    // Born 1 August 2013: a child on 22 July 2026, a grown-up from 1 August 2026.
    const customerId = await customerWith("ACTIVE", [
      member({ birthDate: new Date("2013-08-01T00:00:00.000Z") }),
    ]);

    const before = await issueCard(deps(), { customerId, reason: "FIRST_ISSUE" });
    const after = await issueCard(deps("2026-08-01T09:00:00.000Z"), {
      customerId,
      reason: "STALE_COUNTS",
    });

    expect(before.countsAtIssue).toEqual({ grownUps: 1, children: 1 });
    expect(after.countsAtIssue).toEqual({ grownUps: 2, children: 0 });
  });

  it("leaves the counts printed on a superseded card exactly as they were", async () => {
    const customerId = await customerWith("ACTIVE", [
      member({ birthDate: new Date("2013-08-01T00:00:00.000Z") }),
    ]);
    await issueCard(deps(), { customerId, reason: "FIRST_ISSUE" });

    await issueCard(deps("2026-08-01T09:00:00.000Z"), { customerId, reason: "STALE_COUNTS" });

    const run = await cards.listCards(customerId);
    expect(run.map((card) => card.countsAtIssue)).toEqual([
      { grownUps: 2, children: 0 },
      { grownUps: 1, children: 1 },
    ]);
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

describe("reissueCard", () => {
  let customers: FakeCustomerRepository;
  let cards: FakeCardRepository;
  let audit: FakeAuditLog;
  let distribution: FakeDistributionRecordRepository;

  function deps(today = TODAY) {
    return { customers, cards, clock: fakeClock(today), audit, distribution };
  }

  /**
   * A customer who already holds card 1 and has a reminder on file — the state a household is in
   * when they come back having lost the card, so "nothing else changed" has something to be about.
   */
  async function holderOfCardOne(status: CustomerStatus = "ACTIVE"): Promise<number> {
    const customer = await customers.create({ ...storedCustomer(status), reminderCount: 2 });
    cards.place(customer.id, 1);
    return customer.id;
  }

  function collected(customerId: number): DistributionRecord {
    return {
      id: 1,
      customerId,
      date: new Date(TODAY),
      showedUp: true,
      paidCents: 500 as Cents,
      priceCents: 500 as Cents,
    };
  }

  beforeEach(() => {
    customers = new FakeCustomerRepository();
    cards = new FakeCardRepository(customers);
    audit = new FakeAuditLog();
    distribution = new FakeDistributionRecordRepository();
  });

  it("issues the index after the current card, so the lost one is no longer the highest", async () => {
    const customerId = await holderOfCardOne();

    const card = await reissueCard(deps(), { customerId, reason: "LOST" });

    expect(card.index).toBe(2);
    await expect(cards.currentCard(customerId)).resolves.toEqual(card);
  });

  it("goes through issueCard rather than a second issuing path of its own", async () => {
    const customerId = await holderOfCardOne();

    const card = await reissueCard(deps(), { customerId, reason: "LOST" });

    // The one card-issuing path is recognisable by what it leaves behind: the card stamped with the
    // injected clock and exactly one entry under the card-issued event.
    expect(card.issuedAt).toEqual(new Date(TODAY));
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0].what).toBe("customer.card.issued");
    expect(audit.entries[0].changedFields).toEqual(["card"]);
  });

  it("records the reissue with LOST as the why, so the log tells losses from birthdays apart", async () => {
    const customerId = await holderOfCardOne();

    await reissueCard(deps(), { customerId, reason: "LOST" });

    expect(audit.entries[0].why).toBe("LOST");
  });

  it("keeps the superseded card on record — it is invalid only by being outranked", async () => {
    const customerId = await holderOfCardOne();

    await reissueCard(deps(), { customerId, reason: "LOST" });

    await expect(cards.listCards(customerId)).resolves.toMatchObject([{ index: 2 }, { index: 1 }]);
  });

  it("counts on again when a replacement is lost in its turn", async () => {
    const customerId = await holderOfCardOne();

    await reissueCard(deps(), { customerId, reason: "LOST" });
    const card = await reissueCard(deps(), { customerId, reason: "LOST" });

    expect(card.index).toBe(3);
    await expect(cards.currentCard(customerId)).resolves.toEqual(card);
  });

  it("never limits reissues — the tenth succeeds exactly like the second", async () => {
    const customerId = await holderOfCardOne();

    for (let issue = 0; issue < 10; issue += 1) {
      await reissueCard(deps(), { customerId, reason: "LOST" });
    }

    await expect(cards.currentCard(customerId)).resolves.toMatchObject({ index: 11 });
  });

  it("leaves status, customer number and reminder count as they were", async () => {
    const customerId = await holderOfCardOne();
    const before = await customers.findById(customerId);

    await reissueCard(deps(), { customerId, reason: "LOST" });

    const after = await customers.findById(customerId);
    expect(after).toMatchObject({
      status: before?.status,
      customerNumber: before?.customerNumber,
      reminderCount: before?.reminderCount,
    });
  });

  it("leaves the hand-out history alone — losing a card costs the household nothing", async () => {
    const customerId = await holderOfCardOne();
    distribution = new FakeDistributionRecordRepository(collected(customerId));

    await reissueCard(deps(), { customerId, reason: "LOST" });

    await expect(distribution.listForCustomer(customerId)).resolves.toEqual([
      collected(customerId),
    ]);
    expect(distribution.writes).toBe(0);
  });

  it("reissues to a blocked customer — a block pauses the counter, not the card", async () => {
    const customerId = await holderOfCardOne("BLOCKED");

    const card = await reissueCard(deps(), { customerId, reason: "LOST" });

    expect(card.index).toBe(2);
  });

  it("refuses a reissue to an archived customer, whose slot may already be someone else's", async () => {
    const customerId = await holderOfCardOne("ARCHIVED");

    await expect(reissueCard(deps(), { customerId, reason: "LOST" })).rejects.toThrow(
      CustomerArchived,
    );
  });

  it("writes neither card nor audit entry when the customer is archived", async () => {
    const customerId = await holderOfCardOne("ARCHIVED");

    await reissueCard(deps(), { customerId, reason: "LOST" }).catch(() => undefined);

    await expect(cards.currentCard(customerId)).resolves.toMatchObject({ index: 1 });
    expect(audit.entries).toHaveLength(0);
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

  it("reports a full register as no number and no recommendation", async () => {
    settings = new FakeSettingsRepository(version({ quotaN: 2 }));
    customers = new FakeCustomerRepository([1, 2]);

    const proposal = await proposeRegistration(deps());

    expect(proposal.customerNumber).toBeNull();
    // The two are absent together or not at all: a group with no number to offer is not a
    // recommendation, and the screen renders the full register as a state of its own.
    expect(proposal.suggestedGroup).toBeNull();
    expect(proposal.quotaN).toBe(2);
  });

  it("recommends the smaller group and shows both sizes it was decided from", async () => {
    customers = new FakeCustomerRepository([1, 2, 3]);

    const proposal = await proposeRegistration(deps());

    // Counted off the numbers the register holds — 1 and 3 are RED, 2 is BLUE — rather than asked
    // of the database a second time.
    expect(proposal.suggestedGroup).toBe("BLUE");
    expect(proposal.groupCounts).toEqual({ red: 2, blue: 1 });
  });

  it("recommends the other group when the smaller one is full", async () => {
    // A quota lowered to 4 (US-14) leaves three households parked above it, all of them RED. BLUE
    // is the smaller group and has nothing left to offer inside the quota, so the recommendation
    // goes to RED rather than to an empty dropdown.
    settings = new FakeSettingsRepository(version({ quotaN: 4 }));
    customers = new FakeCustomerRepository([2, 4, 11, 13, 15]);

    const proposal = await proposeRegistration(deps());

    expect(proposal.groupCounts).toEqual({ red: 3, blue: 2 });
    expect(proposal.suggestedGroup).toBe("RED");
    expect(proposal.customerNumber).toBe(1);
  });

  it("opens on the lowest free number of the recommended group", async () => {
    settings = new FakeSettingsRepository(version({ quotaN: 8 }));
    customers = new FakeCustomerRepository([2, 5, 7]);

    const proposal = await proposeRegistration(deps());

    // RED is the bigger group, so the recommendation is BLUE and the form opens on 4 — not on 1,
    // which is the lowest free number of the register as a whole.
    expect(proposal.suggestedGroup).toBe("BLUE");
    expect(proposal.customerNumber).toBe(4);
  });

  it("offers the whole free pool, not only the recommendation's", async () => {
    settings = new FakeSettingsRepository(version({ quotaN: 8 }));
    customers = new FakeCustomerRepository([2, 5, 7]);

    const proposal = await proposeRegistration(deps());

    // Both groups' numbers, so the form can re-filter in the browser when staff pick the other one
    // rather than going back to the server to look at a list it already holds.
    expect(proposal.freeNumbers).toEqual([1, 3, 4, 6, 8]);
  });

  it("reads the register once", async () => {
    await proposeRegistration(deps());

    // The pool, the balance and the number the form opens on all come from one reading; a second
    // query is a second instant, and the three could then disagree.
    expect(customers.reads).toBe(1);
    expect(customers.groupCountReads).toBe(0);
  });

  it("reports the day the form must judge the household against", async () => {
    const proposal = await proposeRegistration(deps());

    expect(proposal.today).toEqual(new Date(TODAY));
  });

  it("refuses to propose anything when no settings have been recorded", async () => {
    settings = new FakeSettingsRepository();

    await expect(proposeRegistration(deps())).rejects.toThrow(NoSettingsInForce);
  });

  it("offers every number in the quota that no active customer holds", async () => {
    settings = new FakeSettingsRepository(version({ quotaN: 5 }));
    customers = new FakeCustomerRepository([1, 2, 4]);

    const proposal = await proposeRegistration(deps());

    expect(proposal.freeNumbers).toEqual([3, 5]);
  });

  it("offers the number an archived household released", async () => {
    settings = new FakeSettingsRepository(version({ quotaN: 3 }));
    customers = new FakeCustomerRepository([1]);
    const archived = await customers.create({ ...storedCustomer("ACTIVE"), customerNumber: 2 });
    await customers.archive(archived.id, "MOVED_AWAY", new Date(TODAY));

    const proposal = await proposeRegistration(deps());

    expect(proposal.freeNumbers).toEqual([2, 3]);
  });

  it("bounds the offer by the quota in force, not by the highest number in the register", async () => {
    settings = new FakeSettingsRepository(version({ quotaN: 3 }));
    customers = new FakeCustomerRepository([1, 7]);

    const proposal = await proposeRegistration(deps());

    expect(proposal.freeNumbers).toEqual([2, 3]);
  });

  it("offers nothing when the register is full, alongside the null proposal", async () => {
    settings = new FakeSettingsRepository(version({ quotaN: 2 }));
    customers = new FakeCustomerRepository([1, 2]);

    const proposal = await proposeRegistration(deps());

    expect(proposal.freeNumbers).toEqual([]);
    expect(proposal.customerNumber).toBeNull();
  });

  it("proposes one of the numbers it offers, so the two cannot disagree", async () => {
    settings = new FakeSettingsRepository(version({ quotaN: 5 }));
    customers = new FakeCustomerRepository([1, 2, 4]);

    const proposal = await proposeRegistration(deps());

    expect(proposal.freeNumbers).toContain(proposal.customerNumber);
  });
});

describe("readCustomer", () => {
  let customers: FakeCustomerRepository;
  let cards: FakeCardRepository;
  let settings: FakeSettingsRepository;
  let records: FakeDistributionRecordRepository;
  let audit: FakeAuditLog;

  /**
   * A RED Thursday every fortnight from the `2026-W02` anchor: … 06-11, 06-25, 07-09, 07-23. With
   * `TODAY` on 2026-07-22 the last own distribution behind the household is 07-09.
   */
  const OWN_DISTRIBUTIONS = [
    "2026-05-14T09:00:00.000Z",
    "2026-05-28T09:00:00.000Z",
    "2026-06-11T09:00:00.000Z",
    "2026-06-25T09:00:00.000Z",
    "2026-07-09T09:00:00.000Z",
  ];

  function deps(today = TODAY) {
    return { customers, cards, settings, records, clock: fakeClock(today), audit };
  }

  /**
   * A RED household registered on 2026-05-01, i.e. with five own distributions behind them. RED
   * because 49 is odd, which is the whole of what makes a household RED (US-31) — the distributions
   * above are the Thursdays of *their* week.
   */
  async function seedLongStanding(): Promise<RegisteredCustomer> {
    return customers.create({
      ...storedCustomer("ACTIVE"),
      customerNumber: 49,
      card: {
        ...storedCustomer("ACTIVE").card,
        issuedAt: new Date("2026-05-01T09:00:00.000Z"),
      },
    });
  }

  /** A hand-out at the seeded 5,00 € price; `paidCents` is what the household handed over. */
  async function attend(customerId: number, iso: string, paidCents = 500): Promise<void> {
    await records.create({
      customerId,
      date: new Date(iso),
      showedUp: true,
      paidCents: paidCents as Cents,
      priceCents: 500 as Cents,
    });
  }

  beforeEach(() => {
    customers = new FakeCustomerRepository();
    cards = new FakeCardRepository(customers);
    settings = new FakeSettingsRepository(version());
    records = new FakeDistributionRecordRepository();
    audit = new FakeAuditLog();
  });

  it("derives the card number from the slot and the card index", async () => {
    const registered = await registerCustomer(deps(), registerInput());

    const view = await readCustomer(deps(), registered.id);

    expect(view.cardNumber).toBe("1k1");
    expect(view.customer.id).toBe(registered.id);
  });

  it("names the number a replacement would carry, so a reissue is confirmed before it is written", async () => {
    const registered = await registerCustomer(deps(), registerInput());

    const view = await readCustomer(deps(), registered.id);

    expect(view.nextCardNumber).toBe("1k2");
  });

  it("derives the household counts from the birthdates as of today", async () => {
    const registered = await registerCustomer(
      deps(),
      registerInputWith([member({ birthDate: new Date("2020-06-01T00:00:00.000Z") })]),
    );

    const view = await readCustomer(deps(), registered.id);

    expect(view.composition).toEqual({ grownUps: 1, children: 1 });
  });

  it("counts a member who turned 13 since the registration as a grown-up", async () => {
    const registered = await registerCustomer(
      deps(),
      registerInputWith([], { birthDate: new Date("2013-08-01T00:00:00.000Z") }),
    );

    const view = await readCustomer(deps("2026-08-01T09:00:00.000Z"), registered.id);

    expect(view.composition).toEqual({ grownUps: 1, children: 0 });
  });

  it("derives the standard price from the counts and the settings in force", async () => {
    const registered = await registerCustomer(
      deps(),
      registerInputWith([member({ birthDate: new Date("2020-06-01T00:00:00.000Z") })]),
    );

    const view = await readCustomer(deps(), registered.id);

    // 1 grown-up + 1 child under the seeded 200c/100c prices.
    expect(view.allowance.priceCents).toBe(300);
  });

  it("gives each household member their current age as of today", async () => {
    const registered = await registerCustomer(
      deps(),
      registerInputWith(
        [member({ firstName: "Bo", birthDate: new Date("2020-06-01T00:00:00.000Z") })],
        {
          firstName: "Ada",
          birthDate: new Date("1990-04-05T00:00:00.000Z"),
        },
      ),
    );

    const view = await readCustomer(deps(), registered.id);

    expect(view.household.map((m) => ({ firstName: m.firstName, age: m.age }))).toEqual([
      { firstName: "Ada", age: 36 },
      { firstName: "Bo", age: 6 },
    ]);
  });

  it("counts the household's own distributions missed in a row since they registered", async () => {
    const registered = await seedLongStanding();

    const view = await readCustomer(deps(), registered.id);

    expect(view.consecutiveNoShows).toBe(OWN_DISTRIBUTIONS.length);
  });

  it("stops the no-show count at the last distribution the household attended", async () => {
    const registered = await seedLongStanding();
    await attend(registered.id, "2026-06-25T09:00:00.000Z");

    const view = await readCustomer(deps(), registered.id);

    // Only 07-09 is missed; 06-25 was attended and everything before it is behind that.
    expect(view.consecutiveNoShows).toBe(1);
  });

  it("shows no missed distributions for a household registered since the last one", async () => {
    const registered = await registerCustomer(deps(), registerInput());

    const view = await readCustomer(deps(), registered.id);

    expect(view.consecutiveNoShows).toBe(0);
  });

  it("lists the household's hand-outs newest first, each with the price that applied", async () => {
    const registered = await seedLongStanding();
    await attend(registered.id, "2026-06-11T09:00:00.000Z");
    await attend(registered.id, "2026-07-09T09:00:00.000Z");

    const view = await readCustomer(deps(), registered.id);

    expect(view.history.map((handOut) => handOut.record.date.toISOString())).toEqual([
      "2026-07-09T09:00:00.000Z",
      "2026-06-11T09:00:00.000Z",
    ]);
    // The price is the record's own, captured when the hand-out was written — never re-derived from
    // today's settings, which may since have changed (US-05, FR-2).
    expect(view.history.map((handOut) => handOut.record.priceCents)).toEqual([500, 500]);
  });

  it("states a settled balance for a household with no hand-outs", async () => {
    const registered = await registerCustomer(deps(), registerInput());

    const view = await readCustomer(deps(), registered.id);

    expect(view.balanceCents).toBe(0);
  });

  it("states an open amount after a part payment", async () => {
    const registered = await seedLongStanding();
    await attend(registered.id, "2026-06-11T09:00:00.000Z", 200);

    const view = await readCustomer(deps(), registered.id);

    // Σ (paid − price): 2,00 € against a 5,00 € week leaves 3,00 € owing.
    expect(view.balanceCents).toBe(-300);
  });

  it("states a credit after an overpayment", async () => {
    const registered = await seedLongStanding();
    await attend(registered.id, "2026-06-11T09:00:00.000Z", 800);

    const view = await readCustomer(deps(), registered.id);

    expect(view.balanceCents).toBe(300);
  });

  it("states what was asked on each past hand-out", async () => {
    const registered = await seedLongStanding();
    await attend(registered.id, "2026-06-11T09:00:00.000Z", 200);
    await attend(registered.id, "2026-07-09T09:00:00.000Z", 800);

    const view = await readCustomer(deps(), registered.id);

    // Newest first: 07-09 was asked for the 5,00 € week plus the 3,00 € left over from 06-11, and
    // paying it settled the household.
    expect(view.history.map((handOut) => handOut.askedCents)).toEqual([800, 500]);
    expect(view.history.map((handOut) => handOut.balanceAfter)).toEqual([0, -300]);
  });

  it("marks a hand-out that cleared an old debt as exact", async () => {
    const registered = await seedLongStanding();
    await attend(registered.id, "2026-06-11T09:00:00.000Z", 200);
    await attend(registered.id, "2026-07-09T09:00:00.000Z", 800);

    const view = await readCustomer(deps(), registered.id);

    // 8,00 € against a 5,00 € price, and yet not `OVER`: the mark judges the payment against what
    // was asked that day, so the household reads as having paid up rather than paid ahead.
    expect(view.history.map((handOut) => handOut.standing)).toEqual(["EXACT", "SHORT"]);
  });

  it("keeps an archived household's balance", async () => {
    const registered = await seedLongStanding();
    await attend(registered.id, "2026-06-11T09:00:00.000Z", 200);
    await customers.archive(registered.id, "verzogen", new Date(TODAY));

    const view = await readCustomer(deps(), registered.id);

    // Leaving the register writes nothing off: the record reads exactly as it did the week before,
    // debt and all, because what happened is what the history says happened (US-29.6).
    expect(view.balanceCents).toBe(-300);
    expect(view.history).toHaveLength(1);
  });

  it("starts a re-registered household at zero", async () => {
    const archived = await seedLongStanding();
    await attend(archived.id, "2026-06-11T09:00:00.000Z", 200);
    await customers.archive(archived.id, "verzogen", new Date(TODAY));
    const draft = await draftFromArchived({ customers }, { archivedCustomerId: archived.id });
    const returning = await registerCustomer(deps(), {
      ...draft,
      certificate: { type: "Jobcenter", validUntil: new Date("2027-06-30T00:00:00.000Z") },
      notes: "",
      previousCustomerId: archived.id,
    });

    const view = await readCustomer(deps(), returning.id);

    // Nothing special-cases the re-registration. Hand-outs hang off the surrogate id (ADR-008), so
    // the new household simply has no history — which is the property that would break the day
    // somebody keyed records on the customer number instead.
    expect(view.balanceCents).toBe(0);
    expect(view.history).toEqual([]);
  });

  it("shows no hand-out history for a household that has never collected", async () => {
    const registered = await registerCustomer(deps(), registerInput());

    const view = await readCustomer(deps(), registered.id);

    expect(view.history).toEqual([]);
  });

  it("reports the day the household editor must judge its rows against", async () => {
    const registered = await registerCustomer(deps(), registerInput());

    const view = await readCustomer(deps(), registered.id);

    expect(view.today).toEqual(new Date(TODAY));
  });

  it("reports both group sizes, so a move between them is judged against the balance", async () => {
    customers = new FakeCustomerRepository([], { red: 7, blue: 4 });
    const registered = await registerCustomer(deps(), registerInput());

    const view = await readCustomer(deps(), registered.id);

    expect(view.groupCounts).toEqual({ red: 7, blue: 4 });
  });

  it("offers every number the household may be moved to, with the card each would print", async () => {
    settings = new FakeSettingsRepository(version({ quotaN: 3 }));
    customers = new FakeCustomerRepository([2]);
    const registered = await registerCustomer(deps(), registerInput());

    const view = await readCustomer(deps(), registered.id);

    // The household took slot 1 and somebody active is on 2, so 1 and 3 are what they may hold.
    // Their own number is always among them — it is what the control opens on (US-30.4) — and each
    // choice carries the card that move would print: they hold `1k1`, so nothing below `k2` is left.
    expect(view.numberChoices).toEqual([
      { number: 1, nextCardNumber: "1k2" },
      { number: 3, nextCardNumber: "3k2" },
    ]);
  });

  it("offers an archived household no number at all, because they hold no slot", async () => {
    const registered = await registerCustomer(deps(), registerInput());
    await customers.archive(registered.id, "verzogen", new Date(TODAY));

    const view = await readCustomer(deps(), registered.id);

    expect(view.numberChoices).toEqual([]);
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
    return { customers, cards, settings, clock: fakeClock(today), audit };
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

  /** The same, for a test that turns on who lives with the customer. */
  async function registeredWith(
    others: ReadonlyArray<HouseholdMemberDetails>,
    overrides: Partial<RegisterCustomerInput> = {},
  ): Promise<RegisteredCustomer> {
    const customer = await registerCustomer(registerDeps(), registerInputWith(others, overrides));
    cards.place(customer.id, customer.card.index);
    return customer;
  }

  beforeEach(() => {
    customers = new FakeCustomerRepository();
    cards = new FakeCardRepository(customers);
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
    const customer = await registeredWith([
      member({ birthDate: new Date("2020-06-01T00:00:00.000Z") }),
    ]);

    const view = await readCard(deps(), customer.id);

    expect(view.composition).toEqual({ grownUps: 1, children: 1 });
  });

  it("counts a member who turned 13 since the card was issued as a grown-up", async () => {
    const customer = await registeredWith([], {
      birthDate: new Date("2013-08-01T00:00:00.000Z"),
    });

    const view = await readCard(deps("2026-08-01T09:00:00.000Z"), customer.id);

    expect(view.composition).toEqual({ grownUps: 1, children: 0 });
  });

  it("carries the name and the group the card is printed with", async () => {
    // Slot 2 is even, so the card prints BLUE — the number is the whole of the choice (US-31).
    const customer = await registered({ firstName: "Mira", lastName: "Aalto", customerNumber: 2 });

    const view = await readCard(deps(), customer.id);

    expect(view.firstName).toBe("Mira");
    expect(view.lastName).toBe("Aalto");
    expect(view.group).toBe("BLUE");
  });

  it("derives the standard price for the card's household", async () => {
    const customer = await registeredWith([
      member({ birthDate: new Date("2020-06-01T00:00:00.000Z") }),
    ]);

    const view = await readCard(deps(), customer.id);

    // 1 grown-up + 1 child under the seeded 200c/100c prices.
    expect(view.allowance.priceCents).toBe(300);
  });

  it("counts the household's first card as one issued and no loss", async () => {
    const customer = await registered();

    const view = await readCard(deps(), customer.id);

    expect(view.cardsIssued).toBe(1);
    expect(view.reissuesForLoss).toBe(0);
  });

  it("counts every card the household has been through, the one they hold included", async () => {
    const customer = await registered();
    await reissueCard(deps(), { customerId: customer.id, reason: "LOST" });
    await reissueCard(deps(), { customerId: customer.id, reason: "STALE_COUNTS" });

    const view = await readCard(deps(), customer.id);

    expect(view.cardsIssued).toBe(3);
  });

  it("keeps a stale-counts reissue out of the loss count, which is not the household's doing", async () => {
    const customer = await registered();
    await reissueCard(deps(), { customerId: customer.id, reason: "LOST" });
    await reissueCard(deps(), { customerId: customer.id, reason: "STALE_COUNTS" });
    await reissueCard(deps(), { customerId: customer.id, reason: "LOST" });

    const view = await readCard(deps(), customer.id);

    expect(view.cardsIssued).toBe(4);
    expect(view.reissuesForLoss).toBe(2);
  });

  it("reports the tenth loss without a word of warning — the judgement is the staff's", async () => {
    const customer = await registered();
    for (let reissue = 0; reissue < 10; reissue += 1) {
      await reissueCard(deps(), { customerId: customer.id, reason: "LOST" });
    }

    const view = await readCard(deps(), customer.id);

    expect(view.cardsIssued).toBe(11);
    expect(view.reissuesForLoss).toBe(10);
  });

  it("names the number a replacement would carry, so a reissue is confirmed before it is written", async () => {
    const customer = await registered();

    const view = await readCard(deps(), customer.id);

    expect(view.nextCardNumber).toBe("1k2");
  });

  it("counts the next number on from the card held, not from the first one ever issued", async () => {
    const customer = await registered();
    await reissueCard(deps(), { customerId: customer.id, reason: "LOST" });

    const view = await readCard(deps(), customer.id);

    expect(view.cardNumber).toBe("1k2");
    expect(view.nextCardNumber).toBe("1k3");
  });

  it("carries the household's status, so an archived one is offered no replacement card", async () => {
    const customer = await registered();
    await blockCustomer(deps(), { customerId: customer.id, reason: "Nachweis fehlt" });

    const view = await readCard(deps(), customer.id);

    expect(view.status).toBe("BLOCKED");
  });

  it("refuses an id that belongs to nobody rather than showing an empty card", async () => {
    await expect(readCard(deps(), 404)).rejects.toThrow(CustomerNotFound);
  });

  it("refuses a customer with no card on file rather than inventing a number", async () => {
    const customer = await registerCustomer(registerDeps(), registerInput());

    await expect(readCard(deps(), customer.id)).rejects.toThrow(InvalidCustomerRecord);
  });
});

describe("blockCustomer", () => {
  let customers: FakeCustomerRepository;
  let audit: FakeAuditLog;

  function deps(today = TODAY) {
    return { customers, audit, clock: fakeClock(today) };
  }

  /** Put a customer of the given status in the register and hand back their id. */
  async function seed(status: CustomerStatus): Promise<number> {
    const customer = await customers.create(storedCustomer(status));
    return customer.id;
  }

  beforeEach(() => {
    customers = new FakeCustomerRepository();
    audit = new FakeAuditLog();
  });

  it("blocks an active customer and stores the reason, trimmed", async () => {
    const customerId = await seed("ACTIVE");

    await blockCustomer(deps(), { customerId, reason: "  suspected misuse  " });

    const after = await customers.findById(customerId);
    expect(after?.status).toBe("BLOCKED");
    expect(after?.blockReason).toBe("suspected misuse");
  });

  it("keeps the customer on the register — a block does not free the slot", async () => {
    const customerId = await seed("ACTIVE");

    await blockCustomer(deps(), { customerId, reason: "under review" });

    // 50 is the customer number storedCustomer holds; it must still be taken after a block.
    await expect(customers.takenActiveNumbers()).resolves.toContain(50);
  });

  it("leaves the customer number and the current card untouched", async () => {
    const customerId = await seed("ACTIVE");
    const before = await customers.findById(customerId);

    await blockCustomer(deps(), { customerId, reason: "under review" });

    const after = await customers.findById(customerId);
    expect(after?.customerNumber).toBe(before?.customerNumber);
    expect(after?.card).toEqual(before?.card);
  });

  it("records the block under a stable event name, with the reason as the why and no actor", async () => {
    const customerId = await seed("ACTIVE");

    await blockCustomer(deps(), { customerId, reason: "  suspected misuse  " });

    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0].what).toBe("customer.blocked");
    expect(audit.entries[0].changedFields).toEqual(["status", "blockReason"]);
    expect(audit.entries[0].why).toBe("suspected misuse");
    expect(Object.keys(audit.entries[0])).not.toContain("who");
  });

  it("refuses a reason that is only whitespace and writes nothing", async () => {
    const customerId = await seed("ACTIVE");

    await expect(blockCustomer(deps(), { customerId, reason: "   " })).rejects.toThrow(
      MissingAuditReason,
    );

    const after = await customers.findById(customerId);
    expect(after?.status).toBe("ACTIVE");
    expect(after?.blockReason).toBeNull();
    expect(audit.entries).toHaveLength(0);
  });

  it("refuses to block an already-blocked customer", async () => {
    const customerId = await seed("BLOCKED");

    await expect(blockCustomer(deps(), { customerId, reason: "again" })).rejects.toThrow(
      IllegalStatusTransition,
    );
  });

  it("refuses to block an archived customer, whose slot may already be someone else's", async () => {
    const customerId = await seed("ARCHIVED");

    await expect(blockCustomer(deps(), { customerId, reason: "too late" })).rejects.toThrow(
      IllegalStatusTransition,
    );
  });

  it("refuses an id that belongs to nobody rather than blocking the void", async () => {
    await expect(blockCustomer(deps(), { customerId: 404, reason: "who?" })).rejects.toThrow(
      CustomerNotFound,
    );
    expect(audit.entries).toHaveLength(0);
  });
});

describe("unblockCustomer", () => {
  let customers: FakeCustomerRepository;
  let audit: FakeAuditLog;

  function deps(today = TODAY) {
    return { customers, audit, clock: fakeClock(today) };
  }

  async function seed(status: CustomerStatus): Promise<number> {
    const customer = await customers.create(storedCustomer(status));
    return customer.id;
  }

  /** Block a freshly-seeded active customer through the use case and hand back their id. */
  async function seedBlocked(reason: string): Promise<number> {
    const customerId = await seed("ACTIVE");
    await blockCustomer(deps(), { customerId, reason });
    return customerId;
  }

  beforeEach(() => {
    customers = new FakeCustomerRepository();
    audit = new FakeAuditLog();
  });

  it("returns a blocked customer to active and clears the reason", async () => {
    const customerId = await seedBlocked("under review");

    await unblockCustomer(deps(), { customerId });

    const after = await customers.findById(customerId);
    expect(after?.status).toBe("ACTIVE");
    expect(after?.blockReason).toBeNull();
  });

  it("records the lift under a stable event name, carrying the lifted reason as the why", async () => {
    const customerId = await seedBlocked("under review");

    await unblockCustomer(deps(), { customerId });

    const lift = audit.entries[1];
    expect(lift.what).toBe("customer.unblocked");
    expect(lift.changedFields).toEqual(["status", "blockReason"]);
    expect(lift.why).toBe("under review");
    expect(Object.keys(lift)).not.toContain("who");
  });

  it("keeps the customer number and the current card — lifting re-activates, it does not re-register", async () => {
    const customerId = await seedBlocked("under review");
    const before = await customers.findById(customerId);

    await unblockCustomer(deps(), { customerId });

    const after = await customers.findById(customerId);
    expect(after?.customerNumber).toBe(before?.customerNumber);
    expect(after?.card).toEqual(before?.card);
  });

  it("records an empty why when the blocked row carried no reason", async () => {
    // A blocked row with no reason can only come from a hand-fixed database; lifting it must record
    // an empty why rather than crash on the missing text.
    const customerId = await seed("BLOCKED");

    await unblockCustomer(deps(), { customerId });

    expect(audit.entries[0].what).toBe("customer.unblocked");
    expect(audit.entries[0].why).toBe("");
  });

  it("refuses to unblock a customer who is already active", async () => {
    const customerId = await seed("ACTIVE");

    await expect(unblockCustomer(deps(), { customerId })).rejects.toThrow(IllegalStatusTransition);
  });

  it("refuses to unblock an archived customer", async () => {
    const customerId = await seed("ARCHIVED");

    await expect(unblockCustomer(deps(), { customerId })).rejects.toThrow(IllegalStatusTransition);
  });

  it("refuses an id that belongs to nobody rather than lifting nothing", async () => {
    await expect(unblockCustomer(deps(), { customerId: 404 })).rejects.toThrow(CustomerNotFound);
  });
});

describe("archiveCustomer", () => {
  let customers: FakeCustomerRepository;
  let cards: FakeCardRepository;
  let distribution: FakeDistributionRecordRepository;
  let audit: FakeAuditLog;

  /** The quota the freed slot is looked for within — the seeded default (US-01). */
  const QUOTA = 240;

  /**
   * `cards` and `distribution` are not in `archiveCustomer`'s dependencies at all; they are handed
   * in as witnesses, so "nothing is deleted" can be stated as behaviour rather than trusted from the
   * signature. A use case that ever grew a delete would fail the snapshot below.
   */
  function deps(today = TODAY) {
    return { customers, cards, distribution, clock: fakeClock(today), audit };
  }

  /**
   * A household with a history worth losing: a reissued card on top of the first, two hand-outs on
   * record, a certificate, notes and reminders on file — the state a real customer is in by the time
   * anyone thinks of archiving them.
   */
  async function seedWithHistory(status: CustomerStatus, customerNumber = 50): Promise<number> {
    const customer = await customers.create({
      ...storedCustomer(status),
      customerNumber,
      reminderCount: 2,
      details: createCustomerDetails(
        registerInput({ notes: "Bringt Ausweis nach" }),
        new Date(TODAY),
      ),
    });
    cards.place(customer.id, 1, 2);
    for (const date of ["2026-06-11T09:00:00.000Z", "2026-06-25T09:00:00.000Z"]) {
      await distribution.create({
        customerId: customer.id,
        date: new Date(date),
        showedUp: true,
        paidCents: 500 as Cents,
        priceCents: 500 as Cents,
      });
    }
    return customer.id;
  }

  /**
   * Everything the household owns, counted in one value: the rows in each store plus the fields the
   * customer row itself carries. One equality then covers every table an archive could have touched,
   * and a future write nobody thought to check still fails the test.
   *
   * The reminder *log* has no witness here because `archiveCustomer` has no reminder repository to
   * reach it with; `reminderCount` is the part of that trail the customer row holds, and it is in.
   */
  async function belongings(customerId: number): Promise<string> {
    const customer = await customers.findById(customerId);
    return JSON.stringify({
      cards: await cards.listCards(customerId),
      records: await distribution.listForCustomer(customerId),
      customerNumber: customer?.customerNumber,
      reminderCount: customer?.reminderCount,
      details: customer?.details,
    });
  }

  beforeEach(() => {
    customers = new FakeCustomerRepository();
    cards = new FakeCardRepository(customers);
    distribution = new FakeDistributionRecordRepository();
    audit = new FakeAuditLog();
  });

  it("archives an active customer, storing the reason trimmed and the instant it happened", async () => {
    const customerId = await seedWithHistory("ACTIVE");

    await archiveCustomer(deps(), { customerId, reason: "  nach Hamburg verzogen  " });

    const after = await customers.findById(customerId);
    expect(after?.status).toBe("ARCHIVED");
    expect(after?.archiveReason).toBe("nach Hamburg verzogen");
    expect(after?.archivedAt).toEqual(new Date(TODAY));
  });

  it("frees the customer number immediately — the next registration is offered it", async () => {
    customers = new FakeCustomerRepository([1, 2]);
    const customerId = await seedWithHistory("ACTIVE", 3);
    expect(lowestFreeNumber(await customers.takenActiveNumbers(), QUOTA)).toBe(4);

    await archiveCustomer(deps(), { customerId, reason: "verzogen" });

    expect(lowestFreeNumber(await customers.takenActiveNumbers(), QUOTA)).toBe(3);
  });

  it("keeps the number on the archived row, so the record still says which slot it held", async () => {
    const customerId = await seedWithHistory("ACTIVE", 3);

    await archiveCustomer(deps(), { customerId, reason: "verzogen" });

    expect((await customers.findById(customerId))?.customerNumber).toBe(3);
  });

  it("deletes nothing — cards, hand-outs, certificate, notes and reminders all survive", async () => {
    const customerId = await seedWithHistory("ACTIVE");
    const before = await belongings(customerId);

    await archiveCustomer(deps(), { customerId, reason: "verzogen" });

    expect(await belongings(customerId)).toBe(before);
  });

  it("archives a blocked customer and leaves no block reason behind", async () => {
    const customerId = await seedWithHistory("ACTIVE");
    await blockCustomer(deps(), { customerId, reason: "Karte weitergegeben" });

    await archiveCustomer(deps(), { customerId, reason: "meldet sich nicht mehr" });

    const after = await customers.findById(customerId);
    expect(after?.status).toBe("ARCHIVED");
    expect(after?.blockReason).toBeNull();
    expect(after?.archiveReason).toBe("meldet sich nicht mehr");
  });

  it("records the archive under a stable event name, with the reason as the why and no actor", async () => {
    const customerId = await seedWithHistory("ACTIVE");

    await archiveCustomer(deps(), { customerId, reason: "  verzogen  " });

    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0].what).toBe("customer.archived");
    expect(audit.entries[0].changedFields).toEqual(["status", "archiveReason", "archivedAt"]);
    expect(audit.entries[0].why).toBe("verzogen");
    expect(audit.entries[0].when).toEqual(new Date(TODAY));
    expect(Object.keys(audit.entries[0])).not.toContain("who");
  });

  it("refuses an empty reason and writes nothing — the reason is the whole record", async () => {
    const customerId = await seedWithHistory("ACTIVE");

    await expect(archiveCustomer(deps(), { customerId, reason: "" })).rejects.toThrow(
      MissingAuditReason,
    );

    const after = await customers.findById(customerId);
    expect(after?.status).toBe("ACTIVE");
    expect(after?.archiveReason).toBeNull();
    expect(audit.entries).toHaveLength(0);
  });

  it("names the archive event on the refusal, not the class", async () => {
    const customerId = await seedWithHistory("ACTIVE");

    await expect(archiveCustomer(deps(), { customerId, reason: "   " })).rejects.toThrow(
      new MissingAuditReason("customer.archived").message,
    );
  });

  it("keeps the slot taken when the archive is refused", async () => {
    customers = new FakeCustomerRepository([1, 2]);
    const customerId = await seedWithHistory("ACTIVE", 3);

    await expect(archiveCustomer(deps(), { customerId, reason: " " })).rejects.toThrow(
      MissingAuditReason,
    );

    expect(lowestFreeNumber(await customers.takenActiveNumbers(), QUOTA)).toBe(4);
  });

  it("refuses to archive an already-archived customer, whose slot may be someone else's", async () => {
    const customerId = await seedWithHistory("ARCHIVED");

    await expect(archiveCustomer(deps(), { customerId, reason: "nochmal" })).rejects.toThrow(
      IllegalStatusTransition,
    );
    expect(audit.entries).toHaveLength(0);
  });

  it("refuses an id that belongs to nobody rather than archiving the void", async () => {
    await expect(archiveCustomer(deps(), { customerId: 404, reason: "wer?" })).rejects.toThrow(
      CustomerNotFound,
    );
    expect(audit.entries).toHaveLength(0);
  });
});

describe("searchArchivedCustomers", () => {
  let customers: FakeCustomerRepository;

  /** No clock and no audit log: the search reads, and nothing about it depends on the day. */
  function deps() {
    return { customers };
  }

  /**
   * An archived household whose name, birthdate and archive date the test decides. It goes in
   * through `create` and then `archive`, so the row the search sees is the one archiving leaves —
   * number still on it, reason and instant written by the same call the use case makes.
   */
  async function archivedHousehold(seed: {
    firstName: string;
    lastName: string;
    birthDate?: string;
    customerNumber?: number;
    archivedAt?: string;
    reason?: string;
    /** Who lives *with* them: the customer's own row is added, as every household has one. */
    members?: ReadonlyArray<HouseholdMemberDetails>;
  }): Promise<number> {
    const personal = {
      firstName: seed.firstName,
      lastName: seed.lastName,
      birthDate: new Date(seed.birthDate ?? "1985-03-11T00:00:00.000Z"),
    };
    const details = createCustomerDetails(
      registerInput({
        ...personal,
        ...(seed.members === undefined
          ? {}
          : { householdMembers: [self(personal), ...seed.members] }),
      }),
      new Date(TODAY),
    );
    const customer = await customers.create({
      ...storedCustomer("ACTIVE"),
      customerNumber: seed.customerNumber ?? 50,
      details,
    });
    await customers.archive(
      customer.id,
      seed.reason ?? "verzogen",
      new Date(seed.archivedAt ?? TODAY),
    );
    return customer.id;
  }

  beforeEach(() => {
    customers = new FakeCustomerRepository();
  });

  it("finds a household whose name is spelled without the umlaut it was stored with", async () => {
    await archivedHousehold({ firstName: "Anke", lastName: "Müller" });

    const found = await searchArchivedCustomers(deps(), { lastName: "Mueller" });

    expect(found.matches).toHaveLength(1);
    expect(found.matches[0].lastName).toBe("Müller");
  });

  it("finds a household whose name was typed in capitals", async () => {
    await archivedHousehold({ firstName: "Anke", lastName: "Müller" });

    const found = await searchArchivedCustomers(deps(), { lastName: "MÜLLER" });

    expect(found.matches).toHaveLength(1);
  });

  it("finds a household from the first letters of the name, before it is typed out", async () => {
    await archivedHousehold({ firstName: "Anke", lastName: "Schneider" });

    const found = await searchArchivedCustomers(deps(), { lastName: "Schn" });

    expect(found.matches).toHaveLength(1);
  });

  it("leaves a household that is still on the register out of the archive search", async () => {
    await customers.create({
      ...storedCustomer("ACTIVE"),
      details: createCustomerDetails(
        registerInput({ firstName: "Bernd", lastName: "Schneider" }),
        new Date(TODAY),
      ),
    });
    await archivedHousehold({ firstName: "Anke", lastName: "Schneider", customerNumber: 51 });

    const found = await searchArchivedCustomers(deps(), { lastName: "Schneider" });

    expect(found.matches.map((match) => match.firstName)).toEqual(["Anke"]);
  });

  it("lists the most recently archived first when two households share a last name", async () => {
    await archivedHousehold({
      firstName: "Anke",
      lastName: "Schneider",
      archivedAt: "2024-03-04T10:00:00.000Z",
    });
    await archivedHousehold({
      firstName: "Bernd",
      lastName: "Schneider",
      customerNumber: 51,
      archivedAt: "2026-01-09T10:00:00.000Z",
    });

    const found = await searchArchivedCustomers(deps(), { lastName: "Schneider" });

    expect(found.matches.map((match) => match.firstName)).toEqual(["Bernd", "Anke"]);
  });

  it("narrows two namesakes down by the first name", async () => {
    await archivedHousehold({ firstName: "Anke", lastName: "Schneider" });
    await archivedHousehold({ firstName: "Bernd", lastName: "Schneider", customerNumber: 51 });

    const found = await searchArchivedCustomers(deps(), {
      lastName: "Schneider",
      firstName: "Bernd",
    });

    expect(found.matches.map((match) => match.firstName)).toEqual(["Bernd"]);
  });

  it("narrows two namesakes down by the date of birth alone", async () => {
    await archivedHousehold({
      firstName: "Anke",
      lastName: "Schneider",
      birthDate: "1985-03-11T00:00:00.000Z",
    });
    await archivedHousehold({
      firstName: "Bernd",
      lastName: "Schneider",
      customerNumber: 51,
      birthDate: "1972-11-30T00:00:00.000Z",
    });

    const found = await searchArchivedCustomers(deps(), {
      birthDate: new Date("1972-11-30T00:00:00.000Z"),
    });

    expect(found.matches.map((match) => match.firstName)).toEqual(["Bernd"]);
  });

  it("carries the number the household held, the archive date and the reason", async () => {
    await archivedHousehold({
      firstName: "Anke",
      lastName: "Schneider",
      customerNumber: 37,
      archivedAt: "2026-01-09T10:00:00.000Z",
      reason: "zwei Jahre nicht erschienen",
    });

    const [match] = (await searchArchivedCustomers(deps(), { lastName: "Schneider" })).matches;

    expect(match.formerCustomerNumber).toBe(37);
    expect(match.archivedAt).toEqual(new Date("2026-01-09T10:00:00.000Z"));
    expect(match.archiveReason).toBe("zwei Jahre nicht erschienen");
  });

  it("carries the address and the household size, so two namesakes can be told apart", async () => {
    await archivedHousehold({
      firstName: "Anke",
      lastName: "Schneider",
      members: [member(), member({ birthDate: new Date("2020-06-01T00:00:00.000Z") })],
    });

    const [match] = (await searchArchivedCustomers(deps(), { lastName: "Schneider" })).matches;

    expect(match.householdSize).toBe(3);
    expect(match.address.city).not.toBe("");
  });

  it("counts the household size in people, not in grown-ups and children", async () => {
    await archivedHousehold({
      firstName: "Anke",
      lastName: "Schneider",
      members: [member({ birthDate: new Date("2020-06-01T00:00:00.000Z") })],
    });

    const [match] = (await searchArchivedCustomers(deps(), { lastName: "Schneider" })).matches;

    // Two people, one of them a child — a size, not a pair of counts.
    expect(match.householdSize).toBe(2);
  });

  it("names the archived record by its own id, never by the number it once held", async () => {
    const customerId = await archivedHousehold({
      firstName: "Anke",
      lastName: "Schneider",
      customerNumber: 37,
    });

    const [match] = (await searchArchivedCustomers(deps(), { lastName: "Schneider" })).matches;

    expect(match.customerId).toBe(customerId);
    expect(match.customerId).not.toBe(37);
  });

  it("finds nobody rather than failing when the name belongs to no archived household", async () => {
    await archivedHousehold({ firstName: "Anke", lastName: "Schneider" });

    const found = await searchArchivedCustomers(deps(), { lastName: "Yildirim" });

    expect(found.matches).toEqual([]);
    expect(found.truncated).toBe(false);
  });

  it("refuses a search with every criterion blank rather than listing the whole archive", async () => {
    await archivedHousehold({ firstName: "Anke", lastName: "Schneider" });

    await expect(searchArchivedCustomers(deps(), {})).rejects.toThrow(EmptySearchQuery);
  });

  it("treats a name of nothing but spaces as a criterion nobody filled in", async () => {
    await expect(
      searchArchivedCustomers(deps(), { lastName: "   ", firstName: "" }),
    ).rejects.toThrow(EmptySearchQuery);
  });

  it("searches on the trimmed name, so a trailing space still finds the household", async () => {
    await archivedHousehold({ firstName: "Anke", lastName: "Schneider" });

    const found = await searchArchivedCustomers(deps(), { lastName: "  Schneider  " });

    expect(found.matches).toHaveLength(1);
  });

  it("shows twenty matches and asks for a narrower search when there are more", async () => {
    for (let index = 0; index < MAX_ARCHIVE_SEARCH_RESULTS + 1; index += 1) {
      await archivedHousehold({
        firstName: "Anke",
        lastName: "Schneider",
        customerNumber: index + 1,
      });
    }

    const found = await searchArchivedCustomers(deps(), { lastName: "Schneider" });

    expect(found.matches).toHaveLength(MAX_ARCHIVE_SEARCH_RESULTS);
    expect(found.truncated).toBe(true);
  });

  it("asks for nothing when exactly twenty match — that list is readable", async () => {
    for (let index = 0; index < MAX_ARCHIVE_SEARCH_RESULTS; index += 1) {
      await archivedHousehold({
        firstName: "Anke",
        lastName: "Schneider",
        customerNumber: index + 1,
      });
    }

    const found = await searchArchivedCustomers(deps(), { lastName: "Schneider" });

    expect(found.matches).toHaveLength(MAX_ARCHIVE_SEARCH_RESULTS);
    expect(found.truncated).toBe(false);
  });
});

describe("draftFromArchived", () => {
  let customers: FakeCustomerRepository;
  let cards: FakeCardRepository;
  let distribution: FakeDistributionRecordRepository;
  let audit: FakeAuditLog;

  /**
   * `cards`, `distribution` and `audit` are not among the use case's dependencies at all; they are
   * handed in as witnesses, so "the draft creates nothing" is stated as behaviour rather than read
   * off the signature. A use case that ever grew a write would fail these.
   */
  function deps() {
    return { customers, cards, distribution, audit };
  }

  /** The whole register as it stands, in one comparable value. */
  function register(): string {
    return JSON.stringify(customers.created);
  }

  /** An archived household, put in through `create` and then archived like the use case does. */
  async function archivedHousehold(
    overrides: Partial<RegisterCustomerInput> = {},
  ): Promise<number> {
    const customer = await customers.create({
      ...storedCustomer("ACTIVE"),
      details: createCustomerDetails(registerInput(overrides), new Date(TODAY)),
    });
    await customers.archive(customer.id, "verzogen", new Date(TODAY));
    return customer.id;
  }

  beforeEach(() => {
    customers = new FakeCustomerRepository();
    cards = new FakeCardRepository(customers);
    distribution = new FakeDistributionRecordRepository();
    audit = new FakeAuditLog();
  });

  it("pre-fills the applicant's own name, birthdate and address from the archived record", async () => {
    const customerId = await archivedHousehold({
      firstName: "Anke",
      lastName: "Schneider",
      birthDate: new Date("1985-03-11T00:00:00.000Z"),
      address: { street: "Lange Straße", houseNumber: "7a", zip: "33129", city: "Delbrück" },
    });

    const draft = await draftFromArchived(deps(), { archivedCustomerId: customerId });

    expect(draft.firstName).toBe("Anke");
    expect(draft.lastName).toBe("Schneider");
    expect(draft.birthDate).toEqual(new Date("1985-03-11T00:00:00.000Z"));
    expect(draft.address).toEqual({
      street: "Lange Straße",
      houseNumber: "7a",
      zip: "33129",
      city: "Delbrück",
    });
  });

  it("pre-fills every household member with their name and birthdate", async () => {
    const customerId = await archivedHousehold({
      firstName: "Anke",
      lastName: "Schneider",
      birthDate: new Date("1990-04-05T00:00:00.000Z"),
      householdMembers: [
        member({ firstName: "Anke", lastName: "Schneider" }),
        member({
          firstName: "Timo",
          lastName: "Schneider",
          birthDate: new Date("2020-06-01T00:00:00.000Z"),
        }),
      ],
    });

    const draft = await draftFromArchived(deps(), { archivedCustomerId: customerId });

    expect(draft.householdMembers).toEqual([
      {
        firstName: "Anke",
        lastName: "Schneider",
        birthDate: new Date("1990-04-05T00:00:00.000Z"),
      },
      { firstName: "Timo", lastName: "Schneider", birthDate: new Date("2020-06-01T00:00:00.000Z") },
    ]);
  });

  it("carries no number, group, card, reminder count, certificate or notes — those are decided afresh", async () => {
    const customerId = await archivedHousehold({ notes: "Bringt Ausweis nach" });

    const draft = await draftFromArchived(deps(), { archivedCustomerId: customerId });

    expect(Object.keys(draft).sort()).toEqual([
      "address",
      "birthDate",
      "firstName",
      "householdMembers",
      "lastName",
    ]);
  });

  it("creates nothing and changes nothing — a pre-fill is a read", async () => {
    const customerId = await archivedHousehold();
    cards.place(customerId, 1);
    await distribution.create({
      customerId,
      date: new Date("2026-06-11T09:00:00.000Z"),
      showedUp: true,
      paidCents: 500 as Cents,
      priceCents: 500 as Cents,
    });
    const before = register();
    const writesBefore = distribution.writes;

    await draftFromArchived(deps(), { archivedCustomerId: customerId });

    expect(register()).toBe(before);
    expect(await cards.listCards(customerId)).toHaveLength(1);
    expect(distribution.writes).toBe(writesBefore);
    expect(audit.entries).toEqual([]);
  });

  it("copies the household as new values, so editing the draft cannot reach the archived record", async () => {
    const customerId = await archivedHousehold({
      firstName: "Anke",
      lastName: "Schneider",
      birthDate: new Date("1985-03-11T00:00:00.000Z"),
      address: { street: "Lange Straße", houseNumber: "7a", zip: "33129", city: "Delbrück" },
      householdMembers: [
        member({
          firstName: "Anke",
          lastName: "Schneider",
          birthDate: new Date("1985-03-11T00:00:00.000Z"),
        }),
      ],
    });
    const draft = await draftFromArchived(deps(), { archivedCustomerId: customerId });

    // What a form does to the value it is bound to: fields are overwritten, dates are advanced and
    // rows are added. Only a copy makes that harmless.
    Object.assign(draft, { firstName: "Bernd" });
    Object.assign(draft.address, { street: "Kurze Straße" });
    Object.assign(draft.householdMembers[0], { firstName: "Bernd" });
    draft.birthDate.setFullYear(1900);
    draft.householdMembers[0].birthDate.setFullYear(1900);
    (draft.householdMembers as HouseholdMemberDetails[]).push(member());

    const stored = await customers.findById(customerId);
    expect(stored?.details.firstName).toBe("Anke");
    expect(stored?.details.address.street).toBe("Lange Straße");
    expect(stored?.details.birthDate).toEqual(new Date("1985-03-11T00:00:00.000Z"));
    expect(stored?.details.householdMembers).toHaveLength(1);
    expect(stored?.details.householdMembers[0].firstName).toBe("Anke");
    expect(stored?.details.householdMembers[0].birthDate).toEqual(
      new Date("1985-03-11T00:00:00.000Z"),
    );
  });

  it("refuses an id that belongs to nobody rather than drafting from the void", async () => {
    await expect(draftFromArchived(deps(), { archivedCustomerId: 404 })).rejects.toThrow(
      CustomerNotFound,
    );
  });

  it("refuses to pre-fill from a household that is still on the register", async () => {
    const customer = await customers.create(storedCustomer("ACTIVE"));

    await expect(draftFromArchived(deps(), { archivedCustomerId: customer.id })).rejects.toThrow(
      CustomerNotArchived,
    );
  });

  it("refuses to pre-fill from a blocked household, who holds their slot and their record", async () => {
    const customer = await customers.create(storedCustomer("BLOCKED"));

    await expect(draftFromArchived(deps(), { archivedCustomerId: customer.id })).rejects.toThrow(
      new CustomerNotArchived(customer.id, "BLOCKED").message,
    );
  });
});

/**
 * US-11.3 — the returning household. These tests are about a *path* rather than a new use case:
 * re-registration goes through `registerCustomer` exactly as a walk-in does, and what makes it a
 * re-registration is only that the form was filled in from `draftFromArchived`. If a second
 * registration path ever appeared, the number allocation, the group balancing and the audit entry
 * would each have two homes — and only one of them would be fixed the day a rule changed.
 */
describe("re-registering a household from an archived record", () => {
  let customers: FakeCustomerRepository;
  let settings: FakeSettingsRepository;
  let cards: FakeCardRepository;
  let distribution: FakeDistributionRecordRepository;
  let audit: FakeAuditLog;

  function deps() {
    return { customers, cards, settings, clock: fakeClock(TODAY), audit };
  }

  beforeEach(() => {
    customers = new FakeCustomerRepository();
    settings = new FakeSettingsRepository(version());
    cards = new FakeCardRepository(customers);
    distribution = new FakeDistributionRecordRepository();
    audit = new FakeAuditLog();
  });

  /** A household that once held `customerNumber` and has since left the register. */
  async function archivedHousehold(
    customerNumber: number,
    overrides: Partial<RegisterCustomerInput> = {},
  ): Promise<number> {
    const customer = await customers.create({
      ...storedCustomer("ACTIVE"),
      customerNumber,
      details: createCustomerDetails(
        registerInput(overrides),
        new Date("2024-01-08T09:00:00.000Z"),
      ),
    });
    await customers.archive(customer.id, "verzogen", new Date("2025-11-04T09:00:00.000Z"));
    return customer.id;
  }

  /**
   * What the registration screen does with a match: pre-fill from the archived record, add the paper
   * the applicant is holding today, and register. The certificate and the notes come from the form
   * because the draft deliberately carries neither (US-11.2).
   */
  async function reRegister(
    archivedCustomerId: number,
    customerNumber?: number,
  ): Promise<RegisteredCustomer> {
    const draft = await draftFromArchived({ customers }, { archivedCustomerId });
    return registerCustomer(deps(), {
      ...draft,
      certificate: { type: "Jobcenter", validUntil: new Date("2027-06-30T00:00:00.000Z") },
      notes: "",
      previousCustomerId: archivedCustomerId,
      customerNumber,
    });
  }

  it("carries the archived household's data into the new record", async () => {
    const archivedId = await archivedHousehold(1, {
      firstName: "Anke",
      lastName: "Schneider",
      birthDate: new Date("1990-04-05T00:00:00.000Z"),
      householdMembers: [
        member({ firstName: "Anke", lastName: "Schneider" }),
        member({
          firstName: "Timo",
          lastName: "Schneider",
          birthDate: new Date("2020-06-01T00:00:00.000Z"),
        }),
      ],
    });

    const customer = await reRegister(archivedId);

    expect(customer.details.firstName).toBe("Anke");
    expect(customer.details.householdMembers.map((who) => who.firstName)).toEqual(["Anke", "Timo"]);
  });

  it("allocates a new number rather than the one the household used to hold", async () => {
    const archivedId = await archivedHousehold(1);
    // Their old slot went to somebody else while they were away — the case that makes "a new number"
    // more than a formality.
    await customers.create({ ...storedCustomer("ACTIVE"), customerNumber: 1 });

    const customer = await reRegister(archivedId);

    expect(customer.customerNumber).toBe(2);
  });

  it("is a new customer, not the old one brought back", async () => {
    const archivedId = await archivedHousehold(1);

    const customer = await reRegister(archivedId);

    expect(customer.id).not.toBe(archivedId);
    expect(customer.status).toBe("ACTIVE");
  });

  it("starts the returning household on card index 1 with no reminders outstanding", async () => {
    const archivedId = await archivedHousehold(1);

    const customer = await reRegister(archivedId);

    expect(customer.card.index).toBe(1);
    expect(customer.card.reason).toBe("FIRST_ISSUE");
    expect(customer.reminderCount).toBe(0);
  });

  it("hands a household given their old slot back the next card, not the one they still carry", async () => {
    const archivedId = await archivedHousehold(1);
    cards.place(archivedId, 1);

    const customer = await reRegister(archivedId, 1);

    // No branch on the re-registration: the index comes from the slot's run, which is why the card
    // in the household's kitchen drawer cannot be handed out a second time.
    expect(customer.card.index).toBe(2);
  });

  it("records the certificate presented today, never the lapsed one on the archived record", async () => {
    const archivedId = await archivedHousehold(1, {
      certificate: { type: "Wohngeld", validUntil: new Date("2024-12-31T00:00:00.000Z") },
    });

    const customer = await reRegister(archivedId);

    expect(customer.details.certificate).toEqual({
      type: "Jobcenter",
      validUntil: new Date("2027-06-30T00:00:00.000Z"),
    });
  });

  it("dates the returning household's registration today, not when they first joined", async () => {
    const archivedId = await archivedHousehold(1);

    const customer = await reRegister(archivedId);

    expect(customer.registeredOn).toEqual(new Date(TODAY));
  });

  it("leaves the archived record exactly as it was — its status, number, cards and history", async () => {
    const archivedId = await archivedHousehold(1);
    cards.place(archivedId, 1, 2);
    await distribution.create({
      customerId: archivedId,
      date: new Date("2025-10-08T09:00:00.000Z"),
      showedUp: true,
      paidCents: 500 as Cents,
      priceCents: 500 as Cents,
    });
    const before = JSON.stringify(await customers.findById(archivedId));
    const writesBefore = distribution.writes;

    await reRegister(archivedId);

    expect(JSON.stringify(await customers.findById(archivedId))).toBe(before);
    expect((await cards.listCards(archivedId)).map((card) => card.index)).toEqual([2, 1]);
    expect(await distribution.listForCustomer(archivedId)).toHaveLength(1);
    expect(distribution.writes).toBe(writesBefore);
  });

  it("keeps the archived household's number on their old record, freed but still shown", async () => {
    const archivedId = await archivedHousehold(1);

    await reRegister(archivedId);

    const archived = await customers.findById(archivedId);
    expect(archived?.customerNumber).toBe(1);
    expect(archived?.status).toBe("ARCHIVED");
  });

  it("links the new record to the archived predecessor", async () => {
    const archivedId = await archivedHousehold(1);

    const customer = await reRegister(archivedId);

    expect(customer.previousCustomerId).toBe(archivedId);
  });

  it("names the link among what registration decided, so the re-registration is on the record", async () => {
    const archivedId = await archivedHousehold(1);

    await reRegister(archivedId);

    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0].changedFields).toEqual([
      "customerNumber",
      "group",
      "status",
      "card",
      "previousCustomerId",
    ]);
  });

  it("gives the archived household no second slot — only the new record counts against the quota", async () => {
    const archivedId = await archivedHousehold(1);

    const customer = await reRegister(archivedId);

    await expect(customers.takenActiveNumbers()).resolves.toEqual([customer.customerNumber]);
  });
});
