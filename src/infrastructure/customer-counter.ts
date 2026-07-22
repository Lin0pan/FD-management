import type { CustomerCounter } from "@/application/ports";

/**
 * How many customers currently hold a slot — the reality the quota `N` may not be lowered below
 * (tasks/prd-us-14-configure-business-rules.md, FR-4).
 *
 * There is no `Customer` model yet: registration is US-01, and US-14 is deliberately built first
 * because registration needs the quota to assign a customer number. Until that model exists the
 * count is genuinely zero — the database holds no customers — so this adapter reports zero rather
 * than inventing a number, and the quota check simply never fires.
 *
 * **When US-01 lands, replace this with a Prisma adapter counting active customers.** The port, the
 * `updateSettings` rule and its tests already cover the behaviour and need no change; only this file
 * and the wiring in `src/app/einstellungen/deps.ts` do.
 */
export const emptyCustomerCounter: CustomerCounter = {
  countActive: () => Promise.resolve(0),
};
