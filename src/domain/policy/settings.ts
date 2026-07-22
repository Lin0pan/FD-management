/**
 * The policy values FD can change without a deploy, and the rule that decides which of them apply
 * on a given day.
 *
 * Every number in FD's process — the quota, the portions per head, the price per head, the reminder
 * threshold, the week-cycle anchor — is configuration, not a constant (tasks/prd-us-14-configure-
 * business-rules.md). Versions are immutable and dated: a distribution record stores only a `paid`
 * flag, so the only way to answer "what did that customer owe last March" is to resolve the version
 * in force on that date.
 *
 * This module is pure: it does no I/O, never reads the wall clock, and works over an array of
 * versions that the application layer has already loaded.
 */

import { InvalidSettings, NoSettingsInForce } from "../errors";
import type { Cents } from "../money";

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
  readonly portionsPerGrownUp: number;
  readonly portionsPerChild: number;
  readonly reminderThreshold: number;
  readonly weekAnchor: WeekAnchor;
  readonly distributionWeekday: IsoWeekday;
  /** What one grown-up and one child each cost at a distribution. The total is derived. */
  readonly pricePerGrownUp: Cents;
  readonly pricePerChild: Cents;
}

/** The unvalidated shape `createSettings` accepts — the weekday is narrowed during validation. */
export interface SettingsInput extends Omit<Settings, "distributionWeekday"> {
  readonly distributionWeekday: number;
}

/** A set of policy values together with the date it takes effect. */
export interface SettingsVersion {
  readonly effectiveFrom: Date;
  readonly settings: Settings;
}

/** `2026-W02` — a four-digit ISO year, `W`, and a two-digit week between 01 and 53. */
const ISO_WEEK = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;

function requireInteger(field: string, value: number, minimum: number): void {
  if (!Number.isInteger(value) || value < minimum) {
    throw new InvalidSettings(
      field,
      `must be an integer of at least ${minimum}, received ${value}`,
    );
  }
}

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
  requireInteger("portionsPerGrownUp", input.portionsPerGrownUp, 0);
  requireInteger("portionsPerChild", input.portionsPerChild, 0);
  requireInteger("reminderThreshold", input.reminderThreshold, 1);
  requireInteger("pricePerGrownUp", input.pricePerGrownUp, 0);
  requireInteger("pricePerChild", input.pricePerChild, 0);
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

  return {
    quotaN: input.quotaN,
    portionsPerGrownUp: input.portionsPerGrownUp,
    portionsPerChild: input.portionsPerChild,
    reminderThreshold: input.reminderThreshold,
    weekAnchor: { isoWeek: input.weekAnchor.isoWeek, colour: input.weekAnchor.colour },
    distributionWeekday: input.distributionWeekday,
    pricePerGrownUp: input.pricePerGrownUp,
    pricePerChild: input.pricePerChild,
  };
}

/**
 * The settings in force on `date`: the version with the greatest `effectiveFrom` that is not after
 * it. A version dated exactly `date` is in force on that day.
 *
 * @throws {NoSettingsInForce} if no version had taken effect yet — never a partial object.
 */
export function resolveSettingsAt(versions: ReadonlyArray<SettingsVersion>, date: Date): Settings {
  let inForce: SettingsVersion | undefined;
  for (const version of versions) {
    if (version.effectiveFrom.getTime() > date.getTime()) continue;
    if (
      inForce === undefined ||
      version.effectiveFrom.getTime() > inForce.effectiveFrom.getTime()
    ) {
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
  "portionsPerGrownUp",
  "portionsPerChild",
  "reminderThreshold",
  "weekAnchor",
  "distributionWeekday",
  "pricePerGrownUp",
  "pricePerChild",
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
 * What a household pays for one distribution: one grown-up price per grown-up plus one child price
 * per child.
 *
 * FD charges per head, so the total is derived rather than stored or looked up — every household
 * size is priceable and there is no table to keep in step with reality. Both factors are whole
 * cents, so the sum is too.
 */
export function priceFor(settings: Settings, grownUps: number, children: number): Cents {
  return grownUps * settings.pricePerGrownUp + children * settings.pricePerChild;
}
