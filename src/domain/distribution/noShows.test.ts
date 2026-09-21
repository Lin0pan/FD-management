import { describe, expect, it } from "vitest";
import type { Group } from "../customer/group";
import { consecutiveNoShows } from "./noShows";
import { createSessionGroups, type DistributionSession } from "./session";

const REGISTERED = new Date("2026-01-01T00:00:00.000Z");

/** An afternoon of 2026, ended unless the test says it is still running. */
function session(
  id: number,
  day: string,
  groups: ReadonlyArray<Group>,
  running = false,
): DistributionSession {
  return {
    id,
    startedAt: new Date(`${day}T14:00:00.000Z`),
    endedAt: running ? null : new Date(`${day}T17:30:00.000Z`),
    groups: createSessionGroups(groups),
  };
}

/** The sessions arrive as the store hands them over: newest first, discarded ones already gone. */
function count(options: {
  sessions: ReadonlyArray<DistributionSession>;
  attended?: ReadonlyArray<number>;
  group?: Group;
  registeredOn?: Date;
}): number {
  return consecutiveNoShows({
    sessions: options.sessions,
    attendedSessionIds: options.attended ?? [],
    customerGroup: options.group ?? "RED",
    registeredOn: options.registeredOn ?? REGISTERED,
  });
}

describe("consecutiveNoShows", () => {
  it("counts a session the household's group was served at and they missed", () => {
    expect(count({ sessions: [session(2, "2026-01-22", ["RED"])] })).toBe(1);
  });

  it("does not count a session that served only the other group", () => {
    expect(
      count({
        sessions: [session(3, "2026-01-15", ["BLUE"]), session(2, "2026-01-08", ["RED"])],
        attended: [2],
      }),
    ).toBe(0);
  });

  it("counts a session that served both groups", () => {
    expect(count({ sessions: [session(4, "2026-01-29", ["RED", "BLUE"])], group: "BLUE" })).toBe(1);
  });

  it("does not count the session that is still running", () => {
    expect(
      count({
        sessions: [session(5, "2026-02-05", ["RED"], true), session(2, "2026-01-08", ["RED"])],
        attended: [2],
      }),
    ).toBe(0);
  });

  it("does not count a session that started before the household joined", () => {
    expect(
      count({
        sessions: [session(2, "2026-01-08", ["RED"])],
        registeredOn: new Date("2026-02-01T00:00:00.000Z"),
      }),
    ).toBe(0);
  });

  it("stops counting at the last session they collected at", () => {
    expect(
      count({
        sessions: [
          session(6, "2026-02-05", ["RED"]),
          session(4, "2026-01-22", ["RED"]),
          session(2, "2026-01-08", ["RED"]),
        ],
        attended: [2],
      }),
    ).toBe(2);
  });

  it("answers zero for a household that has not seen a session yet", () => {
    expect(count({ sessions: [] })).toBe(0);
  });
});
