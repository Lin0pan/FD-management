import { beforeEach, describe, expect, it } from "vitest";
import type { DistributionRecord } from "@/domain/distribution/distributionRecord";
import {
  createSessionGroups,
  type DistributionSession,
  type SessionGroups,
} from "@/domain/distribution/session";
import {
  DistributionSessionAlreadyRunning,
  DistributionSessionNotEmpty,
  DistributionSessionNotReopenable,
  MissingAuditReason,
  MissingRequiredField,
  NoDistributionSessionRunning,
} from "@/domain/errors";
import type { Cents } from "@/domain/money";
import type {
  AuditEntry,
  AuditLog,
  Clock,
  DistributionRecordRepository,
  DistributionSessionRepository,
  ReminderLogEntry,
  ReminderLogRepository,
} from "../ports";
import { discardDistributionSession } from "./discard-distribution-session";
import { endDistributionSession } from "./end-distribution-session";
import { readDistributionSessionState } from "./read-distribution-session-state";
import { reopenDistributionSession } from "./reopen-distribution-session";
import { startDistributionSession } from "./start-distribution-session";

/** Hand-written fakes throughout, per the testing standard — no mocking library. */

const STARTED = "2026-01-08T14:00:00.000Z";
const ENDED = "2026-01-08T17:30:00.000Z";
const LATER = "2026-01-15T14:00:00.000Z";

const RUNNING_ID = 12;
const EARLIER_ID = 11;

function fakeClock(iso: string): Clock {
  return { now: () => new Date(iso) };
}

function session(overrides: Partial<DistributionSession> = {}): DistributionSession {
  return {
    id: overrides.id ?? RUNNING_ID,
    startedAt: overrides.startedAt ?? new Date(STARTED),
    endedAt: overrides.endedAt ?? null,
    groups: overrides.groups ?? createSessionGroups(["RED"]),
  };
}

/**
 * The register of sessions, stamped rather than deleted exactly as the adapter stamps them: a
 * discarded row stays in `rows` and is filtered out of every read, so a test can prove the store was
 * not asked to forget anything.
 */
interface SessionRow {
  discardedAt: Date | null;
  readonly session: DistributionSession;
}

class FakeDistributionSessionRepository implements DistributionSessionRepository {
  readonly rows: SessionRow[] = [];
  private nextId = 100;

  constructor(...sessions: DistributionSession[]) {
    for (const session of sessions) {
      this.rows.push({ discardedAt: null, session });
    }
  }

  private get visible(): SessionRow[] {
    return this.rows.filter((row) => row.discardedAt === null);
  }

  private require(sessionId: number): SessionRow {
    const row = this.visible.find((one) => one.session.id === sessionId);
    if (row === undefined) {
      throw new Error(`No session ${sessionId}`);
    }
    return row;
  }

  private replace(sessionId: number, endedAt: Date | null): void {
    const row = this.require(sessionId);
    this.rows[this.rows.indexOf(row)] = { ...row, session: { ...row.session, endedAt } };
  }

  findRunning(): Promise<DistributionSession | null> {
    return Promise.resolve(
      this.visible.find((row) => row.session.endedAt === null)?.session ?? null,
    );
  }

  lastEnded(): Promise<DistributionSession | null> {
    const ended = this.visible.filter((row) => row.session.endedAt !== null);
    return Promise.resolve(ended.at(-1)?.session ?? null);
  }

  findById(sessionId: number): Promise<DistributionSession | null> {
    return Promise.resolve(
      this.visible.find((row) => row.session.id === sessionId)?.session ?? null,
    );
  }

  start(groups: SessionGroups, at: Date): Promise<DistributionSession> {
    // The store is the final authority on "one at a time", as the `one_running_session` index is.
    const running = this.visible.find((row) => row.session.endedAt === null);
    if (running !== undefined) {
      return Promise.reject(new DistributionSessionAlreadyRunning(running.session.id));
    }
    const session = { id: this.nextId++, startedAt: at, endedAt: null, groups };
    this.rows.push({ discardedAt: null, session });
    return Promise.resolve(session);
  }

  end(sessionId: number, at: Date): Promise<void> {
    this.replace(sessionId, at);
    return Promise.resolve();
  }

  discard(sessionId: number, at: Date): Promise<void> {
    this.require(sessionId).discardedAt = at;
    return Promise.resolve();
  }

  reopen(sessionId: number): Promise<void> {
    this.replace(sessionId, null);
    return Promise.resolve();
  }
}

class FakeDistributionRecordRepository implements DistributionRecordRepository {
  constructor(private readonly rows: ReadonlyArray<DistributionRecord> = []) {}

  listForCustomer(): Promise<ReadonlyArray<DistributionRecord>> {
    return Promise.reject(
      new Error("The session use cases read a whole afternoon, never one household"),
    );
  }

  listForSession(sessionId: number): Promise<ReadonlyArray<DistributionRecord>> {
    return Promise.resolve(this.rows.filter((row) => row.sessionId === sessionId));
  }

  findById(): Promise<DistributionRecord | null> {
    return Promise.reject(new Error("Correcting a hand-out has a suite of its own"));
  }

  create(): Promise<DistributionRecord> {
    return Promise.reject(new Error("Recording a hand-out has a suite of its own"));
  }

  setPayment(): Promise<DistributionRecord> {
    return Promise.reject(new Error("Correcting a hand-out has a suite of its own"));
  }

  remove(): Promise<void> {
    return Promise.reject(new Error("Correcting a hand-out has a suite of its own"));
  }
}

class FakeReminderLogRepository implements ReminderLogRepository {
  constructor(private readonly count = 0) {}

  findInSession(): Promise<ReminderLogEntry | null> {
    return Promise.reject(new Error("Logging a reminder has a suite of its own"));
  }

  listForSession(sessionId: number): Promise<ReadonlyArray<ReminderLogEntry>> {
    return Promise.resolve(
      Array.from({ length: this.count }, () => ({ sessionId, resultingCount: 1 })),
    );
  }

  record(): Promise<void> {
    return Promise.reject(new Error("Logging a reminder has a suite of its own"));
  }
}

class FakeAuditLog implements AuditLog {
  readonly entries: AuditEntry[] = [];

  append(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

/** A hand-out in the session under test — only the two money fields and the session matter here. */
function handout(id: number, paidCents: Cents, sessionId = RUNNING_ID): DistributionRecord {
  return {
    id,
    customerId: id,
    sessionId,
    date: new Date(STARTED),
    showedUp: true,
    paidCents,
    priceCents: 500 as Cents,
  };
}

describe("startDistributionSession", () => {
  let sessions: FakeDistributionSessionRepository;
  let audit: FakeAuditLog;

  beforeEach(() => {
    sessions = new FakeDistributionSessionRepository();
    audit = new FakeAuditLog();
  });

  function deps(at = STARTED) {
    return { sessions, audit, clock: fakeClock(at) };
  }

  it("starts the afternoon at the instant the button was pressed", async () => {
    const started = await startDistributionSession(deps(), { groups: ["BLUE"] });

    expect(started.startedAt).toEqual(new Date(STARTED));
    expect(started.endedAt).toBeNull();
    expect(started.groups).toEqual(["BLUE"]);
    expect(await sessions.findRunning()).toEqual(started);
  });

  it("refuses a second session while one is running", async () => {
    sessions = new FakeDistributionSessionRepository(session());

    await expect(startDistributionSession(deps(), { groups: ["RED"] })).rejects.toBeInstanceOf(
      DistributionSessionAlreadyRunning,
    );
    expect(sessions.rows).toHaveLength(1);
  });

  it("refuses a session that serves no group", async () => {
    await expect(startDistributionSession(deps(), { groups: [] })).rejects.toBeInstanceOf(
      MissingRequiredField,
    );
    expect(sessions.rows).toHaveLength(0);
  });

  it("orders the chosen groups RED before BLUE, whichever way the form sent them", async () => {
    const started = await startDistributionSession(deps(), { groups: ["BLUE", "RED"] });

    expect(started.groups).toEqual(["RED", "BLUE"]);
  });

  it("writes nothing to the log when a session is started", async () => {
    // A session that began and never ended is nowhere in the log: the entry is written at the end,
    // where it can name both instants at once (US-34, FR-13).
    await startDistributionSession(deps(), { groups: ["RED"] });

    expect(audit.entries).toHaveLength(0);
  });
});

describe("discardDistributionSession", () => {
  let sessions: FakeDistributionSessionRepository;
  let records: FakeDistributionRecordRepository;
  let reminders: FakeReminderLogRepository;
  let audit: FakeAuditLog;

  beforeEach(() => {
    sessions = new FakeDistributionSessionRepository(session());
    records = new FakeDistributionRecordRepository();
    reminders = new FakeReminderLogRepository();
    audit = new FakeAuditLog();
  });

  function deps() {
    return { sessions, records, reminders, audit, clock: fakeClock(ENDED) };
  }

  it("discards a session nobody was served at", async () => {
    await discardDistributionSession(deps());

    expect(await sessions.findRunning()).toBeNull();
    expect(await sessions.lastEnded()).toBeNull();
    // Stamped, never deleted (ADR-010): the row is still there, it is simply nobody's afternoon.
    expect(sessions.rows).toHaveLength(1);
    expect(sessions.rows[0]?.discardedAt).toEqual(new Date(ENDED));
  });

  it("refuses to discard a session that served somebody", async () => {
    records = new FakeDistributionRecordRepository([handout(1, 500 as Cents)]);

    await expect(discardDistributionSession(deps())).rejects.toBeInstanceOf(
      DistributionSessionNotEmpty,
    );
    expect(await sessions.findRunning()).not.toBeNull();
  });

  it("refuses to discard a session that only logged a reminder", async () => {
    reminders = new FakeReminderLogRepository(1);

    await expect(discardDistributionSession(deps())).rejects.toBeInstanceOf(
      DistributionSessionNotEmpty,
    );
    expect(await sessions.findRunning()).not.toBeNull();
  });

  it("refuses to discard when no session is running", async () => {
    sessions = new FakeDistributionSessionRepository();

    await expect(discardDistributionSession(deps())).rejects.toBeInstanceOf(
      NoDistributionSessionRunning,
    );
  });

  it("writes nothing to the log when a session is discarded", async () => {
    await discardDistributionSession(deps());

    expect(audit.entries).toHaveLength(0);
  });
});

describe("endDistributionSession", () => {
  let sessions: FakeDistributionSessionRepository;
  let records: FakeDistributionRecordRepository;
  let audit: FakeAuditLog;

  beforeEach(() => {
    sessions = new FakeDistributionSessionRepository(
      session({ groups: createSessionGroups(["RED", "BLUE"]) }),
    );
    records = new FakeDistributionRecordRepository();
    audit = new FakeAuditLog();
  });

  function deps() {
    return { sessions, records, audit, clock: fakeClock(ENDED) };
  }

  it("counts what was taken when the session ends", async () => {
    records = new FakeDistributionRecordRepository([
      handout(1, 500 as Cents),
      handout(2, 250 as Cents),
      // An earlier afternoon's hand-out, which this summary may not count.
      handout(3, 900 as Cents, EARLIER_ID),
    ]);

    const summary = await endDistributionSession(deps());

    expect(summary).toEqual({ households: 2, totalPaidCents: 750 });
    expect(await sessions.findRunning()).toBeNull();
    expect((await sessions.lastEnded())?.endedAt).toEqual(new Date(ENDED));
  });

  it("summarises an afternoon nobody came to as nothing taken", async () => {
    const summary = await endDistributionSession(deps());

    expect(summary).toEqual({ households: 0, totalPaidCents: 0 });
  });

  it("writes one audit entry naming the start and the end", async () => {
    records = new FakeDistributionRecordRepository([handout(1, 500 as Cents)]);

    await endDistributionSession(deps());

    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toEqual({
      what: "distribution.session.ended",
      changedFields: ["startedAt", "endedAt", "groups"],
      when: new Date(ENDED),
      why: `startedAt=${STARTED}, groups=RED,BLUE, households=1, totalPaid=500`,
    });
  });

  it("refuses to end when no session is running", async () => {
    sessions = new FakeDistributionSessionRepository();

    await expect(endDistributionSession(deps())).rejects.toBeInstanceOf(
      NoDistributionSessionRunning,
    );
    expect(audit.entries).toHaveLength(0);
  });
});

describe("reopenDistributionSession", () => {
  let sessions: FakeDistributionSessionRepository;
  let audit: FakeAuditLog;

  beforeEach(() => {
    sessions = new FakeDistributionSessionRepository(
      session({ id: EARLIER_ID, endedAt: new Date("2026-01-01T17:00:00.000Z") }),
      session({ endedAt: new Date(ENDED) }),
    );
    audit = new FakeAuditLog();
  });

  function deps() {
    return { sessions, audit, clock: fakeClock(LATER) };
  }

  it("reopens the session that ended last, and records why", async () => {
    await reopenDistributionSession(deps(), {
      sessionId: RUNNING_ID,
      reason: "Zahlung nachtragen",
    });

    expect((await sessions.findRunning())?.id).toBe(RUNNING_ID);
    expect(audit.entries).toEqual([
      {
        what: "distribution.session.reopened",
        changedFields: ["endedAt"],
        when: new Date(LATER),
        why: "Zahlung nachtragen",
      },
    ]);
  });

  it("refuses to reopen a session with another one running", async () => {
    sessions = new FakeDistributionSessionRepository(session({ endedAt: new Date(ENDED) }), {
      id: 20,
      startedAt: new Date(LATER),
      endedAt: null,
      groups: createSessionGroups(["BLUE"]),
    });

    await expect(
      reopenDistributionSession(deps(), { sessionId: RUNNING_ID, reason: "Zahlung nachtragen" }),
    ).rejects.toBeInstanceOf(DistributionSessionNotReopenable);
    expect(audit.entries).toHaveLength(0);
  });

  it("refuses to reopen anything but the afternoon that ended last", async () => {
    await expect(
      reopenDistributionSession(deps(), { sessionId: EARLIER_ID, reason: "Zahlung nachtragen" }),
    ).rejects.toBeInstanceOf(DistributionSessionNotReopenable);
    expect((await sessions.findById(EARLIER_ID))?.endedAt).not.toBeNull();
  });

  it("refuses to reopen a session the register does not hold", async () => {
    await expect(
      reopenDistributionSession(deps(), { sessionId: 999, reason: "Zahlung nachtragen" }),
    ).rejects.toBeInstanceOf(DistributionSessionNotReopenable);
  });

  it("refuses a reopening with no reason", async () => {
    await expect(
      reopenDistributionSession(deps(), { sessionId: RUNNING_ID, reason: "   " }),
    ).rejects.toThrowError(new MissingAuditReason("distribution.session.reopened").message);
    expect((await sessions.lastEnded())?.endedAt).not.toBeNull();
    expect(audit.entries).toHaveLength(0);
  });
});

describe("readDistributionSessionState", () => {
  it("proposes the group that was not up last time when nothing is running", async () => {
    const sessions = new FakeDistributionSessionRepository(
      session({ id: EARLIER_ID, endedAt: new Date(ENDED), groups: createSessionGroups(["RED"]) }),
    );

    const state = await readDistributionSessionState({ sessions });

    expect(state.running).toBeNull();
    expect(state.lastEnded?.id).toBe(EARLIER_ID);
    expect(state.proposedGroups).toEqual(["BLUE"]);
  });

  it("preselects nothing before the first afternoon has ever taken place", async () => {
    const state = await readDistributionSessionState({
      sessions: new FakeDistributionSessionRepository(),
    });

    expect(state).toEqual({ running: null, lastEnded: null, proposedGroups: null });
  });

  it("reports the running session, and still proposes from the one before it", async () => {
    const sessions = new FakeDistributionSessionRepository(
      session({ id: EARLIER_ID, endedAt: new Date(ENDED), groups: createSessionGroups(["BLUE"]) }),
      session({ groups: createSessionGroups(["RED"]) }),
    );

    const state = await readDistributionSessionState({ sessions });

    expect(state.running?.id).toBe(RUNNING_ID);
    expect(state.proposedGroups).toEqual(["RED"]);
  });
});
