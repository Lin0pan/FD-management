import { resolve } from "node:path";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { foldName } from "@/domain/customer/nameSearch";
import { SHARED } from "./registers";
import { releaseNumbers } from "./seeding";

/**
 * The two promises the Kontrast-Theme made DF (`docs/guideline/ui_styling_guide.md` §8, §9): no text
 * a staff member reads is set smaller than 13px, and the keyboard's position is always marked.
 *
 * Neither is visible to any other spec. Both are properties of every screen at once, and both were
 * lost before by one primitive or one hand-written class — a 12px hint, an `outline-none` without
 * its replacement — so this sweeps the screens rather than naming elements.
 *
 * The one write is the household {@link CUSTOMER_NUMBER}, seeded so the register and a record have
 * rows to read whatever the specs before this one left behind; nothing else here writes.
 */

/** The smallest type the theme allows: badges and table heads, nothing else goes this low. */
const SMALLEST_PX = 13;

/** This file's own household; no other spec seeds 361. */
const CUSTOMER_NUMBER = 361;

const prisma = new PrismaClient({ datasourceUrl: `file:${resolve(SHARED.database)}` });

/** One grown-up whose certificate has lapsed, so the record shows its badge and its renewal. */
async function seedHousehold(): Promise<number> {
  await releaseNumbers(prisma, CUSTOMER_NUMBER);
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const birthDate = new Date("1980-05-17T00:00:00.000Z");
  const issuedAt = new Date("2025-01-02T00:00:00.000Z");
  const customer = await prisma.customer.create({
    data: {
      customerNumber: CUSTOMER_NUMBER,
      firstName,
      lastName,
      firstNameFolded: foldName(firstName),
      lastNameFolded: foldName(lastName),
      birthDate,
      street: faker.location.street(),
      houseNumber: faker.location.buildingNumber(),
      zip: faker.location.zipCode("#####"),
      city: faker.location.city(),
      status: "ACTIVE",
      reminderCount: 1,
      notes: "",
      householdMembers: { create: [{ firstName, lastName, birthDate }] },
      certificates: {
        create: {
          type: "Jobcenter-Bescheid",
          validUntil: new Date("2025-12-31T00:00:00.000Z"),
          recordedAt: issuedAt,
        },
      },
      cards: {
        create: {
          customerNumber: CUSTOMER_NUMBER,
          index: 1,
          issuedAt,
          printedAt: issuedAt,
          reason: "FIRST_ISSUE",
          grownUpsAtIssue: 1,
          childrenAtIssue: 0,
        },
      },
    },
  });
  return customer.id;
}

/** Every screen staff work in, except `/kunden/[id]/karte`, whose outsized type is US-02.4's. */
const SCREENS = [
  "/",
  "/ausgabe",
  "/ausgabetermine",
  "/kunden",
  "/kunden/neu",
  "/warteliste",
  "/uebersichten",
  "/karten-neuausstellung",
  "/karten-drucken",
  "/einstellungen",
] as const;

/** The visible elements whose own text is set below the floor, described for the failure message. */
async function textBelowFloor(page: Page): Promise<ReadonlyArray<string>> {
  return page.evaluate((floor) => {
    const offenders: string[] = [];
    for (const element of document.querySelectorAll("body *")) {
      const ownText = [...element.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? "")
        .join("")
        .trim();
      if (ownText === "") {
        continue;
      }
      // A screen-reader-only label is 1px wide by design; it is heard, not read.
      const box = element.getBoundingClientRect();
      if (box.width <= 1 || box.height <= 1) {
        continue;
      }
      const size = Number.parseFloat(getComputedStyle(element).fontSize);
      if (size < floor) {
        offenders.push(`${size}px <${element.tagName.toLowerCase()}> "${ownText.slice(0, 40)}"`);
      }
    }
    return offenders;
  }, SMALLEST_PX);
}

test.describe("Lesbarkeit", () => {
  let customerId = 0;

  test.beforeAll(async () => {
    customerId = await seedHousehold();
  });

  test.afterAll(async () => {
    await releaseNumbers(prisma, CUSTOMER_NUMBER);
    await prisma.$disconnect();
  });

  for (const path of SCREENS) {
    test(`sets no text on ${path} below ${SMALLEST_PX}px`, async ({ page }) => {
      await page.goto(path);
      expect(await textBelowFloor(page)).toEqual([]);
    });
  }

  test("sets no text on a household's record below the floor either", async ({ page }) => {
    await page.goto(`/kunden/${customerId}`);

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await textBelowFloor(page)).toEqual([]);
  });

  test("marks every stop of the keyboard with the same 2px outline", async ({ page }) => {
    // The register's filters and the counter between them hold every primitive staff tab through:
    // links, buttons, a text field, native selects and a checkbox.
    for (const path of ["/kunden", "/ausgabe"]) {
      await page.goto(path);
      for (let stop = 0; stop < 15; stop++) {
        await page.keyboard.press("Tab");
        const what = await page.evaluate(() => {
          const focused = document.activeElement;
          return focused === null || focused === document.body
            ? null
            : `<${focused.tagName.toLowerCase()}> "${(focused.textContent ?? "").trim().slice(0, 30)}"`;
        });
        if (what === null) {
          continue;
        }
        // Polled: a `Button` transitions every property, the outline included, so the mark eases in
        // over 150ms from the browser's default and a single read can land halfway.
        await expect
          .poll(
            () =>
              page.evaluate(() => {
                const style = getComputedStyle(document.activeElement ?? document.body);
                return `${style.outlineStyle} ${style.outlineWidth}`;
              }),
            { message: `focus on ${what} at ${path}` },
          )
          .toBe("solid 2px");
      }
    }
  });
});
