import { rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { de } from "@/i18n/de";
import { berlinDayKey } from "@/domain/distribution/attendance";
import { foldName } from "@/domain/customer/nameSearch";
import { SHARED } from "./registers";
import { fillDay, fillSticky, typedDay } from "./day";

/**
 * A household changes and the whole application follows, driven through the built app
 * (tasks/prd-us-16-maintain-customer-record.md §US-16.6).
 *
 * Every edit here is already proved in isolation: `updateHousehold` replaces the member set against
 * fakes, `changeGroup` reports the two sizes back, `updateNotes` reaches `lookupCustomer`, and
 * `renewCertificate` resets the reminder count. What none of those can see is the claim the story
 * makes — *a correction typed on the record is in force everywhere, immediately*. "Everywhere" is
 * four other screens and "immediately" is the same afternoon, so this spec follows one household
 * through the four edits and reads the consequence off the screen that would betray it:
 *
 * - a child is added, and the counts, the portions and the price move **before the save** (FR-1),
 *   then the cards-due list says the card in the customer's hand is behind (FR-3);
 * - a renewed certificate is recorded, and the reminder count is back to 0 (FR-6);
 * - the household moves group, both sizes move with it, and the counter's verdict for *today* flips
 *   from "wrong group" to "clear to serve" — one write, no waiting for next week (FR-4);
 * - a note is written, and it is read out at the counter (FR-5).
 *
 * The order is not arbitrary. The certificate is seeded expired, because that is what a reminder
 * count of 2 means, and the renewal has to come before the counter tests or their verdict would be
 * the certificate's rather than the group's. The card is reissued in the middle for the same reason
 * the group test needs it: with the printed counts already out of date, `HOUSEHOLD_CHANGE` would
 * answer the cards-due list first and the group's own reason would never be visible.
 *
 * One household is seeded straight through Prisma: BLUE, active, expired certificate, two reminders
 * sent, one card printed with the counts and the group it really had. It takes number 291, clear of
 * the low sequence the registration, card, archive and re-registration specs allocate against, and
 * of the counter (201–206/239), portions (211), serve (221–222), reminders (231), block (241),
 * reissue (251), age-13 (271) and customer-list (281–285) specs in the shared `data/e2e.db`.
 *
 * The hand-out history at the foot of the record is a second subject with a second pair of
 * households behind it — 292 with a long history, 293 with none — so this spec owns **291–293**.
 * They are separate because 291 is edited all the way through the run above and is served at the
 * counter, which writes a hand-out: neither a fixed row count nor an empty history survives that.
 */

// A fixed seed so a failure is reproducible; only names and addresses come from Faker. Every date
// stays a literal, because a distribution day, an age and a certificate's validity are all dates.
faker.seed(20260730);

/** The file `playwright.config.ts` points `FD_FIXED_NOW_FILE` at, relative to the repo root. */
const NOW_FILE = SHARED.now;

/**
 * The day this spec is judged on: Thursday 08.01.2026, 09:00 UTC.
 *
 * It follows from the seeded settings alone (`src/infrastructure/prisma/seed.ts`): anchor `2026-W02`
 * = RED, distributions on ISO weekday 4. So it is a **RED** distribution day — which is the whole
 * point for a household seeded BLUE: they are turned away at the counter this morning, and the same
 * counter serves them once the group is corrected, with nothing but the edit in between.
 */
const TODAY = "2026-01-08T09:00:00.000Z";

/** The number this spec owns. */
const CUSTOMER_NUMBER = 291;

/** The household's card number at a given running index, e.g. `291k2`. */
function card(index: number): string {
  return `${CUSTOMER_NUMBER}k${index}`;
}

/** Born well before 13 years ago: a grown-up. Comfortably inside the last 13 years: a child. */
const GROWN_UP_BIRTH_DATE = "1985-02-11";
const CHILD_BIRTH_DATE = "2020-06-15";
/** The baby added on the record — born well inside the last 13 years, so a second child. */
const NEW_CHILD_BIRTH_DATE = "2024-03-05";
/** Lapsed before the pinned day, which is what a reminder count of 2 is a consequence of. */
const EXPIRED_CERTIFICATE = "2025-12-31";
/** Comfortably after the pinned day — a renewal the past-date rule has no quarrel with. */
const RENEWED_CERTIFICATE = "2027-06-30";

/** The date the refused-renewal spec corrects its typo to — later still, so nothing downstream moves. */
const LATER_CERTIFICATE = "2027-12-31";
/** Where the household stood before the reminders stopped: two sent, none answered. */
const REMINDERS_SENT = 2;

/** The note staff leave for the counter — an umlaut included, since it is round-tripped verbatim. */
const NOTE = "Bringt den verlängerten Nachweis nächste Woche mit.";

/**
 * What the seeded settings make of each composition, before and after the baby is added.
 *
 * 2 portions and 200c per grown-up, 1 portion and 100c per child. One grown-up and one child is
 * therefore 3 portions at 3,00 €; a second child takes it to 4 at 4,00 €. All four figures move on
 * one edit, which is what makes the panel's live reading worth asserting: a screen that derived the
 * counts and stored the money would pass on the first two and fail on the last two.
 */
const BEFORE = { grownUps: "1", children: "1", portions: "3", price: "3,00 €" };
const AFTER = { grownUps: "1", children: "2", portions: "4", price: "4,00 €" };

/** The two numbers the hand-out history is proved on: one long history, one household with none. */
const WITH_HISTORY_NUMBER = 292;
const WITHOUT_HISTORY_NUMBER = 293;

/**
 * How many hand-outs the long history holds.
 *
 * Enough that the box has something to scroll — thirty rows are around 1 100px against a 60vh
 * scrollport on the default 720px viewport — and no more, because every row is one more insert on
 * every run. It is *not* enough to show the header sticking the way five years of records would;
 * that is measured by hand against an inflated register, per `docs/guideline/ui_styling_guide.md` §11.
 */
const HAND_OUTS = 30;

/** The most recent hand-out, the Thursday before the pinned day, and the step back from it. */
const FIRST_HAND_OUT = new Date("2026-01-01T09:00:00.000Z");
const FORTNIGHT_MS = 14 * 24 * 60 * 60 * 1000;

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

function utcMidnight(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/**
 * Insert one BLUE, active household: a grown-up, a child, a lapsed certificate with two reminders
 * behind it, and a card printed with the counts and the group the household really had.
 *
 * @returns the surrogate id the record page is addressed by (the URL takes the id, not the number).
 */
async function seedHousehold(): Promise<number> {
  const lastName = faker.person.lastName();
  const firstName = faker.person.firstName();

  const customer = await prisma.customer.create({
    data: {
      customerNumber: CUSTOMER_NUMBER,
      firstName,
      lastName,
      firstNameFolded: foldName(firstName),
      lastNameFolded: foldName(lastName),
      birthDate: utcMidnight(GROWN_UP_BIRTH_DATE),
      street: faker.location.street(),
      houseNumber: faker.location.buildingNumber(),
      zip: faker.location.zipCode("#####"),
      city: faker.location.city(),
      group: "BLUE",
      status: "ACTIVE",
      reminderCount: REMINDERS_SENT,
      notes: "",
      householdMembers: {
        create: [
          { firstName, lastName, birthDate: utcMidnight(GROWN_UP_BIRTH_DATE) },
          {
            firstName: faker.person.firstName(),
            lastName,
            birthDate: utcMidnight(CHILD_BIRTH_DATE),
          },
        ],
      },
      certificates: {
        create: {
          type: "Jobcenter-Bescheid",
          validUntil: utcMidnight(EXPIRED_CERTIFICATE),
          recordedAt: utcMidnight("2025-01-02"),
        },
      },
      cards: {
        create: {
          customerNumber: CUSTOMER_NUMBER,
          index: 1,
          issuedAt: utcMidnight("2026-01-02"),
          reason: "FIRST_ISSUE",
          // True when it was printed, and the reference every assertion about the cards-due list is
          // made against: the counts go out of date on the household edit, the group on the move.
          grownUpsAtIssue: 1,
          childrenAtIssue: 1,
          groupAtIssue: "BLUE",
        },
      },
    },
    select: { id: true },
  });

  return customer.id;
}

/**
 * A plain BLUE household with a valid certificate and one printed card, for the history tests.
 *
 * Deliberately not {@link seedHousehold}: nothing here is about reminders or a lapsed certificate,
 * and a second copy of that fixture with the fields inverted would read as if it were.
 *
 * @param customerNumber the number this household takes — 292 or 293, both owned by this spec.
 * @param handOuts how many hand-outs to write behind it.
 * @returns the surrogate id the record page is addressed by.
 */
async function seedHouseholdWithHistory(customerNumber: number, handOuts: number): Promise<number> {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();

  const customer = await prisma.customer.create({
    data: {
      customerNumber,
      firstName,
      lastName,
      firstNameFolded: foldName(firstName),
      lastNameFolded: foldName(lastName),
      birthDate: utcMidnight(GROWN_UP_BIRTH_DATE),
      street: faker.location.street(),
      houseNumber: faker.location.buildingNumber(),
      zip: faker.location.zipCode("#####"),
      city: faker.location.city(),
      group: "BLUE",
      status: "ACTIVE",
      reminderCount: 0,
      notes: "",
      householdMembers: {
        create: [{ firstName, lastName, birthDate: utcMidnight(GROWN_UP_BIRTH_DATE) }],
      },
      certificates: {
        create: {
          type: "Jobcenter-Bescheid",
          validUntil: utcMidnight(RENEWED_CERTIFICATE),
          recordedAt: utcMidnight("2025-01-02"),
        },
      },
      cards: {
        create: {
          customerNumber,
          index: 1,
          issuedAt: utcMidnight("2026-01-02"),
          reason: "FIRST_ISSUE",
          grownUpsAtIssue: 1,
          childrenAtIssue: 0,
          groupAtIssue: "BLUE",
        },
      },
    },
    select: { id: true },
  });

  if (handOuts > 0) {
    await prisma.distributionRecord.createMany({
      // Fortnightly, walking back from the distribution before the pinned day — which is what a
      // long history is: one household coming every other Thursday for years. The day key is
      // derived from each instant by `berlinDayKey`, the same rule the write path uses, because the
      // unique `(customerId, dayKey)` index is what would reject two rows sharing a day.
      data: Array.from({ length: handOuts }, (_unused, index) => {
        const date = new Date(FIRST_HAND_OUT.getTime() - index * FORTNIGHT_MS);
        return {
          customerId: customer.id,
          date,
          dayKey: berlinDayKey(date),
          showedUp: true,
          paid: true,
          priceCents: 200,
        };
      }),
    });
  }

  return customer.id;
}

/** Read the record's four derived figures and check them against one of the two expectations. */
async function expectDerived(page: Page, expected: typeof BEFORE): Promise<void> {
  await expect(page.getByTestId("grown-ups")).toHaveText(expected.grownUps);
  await expect(page.getByTestId("children")).toHaveText(expected.children);
  await expect(page.getByTestId("portions")).toHaveText(expected.portions);
  await expect(page.getByTestId("price")).toHaveText(expected.price);
}

/** This household's row on the cards-due list, addressed by the number it owns. */
function dueRow(page: Page): Locator {
  return page.locator(`[data-testid="cards-due-row"][data-customer-number="${CUSTOMER_NUMBER}"]`);
}

/**
 * The two group sizes as the record states them.
 *
 * Read rather than asserted outright: they count the whole register, and the other specs sharing
 * `data/e2e.db` register households of their own. What this spec can claim is that a move takes one
 * from one side and adds it to the other, so the figures are only ever compared with themselves.
 */
async function groupSizes(page: Page): Promise<{ red: number; blue: number }> {
  const text = await page.getByTestId("group-sizes").innerText();
  const match = /Rot (\d+), Blau (\d+)/.exec(text);
  expect(match).not.toBeNull();
  // Narrowed for the compiler, and a failure here is the same failure as the expectation above.
  if (match === null) {
    throw new Error(`unreadable group sizes: ${text}`);
  }
  return { red: Number(match[1]), blue: Number(match[2]) };
}

/** Type a number at the counter and press Enter, exactly as staff do it. */
async function lookUp(page: Page, query: string): Promise<void> {
  await page.goto("/ausgabe");
  await page.getByTestId("counter-input").fill(query);
  await page.getByTestId("counter-input").press("Enter");
  await expect(page).toHaveURL(new RegExp(`nummer=${query}`));
}

test.describe.configure({ mode: "serial" });

test.describe("Kundenakte pflegen", () => {
  let id: number;

  test.beforeAll(async () => {
    pinToday();
    id = await seedHousehold();
  });

  test.afterAll(async () => {
    // The pinned today goes with the spec: leaving it would freeze January for the settings specs,
    // which save a version stamped *now* and would then assert against the wrong month.
    rmSync(NOW_FILE, { force: true });
    await prisma.$disconnect();
  });

  test("the record opens on the household as it was taken down", async ({ page }) => {
    await page.goto(`/kunden/${id}`);

    await expectDerived(page, BEFORE);
    await expect(page.getByTestId("household-member")).toHaveCount(2);
    await expect(page.getByTestId("card-number")).toHaveText(card(1));
    await expect(page.getByTestId("reminder-count")).toHaveText(String(REMINDERS_SENT));

    // The card prints what the household is and which group they are in, so there is nothing yet to
    // reissue — every row this spec later finds on that list was put there by an edit.
    await page.goto("/karten-neuausstellung");
    await expect(dueRow(page)).toHaveCount(0);
  });

  test("a baby moves the counts, the portions and the price before the save", async ({ page }) => {
    await page.goto(`/kunden/${id}`);
    await page.getByTestId("add-member").click();

    await page.getByTestId("member-first-name-2").fill(faker.person.firstName());
    await page.getByTestId("member-last-name-2").fill(faker.person.lastName());
    await fillDay(page.getByTestId("member-birth-date-2"), NEW_CHILD_BIRTH_DATE);

    // Nothing has been saved yet, and all four figures already say what the household will come to.
    // That is the point of the screen (FR-1): staff see what an edit costs before they commit it.
    await expectDerived(page, AFTER);

    await page.getByTestId("household-submit").click();
    await expect(page.getByTestId("household-saved")).toBeVisible();
    await expect(page.getByTestId("household-error")).toHaveCount(0);

    // And the same four figures come back from the server on a fresh request, derived from the three
    // birthdates now on file rather than from anything the save wrote.
    await page.goto(`/kunden/${id}`);
    await expectDerived(page, AFTER);
    await expect(page.getByTestId("household-member")).toHaveCount(3);
  });

  test("the card in the customer's hand is now behind the household", async ({ page }) => {
    await page.goto("/karten-neuausstellung");

    const row = dueRow(page);
    await expect(row).toHaveCount(1);
    await expect(row.getByTestId("cards-due-card-number")).toHaveText(card(1));
    await expect(row.getByTestId("cards-due-counts-on-card")).toHaveText(
      de.customers.derived.countsValue(1, 1),
    );
    await expect(row.getByTestId("cards-due-counts-today")).toHaveText(
      de.customers.derived.countsValue(1, 2),
    );
    await expect(row.getByTestId("cards-due-reason")).toHaveText(
      de.cardsDue.reasons.HOUSEHOLD_CHANGE,
    );
  });

  test("a renewed certificate resets the reminders to zero", async ({ page }) => {
    await page.goto(`/kunden/${id}`);
    await expect(page.getByTestId("reminder-count")).toHaveText(String(REMINDERS_SENT));

    await fillSticky(page.getByTestId("renewal-type"), "Wohngeldbescheid");
    await fillDay(page.getByTestId("renewal-valid-until"), RENEWED_CERTIFICATE);
    await page.getByTestId("renewal-save").click();

    // The confirmation names the reset, and the figure beside it comes back from the revalidated
    // record — the same use case the counter calls, and therefore the same count of zero (FR-6).
    await expect(page.getByTestId("renewal-saved")).toHaveText(
      de.distribution.certificate.renewal.saved,
    );
    await expect(page.getByTestId("reminder-count")).toHaveText("0");

    await page.goto(`/kunden/${id}`);
    await expect(page.getByTestId("reminder-count")).toHaveText("0");
  });

  test("a refused renewal keeps both fields, so only the wrong one is retyped", async ({
    page,
  }) => {
    await page.goto(`/kunden/${id}`);

    // A wrong year is the mistake this refusal exists for: the type is right, four characters of the
    // date are not. Uncontrolled, React's post-action reset emptied *both* fields on the way back, so
    // correcting a typo meant retyping the certificate as well — the same finding as on the
    // settings screen.
    await fillSticky(page.getByTestId("renewal-type"), "Rentenbescheid");
    await fillDay(page.getByTestId("renewal-valid-until"), "2025-06-30");
    await page.getByTestId("renewal-save").click();

    const refusal = page.getByTestId("renewal-error");
    await expect(refusal).toHaveText(de.distribution.certificate.renewal.errors.validUntilInPast);
    await expect(refusal).toHaveAttribute("data-tier", "refusal");

    await expect(page.getByTestId("renewal-type")).toHaveValue("Rentenbescheid");
    await expect(page.getByTestId("renewal-valid-until")).toHaveValue(typedDay("2025-06-30"));

    // Correct only the date. If the type had been cleared the form would not submit at all — it is
    // `required` — so this save landing is itself the proof that it survived.
    await fillDay(page.getByTestId("renewal-valid-until"), LATER_CERTIFICATE);
    await page.getByTestId("renewal-save").click();
    await expect(page.getByTestId("renewal-saved")).toHaveText(
      de.distribution.certificate.renewal.saved,
    );

    // A save remounts the form on its `saves` key, so the next renewal starts empty rather than on
    // the values just filed — the other half of the pair, and the reason a refusal is not enough to
    // decide this on its own.
    await expect(page.getByTestId("renewal-type")).toHaveValue("");
    await expect(page.getByTestId("renewal-valid-until")).toHaveValue("");
  });

  test("the reissued card catches up with the household", async ({ page }) => {
    // Before the group can be judged on its own, the printed counts have to agree with the record:
    // they answer the cards-due list first, and the group's reason would never be reached.
    await page.goto(`/kunden/${id}`);
    await page.getByTestId("reissue-open").click();
    await expect(page.getByTestId("reissue-confirm")).toHaveText(
      de.customers.reissue.confirm(card(1), card(2)),
    );
    await page.getByTestId("reissue-submit").click();

    await expect(page.getByTestId("card-number")).toHaveText(card(2));
    await expect(page.getByTestId("reissue-saved")).toHaveText(de.customers.reissue.saved(card(2)));
    await expect(page.getByTestId("reissue-error")).toHaveCount(0);

    await page.goto("/karten-neuausstellung");
    await expect(dueRow(page)).toHaveCount(0);
  });

  test("the group move is in force at the counter the same morning", async ({ page }) => {
    // A BLUE household on a RED distribution day: turned away, and nothing on the screen offers to
    // hand anything out.
    await lookUp(page, card(2));
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "WRONG_GROUP",
    );
    await expect(page.getByTestId("serve-button")).toHaveCount(0);

    await page.goto(`/kunden/${id}`);
    const before = await groupSizes(page);

    await page.getByTestId("group-RED").check();
    await page.getByTestId("group-submit").click();
    await expect(page.getByTestId("group-saved")).toBeVisible();

    // Both sizes move, because a move is a transfer: the decision this control exists to inform is
    // made by comparing them, so the screen has to be right about both at once (FR-4).
    await expect(page.getByTestId("group-sizes")).toHaveText(
      de.customers.record.groupSizes(before.red + 1, before.blue - 1),
    );

    // The same card, the same morning, the opposite answer — with one edit in between and no wait
    // for the next RED week.
    await lookUp(page, card(2));
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "CLEAR_TO_SERVE",
    );
    await expect(page.getByTestId("serve-button")).toBeVisible();

    // The card still names the group they have left. It is stated as a remark beside the verdict,
    // never instead of it: a card that has fallen behind turns nobody away.
    await expect(page.getByTestId("counter-stale-card")).toHaveText(
      de.distribution.counter.staleCardGroup(
        card(2),
        de.customers.groups.BLUE,
        de.customers.groups.RED,
      ),
    );
  });

  test("the printed group is what now puts the household on the cards-due list", async ({
    page,
  }) => {
    await page.goto("/karten-neuausstellung");

    const row = dueRow(page);
    await expect(row).toHaveCount(1);
    // The counts on both sides agree — this row is the group's doing and the screen says so.
    await expect(row.getByTestId("cards-due-counts-on-card")).toHaveText(
      de.customers.derived.countsValue(1, 2),
    );
    await expect(row.getByTestId("cards-due-counts-today")).toHaveText(
      de.customers.derived.countsValue(1, 2),
    );
    await expect(row.getByTestId("cards-due-reason")).toHaveText(de.cardsDue.reasons.GROUP_CHANGE);

    // ...and because they agree, the row has to print the thing that does not: the colour on the
    // card against the colour the household is in today. Both in words, never only as a tint.
    await expect(row.getByTestId("cards-due-group-on-card")).toHaveText(de.customers.groups.BLUE);
    await expect(row.getByTestId("cards-due-group-today")).toHaveText(de.customers.groups.RED);
  });

  test("a note written on the record is read out at the counter", async ({ page }) => {
    await page.goto(`/kunden/${id}`);
    await page.getByTestId("notes-field").fill(NOTE);
    await page.getByTestId("notes-submit").click();
    await expect(page.getByTestId("notes-saved")).toBeVisible();

    // Verbatim, on the screen staff have open while the customer is standing in front of them —
    // a note nobody reads at the counter is a note written for nobody (FR-5).
    await lookUp(page, card(2));
    await expect(page.getByTestId("counter-notes")).toHaveText(NOTE);
  });

  test("shows the answer to the last thing asked, and no older one", async ({ page }) => {
    // Eight write controls stand on this record and each keeps its own last result. Observed before
    // the board: a „Gespeichert." from a group move was still on screen through a card reissue and a
    // block afterwards — a green banner beside a button that had just done something else, which is
    // exactly how somebody concludes an action succeeded when it never reported.
    await page.goto(`/kunden/${id}`);
    await page.getByTestId("notes-field").fill(`${NOTE} (zweite Fassung)`);
    await page.getByTestId("notes-submit").click();
    await expect(page.getByTestId("notes-saved")).toBeVisible();

    await page.getByTestId("reissue-open").click();
    await page.getByTestId("reissue-submit").click();

    // The reissue answers, and the save's answer goes — it is not the answer to the button that was
    // just pressed. The one that stays is beside the button that produced it.
    await expect(page.getByTestId("reissue-saved")).toHaveText(de.customers.reissue.saved(card(3)));
    await expect(page.getByTestId("notes-saved")).toHaveCount(0);
  });

  /*
   * The two refusals, and the difference between them.
   *
   * Both wear a `<feature>-error` test id, because that id means *the answer was no* rather than
   * *the red tier* — four specs assert `toHaveCount(0)` on one to mean nothing was refused, and a
   * separate id for amber would leave them asserting the absence of something that no longer
   * renders. The tier is on `data-tier`, off the same locator, exactly as the counter's verdict is.
   */

  test("a rule saying no is amber, not red", async ({ page }) => {
    // The household is RED by now — the group test above moved it there. Asking for RED again is
    // `GroupUnchanged`: refused rather than quietly accepted, because a move writes an audit entry
    // and makes the printed card stale, and neither should happen for a change nobody made.
    await page.goto(`/kunden/${id}`);
    await page.getByTestId("group-RED").check();
    await page.getByTestId("group-submit").click();

    const refusal = page.getByTestId("group-error");
    await expect(refusal).toHaveText(de.customers.errors.groupUnchanged(de.customers.groups.RED));
    await expect(refusal).toHaveAttribute("data-tier", "refusal");
  });

  test("a record that is no longer there is red", async ({ page }) => {
    await page.goto(`/kunden/${id}`);

    // The one place a spec has to reach past the UI, and the reason is that the UI cannot produce
    // this: `CustomerNotFound` means the screen is describing a household that has gone since it
    // was drawn, which a browser sitting on a live record will not do on request. Rewriting the
    // hidden id is how that stale screen is staged — the form still submits, and the action answers
    // the way it would answer the real thing.
    //
    // The note is typed *first* and the id rewritten after: the textarea is controlled, so filling
    // it re-renders the form, and React restores a controlled hidden input to the value its prop
    // says. Rewriting before typing puts the real id back before the submit ever reads it.
    await page.getByTestId("notes-field").fill("Wird nicht gespeichert.");
    await page
      .locator('form:has([data-testid="notes-submit"]) input[name="customerId"]')
      .evaluate((input: HTMLInputElement): void => {
        input.value = "999999";
      });
    await page.getByTestId("notes-submit").click();

    const failure = page.getByTestId("notes-error");
    await expect(failure).toHaveText(de.customers.record.errors.unknown);
    await expect(failure).toHaveAttribute("data-tier", "error");
  });
});

/**
 * The hand-out history at the foot of the record: a bounded box, and a summary that says how much is
 * inside it before anyone opens it.
 *
 * What a spec can prove here and what it cannot are different things, and the split is deliberate.
 * It **can** prove the count — that is the whole point of putting it in the summary, and it is read
 * with the fold shut, which is exactly how staff meet it. It **can** prove the box is a region with
 * a name and that the keyboard reaches it and scrolls it, which is a requirement rather than a
 * polish item: a scrollable box that cannot take focus cannot be scrolled by keyboard at all
 * (WCAG 2.1.1). It **cannot** meaningfully prove the header sticks — that only shows itself above
 * the row count any fixture wants to insert on every run, so it is measured by hand against an
 * inflated copy of the register (`docs/guideline/ui_styling_guide.md` §11).
 */
test.describe("Bisherige Ausgaben", () => {
  let withHistory: number;
  let withoutHistory: number;

  test.beforeAll(async () => {
    pinToday();
    withHistory = await seedHouseholdWithHistory(WITH_HISTORY_NUMBER, HAND_OUTS);
    withoutHistory = await seedHouseholdWithHistory(WITHOUT_HISTORY_NUMBER, 0);
  });

  test.afterAll(async () => {
    rmSync(NOW_FILE, { force: true });
    await prisma.$disconnect();
  });

  test("the fold says how many hand-outs it holds without being opened", async ({ page }) => {
    await page.goto(`/kunden/${withHistory}`);

    // Nothing is clicked before the assertion, and that is the assertion: the summary answers the
    // question the disclosure used to leave unanswered — whether opening it is worth the click.
    await expect(page.getByTestId("history-count")).toHaveText(
      de.customers.record.historyCount(HAND_OUTS),
    );
    await expect(page.getByTestId("history-row").first()).toBeHidden();
  });

  test("a household with no hand-outs says so rather than showing a zero", async ({ page }) => {
    await page.goto(`/kunden/${withoutHistory}`);

    await expect(page.getByTestId("history-count")).toHaveText(de.customers.record.historyCount(0));

    // And the fold, once opened, says the same thing at length rather than showing an empty table.
    await page.getByTestId("history-open").click();
    await expect(page.getByTestId("history-empty")).toBeVisible();
    await expect(page.getByTestId("history-row")).toHaveCount(0);
  });

  test("the history is a named region the keyboard can reach and scroll", async ({ page }) => {
    await page.goto(`/kunden/${withHistory}`);

    // Opened from the keyboard rather than with a click, because the tab step below is the point of
    // the test and the two engines disagree about where a `Tab` starts from. Chromium treats a
    // programmatic `focus()` as the sequential-navigation origin; WebKit does not, so `focus()` then
    // `Tab` leaves focus sitting on the summary and the box is never reached. Pressing Enter on the
    // focused summary is both how a keyboard user opens the fold and what makes the summary a real
    // origin in either engine — so this asserts the same contract without encoding one engine's
    // shortcut. (The box itself is tab-reachable in both; only the starting point differed.)
    await page.getByTestId("history-open").focus();
    await page.keyboard.press("Enter");

    const history = page.getByRole("region", {
      name: de.customers.record.historyRegionLabel,
    });
    await expect(history).toBeVisible();
    await expect(page.getByTestId("history-row")).toHaveCount(HAND_OUTS);

    // Tab from the summary that opened it: the box is the next thing focus lands on, which is what
    // makes it reachable at all without a pointer.
    await page.keyboard.press("Tab");
    await expect(history).toBeFocused();

    const scrollTop = async (): Promise<number> =>
      history.evaluate((box: HTMLElement): number => box.scrollTop);
    expect(await scrollTop()).toBe(0);

    await page.keyboard.press("ArrowDown");
    await expect.poll(scrollTop).toBeGreaterThan(0);

    // The rows are all in the DOM whether they are in view or not — no pagination and no
    // virtualisation — so browser find still crosses the whole history, which is why neither was
    // reached for.
    await expect(page.getByTestId("history-row")).toHaveCount(HAND_OUTS);
  });
});
