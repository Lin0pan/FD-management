import { test, expect } from "@playwright/test";

test("home page renders the German heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Füllhorn Delbrück – Verwaltung",
  );
});
