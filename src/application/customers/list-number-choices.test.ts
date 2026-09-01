import { faker } from "@faker-js/faker";
import { beforeEach, describe, expect, it } from "vitest";
import type { IssuedCard } from "@/domain/card/card";
import {
  createCustomerDetails,
  type CustomerStatus,
  type NewCustomer,
  type RegisteredCustomer,
} from "@/domain/customer/customer";
import type { GroupCounts } from "@/domain/customer/group";
import { createSettings, type SettingsInput, type SettingsVersion } from "@/domain/policy/settings";
import type {
  ArchivedCustomer,
  CardIssueCounts,
  CardRepository,
  Clock,
  CustomerRepository,
  SettingsRepository,
} from "../ports";
import { listNumberChoices } from "./list-number-choices";

/**
 * Hand-written fakes, per the testing standard, and synthetic data only.
 *
 * The two stores here answer one question each — which numbers active households hold, and how far
 * every slot's run has got — because that is all the use case asks of them. Everything else on both
 * ports rejects, so a second query fails loudly rather than passing unnoticed: „reads the register
 * once" is the rule this file states, and a fake that answered politely could not state it.
 */

faker.seed(20260831);

const TODAY = "2026-08-31T09:00:00.000Z";

const GROWN_UP_BIRTH_DATE = new Date("1985-03-11T00:00:00.000Z");
const CHILD_BIRTH_DATE = new Date("2015-06-02T00:00:00.000Z");

function fakeClock(now: string): Clock {
  return { now: () => new Date(now) };
}

class FakeSettingsRepository implements SettingsRepository {
  readonly versions: SettingsVersion[] = [];

  constructor(...versions: SettingsVersion[]) {
    this.versions.push(...versions);
  }

  listVersions(): Promise<SettingsVersion[]> {
    return Promise.resolve([...this.versions]);
  }

  append(): Promise<void> {
    return Promise.reject(new Error("reading the choices never writes a settings version"));
  }
}

/** The register as far as this use case needs it: the numbers active households are sitting on. */
class FakeCustomerRepository implements CustomerRepository {
  reads = 0;

  constructor(private readonly taken: ReadonlyArray<number>) {}

  takenActiveNumbers(): Promise<ReadonlyArray<number>> {
    this.reads += 1;
    return Promise.resolve([...this.taken]);
  }

  findById(): Promise<RegisteredCustomer | null> {
    // The customer is handed in rather than looked up: the record has already read it, and reading
    // it a second time is how the number offered and the number held come from two moments.
    return Promise.reject(new Error("the customer is passed in, never fetched"));
  }

  findByCustomerNumber(): Promise<RegisteredCustomer | null> {
    return Promise.reject(new Error("listing the choices resolves no customer number"));
  }

  list(): Promise<ReadonlyArray<RegisteredCustomer>> {
    return Promise.reject(new Error("listing the choices never browses the register"));
  }

  listWithStatus(): Promise<ReadonlyArray<RegisteredCustomer>> {
    return Promise.reject(new Error("listing the choices never browses the register"));
  }

  searchArchived(): Promise<ReadonlyArray<ArchivedCustomer>> {
    return Promise.reject(new Error("listing the choices never searches the archive"));
  }

  groupCounts(): Promise<GroupCounts> {
    return Promise.reject(new Error("a number is not a group"));
  }

  create(): Promise<RegisteredCustomer> {
    return Promise.reject(new Error("listing the choices writes nothing"));
  }

  updateHousehold(): Promise<void> {
    return Promise.reject(new Error("listing the choices writes nothing"));
  }

  updateDetails(): Promise<void> {
    return Promise.reject(new Error("listing the choices writes nothing"));
  }

  updateNotes(): Promise<void> {
    return Promise.reject(new Error("listing the choices writes nothing"));
  }

  setStatus(): Promise<void> {
    return Promise.reject(new Error("listing the choices writes nothing"));
  }

  archive(): Promise<void> {
    return Promise.reject(new Error("listing the choices writes nothing"));
  }

  changeCustomerNumber(): Promise<IssuedCard> {
    return Promise.reject(new Error("listing the choices moves nobody"));
  }
}

/**
 * The cards as far as this use case needs them: how far the run on each slot has got, the plural of
 * `highestIndexForNumber` and answered in one go. A slot missing from the map has never had a card.
 */
class FakeCardRepository implements CardRepository {
  reads = 0;

  constructor(private readonly highestPerSlot: ReadonlyMap<number, number> = new Map()) {}

  highestIndexByNumber(): Promise<ReadonlyMap<number, number>> {
    this.reads += 1;
    return Promise.resolve(new Map(this.highestPerSlot));
  }

  highestIndexForNumber(): Promise<number> {
    return Promise.reject(new Error("one dropdown asks every slot at once, never one at a time"));
  }

  currentCard(): Promise<IssuedCard | null> {
    return Promise.reject(new Error("the card the household holds is on the customer handed in"));
  }

  listCards(): Promise<ReadonlyArray<IssuedCard>> {
    return Promise.reject(new Error("listing the choices reads no household's run"));
  }

  issueCounts(): Promise<CardIssueCounts> {
    return Promise.reject(new Error("listing the choices counts no cards"));
  }

  issue(): Promise<IssuedCard> {
    return Promise.reject(new Error("listing the choices prints nothing"));
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

interface HouseholdOptions {
  readonly customerNumber: number;
  readonly status?: CustomerStatus;
  /** The index of the card in the household's pocket — the top of their own run. */
  readonly cardIndex?: number;
}

/** A household the register already holds, carrying the card at the top of its slot's run. */
function household({
  customerNumber,
  status = "ACTIVE",
  cardIndex = 1,
}: HouseholdOptions): RegisteredCustomer {
  // The customer is the first member of their own household; `createCustomerDetails` insists on it.
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const details = createCustomerDetails(
    {
      firstName,
      lastName,
      birthDate: GROWN_UP_BIRTH_DATE,
      address: {
        street: faker.location.street(),
        houseNumber: faker.location.buildingNumber(),
        zip: faker.location.zipCode("#####"),
        city: faker.location.city(),
      },
      certificate: { type: "Jobcenter", validUntil: new Date("2027-01-31T00:00:00.000Z") },
      householdMembers: [
        { firstName, lastName, birthDate: GROWN_UP_BIRTH_DATE },
        {
          firstName: faker.person.firstName(),
          lastName,
          birthDate: CHILD_BIRTH_DATE,
        },
      ],
      notes: "",
    },
    new Date(TODAY),
  );
  const stored: NewCustomer = {
    customerNumber,
    status,
    reminderCount: 0,
    details,
    card: {
      index: cardIndex,
      issuedAt: new Date("2026-01-15T09:00:00.000Z"),
      reason: "FIRST_ISSUE",
      countsAtIssue: { grownUps: 1, children: 1 },
    },
    previousCustomerId: null,
  };
  return {
    ...stored,
    card: { ...stored.card, customerNumber },
    id: 1,
    blockReason: null,
    archiveReason: status === "ARCHIVED" ? "Weggezogen" : null,
    archivedAt: status === "ARCHIVED" ? new Date(TODAY) : null,
    registeredOn: new Date("2026-01-15T09:00:00.000Z"),
  };
}

describe("listNumberChoices", () => {
  let customers: FakeCustomerRepository;
  let cards: FakeCardRepository;
  let settings: FakeSettingsRepository;

  function deps() {
    return { customers, cards, settings, clock: fakeClock(TODAY) };
  }

  beforeEach(() => {
    customers = new FakeCustomerRepository([1, 2, 4]);
    cards = new FakeCardRepository();
    settings = new FakeSettingsRepository(version({ quotaN: 5 }));
  });

  it("offers the household's own number and every free one", async () => {
    // The household sits on 2, so `takenActiveNumbers` contains it; 1 and 4 are somebody else's.
    const choices = await listNumberChoices(deps(), household({ customerNumber: 2 }));

    expect(choices.map((choice) => choice.number)).toEqual([2, 3, 5]);
  });

  it("names the next card number on each slot", async () => {
    // Slot 3 has been round seven times; the household carries `2k4`, the top of its own run.
    cards = new FakeCardRepository(
      new Map([
        [2, 4],
        [3, 7],
      ]),
    );

    const choices = await listNumberChoices(deps(), household({ customerNumber: 2, cardIndex: 4 }));

    expect(choices).toEqual([
      { number: 2, nextCardNumber: "2k5" },
      { number: 3, nextCardNumber: "3k8" },
      { number: 5, nextCardNumber: "5k5" },
    ]);
  });

  it("names the index above the household's own run on a slot nobody has ever held", async () => {
    // Slot 5 has never had a card, so the slot alone would say `5k1` — a number the household is
    // already past, and one the write would refuse (US-30.3). The card outranks both runs.
    cards = new FakeCardRepository(new Map([[2, 4]]));

    const choices = await listNumberChoices(deps(), household({ customerNumber: 2, cardIndex: 4 }));

    expect(choices).toContainEqual({ number: 5, nextCardNumber: "5k5" });
  });

  it("continues the run of a slot an archived household left", async () => {
    // The worked example of US-30: a household on 5 carrying `5k4` moving onto 23, whose last card
    // ever printed was `23k5` by a household since archived.
    customers = new FakeCustomerRepository([5]);
    cards = new FakeCardRepository(
      new Map([
        [5, 4],
        [23, 5],
      ]),
    );
    settings = new FakeSettingsRepository(version({ quotaN: 240 }));

    const choices = await listNumberChoices(deps(), household({ customerNumber: 5, cardIndex: 4 }));

    expect(choices).toContainEqual({ number: 23, nextCardNumber: "23k6" });
  });

  it("offers only the household's own number when the register is otherwise full", async () => {
    customers = new FakeCustomerRepository([1, 2, 3]);
    settings = new FakeSettingsRepository(version({ quotaN: 3 }));

    const choices = await listNumberChoices(deps(), household({ customerNumber: 2 }));

    // Never an empty list: the control has to open on the number the household is sitting on.
    expect(choices.map((choice) => choice.number)).toEqual([2]);
  });

  it("offers nothing for an archived household", async () => {
    const choices = await listNumberChoices(
      deps(),
      household({ customerNumber: 2, status: "ARCHIVED" }),
    );

    expect(choices).toEqual([]);
    // Neither store is asked at all: a household that has left the register holds no slot, so there
    // is nothing to offer. A statement about meaning, not a saving.
    expect(customers.reads).toBe(0);
    expect(cards.reads).toBe(0);
  });

  it("reads the register once", async () => {
    await listNumberChoices(deps(), household({ customerNumber: 2 }));

    // One reading each, so the number offered and the card number beside it cannot come from two
    // different moments — and so a slot is never asked about one at a time.
    expect(customers.reads).toBe(1);
    expect(cards.reads).toBe(1);
  });
});
