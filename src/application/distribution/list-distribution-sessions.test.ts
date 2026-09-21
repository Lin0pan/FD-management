import { describe, expect, it } from "vitest";
import {
  createSessionGroups,
  type DistributionSession,
  type SessionSummary,
} from "@/domain/distribution/session";
import type { Cents } from "@/domain/money";
import type { DistributionRecordRepository, DistributionSessionRepository } from "../ports";
import { listDistributionSessions } from "./list-distribution-sessions";

/** Hand-written fakes throughout, per the testing standard — no mocking library. */

const FIRST = new Date("2026-01-08T14:00:00.000Z");
const SECOND = new Date("2026-01-15T14:00:00.000Z");
const THIRD = new Date("2026-01-22T14:00:00.000Z");
const END_OF_AFTERNOON = 3.5 * 60 * 60 * 1000;

function ended(id: number, startedAt: Date, groups: ReadonlyArray<"RED" | "BLUE">) {
  return {
    id,
    startedAt,
    endedAt: new Date(startedAt.getTime() + END_OF_AFTERNOON),
    groups: createSessionGroups(groups),
  };
}

function running(id: number, startedAt: Date, groups: ReadonlyArray<"RED" | "BLUE">) {
  return { id, startedAt, endedAt: null, groups: createSessionGroups(groups) };
}

/**
 * The session register, stamping a discarded session rather than forgetting it exactly as the
 * adapter does: the filter the use case relies on is the store's, so a fake that simply held fewer
 * rows would prove nothing about it.
 */
class FakeDistributionSessionRepository implements DistributionSessionRepository {
  private readonly rows: { discarded: boolean; readonly session: DistributionSession }[] = [];

  /** Oldest first, as an afternoon register grows. */
  constructor(...sessions: DistributionSession[]) {
    this.rows.push(...sessions.map((session) => ({ discarded: false, session })));
  }

  private get visible(): ReadonlyArray<DistributionSession> {
    return this.rows.filter((row) => !row.discarded).map((row) => row.session);
  }

  findRunning(): Promise<DistributionSession | null> {
    return Promise.resolve(this.visible.find((session) => session.endedAt === null) ?? null);
  }

  listEnded(): Promise<ReadonlyArray<DistributionSession>> {
    const closed = this.visible.filter((session) => session.endedAt !== null);
    return Promise.resolve([...closed].reverse());
  }

  discard(sessionId: number): Promise<void> {
    const row = this.rows.find((one) => one.session.id === sessionId);
    if (row === undefined) {
      throw new Error(`No session ${sessionId}`);
    }
    row.discarded = true;
    return Promise.resolve();
  }

  lastEnded(): Promise<DistributionSession | null> {
    return Promise.reject(new Error("The overview reads every afternoon, never the last alone"));
  }

  findById(): Promise<DistributionSession | null> {
    return Promise.reject(new Error("Reading one session has a suite of its own"));
  }

  start(): Promise<DistributionSession> {
    return Promise.reject(new Error("Starting a session has a suite of its own"));
  }

  end(): Promise<void> {
    return Promise.reject(new Error("Ending a session has a suite of its own"));
  }

  reopen(): Promise<void> {
    return Promise.reject(new Error("Reopening a session has a suite of its own"));
  }
}

/** Only the aggregate is answered here; the overview never reads a hand-out. */
class FakeDistributionRecordRepository implements DistributionRecordRepository {
  constructor(private readonly summaries: ReadonlyMap<number, SessionSummary> = new Map()) {}

  summariseBySession(): Promise<ReadonlyMap<number, SessionSummary>> {
    return Promise.resolve(this.summaries);
  }

  listForCustomer(): Promise<never> {
    return Promise.reject(new Error("The overview reads afternoons, never one household"));
  }

  listForSession(): Promise<never> {
    return Promise.reject(new Error("A row of the overview is an aggregate, not a list"));
  }

  findById(): Promise<never> {
    return Promise.reject(new Error("Correcting a hand-out has a suite of its own"));
  }

  create(): Promise<never> {
    return Promise.reject(new Error("Recording a hand-out has a suite of its own"));
  }

  setPayment(): Promise<never> {
    return Promise.reject(new Error("Correcting a hand-out has a suite of its own"));
  }

  remove(): Promise<never> {
    return Promise.reject(new Error("Correcting a hand-out has a suite of its own"));
  }

  freezeSession(): Promise<never> {
    return Promise.reject(new Error("Ending a session has a suite of its own"));
  }

  thawSession(): Promise<never> {
    return Promise.reject(new Error("Reopening a session has a suite of its own"));
  }
}

function summary(households: number, totalPaidCents: number): SessionSummary {
  return { households, totalPaidCents: totalPaidCents as Cents };
}

describe("listDistributionSessions", () => {
  it("lists the newest session first", async () => {
    const sessions = new FakeDistributionSessionRepository(
      ended(1, FIRST, ["RED"]),
      ended(2, SECOND, ["BLUE"]),
      ended(3, THIRD, ["RED", "BLUE"]),
    );

    const listed = await listDistributionSessions({
      sessions,
      records: new FakeDistributionRecordRepository(),
    });

    expect(listed.map((row) => row.id)).toEqual([3, 2, 1]);
    expect(listed.map((row) => row.running)).toEqual([false, false, false]);
    expect(listed.map((row) => row.groups)).toEqual([["RED", "BLUE"], ["BLUE"], ["RED"]]);
  });

  it("puts the running session at the top", async () => {
    const sessions = new FakeDistributionSessionRepository(
      ended(1, FIRST, ["RED"]),
      running(2, SECOND, ["BLUE"]),
    );

    const listed = await listDistributionSessions({
      sessions,
      records: new FakeDistributionRecordRepository(new Map([[1, summary(2, 900)]])),
    });

    expect(listed.map((row) => row.id)).toEqual([2, 1]);
    // Its end is open and nobody has collected yet: the afternoon under way is in the list from the
    // moment it starts, with the figures it has so far.
    expect(listed.at(0)).toMatchObject({ running: true, endedAt: null, households: 0 });
    expect(listed.at(0)?.totalPaidCents).toBe(0);
  });

  it("counts what each session took", async () => {
    const sessions = new FakeDistributionSessionRepository(
      ended(1, FIRST, ["RED"]),
      ended(2, SECOND, ["BLUE"]),
    );
    const records = new FakeDistributionRecordRepository(
      new Map([
        [1, summary(3, 1650)],
        [2, summary(17, 9400)],
      ]),
    );

    const listed = await listDistributionSessions({ sessions, records });

    expect(listed).toMatchObject([
      { id: 2, households: 17, totalPaidCents: 9400 },
      { id: 1, households: 3, totalPaidCents: 1650 },
    ]);
  });

  it("omits a discarded session", async () => {
    const sessions = new FakeDistributionSessionRepository(
      ended(1, FIRST, ["RED"]),
      running(2, SECOND, ["BLUE"]),
    );
    await sessions.discard(2);

    const listed = await listDistributionSessions({
      sessions,
      records: new FakeDistributionRecordRepository(),
    });

    expect(listed.map((row) => row.id)).toEqual([1]);
  });

  it("answers nothing at all before the first distribution has been held", async () => {
    const listed = await listDistributionSessions({
      sessions: new FakeDistributionSessionRepository(),
      records: new FakeDistributionRecordRepository(),
    });

    expect(listed).toEqual([]);
  });
});
