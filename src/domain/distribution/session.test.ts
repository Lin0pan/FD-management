import { describe, expect, it } from "vitest";
import { InvalidSessionGroups, MissingRequiredField } from "../errors";
import {
  canDiscard,
  canReopen,
  createSessionGroups,
  formatSessionGroups,
  isRunning,
  parseSessionGroups,
  proposeGroups,
  servesGroup,
  type DistributionSession,
} from "./session";

const startedAt = new Date("2026-01-08T14:00:00Z");
const endedAt = new Date("2026-01-08T17:30:00Z");

/** A session as the store hands one over — ended unless a test says otherwise. */
function session(
  id: number,
  groups: ReadonlyArray<"RED" | "BLUE">,
  ended: Date | null = endedAt,
): DistributionSession {
  return { id, startedAt, endedAt: ended, groups: createSessionGroups(groups) };
}

describe("createSessionGroups", () => {
  it("refuses a session that serves no group", () => {
    let failure: unknown;
    try {
      createSessionGroups([]);
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(MissingRequiredField);
    expect((failure as MissingRequiredField).field).toBe("groups");
  });

  it("puts RED before BLUE however the groups were chosen", () => {
    expect(createSessionGroups(["BLUE", "RED"])).toEqual(["RED", "BLUE"]);
  });

  it("serves a group named twice only once", () => {
    expect(createSessionGroups(["BLUE", "BLUE"])).toEqual(["BLUE"]);
  });
});

describe("formatSessionGroups / parseSessionGroups", () => {
  it("reads a stored RED,BLUE as both groups", () => {
    expect(parseSessionGroups("RED,BLUE")).toEqual(["RED", "BLUE"]);
  });

  it("stores one group as its name alone", () => {
    expect(formatSessionGroups(createSessionGroups(["BLUE"]))).toBe("BLUE");
    expect(parseSessionGroups("BLUE")).toEqual(["BLUE"]);
  });

  it("writes both groups in the order it reads them back", () => {
    expect(formatSessionGroups(createSessionGroups(["BLUE", "RED"]))).toBe("RED,BLUE");
  });

  it("refuses a stored value that names no group", () => {
    let failure: unknown;
    try {
      parseSessionGroups("GREEN");
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(InvalidSessionGroups);
    expect((failure as InvalidSessionGroups).stored).toBe("GREEN");
  });

  it("refuses a stored value holding nothing", () => {
    expect(() => parseSessionGroups("")).toThrow(InvalidSessionGroups);
  });
});

describe("servesGroup", () => {
  it("serves only the group the session was started for", () => {
    const groups = createSessionGroups(["RED"]);

    expect(servesGroup(groups, "RED")).toBe(true);
    expect(servesGroup(groups, "BLUE")).toBe(false);
  });

  it("serves every household when the session serves both groups", () => {
    const groups = createSessionGroups(["RED", "BLUE"]);

    expect(servesGroup(groups, "RED")).toBe(true);
    expect(servesGroup(groups, "BLUE")).toBe(true);
  });
});

describe("isRunning", () => {
  it("runs until somebody ends it", () => {
    expect(isRunning(session(1, ["RED"], null))).toBe(true);
    expect(isRunning(session(1, ["RED"]))).toBe(false);
  });
});

describe("proposeGroups", () => {
  it("proposes the group that was not up last time", () => {
    expect(proposeGroups(session(1, ["RED"]))).toEqual(["BLUE"]);
    expect(proposeGroups(session(2, ["BLUE"]))).toEqual(["RED"]);
  });

  it("proposes both groups again after a session that served both", () => {
    expect(proposeGroups(session(3, ["RED", "BLUE"]))).toEqual(["RED", "BLUE"]);
  });

  it("preselects nothing when no session has ever taken place", () => {
    expect(proposeGroups(null)).toBeNull();
  });
});

describe("canDiscard", () => {
  it("discards a running session nobody was served at", () => {
    expect(canDiscard(session(1, ["RED"], null), { handouts: 0, reminders: 0 })).toBe(true);
  });

  it("refuses to discard a session that has served somebody", () => {
    expect(canDiscard(session(1, ["RED"], null), { handouts: 1, reminders: 0 })).toBe(false);
  });

  it("refuses to discard a session that has logged a reminder", () => {
    expect(canDiscard(session(1, ["RED"], null), { handouts: 0, reminders: 1 })).toBe(false);
  });

  it("refuses to discard a session that has ended", () => {
    expect(canDiscard(session(1, ["RED"]), { handouts: 0, reminders: 0 })).toBe(false);
  });
});

describe("canReopen", () => {
  it("reopens the session that ended last", () => {
    const last = session(7, ["RED"]);

    expect(canReopen(last, { mostRecentlyEnded: last, running: null })).toBe(true);
  });

  it("refuses to reopen anything but the most recent session", () => {
    const older = session(6, ["BLUE"]);
    const last = session(7, ["RED"]);

    expect(canReopen(older, { mostRecentlyEnded: last, running: null })).toBe(false);
  });

  it("refuses to reopen while a session is running", () => {
    const last = session(7, ["RED"]);

    expect(canReopen(last, { mostRecentlyEnded: last, running: session(8, ["BLUE"], null) })).toBe(
      false,
    );
  });

  it("refuses to reopen when no session has ended yet", () => {
    expect(canReopen(session(7, ["RED"]), { mostRecentlyEnded: null, running: null })).toBe(false);
  });
});
