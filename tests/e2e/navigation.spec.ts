import { expect, test, type Page } from "@playwright/test";
import { de } from "@/i18n/de";

/**
 * The navigation shell (`tasks/prd-us-17-navigation-shell.md` §US-17.5). `activeSection` is already
 * proved as a pure function, so nothing here re-tests the routing table.
 *
 * What a unit test cannot see is the bar as staff meet it: that the links are really in every
 * screen's layout, that following one lands on the section it names, and that the marking follows —
 * including on the screens a section owns but does not name.
 */

/** One section of the bar: the link that leads there, and the screen that proves you arrived. */
interface Section {
  /** The value in the link's `data-testid`, i.e. `nav-<section>`. */
  readonly section: string;
  readonly label: string;
  readonly path: string;
  /** The `<h1>` of the screen the link leads to — spelled out here rather than derived from it. */
  readonly heading: string;
}

/**
 * The five areas, in the order the bar shows them.
 *
 * Deliberately a table of its own instead of the `NAV_ITEMS` the bar renders: a spec that imported
 * the implementation's table could only ever say "the bar agrees with itself". The headings are the
 * dictionary's, because German strings live in one place (CLAUDE.md), but which heading belongs to
 * which path is stated here.
 */
const SECTIONS: ReadonlyArray<Section> = [
  { section: "start", label: de.nav.start, path: "/", heading: de.home.heading },
  {
    section: "distribution",
    label: de.nav.distribution,
    path: "/ausgabe",
    heading: de.distribution.heading,
  },
  {
    section: "customers",
    label: de.nav.customers,
    path: "/kunden",
    heading: de.customerList.heading,
  },
  {
    section: "overviews",
    label: de.nav.overviews,
    path: "/uebersichten",
    heading: de.nav.overviews,
  },
  {
    section: "settings",
    label: de.nav.settings,
    path: "/einstellungen",
    heading: de.settings.heading,
  },
];

/** The screens the customer hub owns without naming them in the bar (US-17.1). */
const HUB_ROUTES = ["/kunden", "/warteliste"] as const;

/** The lists Übersichten owns without naming them in the bar; their URLs predate the tab (US-38.2). */
const OVERVIEW_ROUTES = ["/ausgabetermine", "/karten-neuausstellung"] as const;

/** The path of the page currently open, without the origin the base url supplies. */
function path(page: Page): string {
  return new URL(page.url()).pathname;
}

/**
 * Which sections the bar has marked, by `data-testid`.
 *
 * An array rather than a single value on purpose: "Start is marked" and "nothing else is marked at
 * the same time" are two different claims, and only the second one catches a prefix rule that lets
 * `/` swallow every path in the application.
 */
async function markedSections(page: Page): Promise<ReadonlyArray<string>> {
  return page
    .getByTestId("main-nav")
    .locator('a[aria-current="page"]')
    .evaluateAll((links) => links.map((link) => link.getAttribute("data-testid") ?? ""));
}

/** Follow the bar to a section and wait for the page it leads to. */
async function clickNav(page: Page, target: Section): Promise<void> {
  await page.getByTestId(`nav-${target.section}`).click();
  await page.waitForURL((url) => url.pathname === target.path);
}

test.describe("Navigationsleiste", () => {
  test("zeigt auf jedem Bildschirm dieselben fünf Bereiche in derselben Reihenfolge", async ({
    page,
  }) => {
    await page.goto("/kunden/neu");

    await expect(page.getByTestId("main-nav").getByRole("link")).toHaveText(
      SECTIONS.map((section) => section.label),
    );
  });

  // One test per starting point rather than one for all twenty moves: a failure then names the
  // screen whose bar is broken, which is the thing that would have to be fixed.
  for (const origin of SECTIONS) {
    test(`von ${origin.label} aus ist jeder andere Bereich über die Leiste erreichbar`, async ({
      page,
    }) => {
      for (const target of SECTIONS.filter((section) => section !== origin)) {
        await page.goto(origin.path);
        await clickNav(page, target);

        expect(path(page)).toBe(target.path);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(target.heading);
        // The bar came along and moved with us — the section just entered is the one marked.
        expect(await markedSections(page)).toEqual([`nav-${target.section}`]);
      }
    });
  }

  test("„Start“ ist auf / markiert und kein zweiter Bereich gleichzeitig", async ({ page }) => {
    await page.goto("/");

    // The whole point of the exact match in `activeSection`: `/` is a prefix of every path, so a
    // rule that compared prefixes naively would mark Start everywhere and here mark it twice over.
    expect(await markedSections(page)).toEqual(["nav-start"]);
    await expect(page.getByTestId("nav-start")).toHaveAttribute("aria-current", "page");
  });

  for (const route of HUB_ROUTES) {
    test(`„${de.nav.customers}“ ist auf ${route} markiert`, async ({ page }) => {
      await page.goto(route);

      // The waiting list has no item of its own; standing on it with the bar marking nothing would
      // read as a broken bar rather than as a screen outside the areas (US-17.1).
      expect(await markedSections(page)).toEqual(["nav-customers"]);
      await expect(page.getByTestId("nav-customers")).toHaveAttribute("aria-current", "page");
    });
  }

  for (const route of OVERVIEW_ROUTES) {
    test(`„${de.nav.overviews}“ ist auf ${route} markiert`, async ({ page }) => {
      await page.goto(route);

      // Other screens link here too, as shortcuts; the list's one home is the Übersichten tab.
      expect(await markedSections(page)).toEqual(["nav-overviews"]);
    });
  }

  test("ein Kundendatensatz gehört ebenfalls zu „Kunden verwalten“", async ({ page }) => {
    // A sub-route the table never names: the section owns everything below `/kunden`.
    await page.goto("/kunden/neu");

    expect(await markedSections(page)).toEqual(["nav-customers"]);
  });
});
