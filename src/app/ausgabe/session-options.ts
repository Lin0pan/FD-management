/**
 * The three afternoons the start form offers, shared by the radio group and the action that reads it
 * (`tasks/prd-us-34-distribution-session.md` §US-34.7). Not in `session-actions.ts`, which is
 * `"use server"` and may export nothing but async functions.
 *
 * Three options and not two checkboxes: „Rot und Blau" is the merged afternoon DF hold, and a pair
 * of boxes would also offer the session serving nobody that `createSessionGroups` refuses.
 */

import type { Group } from "@/domain/customer/group";
import type { SessionGroups } from "@/domain/distribution/session";

export const GROUP_OPTIONS = {
  RED: ["RED"],
  BLUE: ["BLUE"],
  BOTH: ["RED", "BLUE"],
} as const satisfies Record<string, ReadonlyArray<Group>>;

export type GroupOption = keyof typeof GROUP_OPTIONS;

/** The order they are offered in, RED before BLUE before both, as `GROUPS` and the register read. */
export const GROUP_OPTIONS_IN_ORDER = ["RED", "BLUE", "BOTH"] as const;

/** Which option names these groups — how the proposal reaches the radio that offers it. */
export function optionFor(groups: SessionGroups): GroupOption {
  // RED, BLUE or both is the whole of `SessionGroups` (`createSessionGroups`), so this is total.
  if (groups.length === 2) {
    return "BOTH";
  }
  return groups.at(0) === "RED" ? "RED" : "BLUE";
}
