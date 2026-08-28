/**
 * Demo data for a development database: `npm run db:demo`.
 *
 * This is **not** `prisma/seed.ts`. That one inserts the provisional settings a fresh install needs
 * to boot and is safe to run against production; this one invents twenty households so the screens
 * have something to show, and must never be pointed at DF's database. It refuses to run over an
 * existing register unless `--reset` says to wipe it first.
 *
 * Two decisions are worth stating, because they are what make the fixture trustworthy:
 *
 *  1. **Everything goes through the real use cases.** Nothing here writes a row with Prisma. A
 *     household is registered by `registerCustomer`, blocked by `blockCustomer`, archived by
 *     `archiveCustomer`; every card is issued by the code that issues cards and every hand-out by
 *     the code that records hand-outs. The demo database is therefore a database the application
 *     could have produced — invariants hold, cards carry the counts that were true when they were
 *     printed, and the audit log tells the whole story. A fixture built by inserting rows would
 *     drift from the rules the moment one of them changed, and would quietly teach a maintainer
 *     that impossible states are possible.
 *  2. **The clock is wound, not faked.** Time is injected everywhere (CLAUDE.md), so a script may
 *     simply hand the use cases a clock it moves. Events are sorted by their instant and executed in
 *     order, which is why the audit log reads forwards and why a card issued eight months ago has an
 *     eight-month-old issue date. Nothing is back-dated by an `UPDATE`.
 *
 * The cast is **synthetic throughout** (Faker, German locale, fixed seed) — no real name, address or
 * certificate appears here. The seed is fixed so two runs produce the same people, which is what
 * makes "customer 7 is the blocked one" a sentence worth saying.
 *
 * The shape is fixed but the *timeline floats*: every date is an offset from today, so a fixture
 * seeded in March still has a certificate expiring next month when you come back to it in June.
 */

import { faker } from "@faker-js/faker/locale/de";
import { PrismaClient } from "@prisma/client";
import { archiveCustomer } from "../src/application/customers/archive-customer";
import { blockCustomer } from "../src/application/customers/block-customer";
import { changeGroup } from "../src/application/customers/change-group";
import { recordReminder } from "../src/application/customers/record-reminder";
import { registerCustomer } from "../src/application/customers/register-customer";
import { reissueCard } from "../src/application/customers/reissue-card";
import { renewCertificate } from "../src/application/customers/renew-certificate";
import { updateNotes } from "../src/application/customers/update-notes";
import { getWeekColour } from "../src/application/distribution/get-week-colour";
import { recordAttendance } from "../src/application/distribution/record-attendance";
import type {
  AuditLog,
  CardRepository,
  CertificateRepository,
  Clock,
  CustomerRepository,
  DistributionRecordRepository,
  ReminderLogRepository,
  SettingsRepository,
  WaitingListRepository,
} from "../src/application/ports";
import { addToWaitingList } from "../src/application/waiting-list/add-to-waiting-list";
import { formatCardNumber } from "../src/domain/card/cardNumber";
import type { Address, HouseholdMemberDetails } from "../src/domain/customer/customer";
import type { Cents } from "../src/domain/money";
import type { WeekColour } from "../src/domain/policy/settings";
import { startOfUtcDay } from "../src/domain/distribution/weekColour";
import { PrismaAuditLog } from "../src/infrastructure/prisma/audit-log";
import { PrismaCardRepository } from "../src/infrastructure/prisma/card-repository";
import { PrismaCertificateRepository } from "../src/infrastructure/prisma/certificate-repository";
import { PrismaCustomerRepository } from "../src/infrastructure/prisma/customer-repository";
import { PrismaDistributionRecordRepository } from "../src/infrastructure/prisma/distribution-record-repository";
import { PrismaReminderLogRepository } from "../src/infrastructure/prisma/reminder-log-repository";
import { PrismaSettingsRepository } from "../src/infrastructure/prisma/settings-repository";
import { PrismaWaitingListRepository } from "../src/infrastructure/prisma/waiting-list-repository";
import { seedSettings } from "../src/infrastructure/prisma/seed";
import { clearRegister } from "../src/infrastructure/prisma/test-support";

/** Fixed so the same run produces the same people. Any number would do; this one is a date. */
const FAKER_SEED = 20_260_101;

/** How many past distribution days get a hand-out history. Eight is about four months of cycle. */
const DISTRIBUTION_DAYS_OF_HISTORY = 8;

/**
 * How the hand-out history is varied: every 7th eligible household is a no-show, and every 5th
 * household that does turn up leaves without paying.
 *
 * Counted rather than drawn at random, and deliberately so. A fixture exists to *guarantee* what it
 * demonstrates, and a random draw guarantees nothing — an early version of this file drew the paid
 * flag from Faker and produced 37 hand-outs of which every single one was paid, so the screens that
 * show an unpaid customer had nothing to show. Counting cannot have a bad day. The two moduli are
 * coprime and neither divides the six-or-so households served on a day, so the pattern shifts from
 * week to week instead of falling on the same people every time.
 */
const NO_SHOW_EVERY = 7;
const UNPAID_EVERY = 5;

/**
 * What the hand-out history actually came to, filled as it is written and printed at the end.
 *
 * Counted rather than predicted: the summary must report what the register holds, not what the
 * moduli above imply it should hold — a household blocked halfway through the history silently
 * shortens its own attendance, and a summary that did the arithmetic itself would not know.
 */
const tally = { handOuts: 0, unpaid: 0, partPayments: 0, paidAhead: 0, noShows: 0 };

// ---------------------------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------------------------

/**
 * The UTC day the fixture is anchored to. Every offset below is relative to it, so the data ages
 * with the calendar instead of rotting into a fixed past.
 */
const TODAY = startOfUtcDay(new Date());

/**
 * The instant `days` from today, at `hour` UTC. Mid-morning by default: DF distributes during the
 * day, and an event stamped at midnight would sit on a day boundary where the Berlin day-key and
 * the UTC day disagree.
 */
function at(days: number, hour = 10): Date {
  return new Date(
    Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth(), TODAY.getUTCDate() + days, hour),
  );
}

/**
 * A birthdate `years` and `andDays` before today — so `bornYearsAgo(13, 5)` is someone who turned 13
 * five days ago, which is how the fixture puts a household on the cards-due list.
 */
function bornYearsAgo(years: number, andDays = 0): Date {
  return new Date(
    Date.UTC(TODAY.getUTCFullYear() - years, TODAY.getUTCMonth(), TODAY.getUTCDate() - andDays),
  );
}

/** The clock the use cases read. Wound forward event by event; never read from the wall. */
let now: Date = at(0);
const clock: Clock = { now: () => now };

// ---------------------------------------------------------------------------------------------
// The cast
// ---------------------------------------------------------------------------------------------

/** One person's age today, so the shape reads as "a 45-year-old and two children". */
interface MemberShape {
  readonly years: number;
  /** Extra days, to place a birthday deliberately — see `bornYearsAgo`. */
  readonly andDays?: number;
}

/**
 * One household as the fixture specifies it: who lives there, when they registered, and what has
 * happened to them since. Names and addresses are *not* here — those are invented per household, so
 * the table stays about the situation being demonstrated.
 */
interface HouseholdShape {
  /** A handle for the summary and for `reregistrationOf`; never stored. */
  readonly key: string;
  /** What this household is in the fixture for, printed in the summary. */
  readonly demonstrates: string;
  readonly registeredDaysAgo: number;
  /** The whole household, the registered customer first. */
  readonly members: ReadonlyArray<MemberShape>;
  /** When the certificate recorded at registration runs out, relative to today. */
  readonly certificateValidInDays: number;
  readonly notes?: string;
  readonly blocked?: { readonly daysAgo: number; readonly reason: string };
  readonly archived?: { readonly daysAgo: number; readonly reason: string };
  /** A card reported lost and replaced. */
  readonly cardLostDaysAgo?: number;
  /** A move between RED and BLUE, which leaves the printed card wrong (US-16.4). */
  readonly groupChangedDaysAgo?: number;
  /** Reminder days, each after the certificate lapsed — the trail an expired certificate starts. */
  readonly remindersDaysAgo?: ReadonlyArray<number>;
  /** A renewal brought in, which appends a certificate and resets the reminder count. */
  readonly renewal?: { readonly daysAgo: number; readonly validInDays: number };
  /** The archived household this registration was pre-filled from (US-11.3). */
  readonly reregistrationOf?: string;
  /** How many of this household's most recent distribution days they missed (US-10.4). */
  readonly missesLastDistributions?: number;
  /** How this household pays, when the fixture puts a balance on it (US-29). */
  readonly paymentHabit?: PaymentHabit;
}

/**
 * A household whose hand-outs are scripted so the register shows what a balance can be (US-29).
 *
 * A hand-out records the **amount** handed over, so a household can end a day owing DF money or
 * having paid ahead, and the screens that state a balance need all three states to be somewhere in
 * the register. Every other household pays what it was asked for, or — on the counted pattern below
 * — nothing at all.
 *
 *  - `OWES` hands over 2,00 € less than was asked, once, and pays only the week's own price after
 *    that — so the debt stands rather than being settled by the next hand-out's asking price.
 *  - `SETTLED_A_DEBT` is 3,00 € short one week and is asked for those 3,00 € on top the next, which
 *    it hands over — the case the counter's amount-to-pay exists for — and it ends back at zero.
 *  - `IN_CREDIT` hands over 5,00 € more than was asked, so as not to have to remember it next week,
 *    and then pays each week's price so the credit stays where a screen can show it.
 */
type PaymentHabit = "OWES" | "SETTLED_A_DEBT" | "IN_CREDIT";

/** The short payment a scripted household makes, and the amount it later hands over on top. */
const SHORT_BY_CENTS = 200;
const DEBT_CENTS = 300;
const PAID_AHEAD_CENTS = 500;

/**
 * What a scripted household hands over on its `visit`-th hand-out, or `null` to hand over exactly
 * what the counter asked for.
 *
 * `askedCents` is what they were asked for that day — the price offset by whatever the household
 * owed or had standing to them — and every script is written against it rather than against the
 * price, because that is the figure the staff member reads out (US-29). Paying the bare
 * `priceCents` is how a household leaves a balance exactly where it was: the week is covered and
 * nothing is put towards the debt or taken out of the credit.
 *
 * The visit numbers are low on purpose: eight distribution days alternate RED and BLUE, so a
 * household sees about four of them and a no-show may take one of those away. A script that needed
 * a fourth visit would silently do nothing for a household that only ever had three.
 */
function scriptedPaymentCents(
  habit: PaymentHabit,
  visit: number,
  askedCents: number,
  priceCents: number,
): number | null {
  switch (habit) {
    case "OWES":
      if (visit === 1) {
        return null;
      }
      return visit === 2 ? Math.max(0, askedCents - SHORT_BY_CENTS) : priceCents;
    case "SETTLED_A_DEBT":
      // Short once. The next hand-out is asked for the debt on top and they hand it over, which is
      // what an omitted amount already means — so there is nothing left to script.
      return visit === 1 ? Math.max(0, askedCents - DEBT_CENTS) : null;
    case "IN_CREDIT":
      return visit === 1 ? askedCents + PAID_AHEAD_CENTS : priceCents;
  }
}

/**
 * Twenty households: twelve active, three blocked, five archived.
 *
 * They are ordered by registration date because that is the order they take customer numbers in —
 * the register hands out the lowest free slot, so reading down this list reads out numbers 1 to 20,
 * except for the returning household at the bottom, which picks up a number an archive freed.
 *
 * Every offset is deliberately under 200 days: the seeded settings version takes effect on
 * 2026-01-01 and nothing can be registered before the policy that priced it existed. `main` asserts
 * this rather than trusting the comment.
 */
const CAST: ReadonlyArray<HouseholdShape> = [
  {
    key: "archived-deceased",
    demonstrates: "archived — the record outlives the person",
    registeredDaysAgo: 200,
    members: [{ years: 83 }],
    certificateValidInDays: 40,
    archived: { daysAgo: 85, reason: "Verstorben — von der Familie mitgeteilt." },
  },
  {
    key: "archived-moved",
    demonstrates: "archived — moved out of the catchment area",
    registeredDaysAgo: 196,
    members: [{ years: 42 }, { years: 40 }, { years: 13, andDays: 200 }],
    certificateValidInDays: 60,
    archived: { daysAgo: 40, reason: "Umzug nach Paderborn, nicht mehr im Einzugsgebiet." },
  },
  {
    key: "archived-employed",
    demonstrates: "archived — no longer eligible",
    registeredDaysAgo: 194,
    members: [{ years: 36 }],
    certificateValidInDays: 30,
    archived: { daysAgo: 55, reason: "Arbeitsaufnahme, Bescheid ist ausgelaufen." },
  },
  {
    key: "archived-no-shows",
    demonstrates: "archived — stopped coming",
    registeredDaysAgo: 190,
    members: [{ years: 61 }, { years: 59 }],
    certificateValidInDays: 20,
    archived: {
      daysAgo: 75,
      reason: "Seit Monaten nicht mehr erschienen, telefonisch nicht erreichbar.",
    },
  },
  {
    key: "archived-own-request",
    demonstrates: "archived on request — and later comes back (see `returned`)",
    registeredDaysAgo: 186,
    members: [{ years: 30 }, { years: 28 }, { years: 3 }],
    certificateValidInDays: 50,
    archived: { daysAgo: 60, reason: "Auf eigenen Wunsch abgemeldet." },
  },
  {
    key: "cert-expired-long",
    demonstrates: "expired certificate with a three-reminder trail",
    registeredDaysAgo: 182,
    members: [{ years: 69 }, { years: 67 }],
    certificateValidInDays: -70,
    remindersDaysAgo: [55, 35, 15],
    notes: "Bescheid mehrfach angemahnt, bringt ihn nach eigener Aussage beim nächsten Mal mit.",
  },
  {
    key: "blocked-conduct",
    demonstrates: "blocked — conduct at the counter",
    registeredDaysAgo: 178,
    members: [{ years: 48 }],
    certificateValidInDays: 100,
    blocked: { daysAgo: 30, reason: "Wiederholt aggressives Verhalten gegenüber Mitarbeitenden." },
  },
  {
    key: "blocked-reselling",
    demonstrates: "blocked — reselling the goods",
    registeredDaysAgo: 174,
    members: [{ years: 39 }, { years: 36 }, { years: 11 }],
    certificateValidInDays: 80,
    blocked: { daysAgo: 60, reason: "Weiterverkauf der ausgegebenen Lebensmittel beobachtet." },
  },
  {
    key: "cert-renewed",
    demonstrates: "a lapsed certificate, reminded once, then renewed — the count resets",
    registeredDaysAgo: 170,
    members: [{ years: 26 }, { years: 24 }],
    certificateValidInDays: -50,
    remindersDaysAgo: [45],
    renewal: { daysAgo: 40, validInDays: 170 },
  },
  {
    key: "single-pensioner",
    demonstrates: "one-person household that has missed its last three distributions",
    registeredDaysAgo: 165,
    members: [{ years: 71 }],
    certificateValidInDays: 240,
    missesLastDistributions: 3,
  },
  {
    key: "blocked-unpaid",
    // Blocked *and* lapsed, with no reminder trail: nobody has chased the paperwork because the
    // household is not being served anyway. The two states are independent, and the screens have to
    // show both at once.
    demonstrates: "blocked — repeatedly unpaid, and the certificate has lapsed too",
    registeredDaysAgo: 158,
    members: [{ years: 55 }, { years: 53 }],
    certificateValidInDays: -22,
    blocked: {
      daysAgo: 14,
      reason: "Beitrag seit vier Ausgaben offen, Absprachen nicht eingehalten.",
    },
  },
  {
    key: "young-family",
    demonstrates: "two grown-ups, two small children — and carries a debt from a part payment",
    registeredDaysAgo: 150,
    members: [{ years: 34 }, { years: 31 }, { years: 6 }, { years: 3 }],
    certificateValidInDays: 200,
    paymentHabit: "OWES",
  },
  {
    key: "large-family",
    demonstrates: "six heads, four children — was short once and settled it exactly next time",
    registeredDaysAgo: 142,
    members: [
      { years: 41 },
      { years: 39 },
      { years: 15 },
      { years: 12 },
      { years: 9 },
      { years: 5 },
    ],
    certificateValidInDays: 120,
    notes: "Große Familie, kommt meist zu zweit und holt für alle mit ab.",
    paymentHabit: "SETTLED_A_DEBT",
  },
  {
    key: "single-parent",
    demonstrates: "one grown-up with two children — paid ahead, so the household has credit",
    registeredDaysAgo: 134,
    members: [{ years: 29 }, { years: 4 }, { years: 2 }],
    certificateValidInDays: 95,
    paymentHabit: "IN_CREDIT",
  },
  {
    key: "birthday-13",
    demonstrates: "a child turned 13 five days ago — the printed card is now wrong (US-13)",
    registeredDaysAgo: 126,
    members: [{ years: 45 }, { years: 43 }, { years: 13, andDays: 5 }, { years: 10 }],
    certificateValidInDays: 180,
  },
  {
    key: "group-moved",
    demonstrates: "moved between RED and BLUE — the printed card names the old group (US-16.4)",
    registeredDaysAgo: 118,
    members: [{ years: 52 }, { years: 50 }, { years: 17 }],
    certificateValidInDays: 160,
    groupChangedDaysAgo: 20,
    notes: "Fährt mit der Nachbarin, deshalb in deren Woche umgetragen.",
  },
  {
    key: "card-lost",
    demonstrates: "card reported lost and replaced — card number ends in k2",
    registeredDaysAgo: 110,
    members: [{ years: 37 }, { years: 35 }, { years: 8 }],
    certificateValidInDays: 140,
    cardLostDaysAgo: 45,
  },
  {
    key: "expiring-soon",
    demonstrates: "certificate lapses in under four weeks",
    registeredDaysAgo: 95,
    members: [{ years: 33 }, { years: 30 }, { years: 7 }, { years: 5 }, { years: 1 }],
    certificateValidInDays: 27,
  },
  {
    key: "cert-expired-short",
    // Registered after the first archive freed slot 1, so it takes that number rather than 19 — the
    // slot rule, visible. Deliberately not on the same day as the archive: two events sharing an
    // instant would leave the order to the sort's stability rather than to the fixture.
    demonstrates:
      "expired certificate, reminded twice — reuses a freed slot, so its first card is not k1 (US-25)",
    registeredDaysAgo: 80,
    members: [{ years: 46 }, { years: 44 }, { years: 16 }, { years: 14 }],
    certificateValidInDays: -35,
    remindersDaysAgo: [25, 10],
  },
  {
    key: "returned",
    demonstrates:
      "re-registered after archiving — new record, freed slot, and a first card above k1 (US-25)",
    registeredDaysAgo: 20,
    members: [{ years: 30 }, { years: 28 }, { years: 3 }],
    certificateValidInDays: 12,
    reregistrationOf: "archived-own-request",
    notes: "Kommt nach kurzer Pause zurück, Bescheid neu ausgestellt.",
  },
];

/** Three applicants on the waiting list, so the screen is not empty. */
const WAITING: ReadonlyArray<{
  readonly addedDaysAgo: number;
  readonly members: MemberShape;
  readonly contactNote: string;
  readonly certificateValidInDays: number;
}> = [
  {
    addedDaysAgo: 48,
    members: { years: 44 },
    contactNote: "Meldet sich freitags selbst im Laden.",
    certificateValidInDays: 90,
  },
  {
    addedDaysAgo: 31,
    members: { years: 27 },
    contactNote: "Über die Nachbarin erreichbar.",
    certificateValidInDays: 150,
  },
  {
    addedDaysAgo: 9,
    members: { years: 58 },
    contactNote: "Kein Telefon, kommt alle zwei Wochen vorbei.",
    certificateValidInDays: 60,
  },
];

/** The kinds of proof of need DF sees, as staff would type them. */
const CERTIFICATE_TYPES = [
  "Jobcenter-Bescheid",
  "Grundsicherung",
  "Wohngeldbescheid",
  "Bescheid Sozialamt",
] as const;

// ---------------------------------------------------------------------------------------------
// Invented identities
// ---------------------------------------------------------------------------------------------

/** A household's invented identity — everything the cast table deliberately leaves out. */
interface Identity {
  readonly lastName: string;
  readonly address: Address;
  readonly certificateType: string;
  readonly members: ReadonlyArray<HouseholdMemberDetails>;
}

function inventAddress(): Address {
  return {
    street: faker.location.street(),
    houseNumber: faker.location.buildingNumber(),
    zip: faker.location.zipCode(),
    city: faker.location.city(),
  };
}

/**
 * Invent one household's people. A returning household is handed the identity it had before, so the
 * re-registration is recognisably the same family rather than a coincidence of the fixture.
 */
function inventIdentity(shape: HouseholdShape, previous: Identity | undefined): Identity {
  if (previous !== undefined) {
    return { ...previous, certificateType: faker.helpers.arrayElement(CERTIFICATE_TYPES) };
  }
  const lastName = faker.person.lastName();
  return {
    lastName,
    address: inventAddress(),
    certificateType: faker.helpers.arrayElement(CERTIFICATE_TYPES),
    members: shape.members.map((member) => ({
      firstName: faker.person.firstName(),
      lastName,
      birthDate: bornYearsAgo(member.years, member.andDays),
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// The events
// ---------------------------------------------------------------------------------------------

/**
 * One thing that happens at one instant. The whole fixture is a list of these, sorted by time and
 * played in order — which is what keeps the audit log, the card issue dates and the reminder trail
 * consistent with each other without any of them being written directly.
 */
interface DemoEvent {
  readonly at: Date;
  readonly run: () => Promise<void>;
}

/**
 * Every port the fixture touches, in one object handed to every use case.
 *
 * The script is a composition root like `src/app/kunden/deps.ts`, so it names the *ports* and not
 * the adapters: the use cases below only ever see these interfaces, and each takes the subset it
 * needs. It is one bag rather than seven because a script that drives the whole application has no
 * narrower honest answer to "what does this depend on".
 */
interface DemoDeps {
  readonly customers: CustomerRepository;
  readonly cards: CardRepository;
  readonly certificates: CertificateRepository;
  readonly settings: SettingsRepository;
  readonly records: DistributionRecordRepository;
  readonly reminders: ReminderLogRepository;
  readonly waitingList: WaitingListRepository;
  readonly audit: AuditLog;
  readonly clock: Clock;
}

async function main(): Promise<void> {
  const reset = process.argv.includes("--reset");
  const prisma = new PrismaClient();

  try {
    const deps: DemoDeps = {
      customers: new PrismaCustomerRepository(prisma),
      cards: new PrismaCardRepository(prisma),
      certificates: new PrismaCertificateRepository(prisma),
      settings: new PrismaSettingsRepository(prisma),
      records: new PrismaDistributionRecordRepository(prisma),
      reminders: new PrismaReminderLogRepository(prisma),
      waitingList: new PrismaWaitingListRepository(prisma),
      audit: new PrismaAuditLog(prisma),
      clock,
    };

    const existing = await prisma.customer.count();
    if (existing > 0 && !reset) {
      console.error(
        `The register already holds ${existing} customer(s). Re-run with --reset to wipe it and\n` +
          "re-seed, or use `npm run db:reset` for a clean database with settings only.",
      );
      process.exitCode = 1;
      return;
    }
    if (reset) {
      // `clearRegister` states the delete order the no-cascade rule forces (CLAUDE.md). The waiting
      // list and the audit log hang off nothing, so they are cleared here rather than there.
      await clearRegister(prisma);
      await prisma.waitingListEntry.deleteMany();
      await prisma.auditEntry.deleteMany();
      console.log("Cleared the register, the waiting list and the audit log.");
    }

    // The settings have to exist before anything can be priced or grouped.
    await seedSettings(deps.settings);

    const versions = await deps.settings.listVersions();
    const earliestSettings = versions
      .map((version) => version.recordedAt.getTime())
      .reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY);
    const earliestEvent = CAST.reduce(
      (earliest, shape) => Math.min(earliest, at(-shape.registeredDaysAgo).getTime()),
      Number.POSITIVE_INFINITY,
    );
    if (earliestEvent < earliestSettings) {
      throw new Error(
        `The fixture's earliest registration (${new Date(earliestEvent).toISOString().slice(0, 10)}) ` +
          `predates the oldest settings version (${new Date(earliestSettings).toISOString().slice(0, 10)}), ` +
          "so it cannot be priced. Shorten the registration offsets in CAST.",
      );
    }

    faker.seed(FAKER_SEED);
    const identities = new Map<string, Identity>();
    for (const shape of CAST) {
      const previous =
        shape.reregistrationOf === undefined ? undefined : identities.get(shape.reregistrationOf);
      identities.set(shape.key, inventIdentity(shape, previous));
    }

    /** Filled as registrations run; every later event on a household reads its id from here. */
    const customerIds = new Map<string, number>();
    /** Which colour collects on each of the distribution days the history covers. */
    const distributionDays = await pastDistributionDays(deps);

    const events: DemoEvent[] = [];

    for (const shape of CAST) {
      const identity = identities.get(shape.key);
      if (identity === undefined) {
        throw new Error(`No identity was invented for ${shape.key}.`);
      }
      events.push(...householdEvents(deps, shape, identity, customerIds));
    }
    events.push(
      ...distributionEvents(deps, distributionDays, customerIds, missedDays(distributionDays)),
    );
    events.push(...waitingListEvents(deps));

    // Chronological order is the point: a block that lands before a hand-out must refuse it, and the
    // audit log must read forwards. `sort` is stable, so events sharing an instant keep cast order.
    events.sort((left, right) => left.at.getTime() - right.at.getTime());

    for (const event of events) {
      now = event.at;
      await event.run();
    }

    now = at(0);
    await printSummary(deps, customerIds);
  } finally {
    await prisma.$disconnect();
  }
}

/** Everything that ever happens to one household, in no particular order — `main` sorts them. */
function householdEvents(
  deps: DemoDeps,
  shape: HouseholdShape,
  identity: Identity,
  customerIds: Map<string, number>,
): DemoEvent[] {
  /** The id this household got when it registered — only ever read by a later event. */
  const idOf = (): number => {
    const id = customerIds.get(shape.key);
    if (id === undefined) {
      throw new Error(`${shape.key} has not been registered yet — event ordering is wrong.`);
    }
    return id;
  };

  const events: DemoEvent[] = [
    {
      at: at(-shape.registeredDaysAgo),
      run: async () => {
        const customer = identity.members[0];
        if (customer === undefined) {
          throw new Error(`${shape.key} has no members.`);
        }
        const previousCustomerId =
          shape.reregistrationOf === undefined
            ? undefined
            : customerIds.get(shape.reregistrationOf);
        const registered = await registerCustomer(deps, {
          firstName: customer.firstName,
          lastName: customer.lastName,
          birthDate: customer.birthDate,
          address: identity.address,
          certificate: {
            type: identity.certificateType,
            validUntil: at(shape.certificateValidInDays, 0),
          },
          householdMembers: identity.members,
          notes: "",
          previousCustomerId,
        });
        customerIds.set(shape.key, registered.id);
      },
    },
  ];

  const notes = shape.notes;
  if (notes !== undefined) {
    // A day after registration, so it reads as something staff added rather than typed on the form.
    events.push({
      at: at(-shape.registeredDaysAgo + 1),
      run: async () => {
        await updateNotes(deps, { customerId: idOf(), notes });
      },
    });
  }

  for (const daysAgo of shape.remindersDaysAgo ?? []) {
    events.push({
      at: at(-daysAgo),
      run: async () => {
        await recordReminder(deps, { customerId: idOf() });
      },
    });
  }

  if (shape.renewal !== undefined) {
    const renewal = shape.renewal;
    events.push({
      at: at(-renewal.daysAgo),
      run: async () => {
        await renewCertificate(deps, {
          customerId: idOf(),
          type: identity.certificateType,
          validUntil: at(renewal.validInDays, 0),
        });
      },
    });
  }

  if (shape.cardLostDaysAgo !== undefined) {
    events.push({
      at: at(-shape.cardLostDaysAgo),
      run: async () => {
        await reissueCard(deps, { customerId: idOf(), reason: "LOST" });
      },
    });
  }

  if (shape.groupChangedDaysAgo !== undefined) {
    events.push({
      at: at(-shape.groupChangedDaysAgo),
      run: async () => {
        // Which group they were put in was the balancer's decision, so the move is expressed as
        // "the other one" rather than as a colour this file has no way of knowing.
        const customer = await deps.customers.findById(idOf());
        if (customer === null) {
          throw new Error(`${shape.key} vanished before its group change.`);
        }
        await changeGroup(deps, {
          customerId: customer.id,
          group: customer.group === "RED" ? "BLUE" : "RED",
        });
      },
    });
  }

  if (shape.blocked !== undefined) {
    const blocked = shape.blocked;
    events.push({
      at: at(-blocked.daysAgo),
      run: async () => {
        await blockCustomer(deps, { customerId: idOf(), reason: blocked.reason });
      },
    });
  }

  if (shape.archived !== undefined) {
    const archived = shape.archived;
    events.push({
      at: at(-archived.daysAgo),
      run: async () => {
        await archiveCustomer(deps, { customerId: idOf(), reason: archived.reason });
      },
    });
  }

  return events;
}

/** One past distribution day and the group that collected on it. */
interface DistributionDay {
  readonly at: Date;
  readonly colour: WeekColour;
}

/**
 * The last {@link DISTRIBUTION_DAYS_OF_HISTORY} distribution days **before** today, oldest first.
 *
 * Today is deliberately left without records even when it is a distribution day: an empty counter is
 * what makes the hand-out screen worth opening. Which weekday and which colour each is comes from
 * `getWeekColour`, so the fixture cannot disagree with the alternation the app derives.
 */
async function pastDistributionDays(deps: DemoDeps): Promise<DistributionDay[]> {
  const days: DistributionDay[] = [];
  for (let offset = -1; days.length < DISTRIBUTION_DAYS_OF_HISTORY && offset > -400; offset -= 1) {
    const day = at(offset);
    const week = await getWeekColour(deps, day);
    if (week.isDistributionDay) {
      days.push({ at: day, colour: week.colour });
    }
  }
  return days.reverse();
}

/**
 * For each household that is meant to have stopped coming, the days it must be absent on: the last
 * few distribution days of *its own* colour, since a household is only ever expected in its week.
 */
function missedDays(days: ReadonlyArray<DistributionDay>): Map<string, Set<number>> {
  const missed = new Map<string, Set<number>>();
  for (const shape of CAST) {
    const count = shape.missesLastDistributions;
    if (count === undefined) {
      continue;
    }
    // The colour is not known until the household is registered, so both colours' tails are marked
    // and the run skips whichever applies. Marking a day of the other colour is harmless: the
    // household is never served on it anyway.
    const tails = (["RED", "BLUE"] as const).flatMap((colour) =>
      days
        .filter((day) => day.colour === colour)
        .slice(-count)
        .map((day) => day.at.getTime()),
    );
    missed.set(shape.key, new Set(tails));
  }
  return missed;
}

/**
 * A hand-out day: most of the week's group turns up, and most of those pay.
 *
 * Who is eligible is **read from the register at that instant** rather than predicted here, so a
 * household blocked or archived earlier in the timeline simply drops out of its own history — the
 * fixture never has to restate a rule the use case already enforces.
 */
function distributionEvents(
  deps: DemoDeps,
  days: ReadonlyArray<DistributionDay>,
  customerIds: Map<string, number>,
  missed: ReadonlyMap<string, Set<number>>,
): DemoEvent[] {
  // Counts across the whole history, not per day, so the two patterns walk through the register
  // instead of landing on the same households every week.
  let eligible = 0;
  let servedSoFar = 0;
  /** How many hand-outs each household has had so far — what a scripted payment is keyed on. */
  const visits = new Map<string, number>();

  return days.map((day) => ({
    at: day.at,
    run: async () => {
      for (const shape of CAST) {
        const id = customerIds.get(shape.key);
        if (id === undefined) {
          continue; // Not registered yet on this day.
        }
        const customer = await deps.customers.findById(id);
        if (customer === null || customer.status !== "ACTIVE" || customer.group !== day.colour) {
          continue;
        }
        if (missed.get(shape.key)?.has(day.at.getTime()) === true) {
          continue;
        }
        eligible += 1;
        if (eligible % NO_SHOW_EVERY === 0) {
          tally.noShows += 1;
          continue; // A no-show writes no record at all (US-05, FR-6).
        }
        servedSoFar += 1;
        // Every hand-out is first written the ordinary way: no amount, which `recordAttendance`
        // reads as "what the counter asked for" — the price plus whatever the household still owes.
        // The record therefore comes back stating today's asking price, which is the figure both
        // the scripted payments and the tally below are written against.
        const record = await recordAttendance(deps, { customerId: id });
        const askedCents = record.paidCents;
        const visit = (visits.get(shape.key) ?? 0) + 1;
        visits.set(shape.key, visit);

        // A scripted household's payments are the script's business alone (US-29): the counted
        // unpaid pattern would drop a zero into a history that exists to demonstrate one balance,
        // and the debt or credit it ended on would be an accident of the modulus. `servedSoFar`
        // counts them all the same, so which of the other households pay nothing is unchanged.
        let scripted: number | null = null;
        if (shape.paymentHabit !== undefined) {
          scripted = scriptedPaymentCents(shape.paymentHabit, visit, askedCents, record.priceCents);
        } else if (servedSoFar % UNPAID_EVERY === 0) {
          scripted = 0;
        }

        // Anything other than paying what was asked is a second write through the store, which is
        // what a same-day correction does anyway: neither the pattern nor a script can know the
        // asking price before the hand-out that sets it.
        const paidCents = scripted ?? askedCents;
        if (scripted !== null) {
          await deps.records.setPayment(record.id, scripted as Cents);
        }

        tally.handOuts += 1;
        // Counted against what was asked, never against the price: a household handing over a
        // capped price plus last week's debt has paid exactly what it owed, not paid ahead.
        if (paidCents === 0) {
          tally.unpaid += 1;
        } else if (paidCents < askedCents) {
          tally.partPayments += 1;
        } else if (paidCents > askedCents) {
          tally.paidAhead += 1;
        }
      }
    },
  }));
}

function waitingListEvents(deps: DemoDeps): DemoEvent[] {
  return WAITING.map((applicant) => ({
    at: at(-applicant.addedDaysAgo),
    run: async () => {
      const lastName = faker.person.lastName();
      await addToWaitingList(deps, {
        firstName: faker.person.firstName(),
        lastName,
        birthDate: bornYearsAgo(applicant.members.years),
        address: inventAddress(),
        contactNote: applicant.contactNote,
        certificate: {
          type: faker.helpers.arrayElement(CERTIFICATE_TYPES),
          validUntil: at(applicant.certificateValidInDays, 0),
        },
      });
    },
  }));
}

// ---------------------------------------------------------------------------------------------
// The summary
// ---------------------------------------------------------------------------------------------

/**
 * What was seeded, as a table you can read next to the running app. Without it the fixture is
 * twenty anonymous rows and every question starts with a search.
 */
async function printSummary(deps: DemoDeps, customerIds: Map<string, number>): Promise<void> {
  console.log("\nSeeded the demo register:\n");
  console.log("  Nr.  Karte   Name                      Status      Was zu sehen ist");
  console.log("  ---  ------  ------------------------  ----------  " + "-".repeat(60));

  for (const shape of CAST) {
    const id = customerIds.get(shape.key);
    if (id === undefined) {
      continue;
    }
    const customer = await deps.customers.findById(id);
    if (customer === null) {
      continue;
    }
    // The card number is in the table because two rows exist to show that it does *not* start at
    // `k1` on a reused slot (US-25), and a table without it would leave that claim to the prose.
    const card = await deps.cards.currentCard(id);
    const cardNumber = card === null ? "—" : formatCardNumber(customer.customerNumber, card.index);
    const name = `${customer.details.lastName}, ${customer.details.firstName}`;
    console.log(
      `  ${String(customer.customerNumber).padStart(3)}  ${cardNumber.padEnd(6)}  ` +
        `${name.padEnd(24).slice(0, 24)}  ` +
        `${customer.status.padEnd(10)}  ${shape.demonstrates}`,
    );
  }

  console.log(
    `\n  ${WAITING.length} applicants on the waiting list. ` +
      `${tally.handOuts} hand-outs over ${DISTRIBUTION_DAYS_OF_HISTORY} past distribution days, ` +
      `${tally.unpaid} of them unpaid, ${tally.noShows} no-shows.` +
      `\n  Balances (US-29): ${tally.partPayments} part payments and ${tally.paidAhead} hand-outs` +
      "\n  paid ahead, so the register carries a household that owes, one that has credit and one" +
      "\n  that was short and settled it exactly the next time. Counted, not predicted." +
      "\n  Today has deliberately no hand-outs recorded — the counter is yours to play with." +
      "\n  Two numbers appear twice above: archiving releases the slot, so a later registration" +
      "\n  takes it while the archived record keeps the number it had. That is the rule, not a bug." +
      "\n  Their card numbers do not: the two households on a reused slot hold a first card ending" +
      "\n  in k2, because the archived household walked out with k1 and it is theirs for good" +
      "\n  (US-25). Type one of those k1s at the counter — it is refused, not resolved.\n",
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
