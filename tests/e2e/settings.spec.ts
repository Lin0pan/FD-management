import { expect, test, type Page } from "@playwright/test";
import { de } from "@/i18n/de";
import { hydrated } from "./day";

/**
 * The settings round-trip against the built app
 * (tasks/prd-us-14-configure-business-rules.md §US-14.5).
 *
 * These specs are the only proof that the whole chain — form, server action, use case, Prisma
 * adapter, SQLite — actually holds together; four green unit gates missed a `"use server"` export
 * bug that a single page load caught. They therefore drive the real screen rather than the ports.
 *
 * They run **serially against one shared database**: each spec builds on the price the previous one
 * saved. The last two are a pair — one proves a rejected save writes nothing and yet leaves every
 * typed value on screen, the other that correcting only the refused field then saves the edits that
 * rode along with it.
 */

/** The price every spec here edits: the per-grown-up price, seeded at 2,00 €. */
const PRICE_LABEL = de.settings.fields.pricePerGrownUp;

/** The optional amount the last four specs edit: the Maximalpreis, seeded at 5,00 € (US-26.8). */
const CAP_LABEL = de.settings.fields.priceCap;

/**
 * What a fresh install holds, as the fields show it — `provisionalSettingsVersion` in
 * `src/infrastructure/prisma/seed.ts`, read back through the German number format.
 *
 * Spelled out rather than imported, because these are what the specs below *assert*: importing them
 * would make the screen and the seed agree by construction, and the point of driving the real form
 * is that they agree by fact. The three are what `beforeAll` restores between attempts.
 */
const SEEDED_PRICE = "2,00";
const SEEDED_CAP = "5,00";
const SEEDED_QUOTA = "240";

/**
 * The egg rule as the version in force states it — DF's own three steps (US-28).
 *
 * Spelled out for the same reason the three amounts above are, and *not* shortened to one row: the
 * rule is the only value on this screen that is a list, and it is stated whole on a line of its own.
 * An assertion that only looked for „ab 3 Personen“ would pass against a rule that had lost its top
 * two steps, which is precisely the failure a list-valued setting can have and a number cannot.
 *
 * This file does not edit the rule — `eggs.spec.ts` does, and hands the seeded one back before this
 * one runs. What is asserted here is that the summary of the version in force still carries it after
 * a save that had nothing to do with it.
 */
const SEEDED_EGG_RULE = "ab 3 Personen: 6 Eier · ab 5 Personen: 12 Eier · ab 8 Personen: 18 Eier";

/**
 * Open the settings screen and wait until React owns it.
 *
 * Not a nicety. The form is `useActionState`, so the confirmation this file asserts after every save
 * is *state* — and a save button pressed before the component hydrates submits the form natively
 * instead, which stores the settings and comes back on a page that holds no state to have put
 * „Gespeichert." anywhere. The spec then fails five seconds later on `settings-saved` with
 * "element(s) not found", which names the notice and not the window it fell into.
 *
 * That is the same window `fillSticky` closes for a controlled *field* (`day.ts`); here nothing is
 * typed before the first click, so the wait is all that is needed.
 *
 * Added as a precaution, not as a demonstrated fix: it is the mechanism that matches the failure
 * WebKit shows on a loaded runner — `settings-saved`, "element(s) not found" (CI run 32708233902) —
 * but that failure has never been reproduced with the wait in place *or* pinned down without it, so
 * it is honest to say only that this closes a window the file did have open.
 *
 * `#pricePerGrownUp` stands in for the form: hydration is per component, and every control on this
 * screen belongs to the one that owns that input.
 */
async function openSettings(page: Page): Promise<void> {
  await page.goto("/einstellungen");
  await hydrated(page.locator("#pricePerGrownUp"));
}

/**
 * Open the version history.
 *
 * It is a `<details>` that starts closed, so every
 * assertion about the *text* of a version has to open it first — Playwright's visibility-aware
 * matchers fail on collapsed content. `toHaveCount` needs no such thing and is asserted shut.
 */
async function openHistory(page: Page): Promise<void> {
  await page.getByTestId("settings-history-open").click();
}

/**
 * How many versions the history holds right now.
 *
 * The counts below are asserted as *this plus one*, rather than as the absolute number they used to
 * be. The claim is the same one — a save appends exactly one version — but this file no longer owns
 * the settings history: `price-cap.spec.ts` saves a Maximalpreis three times before it, and the
 * shared register is one database. An absolute count would tie two spec files to each other and
 * fail the wrong one when either changed. The positional assertions (`nth(1)` for the version a
 * save superseded) need no such thing: they count from the newest.
 */
async function versionCount(page: Page): Promise<number> {
  return page.getByTestId("settings-version").count();
}

test.describe.configure({ mode: "serial" });

test.describe("Einstellungen", () => {
  /**
   * Put the three values this file is a chain of back where it says they start — on **every
   * attempt**, not only the first.
   *
   * The specs below walk the price from 2,00 to 2,50 to 2,75 to 9,99, each asserting where the last
   * one left it, and the Maximalpreis from its seeded 5,00. The database is deleted and re-seeded in
   * `webServer.command` (`playwright.config.ts`), which runs once per *run*; `retries` is 2 on CI and
   * this block is `mode: "serial"`, so a retry replays it from the top against a register the
   * previous attempt already walked. The first spec then reads 9,99 where it expects 2,00 and fails
   * for a reason that has nothing to do with what broke — and does it on both retries, so the test
   * that actually failed never runs again and never appears in the report.
   *
   * Done through the screen rather than through Prisma, like everything else here: this file's whole
   * argument is that it drives the real chain, and a fixture reaching around the server action to
   * write a settings version would be the one write in it that proves nothing. It costs one extra
   * version at the head of the history, which no assertion counts — the counts have been relative
   * since `price-cap.spec.ts` started saving into the same register, and `versions.last()` is still
   * the seeded one.
   */
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await openSettings(page);
    await page.getByLabel(PRICE_LABEL, { exact: true }).fill(SEEDED_PRICE);
    await page.getByLabel(CAP_LABEL, { exact: true }).fill(SEEDED_CAP);
    await page.locator("#quotaN").fill(SEEDED_QUOTA);
    await page.getByRole("button", { name: de.settings.save, exact: true }).click();
    await expect(page.getByTestId("settings-saved")).toHaveText(de.settings.saved);
    await page.close();
  });

  test("a changed price is stored and shown again after a reload", async ({ page }) => {
    await openSettings(page);

    const price = page.getByLabel(PRICE_LABEL, { exact: true });
    await expect(price).toHaveValue(SEEDED_PRICE);
    // A change applies at once, so the screen has no effective-from field to fill in.
    await expect(page.locator("#effectiveFrom")).toHaveCount(0);
    const before = await versionCount(page);

    await price.fill("2,50");
    // The reason is left empty on purpose: it is optional, and only a real page load proves the
    // whole chain accepts a save without one.
    await expect(page.locator("#reason")).toHaveValue("");
    await page.getByRole("button", { name: de.settings.save, exact: true }).click();

    await expect(page.getByTestId("settings-saved")).toHaveText(de.settings.saved);

    await page.reload();
    await expect(page.getByLabel(PRICE_LABEL, { exact: true })).toHaveValue("2,50");
    // The new version leads the read-only history. It is the one in force, so it is the one version
    // stated in full rather than as a diff — the summary above it says how many there are.
    await expect(page.getByTestId("settings-history-count")).toContainText(
      de.settings.history.count(before + 1),
    );
    await openHistory(page);
    await expect(page.getByTestId("settings-version").first()).toContainText(
      `${de.settings.fields.pricePerGrownUp}: 2,50 €`,
    );
    // And every other value it holds, the egg rule among them since US-28 — a save that moved the
    // price must carry the rest of the configuration forward unchanged, and the summary of the
    // version in force is where that is readable.
    await expect(page.getByTestId("settings-version").first()).toContainText(
      `${de.settings.fields.eggRule}: ${SEEDED_EGG_RULE}`,
    );
  });

  test("a second save on the same day is applied too, and both are listed", async ({ page }) => {
    await openSettings(page);

    const before = await versionCount(page);

    // Saving twice in a row is the behaviour this screen exists for — settings apply at once and
    // are never dated, so nothing about the previous save can stand in the way of the next one.
    await page.getByLabel(PRICE_LABEL, { exact: true }).fill("2,75");
    await page.getByRole("button", { name: de.settings.save, exact: true }).click();
    await expect(page.getByTestId("settings-saved")).toHaveText(de.settings.saved);

    await page.reload();
    await expect(page.getByLabel(PRICE_LABEL, { exact: true })).toHaveValue("2,75");

    // Counted with the fold still shut, which is how DF will meet this list.
    const versions = page.getByTestId("settings-version");
    await expect(versions).toHaveCount(before + 1);

    await openHistory(page);
    // Newest first: the price just saved leads the list and is the one marked as in force.
    await expect(versions.first()).toContainText(`${de.settings.fields.pricePerGrownUp}: 2,75 €`);
    await expect(versions.first().getByTestId("settings-version-current")).toHaveText(
      de.settings.history.current,
    );
    // The superseded version states the *move* rather than restating all seven values — a stronger
    // claim than the old assertion, which only read the price that version happened to hold.
    await expect(versions.nth(1)).toContainText(
      de.settings.history.change(de.settings.fields.pricePerGrownUp, "2,00 €", "2,50 €"),
    );
    // And the oldest is where the configuration began, not a change from nothing. Addressed as the
    // last row rather than by index: it is the seeded version, and how many stand above it depends
    // on what the specs before this file saved.
    await expect(versions.last()).toContainText(de.settings.history.initial);
  });

  test("a rejected quota shows a German error and saves nothing", async ({ page }) => {
    await openSettings(page);

    await page.getByLabel(PRICE_LABEL, { exact: true }).fill("9,99");
    await page.locator("#quotaN").fill("0");
    await page.locator("#reason").fill("Höchstzahl senken");
    await page.getByRole("button", { name: de.settings.save, exact: true }).click();

    const refusal = page.getByTestId("settings-error");
    await expect(refusal).toHaveText(de.settings.errors.invalidSettings(de.settings.fields.quotaN));

    // Amber, not red: nothing is broken, a value needs fixing. The tier is decided from the typed
    // `InvalidSettings` in the action and rides on the state, so it cannot drift from the sentence.
    await expect(refusal).toHaveAttribute("data-tier", "refusal");

    // And the refusal says *which* field, 442px from where it is stated. The field it names carries
    // the mark, which is what makes the summary findable.
    await expect(page.locator("#quotaN")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByTestId("settings-field-error")).toHaveCount(1);
    await expect(page.getByTestId("settings-field-error")).toHaveText(
      de.settings.errors.invalidValue,
    );
    await expect(page.locator("#pricePerGrownUp")).not.toHaveAttribute("aria-invalid", "true");

    // And the form still holds what was typed — all three fields, not only the one that was refused.
    // It used to hold none of them: React resets an uncontrolled form once its action resolves, so
    // the reset rewound every field to the stored settings and three edits were thrown away because
    // one of them was wrong. The marked field showing `240` and being called invalid was the same
    // bug seen from the other side.
    await expect(page.locator("#quotaN")).toHaveValue("0");
    await expect(page.getByLabel(PRICE_LABEL, { exact: true })).toHaveValue("9,99");
    await expect(page.locator("#reason")).toHaveValue("Höchstzahl senken");

    // Kept on screen, written nowhere.
    await page.reload();
    await expect(page.getByLabel(PRICE_LABEL, { exact: true })).toHaveValue("2,75");
  });

  test("correcting the refused field saves the edits that rode with it", async ({ page }) => {
    await openSettings(page);
    const before = await versionCount(page);

    await page.getByLabel(PRICE_LABEL, { exact: true }).fill("9,99");
    await page.locator("#quotaN").fill("0");
    await page.locator("#reason").fill("Preis erhöhen");
    await page.getByRole("button", { name: de.settings.save, exact: true }).click();
    await expect(page.getByTestId("settings-error")).toHaveCount(1);

    // The whole point of keeping them: **only the refused field is touched** on the second attempt.
    // Nothing re-types the price or the reason, and the save that follows has to carry both — if the
    // form had reset, this would quietly store 2,75 and the test would say so.
    await page.locator("#quotaN").fill("240");
    await page.getByRole("button", { name: de.settings.save, exact: true }).click();

    await expect(page.getByTestId("settings-saved")).toHaveText(de.settings.saved);
    await expect(page.getByTestId("settings-error")).toHaveCount(0);

    await page.reload();
    await expect(page.getByLabel(PRICE_LABEL, { exact: true })).toHaveValue("9,99");
    await expect(page.locator("#quotaN")).toHaveValue("240");

    // One version appended, carrying the price that rode along with the correction. The history
    // lists the settings themselves, not the audit reason — that lives in the log.
    const versions = page.getByTestId("settings-version");
    await expect(versions).toHaveCount(before + 1);

    await openHistory(page);
    await expect(versions.first()).toContainText(`${de.settings.fields.pricePerGrownUp}: 9,99 €`);
    await expect(versions.first().getByTestId("settings-version-current")).toHaveText(
      de.settings.history.current,
    );
    // The quota was typed twice and ended where it started, so this save moved the price and only
    // the price. The version below therefore names one field, not two.
    await expect(versions.nth(1)).toContainText(
      de.settings.history.change(de.settings.fields.pricePerGrownUp, "2,50 €", "2,75 €"),
    );

    // And the form clears on a save — including `reason`, which describes this change and must not
    // be carried into the next one. That is the other half of the rule: a save clears everything, a
    // refusal keeps everything.
    await expect(page.locator("#reason")).toHaveValue("");
  });

  test("a changed Ausgabetag is named in the history", async ({ page }) => {
    // The defect this history was rebuilt for: the Ausgabetag was one of three settings the old list
    // never printed, so moving it — the setting with the most visible downstream effect, since the
    // Start dashboard and /ausgabe both read it — produced a row identical to its predecessor in
    // every character.
    await openSettings(page);
    await page.locator("#distributionWeekday").selectOption("5");
    await page.getByRole("button", { name: de.settings.save, exact: true }).click();
    await expect(page.getByTestId("settings-saved")).toHaveText(de.settings.saved);

    // Put it back in the same spec: the whole suite shares one database and two other screens read
    // the Ausgabetag. That leaves the moved version superseded, which is where a diff is shown.
    await page.locator("#distributionWeekday").selectOption("4");
    await page.getByRole("button", { name: de.settings.save, exact: true }).click();
    await expect(page.getByTestId("settings-saved")).toHaveText(de.settings.saved);

    await page.reload();
    await expect(page.locator("#distributionWeekday")).toHaveValue("4");

    await openHistory(page);
    const versions = page.getByTestId("settings-version");
    await expect(versions.nth(1)).toContainText(
      de.settings.history.change(
        de.settings.fields.distributionWeekday,
        de.settings.weekdays[4],
        de.settings.weekdays[5],
      ),
    );
    // And the day in force is stated in full by the version above it, which the old list did not do
    // either.
    await expect(versions.first()).toContainText(
      `${de.settings.fields.distributionWeekday}: ${de.settings.weekdays[4]}`,
    );
  });

  /*
   * The Maximalpreis (US-26.8). It is the only optional value on this screen, and *empty* and
   * `0,00` are one lost `null` branch apart: losing it would turn „no cap“ into „free for everyone“
   * on the next save, silently and in the customers' favour. Nothing but a real round trip through
   * the form, the action, Prisma and back proves the branch survived, so these four specs drive it.
   *
   * They run in order, like everything else in this file, and hand the cap back at 5,00 € — the
   * seeded value the pricing specs assert against.
   */

  test("a Maximalpreis is stored and shown again after a reload", async ({ page }) => {
    await openSettings(page);

    const cap = page.getByLabel(CAP_LABEL, { exact: true });
    await expect(cap).toHaveValue(SEEDED_CAP);

    await cap.fill("4,00");
    await page.getByRole("button", { name: de.settings.save, exact: true }).click();
    await expect(page.getByTestId("settings-saved")).toHaveText(de.settings.saved);

    await page.reload();
    await expect(page.getByLabel(CAP_LABEL, { exact: true })).toHaveValue("4,00");

    // And the version in force states it beside the two per-head prices, which is where DF reads
    // back what the software will charge.
    await openHistory(page);
    await expect(page.getByTestId("settings-version").first()).toContainText(
      `${CAP_LABEL}: 4,00 €`,
    );
  });

  test("clearing the Maximalpreis leaves the field empty, not 0,00", async ({ page }) => {
    await openSettings(page);

    // Emptying the field is how a cap is removed — there is no toggle beside it, because a toggle
    // could contradict the amount (US-26.5).
    await page.getByLabel(CAP_LABEL, { exact: true }).fill("");
    await page.getByRole("button", { name: de.settings.save, exact: true }).click();
    await expect(page.getByTestId("settings-saved")).toHaveText(de.settings.saved);

    await page.reload();
    // The assertion this spec exists for, and it is deliberately on the input's **value**: a page
    // that merely lacks the characters `0,00` would also pass a check for their absence, while a
    // cap that had quietly become zero would show them here and nowhere else.
    await expect(page.getByLabel(CAP_LABEL, { exact: true })).toHaveValue("");

    await openHistory(page);
    // No cap is a configuration, so the version in force says so in words rather than leaving the
    // segment out or printing 0,00 €.
    await expect(page.getByTestId("settings-version").first()).toContainText(
      `${CAP_LABEL}: ${de.settings.prices.noCap}`,
    );
  });

  test("the history names the Maximalpreis being changed, removed and introduced", async ({
    page,
  }) => {
    await openSettings(page);

    // Introducing a cap again, and then moving it back to the seeded 5,00 €: the second save is
    // what supersedes the introduction, and a superseded version is where a diff is shown. It also
    // hands the register back the price the pricing specs assert against.
    await page.getByLabel(CAP_LABEL, { exact: true }).fill("4,00");
    await page.getByRole("button", { name: de.settings.save, exact: true }).click();
    await expect(page.getByTestId("settings-saved")).toHaveText(de.settings.saved);

    // Reloaded between the two saves on purpose: a save *clears* the form, and the revalidated
    // render that does it can land after the next `fill`, which would then be rewound to the stored
    // value and the second save would append a version that changed nothing.
    await page.reload();
    await expect(page.getByLabel(CAP_LABEL, { exact: true })).toHaveValue("4,00");

    await page.getByLabel(CAP_LABEL, { exact: true }).fill("5,00");
    await page.getByRole("button", { name: de.settings.save, exact: true }).click();
    await expect(page.getByTestId("settings-saved")).toHaveText(de.settings.saved);

    await page.reload();
    await expect(page.getByLabel(CAP_LABEL, { exact: true })).toHaveValue("5,00");

    await openHistory(page);
    const versions = page.getByTestId("settings-version");
    // All three transitions, newest first and each in full German: a cap introduced where there was
    // none, a cap removed, and a cap moved. „kein Maximalpreis“ is the phrase on the absent side in
    // both directions — the same words the field hint uses.
    await expect(versions.nth(1)).toContainText(
      de.settings.history.change(CAP_LABEL, de.settings.prices.noCap, "4,00 €"),
    );
    await expect(versions.nth(2)).toContainText(
      de.settings.history.change(CAP_LABEL, "4,00 €", de.settings.prices.noCap),
    );
    await expect(versions.nth(3)).toContainText(
      de.settings.history.change(CAP_LABEL, "5,00 €", "4,00 €"),
    );
  });

  test("a Maximalpreis that is not an amount is refused and nothing else is lost", async ({
    page,
  }) => {
    await openSettings(page);

    await page.getByLabel(CAP_LABEL, { exact: true }).fill("5,0o");
    await page.getByLabel(de.settings.fields.pricePerChild, { exact: true }).fill("1,20");
    await page.locator("#reason").fill("Maximalpreis anheben");
    await page.getByRole("button", { name: de.settings.save, exact: true }).click();

    const refusal = page.getByTestId("settings-error");
    // An optional amount that is not empty goes through the same parser as a required one, so the
    // refusal is Zod's and the words are the ones the PRD prescribes (§US-26.5) — but they are said
    // at the field now, with the summary naming the field around them. It was the other way round:
    // the summary carried „Kein gültiger Betrag.“ and the mark a generic „Ungültiger Wert.“, so on
    // a screen with three money boxes the sentence by the button named none of them and the mark
    // that knew which box it sat under said nothing worth reading.
    await expect(refusal).toHaveText(
      de.forms.fieldProblem(CAP_LABEL, de.settings.errors.notAnAmount),
    );
    await expect(refusal).toHaveAttribute("data-tier", "refusal");

    await expect(page.locator("#priceCap")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByTestId("settings-field-error")).toHaveCount(1);
    await expect(page.getByTestId("settings-field-error")).toHaveText(
      de.settings.errors.notAnAmount,
    );
    await expect(page.locator("#pricePerChild")).not.toHaveAttribute("aria-invalid", "true");

    // And the cursor is in it, which this screen never did before: the field it names is 442px above
    // the sentence, measured, and further once several are named at once.
    await expect(page.locator("#priceCap")).toBeFocused();

    // The §4.2d rule for the new field: the edit that rode along with the refused one is still on
    // screen, and so is the refused text itself — rewinding it to the stored 5,00 € would hide what
    // was wrong with it.
    await expect(page.getByLabel(CAP_LABEL, { exact: true })).toHaveValue("5,0o");
    await expect(page.getByLabel(de.settings.fields.pricePerChild, { exact: true })).toHaveValue(
      "1,20",
    );
    await expect(page.locator("#reason")).toHaveValue("Maximalpreis anheben");

    // Kept on screen, written nowhere — both fields come back as the database has them.
    await page.reload();
    await expect(page.getByLabel(CAP_LABEL, { exact: true })).toHaveValue("5,00");
    await expect(page.getByLabel(de.settings.fields.pricePerChild, { exact: true })).toHaveValue(
      "1,00",
    );
  });

  /**
   * Two fields refused together, which this screen used to report one at a time.
   *
   * The action stopped at `issues[0]`, so mistyping two of the three money boxes marked one of them;
   * the staff member corrected it, saved, and was refused again for the other. The schema checks
   * every field independently — a use case checks a settings version — and reporting every issue is
   * what makes that asymmetry honest rather than a shortcut.
   *
   * The two per-head prices, not a price and the quota: `quotaN` is a `type=number` box, so a value
   * the *schema* would refuse is one the **browser** refuses first and the form never submits at
   * all. The three fields that can carry unreadable text are the money ones, which is also where
   * this actually bites — three boxes that all want `2,50`.
   *
   * Nothing is written, so this leaves the settings exactly as the test above found them.
   */
  test("two fields refused at once are both named and both marked", async ({ page }) => {
    await openSettings(page);

    await page.getByLabel(PRICE_LABEL, { exact: true }).fill("2,5o");
    await page.getByLabel(de.settings.fields.pricePerChild, { exact: true }).fill("1,2o");
    await page.getByRole("button", { name: de.settings.save, exact: true }).click();

    // Named rather than counted: the marks are at the fields, but somebody scrolled to the button
    // has to know how far up to look and how many times. In the order the schema reads them.
    await expect(page.getByTestId("settings-error")).toHaveText(
      de.forms.severalFieldProblems([PRICE_LABEL, de.settings.fields.pricePerChild]),
    );

    // Both marked, where only the first used to be — and the second was left for the next save.
    await expect(page.getByTestId("settings-field-error")).toHaveText([
      de.settings.errors.notAnAmount,
      de.settings.errors.notAnAmount,
    ]);
    await expect(page.locator("#pricePerGrownUp")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#pricePerChild")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#priceCap")).not.toHaveAttribute("aria-invalid", "true");

    // The cursor lands in the first of them, not the last one marked.
    await expect(page.locator("#pricePerGrownUp")).toBeFocused();

    // And both texts are still there to be corrected — a refusal that rewound them to the stored
    // amounts would hide what was wrong with them.
    await expect(page.getByLabel(PRICE_LABEL, { exact: true })).toHaveValue("2,5o");
    await expect(page.getByLabel(de.settings.fields.pricePerChild, { exact: true })).toHaveValue(
      "1,2o",
    );

    await page.reload();
    await expect(page.getByLabel(PRICE_LABEL, { exact: true })).not.toHaveValue("2,5o");
  });

  // The quota-below-*active-customers* rule (FR-4) is reachable from the browser as of US-01.6 —
  // the registration form can now put customers into the register — but it needs **two** of them:
  // a quota is only valid at 1 or above, so the count has to reach 2 before any valid quota can
  // fall below it. Registering two households belongs in the registration spec (US-01.7), which
  // owns that flow and its synthetic data; driving the form from the settings spec would couple two
  // files to one customer-number sequence in the shared `data/e2e.db`. The rule itself is covered by
  // `src/application/settings/settings.test.ts`; the specs above prove the surrounding path — a
  // rejected quota is explained in German and nothing is written.
  test.skip("a quota below the active customer count is refused", async ({ page }) => {
    await openSettings(page);
  });
});
