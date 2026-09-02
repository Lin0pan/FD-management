import { rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { de } from "@/i18n/de";
import { foldName } from "@/domain/customer/nameSearch";
import { SHARED } from "./registers";
import { releaseNumbers } from "./seeding";

/**
 * Every verdict the counter can hand down, driven through the built app
 * (tasks/prd-us-04-lookup-customer.md §US-04.5).
 *
 * `evaluateAtCounter` is proved case by case in the domain gate and `lookupCustomer` against fakes.
 * What neither can see is whether the verdict a staff member *reads* is the verdict the rule
 * reached: the words, the icon and the colour are chosen in `counter-lookup.tsx`, and a case
 * rendered as the wrong sentence would turn a household away for the wrong reason. So this spec
 * asserts the German text of each banner, on the real screen, against a real database.
 *
 * The other half is FR-4: a lookup **reads**. Turning someone away for the wrong group or an
 * outdated card must record nothing at all — no reminder, no status change, no audit entry. That is
 * an absence, and an absence is only visible from outside the app, so the spec snapshots the
 * database before the lookups and compares it afterwards. (The distribution record named in the
 * criterion has no table yet — US-05 adds serving — so what is pinned here is every row a lookup
 * could conceivably touch today, and the snapshot widens with the schema.)
 *
 * Six households are seeded straight through Prisma rather than through the UI, because half of
 * these states have no screen that can reach them yet: archiving is US-10, blocking US-08, a second
 * card US-09. They take numbers in the 200s so the registration and card specs, which allocate the
 * *lowest* free number, keep the low sequence they assert against in the shared `data/e2e.db`.
 *
 * `ALREADY_SERVED_TODAY` is the one verdict absent here: nothing can serve a household yet, so
 * nothing can serve one twice. It arrives with US-05, and the exhaustive switch in the UI already
 * renders it.
 */

// A fixed seed so a failure is reproducible; only names and addresses come from Faker. Every date
// stays a literal, because the verdicts under test are decided by dates.
faker.seed(20260724);

/** The file `playwright.config.ts` points `FD_FIXED_NOW_FILE` at, relative to the repo root. */
const NOW_FILE = SHARED.now;

/**
 * The day this spec is judged on: Thursday 08.01.2026.
 *
 * It follows from the seeded settings alone (`src/infrastructure/prisma/seed.ts`): anchor
 * `2026-W02` = RED, distributions on ISO weekday 4. So it is a distribution day, the group
 * collecting is RED — which is what makes a RED household clear and a BLUE one sent away — and a
 * certificate lapsing in 2025 is expired while one running to 2027 is not.
 */
const TODAY = "2026-01-08T09:00:00.000Z";

/** The numbers this spec owns. Well clear of the low sequence the other specs consume. */
const NUMBERS = {
  clear: 201,
  certificateExpired: 202,
  wrongGroup: 203,
  outdatedCard: 204,
  blocked: 205,
  archived: 206,
  /**
   * The household the note is written on. Its own number rather than one of the six above, because
   * the note tests *change* it and the verdict tests assert theirs verbatim — sharing one would
   * make a verdict spec depend on which note test ran last.
   */
  notes: 207,
  /** Inside the quota of 240 and held by nobody — a number staff could plausibly mistype. */
  unassigned: 239,
} as const;

/** Born well before 13 years ago: a grown-up on any day this spec could run. */
const GROWN_UP_BIRTH_DATE = "1985-02-11";
/** Born comfortably inside the last 13 years of 08.01.2026: a child. */
const CHILD_BIRTH_DATE = "2020-06-15";
const VALID_CERTIFICATE = "2027-06-30";
/** Lapsed a week before {@link TODAY} — recently enough that the household is still served. */
const EXPIRED_CERTIFICATE = "2025-12-31";

/** How many certificate reminders the expired-certificate household has already had. */
const REMINDERS_SENT = 2;

/**
 * The database the built app is running against — the same file, opened a second time.
 *
 * `playwright.config.ts` sets `DATABASE_URL` for the *server*; this process never had one, so the
 * path is taken from `registers.ts` — the one place that knows which engine this run drives, and
 * therefore which register is behind it. It is resolved to an absolute path because a relative
 * SQLite url resolves against the schema directory, not the working directory.
 */
const prisma = new PrismaClient({ datasourceUrl: `file:${resolve(SHARED.database)}` });

/** Make the app believe it is {@link TODAY}, for every request until the file is removed. */
function pinToday(): void {
  writeFileSync(NOW_FILE, TODAY, "utf8");
}

interface Household {
  readonly customerNumber: number;
  readonly status: "ACTIVE" | "BLOCKED" | "ARCHIVED";
  readonly certificateValidUntil: string;
  readonly reminderCount?: number;
  readonly notes?: string;
  /** The card indexes the household has been issued; the highest is the one it holds today. */
  readonly cardIndexes: ReadonlyArray<number>;
}

/**
 * Insert one household with a grown-up, a child, a certificate and its cards.
 *
 * Every household is shaped the same on purpose — one grown-up and one child, so the derived counts
 * and price are the same everywhere and any difference on screen is the verdict's doing.
 *
 * @returns the name the screen should show for it.
 */
async function seedHousehold(household: Household): Promise<string> {
  const lastName = faker.person.lastName();
  const firstName = faker.person.firstName();
  const childFirstName = faker.person.firstName();

  // Idempotent, so a CI retry can re-run this block instead of dying on the

  // unique customer number (tests/e2e/seeding.ts).

  await releaseNumbers(prisma, household.customerNumber);

  await prisma.customer.create({
    data: {
      customerNumber: household.customerNumber,
      firstName,
      lastName,
      firstNameFolded: foldName(firstName),
      lastNameFolded: foldName(lastName),
      birthDate: new Date(`${GROWN_UP_BIRTH_DATE}T00:00:00.000Z`),
      street: faker.location.street(),
      houseNumber: faker.location.buildingNumber(),
      zip: faker.location.zipCode("#####"),
      city: faker.location.city(),
      status: household.status,
      reminderCount: household.reminderCount ?? 0,
      notes: household.notes ?? "",
      householdMembers: {
        create: [
          { firstName, lastName, birthDate: new Date(`${GROWN_UP_BIRTH_DATE}T00:00:00.000Z`) },
          {
            firstName: childFirstName,
            lastName,
            birthDate: new Date(`${CHILD_BIRTH_DATE}T00:00:00.000Z`),
          },
        ],
      },
      certificates: {
        create: {
          type: "Jobcenter-Bescheid",
          validUntil: new Date(`${household.certificateValidUntil}T00:00:00.000Z`),
          recordedAt: new Date("2026-01-02T00:00:00.000Z"),
        },
      },
      cards: {
        create: household.cardIndexes.map((index) => ({
          customerNumber: household.customerNumber,
          index,
          issuedAt: new Date("2026-01-02T00:00:00.000Z"),
          reason: index === 1 ? "FIRST_ISSUE" : "LOST",
          // The seeded household is one grown-up and one child, and the printed card says so — no
          // spec here is about a card that has gone stale (US-13).
          grownUpsAtIssue: 1,
          childrenAtIssue: 1,
        })),
      },
    },
  });

  return `${firstName} ${lastName}`;
}

/**
 * Everything about the register a *read* must leave exactly as it found it.
 *
 * Statuses and reminder counts are the two fields a serve or a reminder would move; the cards and
 * the audit entries are counted because either would gain a row. Ordered by customer number so the
 * comparison is a plain string equality rather than a set membership test.
 */
async function snapshotRegister(): Promise<string> {
  const [customers, cards, auditEntries] = await Promise.all([
    prisma.customer.findMany({
      select: { customerNumber: true, status: true, reminderCount: true },
      orderBy: { customerNumber: "asc" },
    }),
    prisma.card.count(),
    prisma.auditEntry.count(),
  ]);
  return JSON.stringify({ customers, cards, auditEntries });
}

/** Type a number at the counter and press Enter, exactly as staff do it. */
async function lookUp(page: Page, query: string): Promise<void> {
  await page.goto("/ausgabe");
  await page.getByTestId("counter-input").fill(query);
  await page.getByTestId("counter-input").press("Enter");
  await expect(page).toHaveURL(new RegExp(`nummer=${query}`));
}

/**
 * The banner, asserted as a staff member reads it: the verdict and its headline — and its sentence
 * only where one is expected.
 *
 * Passing no `detail` asserts that there is *no* sentence, rather than skipping the check. Every
 * verdict but a block is answered by the record below the banner, and a headline with a paragraph
 * under it repeating the record is the state this screen was pulled out of; an omitted assertion
 * would let it come back unnoticed.
 */
async function expectVerdict(
  page: Page,
  kind: string,
  headline: string,
  detail?: string,
): Promise<void> {
  const banner = page.getByTestId("counter-verdict");
  await expect(banner).toHaveAttribute("data-verdict", kind);
  await expect(page.getByTestId("counter-verdict-headline")).toHaveText(headline);
  const sentence = page.getByTestId("counter-verdict-detail");
  await (detail === undefined
    ? expect(sentence).toHaveCount(0)
    : expect(sentence).toHaveText(detail));
}

/**
 * Open the note editor the way a staff member does — a real click on the `<summary>`.
 *
 * Never `evaluate(d => d.open = true)`: a fold that silently stopped opening has to turn the suite
 * red rather than be nudged past (`docs/guideline/ui_styling_guide.md` §10). The wait is not decoration —
 * `fill()` needs visibility, and a closed `<details>` has none.
 */
async function openNoteEditor(page: Page): Promise<void> {
  await page.getByTestId("counter-notes-open").click();
  await expect(page.getByTestId("counter-notes-field")).toBeVisible();
}

/** A note typed as two lines, because that is how a colleague leaves two separate remarks. */
const FIRST_NOTE = "Kommt meist zu zweit.\nHolt für die Nachbarin mit ab.";
/** The note that replaces it — the counter edits in place, so a second save overwrites the first. */
const SECOND_NOTE = "Holt ab jetzt allein ab.";

const verdicts = de.distribution.counter.verdicts;
const counterWords = de.distribution.counter;

test.describe.configure({ mode: "serial" });

test.describe("Verdikt am Tresen", () => {
  /** The names the seeded households got, so each spec can assert it is looking at the right one. */
  const names: Record<number, string> = {};

  test.beforeAll(async () => {
    pinToday();
    for (const household of [
      {
        customerNumber: NUMBERS.clear,
        status: "ACTIVE",
        certificateValidUntil: VALID_CERTIFICATE,
        cardIndexes: [1],
        notes: "Kommt immer früh.",
      },
      {
        customerNumber: NUMBERS.certificateExpired,
        status: "ACTIVE",
        certificateValidUntil: EXPIRED_CERTIFICATE,
        reminderCount: REMINDERS_SENT,
        cardIndexes: [1],
      },
      {
        customerNumber: NUMBERS.wrongGroup,
        status: "ACTIVE",
        certificateValidUntil: VALID_CERTIFICATE,
        cardIndexes: [1],
      },
      {
        customerNumber: NUMBERS.outdatedCard,
        status: "ACTIVE",
        certificateValidUntil: VALID_CERTIFICATE,
        cardIndexes: [1, 2],
      },
      {
        customerNumber: NUMBERS.blocked,
        status: "BLOCKED",
        certificateValidUntil: VALID_CERTIFICATE,
        cardIndexes: [1],
      },
      {
        customerNumber: NUMBERS.archived,
        status: "ARCHIVED",
        certificateValidUntil: VALID_CERTIFICATE,
        cardIndexes: [1],
      },
      {
        // Seeded with no note, so the disclosure starts out offering to *add* one and the first
        // save is the act a staff member actually performs at the table.
        customerNumber: NUMBERS.notes,
        status: "ACTIVE",
        certificateValidUntil: VALID_CERTIFICATE,
        cardIndexes: [1],
      },
    ] as const satisfies ReadonlyArray<Household>) {
      names[household.customerNumber] = await seedHousehold(household);
    }
  });

  test.afterAll(async () => {
    // The pinned today goes with the spec: leaving it would freeze January for the settings specs,
    // which save a version stamped *now* and would then assert against the wrong month.
    rmSync(NOW_FILE, { force: true });
    await prisma.$disconnect();
  });

  test("clears a red household on a red distribution day", async ({ page }) => {
    await lookUp(page, String(NUMBERS.clear));

    await expectVerdict(page, "CLEAR_TO_SERVE", verdicts.clearToServe.headline);
    await expect(page.getByTestId("counter-name")).toHaveText(names[NUMBERS.clear]);
    await expect(page.getByTestId("counter-card-number")).toHaveText(`${NUMBERS.clear}k1`);
    await expect(page.getByTestId("counter-group")).toHaveText(de.customers.groups.RED);
    await expect(page.getByTestId("counter-status")).toHaveText(de.customers.status.ACTIVE);
    await expect(page.getByTestId("counter-notes")).toHaveText("Kommt immer früh.");
    // One grown-up and one child against the seeded settings: 2,00 € + 1,00 €.
    await expect(page.getByTestId("counter-grown-ups")).toHaveText("1");
    await expect(page.getByTestId("counter-children")).toHaveText("1");
    await expect(page.getByTestId("counter-price")).toHaveText("3,00 €");
  });

  test("serves a household whose certificate has lapsed and asks for the renewal", async ({
    page,
  }) => {
    await lookUp(page, String(NUMBERS.certificateExpired));

    await expectVerdict(
      page,
      "CLEAR_TO_SERVE_CERTIFICATE_EXPIRED",
      verdicts.certificateExpired.headline,
    );
    // An expired certificate never withholds food: the verdict above is a clear-to-serve one, and
    // the household is priced exactly as any other — reminded, not turned away.
    await expect(page.getByTestId("counter-price")).toHaveText("3,00 €");
    // The date and the count the headline no longer spells out, in the record it sends staff to.
    // This is what makes dropping the banner's sentence safe rather than a loss of information.
    await expect(page.getByTestId("counter-certificate-valid-until")).toHaveText("31.12.2025");
    await expect(page.getByTestId("counter-reminder-count")).toHaveText(String(REMINDERS_SENT));
  });

  test("sends a blue household away in a red week, naming both colours", async ({ page }) => {
    await lookUp(page, String(NUMBERS.wrongGroup));

    await expectVerdict(page, "WRONG_GROUP", verdicts.wrongGroup.headline);
    // US-03.4 wants the colour in words, not only painted, and the badge is where it is said now
    // that the banner is a headline alone. The week's own colour is named in the banner above.
    await expect(page.getByTestId("counter-group")).toHaveText(de.customers.groups.BLUE);
  });

  test("refuses a superseded card and names the current one", async ({ page }) => {
    await lookUp(page, `${NUMBERS.outdatedCard}k1`);

    await expectVerdict(page, "OUTDATED_CARD", verdicts.outdatedCard.headline);
    // Which card to hand them next is the one fact the refusal needs, and the record prints it.
    await expect(page.getByTestId("counter-card-number")).toHaveText(`${NUMBERS.outdatedCard}k2`);

    // The same household typed as a bare customer number is the current card, and clear to serve —
    // the refusal is about the card presented, never about the household.
    await lookUp(page, String(NUMBERS.outdatedCard));
    await expectVerdict(page, "CLEAR_TO_SERVE", verdicts.clearToServe.headline);
    await expect(page.getByTestId("counter-card-number")).toHaveText(`${NUMBERS.outdatedCard}k2`);
  });

  test("turns a blocked household away and says no reason is on file", async ({ page }) => {
    await lookUp(page, String(NUMBERS.blocked));

    // The reason is shown verbatim once US-08 stores one; until then the banner says there is none
    // rather than leaving the sentence empty.
    await expectVerdict(page, "BLOCKED", verdicts.blocked.headline, verdicts.blocked.noReason);
    await expect(page.getByTestId("counter-status")).toHaveText(de.customers.status.BLOCKED);
  });

  test("states that an archived household is no longer entitled", async ({ page }) => {
    await lookUp(page, String(NUMBERS.archived));

    await expectVerdict(page, "ARCHIVED", verdicts.archived.headline);
    // Archived data stays queryable: the household is still named, it is just not served.
    await expect(page.getByTestId("counter-name")).toHaveText(names[NUMBERS.archived]);
    await expect(page.getByTestId("counter-status")).toHaveText(de.customers.status.ARCHIVED);
  });

  test("answers an unassigned number with not-found rather than an empty page", async ({
    page,
  }) => {
    await lookUp(page, String(NUMBERS.unassigned));

    await expectVerdict(page, "NOT_FOUND", verdicts.notFound.headline);
    // No household, so nothing to show below the banner — but the screen itself is still there,
    // with the input ready for the number staff meant to type.
    await expect(page.getByTestId("counter-customer")).toHaveCount(0);
    await expect(page.getByTestId("counter-input")).toHaveValue("");
    await expect(page.getByTestId("counter-input")).toBeFocused();
  });

  test("records nothing when a household is turned away", async ({ page }) => {
    const before = await snapshotRegister();

    // The two refusals a staff member hits most often, and the two the PRD names: neither may cost
    // the household a reminder or a status, and neither may leave a trace of having happened.
    await lookUp(page, String(NUMBERS.wrongGroup));
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "WRONG_GROUP",
    );
    await lookUp(page, `${NUMBERS.outdatedCard}k1`);
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "OUTDATED_CARD",
    );
    // A successful lookup writes just as little — being served is a decision US-05 will record.
    await lookUp(page, String(NUMBERS.certificateExpired));
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "CLEAR_TO_SERVE_CERTIFICATE_EXPIRED",
    );

    expect(await snapshotRegister()).toBe(before);
  });

  test("writes a first note without leaving the counter", async ({ page }) => {
    await lookUp(page, String(NUMBERS.notes));

    // Nothing on file, and the control says which of the two acts it is before it is clicked.
    await expect(page.getByTestId("counter-notes")).toHaveText(counterWords.details.noNotes);
    await expect(page.getByTestId("counter-notes-open")).toHaveText(counterWords.notes.add);

    await openNoteEditor(page);
    await page.getByTestId("counter-notes-field").fill(FIRST_NOTE);
    await page.getByTestId("counter-notes-submit").click();

    await expect(page.getByTestId("counter-notes-saved")).toBeVisible();
    // The paragraph the *next* staff member reads, refreshed by the same save — the whole point of
    // writing it here rather than on the record.
    await expect(page.getByTestId("counter-notes")).toHaveText(FIRST_NOTE);
  });

  test("keeps both lines of a note that was typed as two", async ({ page }) => {
    await lookUp(page, String(NUMBERS.notes));

    // `toHaveText` normalises whitespace, so it cannot tell one line from two — it passes just as
    // happily on a note collapsed into one run-on sentence. `innerText` is the rendered text, so it
    // holds the break only while `whitespace-pre-line` is on the paragraph.
    const rendered = await page.getByTestId("counter-notes").innerText();
    expect(rendered.split("\n").map((line) => line.trim())).toEqual(FIRST_NOTE.split("\n"));
  });

  test("offers to edit a note that is already on file, not to add one", async ({ page }) => {
    await lookUp(page, String(NUMBERS.notes));

    await expect(page.getByTestId("counter-notes-open")).toHaveText(counterWords.notes.edit);

    await openNoteEditor(page);
    // Prefilled: the counter edits the note in place rather than appending to it, so what a
    // colleague wrote has to be in the field before anything is typed over it.
    await expect(page.getByTestId("counter-notes-field")).toHaveValue(FIRST_NOTE);
  });

  test("records one audit entry per saved note, and no reason", async ({ page }) => {
    const before = await prisma.auditEntry.count();

    await lookUp(page, String(NUMBERS.notes));
    await openNoteEditor(page);
    await page.getByTestId("counter-notes-field").fill(SECOND_NOTE);
    await page.getByTestId("counter-notes-submit").click();
    await expect(page.getByTestId("counter-notes-saved")).toBeVisible();

    expect(await prisma.auditEntry.count()).toBe(before + 1);
    const entry = await prisma.auditEntry.findFirst({ orderBy: { id: "desc" } });
    expect(entry?.what).toBe("customer.notesUpdated");
    expect(entry?.changedFields).toBe("notes");
    // No reason is asked for and none is invented: the changed field already says what happened,
    // and the note's own text is deliberately never copied into the log.
    expect(entry?.why).toBe("");
  });

  test("clears a note that no longer applies", async ({ page }) => {
    await lookUp(page, String(NUMBERS.notes));

    await openNoteEditor(page);
    await page.getByTestId("counter-notes-field").fill("");
    await page.getByTestId("counter-notes-submit").click();

    await expect(page.getByTestId("counter-notes-saved")).toBeVisible();
    await expect(page.getByTestId("counter-notes")).toHaveText(counterWords.details.noNotes);
    await expect(page.getByTestId("counter-notes-open")).toHaveText(counterWords.notes.add);
  });

  test("closes the note editor when the counter moves to another household", async ({ page }) => {
    await lookUp(page, String(NUMBERS.notes));

    const fold = page.locator("details").filter({ has: page.getByTestId("counter-notes-open") });
    // Closed on arrival: the note is read on every lookup and written on hardly any.
    await expect(fold).not.toHaveAttribute("open", /.*/);

    await openNoteEditor(page);
    await page.getByTestId("counter-notes-field").fill("Für den falschen Haushalt getippt.");

    // A soft navigation, not a fresh page load — a `<details>` survives one, and so would the text
    // above, which is how a note gets written onto the wrong household.
    await page.getByTestId("group-progress").click();
    await page.getByTestId(`group-member-${NUMBERS.clear}`).click();
    await expect(page).toHaveURL(new RegExp(`nummer=${NUMBERS.clear}`));

    await expect(page.getByTestId("counter-name")).toHaveText(names[NUMBERS.clear]);
    await expect(fold).not.toHaveAttribute("open", /.*/);
    await openNoteEditor(page);
    await expect(page.getByTestId("counter-notes-field")).toHaveValue("Kommt immer früh.");
  });

  test("offers no note editor for an archived household", async ({ page }) => {
    await lookUp(page, String(NUMBERS.archived));

    // The note is still read — it may be why the household was archived — but `updateNotes` refuses
    // an archived record, and a control that can only ever answer "nein" is worse than none.
    await expect(page.getByTestId("counter-notes")).toBeVisible();
    await expect(page.getByTestId("counter-notes-open")).toHaveCount(0);
  });
});
