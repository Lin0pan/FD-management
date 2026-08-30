/**
 * The policy values DF can change without a deploy, and the rule that decides which of them apply
 * at a point in time.
 *
 * Every number in DF's process — the quota, the price per head, the week-cycle anchor — is
 * configuration, not a constant (tasks/prd-us-14-configure-business-rules.md). A saved change is in
 * force immediately; superseded versions are kept rather than overwritten, because a distribution
 * record stores what that hand-out cost and what was handed over for it, and nothing about the rule
 * that produced either. The only way to answer "how many eggs did that household draw last March",
 * or which colour that week carried, is to resolve the version in force then.
 *
 * This module is pure: it does no I/O, never reads the wall clock, and works over an array of
 * versions that the application layer has already loaded.
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
 * Narrow a persisted string to a {@link WeekColour}. SQLite has no enum type, so the colour comes
 * back from the database as a plain string and has to re-enter the domain through a check.
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
   * The most a household pays for one distribution whatever its size, or `null` for no upper limit
   * at all.
   *
   * `null` rather than a `0` flag, because `0` already means something else here: a cap of nothing
   * is the legal configuration *everybody collects for free*, exactly as a child price of `0` means
   * children are free. The two claims — *no cap* and *a cap of 0,00 €* — have to stay tellable
   * apart from the settings form down to the nullable column, so there is one spelling end to end.
   */
  readonly priceCap: Cents | null;
  /**
   * How many eggs a household receives, as a staircase of thresholds (US-28). The only list-valued
   * policy value, and the only one that may legitimately be empty: no rows means no eggs for anyone.
   */
  readonly eggRule: EggRule;
}

/**
 * The unvalidated shape `createSettings` accepts — the weekday is narrowed and the egg rule is
 * sorted and checked during validation, exactly as the weekday arrives here as a plain number.
 */
export interface SettingsInput extends Omit<Settings, "distributionWeekday" | "eggRule"> {
  readonly distributionWeekday: number;
  readonly eggRule: ReadonlyArray<EggRuleRow>;
}

/**
 * A set of policy values together with the instant they took over.
 *
 * `recordedAt` is stamped from the clock when the change is saved, never chosen by staff: DF adjusts
 * the numbers when reality changes, so a change applies at once and cannot be dated forwards or
 * backwards.
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

  // Through `createEggRule`, so an invalid rule can never reach a `Settings` value: sorting and the
  // staircase check are that constructor's, and repeating either here would be a second answer.
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
 * The settings in force at `date`: the version with the greatest `recordedAt` that is not after it.
 * A version recorded at exactly `date` is already in force — saving takes effect immediately.
 *
 * Two versions can share an instant (nothing stops two saves in the same millisecond), so the tie is
 * broken by position: the one recorded later — later in the array — wins. Otherwise the array order
 * is irrelevant, and callers need not sort.
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
  // The rule is an array, so the comparison below is a comparison of two references and would report
  // every single save as a change to it. Two rules are the same rule when no row differs.
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
 * The three configured price values this derivation reads.
 *
 * It is a `Pick` rather than the whole of {@link Settings} so that a caller holding only the price
 * values can still price a household: the customer record's household editor derives the price in
 * the browser as staff type (US-16.5), and handing it the quota and the week anchor to do so would
 * say those had something to do with the answer.
 */
export type PriceValues = Pick<Settings, "pricePerGrownUp" | "pricePerChild" | "priceCap">;

/**
 * The policy values a *derived allowance* rests on: the three price values above, plus the egg rule.
 *
 * The counts, the egg count and the price are the four figures the counter and the customer record
 * state together, and the household editor derives every one of them in the browser as staff type
 * (US-16.5, US-28). This is what that preview has to be handed — deliberately not the whole of
 * {@link Settings}, for {@link PriceValues}' reason: the quota and the week anchor have nothing to
 * do with what a household receives.
 *
 * {@link priceFor} keeps taking the narrower {@link PriceValues}, because the price is still derived
 * from the prices alone; an egg rule in its signature would say the eggs were part of the sum, and
 * they are free.
 */
export type AllowanceValues = PriceValues & Pick<Settings, "eggRule">;

/**
 * What a household pays for one distribution: one grown-up price per grown-up plus one child price
 * per child, and never more than the {@link Settings.priceCap} when one is configured.
 *
 * DF charges per head, so the total is derived rather than stored or looked up — every household
 * size is priceable and there is no table to keep in step with reality. The cap is what DF actually
 * collects at the counter: with 2,00 € per grown-up and 1,00 € per child, a household of four
 * grown-ups and three children owes 11,00 € per head but pays the 5,00 € cap (US-26).
 *
 * A ceiling, never a floor: a small household pays its per-head sum, and an empty one pays nothing.
 * Both factors are whole cents and so is the cap, so the answer is whole cents either way — no
 * rounding happens here.
 */
export function priceFor(settings: PriceValues, grownUps: number, children: number): Cents {
  const perHead = grownUps * settings.pricePerGrownUp + children * settings.pricePerChild;
  return settings.priceCap === null ? perHead : Math.min(perHead, settings.priceCap);
}
