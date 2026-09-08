/**
 * The policy values DF can change without a deploy, and the rule deciding which apply at a point in
 * time (`tasks/prd-us-14-configure-business-rules.md`).
 *
 * A saved change is in force immediately and superseded versions are kept, never overwritten
 * (ADR-005): a distribution record stores what the hand-out cost, not the rule that produced it, so
 * "which colour did that week carry" can only be answered by resolving the version in force then.
 */

import { InvalidSettings, NoSettingsInForce } from "../errors";
import type { Cents } from "../money";
import { createEggRule, diffEggRule, type EggRule, type EggRuleRow } from "./eggs";
import { requireInteger } from "./require-integer";

/** The two-week distribution cycle alternates between these two groups. */
export type WeekColour = "RED" | "BLUE";

/** The stored form of the two week colours, in the order they are written to the database. */
const WEEK_COLOURS: ReadonlyArray<WeekColour> = ["RED", "BLUE"];

/**
 * Narrow a persisted string to a {@link WeekColour} — SQLite has no enum type, so the value re-enters
 * the domain through a check.
 *
 * @throws {InvalidSettings} if the value is not one of the two colours of the cycle.
 */
export function parseWeekColour(value: string): WeekColour {
  const colour = WEEK_COLOURS.find((candidate) => candidate === value);
  if (colour === undefined) {
    throw new InvalidSettings(
      "weekAnchor.colour",
      `must be one of ${WEEK_COLOURS.join(" or ")}, received ${value}`,
    );
  }
  return colour;
}

/** ISO weekday, Monday = 1 … Sunday = 7. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * The known week of the cycle everything else is counted from, e.g. `2026-W02` was RED, therefore
 * `2026-W03` is BLUE.
 */
export interface WeekAnchor {
  readonly isoWeek: string;
  readonly colour: WeekColour;
}

/** The complete set of policy values in force at one point in time. */
export interface Settings {
  readonly quotaN: number;
  readonly weekAnchor: WeekAnchor;
  readonly distributionWeekday: IsoWeekday;
  /** What one grown-up and one child each cost at a distribution. The total is derived. */
  readonly pricePerGrownUp: Cents;
  readonly pricePerChild: Cents;
  /**
   * The most a household pays for one distribution, or `null` for no limit.
   *
   * `null` rather than a `0` flag, because `0` is the legal configuration *everybody collects for
   * free*. *No cap* and *a cap of 0,00 €* stay tellable apart from the form down to the column.
   */
  readonly priceCap: Cents | null;
  /**
   * How many eggs a household receives, as a staircase of thresholds (US-28). The only list-valued
   * policy value; an empty one is legitimate and means no eggs for anyone.
   */
  readonly eggRule: EggRule;
}

/** The unvalidated shape `createSettings` accepts; the weekday and the egg rule are narrowed there. */
export interface SettingsInput extends Omit<Settings, "distributionWeekday" | "eggRule"> {
  readonly distributionWeekday: number;
  readonly eggRule: ReadonlyArray<EggRuleRow>;
}

/**
 * A set of policy values with the instant they took over. `recordedAt` is stamped from the clock and
 * never chosen by staff, so a change cannot be dated forwards or backwards.
 */
export interface SettingsVersion {
  readonly recordedAt: Date;
  readonly settings: Settings;
}

/** `2026-W02` — a four-digit ISO year, `W`, and a two-digit week between 01 and 53. */
const ISO_WEEK = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;

function isIsoWeekday(value: number): value is IsoWeekday {
  return Number.isInteger(value) && value >= 1 && value <= 7;
}

/**
 * Validate a set of policy values and return it as `Settings`.
 *
 * @throws {InvalidSettings} naming the offending field, so nothing partially-valid is ever stored.
 */
export function createSettings(input: SettingsInput): Settings {
  requireInteger("quotaN", input.quotaN, 1);
  requireInteger("pricePerGrownUp", input.pricePerGrownUp, 0);
  requireInteger("pricePerChild", input.pricePerChild, 0);
  if (input.priceCap !== null) {
    requireInteger("priceCap", input.priceCap, 0);
  }
  if (!isIsoWeekday(input.distributionWeekday)) {
    throw new InvalidSettings(
      "distributionWeekday",
      `must be an ISO weekday between 1 and 7, received ${input.distributionWeekday}`,
    );
  }
  if (!ISO_WEEK.test(input.weekAnchor.isoWeek)) {
    throw new InvalidSettings(
      "weekAnchor.isoWeek",
      `must be an ISO week such as 2026-W02, received ${input.weekAnchor.isoWeek}`,
    );
  }

  // Through `createEggRule`, so an invalid rule can never reach a `Settings`. Sorting and the
  // staircase check are that constructor's; repeating either here would be a second answer.
  const eggRule = createEggRule(input.eggRule);

  return {
    quotaN: input.quotaN,
    weekAnchor: { isoWeek: input.weekAnchor.isoWeek, colour: input.weekAnchor.colour },
    distributionWeekday: input.distributionWeekday,
    pricePerGrownUp: input.pricePerGrownUp,
    pricePerChild: input.pricePerChild,
    priceCap: input.priceCap,
    eggRule,
  };
}

/**
 * The settings in force at `date`: the greatest `recordedAt` not after it, `date` itself included.
 *
 * Two versions can share an instant, so the tie is broken by position — later in the array wins.
 * Otherwise the order is irrelevant and callers need not sort.
 *
 * @throws {NoSettingsInForce} if nothing had been recorded yet — never a partial object.
 */
export function resolveSettingsAt(versions: ReadonlyArray<SettingsVersion>, date: Date): Settings {
  let inForce: SettingsVersion | undefined;
  for (const version of versions) {
    if (version.recordedAt.getTime() > date.getTime()) continue;
    if (inForce === undefined || version.recordedAt.getTime() >= inForce.recordedAt.getTime()) {
      inForce = version;
    }
  }
  if (inForce === undefined) {
    throw new NoSettingsInForce(date);
  }
  return inForce.settings;
}

/** The policy fields, in the order an audit entry lists them. */
const SETTINGS_FIELDS = [
  "quotaN",
  "weekAnchor",
  "distributionWeekday",
  "pricePerGrownUp",
  "pricePerChild",
  "priceCap",
  "eggRule",
] as const;

/** The name of one editable policy field, as it appears in an audit entry. */
export type SettingsField = (typeof SETTINGS_FIELDS)[number];

function sameWeekAnchor(a: WeekAnchor, b: WeekAnchor): boolean {
  return a.isoWeek === b.isoWeek && a.colour === b.colour;
}

function isUnchanged(field: SettingsField, previous: Settings, next: Settings): boolean {
  if (field === "weekAnchor") {
    return sameWeekAnchor(previous.weekAnchor, next.weekAnchor);
  }
  // The rule is an array, so the reference comparison below would report every save as a change to
  // it. Two rules are the same rule when no row differs.
  if (field === "eggRule") {
    return diffEggRule(previous.eggRule, next.eggRule).length === 0;
  }
  return previous[field] === next[field];
}

/**
 * The names of the policy fields that differ between two versions — what an audit entry records as
 * *what changed*. With no previous version (the seed), every field counts as new.
 */
export function changedSettingsFields(
  previous: Settings | undefined,
  next: Settings,
): ReadonlyArray<SettingsField> {
  if (previous === undefined) return [...SETTINGS_FIELDS];
  return SETTINGS_FIELDS.filter((field) => !isUnchanged(field, previous, next));
}

/**
 * The three configured price values this derivation reads — a `Pick` rather than the whole of
 * {@link Settings}, so handing the browser preview (US-16.5) the quota and week anchor does not
 * suggest those have something to do with the answer.
 */
export type PriceValues = Pick<Settings, "pricePerGrownUp" | "pricePerChild" | "priceCap">;

/**
 * What the browser's allowance preview is handed (US-16.5, US-28): the price values plus the egg rule,
 * narrowed for {@link PriceValues}' reason.
 *
 * {@link priceFor} keeps taking the narrower {@link PriceValues} — an egg rule in its signature would
 * say the eggs were part of the sum, and they are free.
 */
export type AllowanceValues = PriceValues & Pick<Settings, "eggRule">;

/**
 * What a household pays for one distribution: per head, capped at {@link Settings.priceCap} when one
 * is configured (US-26). Derived rather than tabulated, so every household size is priceable.
 *
 * A ceiling, never a floor: a small household pays its per-head sum and an empty one pays nothing.
 * Every factor is whole cents, so no rounding happens here.
 */
export function priceFor(settings: PriceValues, grownUps: number, children: number): Cents {
  const perHead = grownUps * settings.pricePerGrownUp + children * settings.pricePerChild;
  return settings.priceCap === null ? perHead : Math.min(perHead, settings.priceCap);
}
