import { faker } from "@faker-js/faker";
import { beforeEach, describe, expect, it } from "vitest";
import type { CardIssueReason, IssuedCard, NewCard } from "@/domain/card/card";
import { formatCardNumber } from "@/domain/card/cardNumber";
import {
  createCustomerDetails,
  type CustomerStatus,
  type HouseholdMemberDetails,
  type NewCustomer,
  type PersonalDetails,
  type RegisteredCustomer,
} from "@/domain/customer/customer";
import type { Group, GroupCounts } from "@/domain/customer/group";
import { composition } from "@/domain/customer/householdComposition";
import type {
  DistributionRecord,
  NewDistributionRecord,
} from "@/domain/distribution/distributionRecord";
import {
  CustomerArchived,
  CustomerNotFound,
  CustomerNumberOutOfRange,
  CustomerNumberTaken,
  CustomerNumberUnchanged,
} from "@/domain/errors";
import type { Cents } from "@/domain/money";
import { createSettings, type SettingsInput, type SettingsVersion } from "@/domain/policy/settings";
import type {
  ArchivedCustomer,
  AuditEntry,
  AuditLog,
  CardIssueCounts,
  CardRepository,
  Clock,
  CustomerRepository,
  DistributionRecordRepository,
  ReminderLogEntry,
  ReminderLogRepository,
  SettingsRepository,
} from "../ports";
import { listCardsDueForReissue } from "./cards-due-for-reissue";
import { changeCustomerNumber } from "./change-customer-number";
import { lookupCustomer } from "./lookup-customer";
import { readCard } from "./read-card";
import { readCustomer } from "./read-customer";

/**
 * Hand-written fakes, per the testing standard, and synthetic data only. The birthdates are fixed
 * rather than faked because every count these tests assert is derived from them: the grown-up was
 * born in 1985, the child on `2015-06-02` — still a child on {@link TODAY} — and the member of
 * {@link OVERTAKEN_BIRTH_DATE} turned 13 after the card in the household's pocket was printed.
 */

faker.seed(20260831);

const TODAY = "2026-08-31T09:00:00.000Z";

const GROWN_UP_BIRTH_DATE = new Date("1985-03-11T00:00:00.000Z");
const CHILD_BIRTH_DATE = new Date("2015-06-02T00:00:00.000Z");
const OVERTAKEN_BIRTH_DATE = new Date("2013-05-04T00:00:00.000Z");

function fakeClock(now: string): Clock {
  return { now: () => new Date(now) };
}

class FakeAuditLog implements AuditLog {
  readonly entries: AuditEntry[] = [];

  append(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

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

/** The hand-outs a household has collected, so the balance the record derives can be compared. */
class FakeDistributionRecordRepository implements DistributionRecordRepository {
  readonly records: DistributionRecord[] = [];
  writes = 0;

  constructor(...records: DistributionRecord[]) {
    this.records.push(...records);
  }

  listForCustomer(customerId: number): Promise<ReadonlyArray<DistributionRecord>> {
    return Promise.resolve(this.records.filter((record) => record.customerId === customerId));
  }

  listForDay(): Promise<ReadonlyArray<DistributionRecord>> {
    return Promise.resolve([]);
  }

  findById(): Promise<DistributionRecord | null> {
    return Promise.resolve(null);
  }

  create(record: NewDistributionRecord): Promise<DistributionRecord> {
    this.writes += 1;
    const stored = { ...record, id: this.records.length + 1 };
    this.records.push(stored);
    return Promise.resolve(stored);
  }

  setPayment(): Promise<DistributionRecord> {
    this.writes += 1;
    return Promise.reject(new Error("no test here amends a hand-out"));
  }

  remove(): Promise<void> {
    this.writes += 1;
    return Promise.resolve();
  }
}

/**
 * The reminder trail, empty throughout. The counter reads it on every lookup (US-06.4) and no test
 * here gives a reminder, so answering `null` is the honest reading of a household nobody reminded.
 */
class FakeReminderLogRepository implements ReminderLogRepository {
  findOnDay(): Promise<ReminderLogEntry | null> {
    return Promise.resolve(null);
  }

  record(): Promise<void> {
    return Promise.reject(new Error("no test here logs a reminder"));
  }
}

/**
 * A register that writes a number change the way the adapter does: the number moves and the card is
 * inserted **together**, and the card's slot is read off the row *after* it moved — so no test can
 * file a card under a number its household does not hold. It owns the cards for that reason; the
 * card store below is a reader over the same rows.
 *
 * `writes` counts every mutation that reached it, which is how „a refusal writes nothing" is stated
 * as a fact about the store rather than as an assertion about one column.
 */
class FakeCustomerRepository implements CustomerRepository {
  readonly holders: RegisteredCustomer[] = [];
  readonly cards: Array<{ readonly customerId: number; readonly card: IssuedCard }> = [];
  writes = 0;

  constructor(...holders: RegisteredCustomer[]) {
    this.holders.push(...holders);
  }

  /**
   * Put a card on a slot's run without going through a use case — the history a household that has
   * since been archived left behind, which the next card on that slot has to count on from (US-25).
   */
  place(customerId: number, customerNumber: number, ...indices: number[]): void {
    for (const index of indices) {
      this.cards.push({
        customerId,
        card: {
          customerNumber,
          index,
          issuedAt: new Date(TODAY),
          reason: "FIRST_ISSUE",
          countsAtIssue: { grownUps: 1, children: 1 },
          groupAtIssue: "RED",
        },
      });
    }
  }

  findById(id: number): Promise<RegisteredCustomer | null> {
    return Promise.resolve(this.holders.find((customer) => customer.id === id) ?? null);
  }

  findByCustomerNumber(customerNumber: number): Promise<RegisteredCustomer | null> {
    // The slot's active holder where it has one, and otherwise whoever held it last — the rule the
    // adapter states for the counter's lookup (US-04.2).
    const holders = this.holders.filter((customer) => customer.customerNumber === customerNumber);
    const active = holders.find((customer) => customer.status !== "ARCHIVED");
    return Promise.resolve(active ?? holders.at(-1) ?? null);
  }

  listWithStatus(status: CustomerStatus): Promise<ReadonlyArray<RegisteredCustomer>> {
    return Promise.resolve(
      this.holders
        .filter((customer) => customer.status === status)
        .sort((a, b) => a.customerNumber - b.customerNumber),
    );
  }

  /**
   * No use case in this file browses the register (US-15.1) or searches the archive (US-11.1); the
   * methods are here because the port has them, and answering with nothing is honest.
   */
  list(): Promise<ReadonlyArray<RegisteredCustomer>> {
    return Promise.resolve([]);
  }

  searchArchived(): Promise<ReadonlyArray<ArchivedCustomer>> {
    return Promise.resolve([]);
  }

  /** Only a household that still holds a slot occupies one — archiving is what releases it. */
  takenActiveNumbers(): Promise<ReadonlyArray<number>> {
    return Promise.resolve(
      this.holders
        .filter((customer) => customer.status !== "ARCHIVED")
        .map((customer) => customer.customerNumber),
    );
  }

  groupCounts(): Promise<GroupCounts> {
    const onRegister = this.holders.filter((customer) => customer.status !== "ARCHIVED");
    return Promise.resolve({
      red: onRegister.filter((customer) => customer.group === "RED").length,
      blue: onRegister.filter((customer) => customer.group === "BLUE").length,
    });
  }

  create(customer: NewCustomer): Promise<RegisteredCustomer> {
    this.writes += 1;
    const registered: RegisteredCustomer = {
      ...customer,
      card: { ...customer.card, customerNumber: customer.customerNumber },
      id: this.holders.length + 1,
      blockReason: null,
      archiveReason: null,
      archivedAt: null,
      registeredOn: customer.card.issuedAt,
    };
    this.holders.push(registered);
    this.cards.push({ customerId: registered.id, card: registered.card });
    return Promise.resolve(registered);
  }

  updateHousehold(id: number, members: ReadonlyArray<HouseholdMemberDetails>): Promise<void> {
    this.writes += 1;
    return this.replace(id, (held) => ({
      ...held,
      details: { ...held.details, householdMembers: [...members] },
    }));
  }

  updateDetails(
    id: number,
    details: PersonalDetails,
    household: ReadonlyArray<HouseholdMemberDetails>,
  ): Promise<void> {
    this.writes += 1;
    return this.replace(id, (held) => ({
      ...held,
      details: { ...held.details, ...details, householdMembers: [...household] },
    }));
  }

  updateNotes(id: number, notes: string): Promise<void> {
    this.writes += 1;
    return this.replace(id, (held) => ({ ...held, details: { ...held.details, notes } }));
  }

  setGroup(id: number, group: Group): Promise<void> {
    this.writes += 1;
    return this.replace(id, (held) => ({ ...held, group }));
  }

  setStatus(id: number, status: CustomerStatus, blockReason: string | null): Promise<void> {
    this.writes += 1;
    return this.replace(id, (held) => ({ ...held, status, blockReason }));
  }

  archive(id: number, reason: string, archivedAt: Date): Promise<void> {
    this.writes += 1;
    return this.replace(id, (held) => ({
      ...held,
      status: "ARCHIVED",
      blockReason: null,
      archiveReason: reason,
      archivedAt,
    }));
  }

  /**
   * The number and the card together, as the adapter's one transaction writes them: the row moves
   * first and the card's slot is then read off it, so the card can only ever be printed under the
   * number the household now holds.
   */
  changeCustomerNumber(id: number, customerNumber: number, card: NewCard): Promise<IssuedCard> {
    this.writes += 1;
    const index = this.holders.findIndex((customer) => customer.id === id);
    if (index === -1) {
      return Promise.reject(new CustomerNotFound(id));
    }
    const issued: IssuedCard = { ...card, customerNumber };
    this.holders[index] = { ...this.holders[index], customerNumber, card: issued };
    this.cards.push({ customerId: id, card: issued });
    return Promise.resolve(issued);
  }

  private replace(
    id: number,
    change: (held: RegisteredCustomer) => RegisteredCustomer,
  ): Promise<void> {
    const index = this.holders.findIndex((customer) => customer.id === id);
    if (index === -1) {
      return Promise.reject(new CustomerNotFound(id));
    }
    this.holders[index] = change(this.holders[index]);
    return Promise.resolve();
  }
}

/**
 * The card store as a reader over the register's rows. A card carries the slot it was **printed
 * under**, so `highestIndexForNumber` asks the cards themselves rather than resolving each one
 * through its household — which is the whole point once a household can move off a slot and leave
 * its run behind (US-30).
 */
class FakeCardRepository implements CardRepository {
  constructor(private readonly register: FakeCustomerRepository) {}

  currentCard(customerId: number): Promise<IssuedCard | null> {
    return Promise.resolve(
      this.cardsOf(customerId).reduce<IssuedCard | null>(
        (current, card) => (current === null || card.index > current.index ? card : current),
        null,
      ),
    );
  }

  highestIndexForNumber(customerNumber: number): Promise<number> {
    return Promise.resolve(
      this.register.cards.reduce(
        (highest, { card }) =>
          card.customerNumber === customerNumber ? Math.max(highest, card.index) : highest,
        0,
      ),
    );
  }

  listCards(customerId: number): Promise<ReadonlyArray<IssuedCard>> {
    return Promise.resolve([...this.cardsOf(customerId)].sort((a, b) => b.index - a.index));
  }

  /** Every slot's run at once, keyed on the number each card was printed under (US-30.4). */
  highestIndexByNumber(): Promise<ReadonlyMap<number, number>> {
    const highest = new Map<number, number>();
    for (const { card } of this.register.cards) {
      highest.set(card.customerNumber, Math.max(highest.get(card.customerNumber) ?? 0, card.index));
    }
    return Promise.resolve(highest);
  }

  issueCounts(customerId: number): Promise<CardIssueCounts> {
    const cards = this.cardsOf(customerId);
    return Promise.resolve({
      cardsIssued: cards.length,
      reissuesForLoss: cards.filter((card) => card.reason === "LOST").length,
    });
  }

  /** No use case in this file issues a card on its own — the number change writes its own. */
  issue(): Promise<IssuedCard> {
    return Promise.reject(new Error("a number change writes its card with the number"));
  }

  private cardsOf(customerId: number): ReadonlyArray<IssuedCard> {
    return this.register.cards
      .filter((held) => held.customerId === customerId)
      .map((held) => held.card);
  }
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
    birthDate: GROWN_UP_BIRTH_DATE,
    ...overrides,
  };
}

interface HouseholdOptions {
  readonly id: number;
  readonly customerNumber: number;
  readonly status?: CustomerStatus;
  readonly group?: Group;
  /** The index of the card the household is holding — the top of the run on their own slot. */
  readonly cardIndex?: number;
  /** Which group the card in their pocket prints; defaults to the one they are in. */
  readonly groupAtIssue?: Group;
  readonly members?: ReadonlyArray<HouseholdMemberDetails>;
  /** What the card in their pocket printed; defaults to the household as it stands today. */
  readonly countsAtIssue?: { readonly grownUps: number; readonly children: number };
}

/** A household the register already holds, carrying the card at the top of its slot's run. */
function household({
  id,
  customerNumber,
  status = "ACTIVE",
  group = "RED",
  cardIndex = 1,
  groupAtIssue = group,
  members,
  countsAtIssue,
}: HouseholdOptions): RegisteredCustomer {
  // The customer is the first member of their own household — `createCustomerDetails` insists on
  // it, so their name and birthdate are read off that row rather than generated beside it.
  const householdMembers = members ?? [
    member({ birthDate: GROWN_UP_BIRTH_DATE }),
    member({ birthDate: CHILD_BIRTH_DATE }),
  ];
  const self = householdMembers[0];
  const details = createCustomerDetails(
    {
      firstName: self.firstName,
      lastName: self.lastName,
      birthDate: self.birthDate,
      address: {
        street: faker.location.street(),
        houseNumber: faker.location.buildingNumber(),
        zip: faker.location.zipCode("#####"),
        city: faker.location.city(),
      },
      certificate: { type: "Jobcenter", validUntil: new Date("2027-01-31T00:00:00.000Z") },
      householdMembers: [...householdMembers],
      notes: "Klingelt zweimal",
    },
    new Date(TODAY),
  );
  return {
    id,
    customerNumber,
    group,
    status,
    blockReason: status === "BLOCKED" ? "Hausverbot" : null,
    archiveReason: status === "ARCHIVED" ? "Weggezogen" : null,
    archivedAt: status === "ARCHIVED" ? new Date(TODAY) : null,
    reminderCount: 2,
    details,
    card: {
      customerNumber,
      index: cardIndex,
      issuedAt: new Date("2026-01-15T09:00:00.000Z"),
      reason: "FIRST_ISSUE",
      countsAtIssue: countsAtIssue ?? composition(details.householdMembers, new Date(TODAY)),
      groupAtIssue,
    },
    registeredOn: new Date("2026-01-15T09:00:00.000Z"),
    previousCustomerId: null,
  };
}

/** A hand-out the household collected, priced then and paid at whatever they handed over. */
function handOut(
  customerId: number,
  id: number,
  date: string,
  paidCents: Cents,
  priceCents: Cents,
): DistributionRecord {
  return { id, customerId, date: new Date(date), showedUp: true, paidCents, priceCents };
}

describe("changeCustomerNumber", () => {
  let customers: FakeCustomerRepository;
  let cards: FakeCardRepository;
  let settings: FakeSettingsRepository;
  let audit: FakeAuditLog;
  let records: FakeDistributionRecordRepository;

  /**
   * The household this suite moves: id 1 on slot 5, carrying `5k4` — the top of its own run. Slot
   * 23 was last held by an archived household whose run reached `23k5`, and slot 99 has never had
   * a card on it at all.
   */
  function register(...holders: RegisteredCustomer[]): void {
    customers = new FakeCustomerRepository(...holders);
    cards = new FakeCardRepository(customers);
  }

  function deps() {
    return { customers, cards, settings, audit, clock: fakeClock(TODAY) };
  }

  function readDeps() {
    return { customers, cards, settings, records, clock: fakeClock(TODAY) };
  }

  beforeEach(() => {
    register(household({ id: 1, customerNumber: 5, cardIndex: 4 }));
    customers.place(1, 5, 1, 2, 3, 4);
    settings = new FakeSettingsRepository(version());
    audit = new FakeAuditLog();
    records = new FakeDistributionRecordRepository(
      handOut(1, 1, "2026-08-13T10:00:00.000Z", 150, 300),
      handOut(1, 2, "2026-08-27T10:00:00.000Z", 300, 300),
    );
  });

  /** The household's slot as the register holds it after whatever the use case did. */
  function storedNumber(id = 1): number | undefined {
    return customers.holders.find((customer) => customer.id === id)?.customerNumber;
  }

  it("moves an active household to a free number", async () => {
    const card = await changeCustomerNumber(deps(), { customerId: 1, customerNumber: 23 });

    expect(storedNumber()).toBe(23);
    expect(card.customerNumber).toBe(23);
  });

  it("moves a blocked household", async () => {
    // A block pauses a household at the counter; it does not freeze their record, the same division
    // `changeGroup` and `issueCard` already make (US-08).
    register(household({ id: 1, customerNumber: 5, cardIndex: 4, status: "BLOCKED" }));

    await changeCustomerNumber(deps(), { customerId: 1, customerNumber: 23 });

    expect(storedNumber()).toBe(23);
    expect(customers.holders[0].status).toBe("BLOCKED");
    expect(customers.holders[0].blockReason).toBe("Hausverbot");
  });

  it("refuses an archived household", async () => {
    register(household({ id: 1, customerNumber: 5, status: "ARCHIVED" }));

    await expect(
      changeCustomerNumber(deps(), { customerId: 1, customerNumber: 23 }),
    ).rejects.toBeInstanceOf(CustomerArchived);
  });

  it("refuses an unknown customer", async () => {
    await expect(
      changeCustomerNumber(deps(), { customerId: 404, customerNumber: 23 }),
    ).rejects.toBeInstanceOf(CustomerNotFound);
  });

  it("refuses the number the household already holds", async () => {
    await expect(
      changeCustomerNumber(deps(), { customerId: 1, customerNumber: 5 }),
    ).rejects.toBeInstanceOf(CustomerNumberUnchanged);
  });

  it("refuses a number an active household holds", async () => {
    register(
      household({ id: 1, customerNumber: 5, cardIndex: 4 }),
      household({ id: 2, customerNumber: 23 }),
    );

    await expect(
      changeCustomerNumber(deps(), { customerId: 1, customerNumber: 23 }),
    ).rejects.toBeInstanceOf(CustomerNumberTaken);
  });

  it("refuses a number above the quota in force", async () => {
    // The quota may have been lowered while the record was open, which is why the settings are read
    // here and not taken from whatever the screen last saw (US-14).
    settings = new FakeSettingsRepository(version({ quotaN: 10 }));

    await expect(
      changeCustomerNumber(deps(), { customerId: 1, customerNumber: 23 }),
    ).rejects.toBeInstanceOf(CustomerNumberOutOfRange);
  });

  it("issues the next card on the new slot", async () => {
    // Slot 23's run reached 5 under a household since archived; the new card continues *that* run,
    // not the household's own — which would have printed `23k5`, a number already out in the world.
    register(
      household({ id: 1, customerNumber: 5, cardIndex: 4 }),
      household({ id: 2, customerNumber: 23, status: "ARCHIVED", cardIndex: 5 }),
    );
    customers.place(1, 5, 1, 2, 3, 4);
    customers.place(2, 23, 1, 2, 3, 4, 5);

    const card = await changeCustomerNumber(deps(), { customerId: 1, customerNumber: 23 });

    expect(formatCardNumber(card.customerNumber, card.index)).toBe("23k6");
  });

  it("continues the run of a slot an archived household left", async () => {
    // The archived holder walked away with `23k5`; nothing about status is consulted, because the
    // card they took is still out in the world (US-25).
    register(
      household({ id: 1, customerNumber: 5, cardIndex: 4 }),
      household({ id: 2, customerNumber: 23, status: "ARCHIVED", cardIndex: 5 }),
    );
    customers.place(1, 5, 1, 2, 3, 4);
    customers.place(2, 23, 1, 2, 3, 4, 5);

    const card = await changeCustomerNumber(deps(), { customerId: 1, customerNumber: 23 });

    expect(card.index).toBe(6);
    expect(await cards.highestIndexForNumber(5)).toBe(4);
  });

  it("issues the card above the household's own run on a slot nobody has ever held", async () => {
    // Slot 99 has never had a card, so the slot alone would say `99k1` — a number this household is
    // already carrying as `5k1`. The card a household holds is the highest-indexed one they have
    // been issued (US-02, FR-4), and `@@unique([customerId, index])` is the database saying so, so
    // the move counts on from *their* run instead and the skipped indexes on 99 are skipped for
    // good. Nothing is printed twice, which is the guarantee that matters (US-25).
    const card = await changeCustomerNumber(deps(), { customerId: 1, customerNumber: 99 });

    expect(formatCardNumber(card.customerNumber, card.index)).toBe("99k5");
  });

  it("prints today's counts and today's group on the new card", async () => {
    // The card in their pocket printed a child who has since turned 13, and a group they have since
    // been moved out of. The card the move prints states the household as it is now.
    register(
      household({
        id: 1,
        customerNumber: 5,
        cardIndex: 4,
        group: "BLUE",
        groupAtIssue: "RED",
        countsAtIssue: { grownUps: 1, children: 1 },
        members: [
          member({ birthDate: GROWN_UP_BIRTH_DATE }),
          member({ birthDate: OVERTAKEN_BIRTH_DATE }),
        ],
      }),
    );

    const card = await changeCustomerNumber(deps(), { customerId: 1, customerNumber: 23 });

    expect(card.countsAtIssue).toEqual({ grownUps: 2, children: 0 });
    expect(card.groupAtIssue).toBe("BLUE");
    expect(card.issuedAt).toEqual(new Date(TODAY));
  });

  it("records the reason as a number change", async () => {
    const card = await changeCustomerNumber(deps(), { customerId: 1, customerNumber: 23 });

    const reason: CardIssueReason = "CUSTOMER_NUMBER_CHANGED";
    expect(card.reason).toBe(reason);
    expect(audit.entries.at(-1)).toEqual({
      what: "customer.card.issued",
      changedFields: ["card"],
      when: new Date(TODAY),
      why: reason,
    });
  });

  it("writes the two numbers into the audit entry", async () => {
    await changeCustomerNumber(deps(), { customerId: 1, customerNumber: 23 });

    expect(audit.entries[0]).toEqual({
      what: "customer.numberChanged",
      changedFields: ["customerNumber"],
      when: new Date(TODAY),
      why: "customerNumber=5→23",
    });
    // Two entries, because two things happened and each is read on its own.
    expect(audit.entries).toHaveLength(2);
  });

  it("writes nothing when the number is refused", async () => {
    register(
      household({ id: 1, customerNumber: 5, cardIndex: 4 }),
      household({ id: 2, customerNumber: 23 }),
    );
    const cardsBefore = customers.cards.length;

    await expect(
      changeCustomerNumber(deps(), { customerId: 1, customerNumber: 23 }),
    ).rejects.toBeInstanceOf(CustomerNumberTaken);

    expect(customers.writes).toBe(0);
    expect(customers.cards).toHaveLength(cardsBefore);
    expect(audit.entries).toEqual([]);
    expect(storedNumber()).toBe(5);
  });

  it("leaves the rest of the record alone", async () => {
    // Read through the real card view, so the claim covers what the record actually shows: the
    // derived balance and the hand-out history as much as the stored columns (ADR-008).
    const before = await readCustomer(readDeps(), 1);

    await changeCustomerNumber(deps(), { customerId: 1, customerNumber: 23 });
    const after = await readCustomer(readDeps(), 1);

    // Everything but the slot and the card it printed — put back, the record is the one before.
    expect({ ...after.customer, customerNumber: 5, card: before.customer.card }).toEqual(
      before.customer,
    );
    expect(after.customer.id).toBe(before.customer.id);
    expect(after.balanceCents).toBe(before.balanceCents);
    expect(after.history).toEqual(before.history);
    expect(after.composition).toEqual(before.composition);
    expect(after.allowance).toEqual(before.allowance);
    expect(after.consecutiveNoShows).toBe(before.consecutiveNoShows);
    expect(records.writes).toBe(0);
  });

  it("releases the old number", async () => {
    await changeCustomerNumber(deps(), { customerId: 1, customerNumber: 23 });

    const taken = await customers.takenActiveNumbers();
    expect(taken).not.toContain(5);
    expect(taken).toContain(23);
  });
});

/**
 * What the rest of the application reads once a household has moved (US-30.5).
 *
 * The move itself is the suite above; these are the four reads that a moved household passes
 * through afterwards, and every one of them is about the same thing: **no card is ever
 * re-labelled**. The household in every test is the batch's worked example — id 1 on slot 5
 * carrying `5k4`, moved onto slot 23 whose last card was `23k5`, so they end up holding `23k6` over
 * a run of `5k4`, `5k3`, `5k2`, `5k1`.
 *
 * They live here rather than in each use case's own suite because this file holds the only fakes
 * that can move a household — the register writes the number and the card together, as the adapter
 * does, so a card can only ever be filed under the slot its household held when it was printed.
 */
describe("the record after a number change", () => {
  let customers: FakeCustomerRepository;
  let cards: FakeCardRepository;
  let settings: FakeSettingsRepository;
  let audit: FakeAuditLog;
  let records: FakeDistributionRecordRepository;
  let reminders: FakeReminderLogRepository;

  /** The household this suite moves, and the run an archived holder left on the slot they take. */
  function register(...holders: RegisteredCustomer[]): void {
    customers = new FakeCustomerRepository(...holders);
    cards = new FakeCardRepository(customers);
    customers.place(1, 5, 1, 2, 3, 4);
    customers.place(2, 23, 1, 2, 3, 4, 5);
  }

  function moveDeps() {
    return { customers, cards, settings, audit, clock: fakeClock(TODAY) };
  }

  function readCardDeps() {
    return { customers, cards, settings, clock: fakeClock(TODAY) };
  }

  function readCustomerDeps() {
    return { customers, cards, settings, records, clock: fakeClock(TODAY) };
  }

  function reissueDeps() {
    return { customers, clock: fakeClock(TODAY) };
  }

  function counterDeps() {
    return { customers, settings, records, reminders, clock: fakeClock(TODAY) };
  }

  /** Move the worked example from 5 to 23. */
  async function moveToTwentyThree(): Promise<void> {
    await changeCustomerNumber(moveDeps(), { customerId: 1, customerNumber: 23 });
  }

  beforeEach(() => {
    register(household({ id: 1, customerNumber: 5, cardIndex: 4 }));
    settings = new FakeSettingsRepository(version());
    audit = new FakeAuditLog();
    records = new FakeDistributionRecordRepository();
    reminders = new FakeReminderLogRepository();
  });

  it("keeps every superseded card under the number it was printed with", async () => {
    await moveToTwentyThree();

    const view = await readCard(readCardDeps(), 1);

    // The four cards left on slot 5 are what makes slot 5 safe to hand out again: the next
    // household to take it is printed `5k5`. Re-labelling them under 23 would put `5k1` back into
    // the pool while the piece of card bearing it is still out in the world (US-25).
    expect(view.superseded.map((entry) => entry.number)).toEqual(["5k4", "5k3", "5k2", "5k1"]);
  });

  it("the card the household holds is on the number they hold", async () => {
    await moveToTwentyThree();

    const view = await readCard(readCardDeps(), 1);
    const record = await readCustomer(readCustomerDeps(), 1);

    // The invariant `nextCardIndexOnMove` exists to keep: the card a household holds is the highest
    // index they have been issued, and a move prints it on the new slot in the same transaction, so
    // reading the number off the card can never disagree with reading it off the household.
    expect(view.cardNumber).toBe("23k6");
    expect(record.cardNumber).toBe("23k6");
    expect(record.customer.customerNumber).toBe(23);
  });

  it("names the next card on the slot the household now holds", async () => {
    await moveToTwentyThree();

    const view = await readCard(readCardDeps(), 1);
    const record = await readCustomer(readCustomerDeps(), 1);

    // A reissue prints on the slot the household holds today, so this one number is derived from
    // the household rather than from a card — the slot they left has no say in it.
    expect(view.nextCardNumber).toBe("23k7");
    expect(record.nextCardNumber).toBe("23k7");
  });

  it("counts the household's own cards, not the indexes the slot has been through", async () => {
    await moveToTwentyThree();

    const view = await readCard(readCardDeps(), 1);

    // Five rows on their record: `5k1` to `5k4` and the `23k6` the move printed. The jump from 4 to
    // 6 is slot 23's history and not theirs, so it is not a card they have been through.
    expect(view.cardsIssued).toBe(5);
    expect(view.reissuesForLoss).toBe(0);
  });

  it("leaves a moved household off the reissue list, their new card printing what they are today", async () => {
    await moveToTwentyThree();

    const due = await listCardsDueForReissue(reissueDeps());

    expect(due).toEqual([]);
  });

  it("takes a household off the reissue list as a side effect of the move", async () => {
    // Their card prints a household of two grown-ups and no child, which they have not been since a
    // member moved out — so they are on the list before the move (US-13.2).
    register(
      household({
        id: 1,
        customerNumber: 5,
        cardIndex: 4,
        countsAtIssue: { grownUps: 2, children: 0 },
      }),
    );

    const before = await listCardsDueForReissue(reissueDeps());
    await moveToTwentyThree();
    const after = await listCardsDueForReissue(reissueDeps());

    expect(before.map((row) => row.customerNumber)).toEqual([5]);
    // Nothing asked for a reissue: the move printed a card, and a card printed today states today's
    // household and today's group, which is all being on that list ever meant.
    expect(after).toEqual([]);
  });

  it("answers for the number the household has left exactly as for one nobody has ever held", async () => {
    await moveToTwentyThree();

    const vacated = await lookupCustomer(counterDeps(), "5");
    const neverHeld = await lookupCustomer(counterDeps(), "77");

    // Slot 5 is simply unassigned again. Nothing at the counter says it was released, because
    // nothing about a free number is any of the counter's business.
    expect(vacated.verdict).toEqual(neverHeld.verdict);
    expect(vacated.verdict.kind).toBe("NOT_FOUND");
    expect(vacated.customer).toBeNull();
  });

  it("resolves a card number on the vacated slot to whoever holds that slot today", async () => {
    await moveToTwentyThree();

    const lookup = await lookupCustomer(counterDeps(), "5k4");

    // `5k4` is a real piece of card in the household's drawer, and it names slot 5 — which nobody
    // holds. The household it belonged to is not reachable through it, and never was: a card number
    // resolves through the slot, not through a household (US-04.2).
    expect(lookup.verdict.kind).toBe("NOT_FOUND");
  });

  it("finds the household under the number and the card number they now carry", async () => {
    await moveToTwentyThree();

    const byNumber = await lookupCustomer(counterDeps(), "23");
    const byCardNumber = await lookupCustomer(counterDeps(), "23k6");

    expect(byNumber.customerId).toBe(1);
    expect(byNumber.customer?.cardNumber).toBe("23k6");
    expect(byCardNumber.customerId).toBe(1);
    // The card they carry is the current one, so it is not read as outdated.
    expect(byCardNumber.verdict.kind).toBe("CLEAR_TO_SERVE");
  });
});
