/**
 * The distribution screen — the counter. Two questions: whether an Ausgabe is under way and whom it
 * serves (US-34.7); and may *this* person collect, for the number just typed (US-04.4).
 *
 * Nothing is computed here — `readDistributionSessionState` and `lookupCustomer` answer, this page
 * lays them out. The lookup is a read (FR-4), so a plain GET form carries the query in the URL, which
 * also means Enter reloads the page with the input empty and focused for the next customer.
 *
 * **Every counter read is behind the running session**: with none running there is nothing to record
 * against, so the lookup, the tally and the household's controls are not built at all — and the use
 * cases behind them refuse to answer anyway (US-34.5).
 *
 * The screen answers about *now* and nothing else (US-22): a `?datum=` still in someone's history is
 * deliberately inert rather than an error.
 */

import { CircleAlert, Search } from "lucide-react";
import Link from "next/link";
import { lookupCustomer, type CounterLookup } from "@/application/customers/lookup-customer";
import {
  readDistributionSessionState,
  type EndedSession,
  type RunningSession,
} from "@/application/distribution/read-distribution-session-state";
import {
  readGroupRoster,
  type GroupRosterView,
} from "@/application/distribution/read-group-roster";
import { readCertificateTypes } from "@/application/settings/read-certificate-types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { CertificateTypeList } from "@/domain/policy/certificateTypes";
import type { Verdict } from "@/domain/distribution/counterVerdict";
import { DomainError } from "@/domain/errors";
import { de } from "@/i18n/de";
import { germanDateTime, germanTime } from "@/i18n/format";
import { ArchiveControls } from "../kunden/archive-controls";
import { BlockControls } from "../kunden/block-controls";
import { CertificateControls } from "./certificate-controls";
import { CustomerDetails, VerdictBanner } from "./counter-lookup";
import { distributionDeps } from "./deps";
import { GroupProgressCard } from "./group-progress-card";
import { RECORD_REMOVED } from "./removed-flag";
import {
  ReopenSessionControls,
  RunningSessionControls,
  StartSessionForm,
} from "./session-controls";
import { SessionGroupBadges } from "./session-group-badges";
import { optionFor } from "./session-options";
import { HANDOUT_RECORDED } from "./served-flag";
import { ARCHIVED } from "../kunden/archived-flag";
import { ServeControls } from "./serve-controls";
import { Confirmation } from "../notice";
import { NoticeBoard } from "../notice-board";
import { SHELL } from "../shell";

/**
 * Whether a verdict permits recording a hand-out — only the two clear-to-serve outcomes, an expired
 * certificate serving and reminding (US-06). The use case re-checks before writing, so hiding the
 * button here is a courtesy, not the guard (FR-8).
 */
function permitsServing(verdict: Verdict): boolean {
  return verdict.kind === "CLEAR_TO_SERVE" || verdict.kind === "CLEAR_TO_SERVE_CERTIFICATE_EXPIRED";
}

/** A session is started and ended on another workstation too, so never cache this screen. */
export const dynamic = "force-dynamic";

/**
 * The afternoon (US-34.7). Two facts and no third: that an Ausgabe is under way, and which group
 * or groups it serves — a badge each, wearing what the Kundenliste and a customer's record wear, so
 * one colour means one thing application-wide.
 *
 * The groups cannot be changed while it runs, and nothing here says so: a control that is not on the
 * screen needs no sentence explaining its absence (`ui_styling_guide.md` §8).
 */
function SessionHeader({ running }: { running: RunningSession }): React.ReactElement {
  return (
    <Card data-testid="session-header">
      {/* `text-base` against the `Card`'s own 14px: this is read at a glance from standing, not from
          a chair like the admin tables the default is tuned for. */}
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-base font-medium">{de.distribution.session.running}</p>
          <SessionGroupBadges groups={running.session.groups} testId="session-groups" />
          {/* One of the two ways to the afternoons already held (US-37.3), which have no item in
              the nav bar. Borderless and pushed to the far edge: it navigates, and it must not read
              as a third thing to do to the afternoon under way. */}
          <Button variant="ghost" asChild className="ml-auto">
            <Link href="/ausgabetermine" data-testid="session-past-link">
              {de.distribution.pastSessions.link}
            </Link>
          </Button>
        </div>
        <RunningSessionControls summary={running.summary} canDiscard={running.canDiscard} />
      </CardContent>
    </Card>
  );
}

/**
 * What the afternoon before this one came to, the second of the two jobs the screen has between
 * afternoons (US-34.8) — the first being the start form above it.
 *
 * It is here that a session nobody ended is noticed: one that ran through the night says so in its
 * two instants. The reopening stands beside it because this is the only screen it is ever reached
 * from, and it is offered by the state's own answer rather than by this branch happening to be the
 * one where nothing runs.
 */
function LastSessionCard({ ended }: { ended: EndedSession }): React.ReactElement {
  const words = de.distribution.session.last;
  return (
    <Card data-testid="last-session">
      <CardHeader>
        <CardTitle className="text-lg">
          <h2>{words.heading}</h2>
        </CardTitle>
        {/* The other way to the afternoons already held: this card answers what the last one came
            to, and the list is where the same question about the one before it is answered. */}
        <CardAction>
          <Button variant="ghost" asChild>
            <Link href="/ausgabetermine" data-testid="last-session-past-link">
              {de.distribution.pastSessions.link}
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <SessionGroupBadges groups={ended.session.groups} testId="last-session-groups" />
        <div className="flex flex-col gap-1">
          <p data-testid="last-session-started">
            {words.startedAt(germanDateTime(ended.session.startedAt))}
          </p>
          {/* `endedAt` is non-null on every session the store reports as the last *ended* one; the
              guard is how that is said without an assertion. */}
          {ended.session.endedAt === null ? null : (
            <p data-testid="last-session-ended">
              {words.endedAt(germanDateTime(ended.session.endedAt))}
            </p>
          )}
          <p data-testid="last-session-summary">
            {words.summary(ended.summary.households, ended.summary.totalPaidCents)}
          </p>
        </div>
        {ended.canReopen ? <ReopenSessionControls sessionId={ended.session.id} /> : null}
      </CardContent>
    </Card>
  );
}

/**
 * A German sentence explaining why the screen has no answer — never a verdict, which has its own
 * painted banner. Either the installation is missing something or what was typed is not a number.
 */
function ErrorNote({ message, testId }: { message: string; testId: string }): React.ReactElement {
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertDescription data-testid={testId} className="max-w-prose">
        {message}
      </AlertDescription>
    </Alert>
  );
}

/** The counter answer for a typed number, or the German sentence explaining why there is none. */
type CounterResult =
  | { readonly lookup: CounterLookup; readonly error: null }
  | { readonly lookup: null; readonly error: string };

/**
 * The verdict for a typed number, or `null` when nothing was typed. Only a number that is not a
 * number is caught — an unassigned one is `NOT_FOUND`, an answer rather than a failure — and anything
 * else is a fault of the installation and belongs on the error screen.
 */
async function lookUpNumber(raw: string | string[] | undefined): Promise<CounterResult | null> {
  if (typeof raw !== "string" || raw.trim() === "") {
    return null;
  }
  try {
    return { lookup: await lookupCustomer(distributionDeps, raw), error: null };
  } catch (error: unknown) {
    if (error instanceof DomainError && error.code === "InvalidCardNumber") {
      return { lookup: null, error: de.distribution.counter.errors.notANumber };
    }
    throw error;
  }
}

/** The four facts the confirmation of a recorded hand-out states, or `null` when there is none. */
interface RecordedHandout {
  readonly customerNumber: number;
  readonly name: string;
  readonly paidCents: number;
  readonly time: string;
}

/**
 * What was just booked for the household `?erfasst=` names, **read back rather than carried**: the
 * redirect hands over the customer number and nothing else, so every figure comes out of the store
 * through the lookup this screen already makes. A confirmation built from values carried through a
 * URL would go on stating a hand-out a second tab had since corrected.
 *
 * Anything the number does not resolve to is `null` and silent — a parameter this screen cannot read
 * is inert rather than an error (US-32.7).
 */
async function recordedHandout(
  raw: string | string[] | undefined,
): Promise<RecordedHandout | null> {
  const result = await lookUpNumber(raw);
  if (result === null || result.lookup === null) {
    return null;
  }
  const { customer, sessionRecord } = result.lookup;
  if (customer === null || sessionRecord === null) {
    return null;
  }
  return {
    customerNumber: customer.customerNumber,
    name: `${customer.firstName} ${customer.lastName}`,
    paidCents: sessionRecord.paidCents,
    time: germanTime(sessionRecord.at),
  };
}

/**
 * Everything the counter is built from, or `null` between afternoons — the running session is in it,
 * so the screen guards **once**: there is no state in which the lookup is known and the session is
 * not, and a second test would say there were.
 */
interface CounterReads {
  readonly running: RunningSession;
  readonly counter: CounterResult | null;
  readonly roster: GroupRosterView;
  readonly recorded: RecordedHandout | null;
  readonly certificateTypes: CertificateTypeList;
}

/** No back-link: the nav bar reaches Start from every screen (US-17.4). */
function PageHeader(): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-3xl font-semibold tracking-tight">{de.distribution.heading}</h1>
    </div>
  );
}

export default async function DistributionPage({
  searchParams,
}: {
  searchParams: Promise<{
    nummer?: string | string[];
    [HANDOUT_RECORDED]?: string | string[];
    [RECORD_REMOVED]?: string | string[];
    [ARCHIVED]?: string | string[];
  }>;
}): Promise<React.ReactElement> {
  const params = await searchParams;
  const { nummer } = params;
  const recordRemoved = params[RECORD_REMOVED] === "1";
  // `nummer` wins: while a household is being looked up, a confirmation about the previous one has
  // nothing to do with the screen. It stands until the next lookup and no longer.
  const lookingUp = typeof nummer === "string" && nummer.trim() !== "";
  const justArchived = params[ARCHIVED] === "1";

  // The afternoon first, because everything below it is only built while one runs.
  const session = await readDistributionSessionState(distributionDeps);

  let counterReads: CounterReads | null = null;

  if (session.running !== null) {
    try {
      // The roster is independent of the lookup — it asks who the session serves, not who this
      // number is — so it must not be sequenced behind it.
      const [counter, roster, recorded, certificateTypes] = await Promise.all([
        lookUpNumber(nummer),
        readGroupRoster(distributionDeps),
        recordedHandout(lookingUp ? undefined : params[HANDOUT_RECORDED]),
        readCertificateTypes(distributionDeps),
      ]);
      counterReads = { running: session.running, counter, roster, recorded, certificateTypes };
    } catch (error: unknown) {
      // An installation with no policy in force at all: the lookup prices a household and cannot.
      // Every other domain error from these reads is a fault, and belongs on the error screen.
      if (error instanceof DomainError && error.code === "NoSettingsInForce") {
        return (
          <main className={SHELL}>
            <PageHeader />
            <Card>
              <CardContent className="flex flex-col items-start gap-4">
                <ErrorNote message={de.distribution.errors.noSettings} testId="settings-missing" />
                <Button asChild>
                  <Link href="/einstellungen">{de.home.settingsLink}</Link>
                </Button>
              </CardContent>
            </Card>
          </main>
        );
      }
      throw error;
    }
  }

  // What the two confirmations above the header read. Both are silent between afternoons: there is
  // no lookup to name a household with, and nothing was recorded at a session that is not running.
  const recorded = counterReads?.recorded ?? null;
  const counter = counterReads?.counter ?? null;

  return (
    // Six write controls stand here. One answer at a time, so a confirmation from the household
    // before this one cannot be read as this one's (`notice-board.tsx`).
    <NoticeBoard>
      <main className={SHELL}>
        <PageHeader />

        {/* The hand-out that just happened, stated at the top of the empty screen the write
          navigates to (US-32.7). It has to name the household, because they are no longer on the
          screen: the number and the name say who, the amount and the time say what was booked. The
          balance is deliberately left out — a household that still owes money is not something to
          be told about after they have left the counter; „Korrigieren“ leads back to the screen
          that states it. The rising group tally below is the standing evidence the write
          landed. */}
        {recorded === null ? null : (
          <Confirmation
            text={de.distribution.serve.recorded(
              recorded.customerNumber,
              recorded.name,
              recorded.paidCents,
              recorded.time,
            )}
            testId="serve-recorded-confirmation"
          >
            {" "}
            <Link
              href={`/ausgabe?nummer=${recorded.customerNumber}`}
              data-testid="serve-recorded-correct"
            >
              {de.distribution.serve.correctRecorded}
            </Link>
          </Confirmation>
        )}

        {/* At the top of the screen rather than beside the button that was pressed, which is the rule
          everywhere else on this page. The removal navigates — it has to, because it destroys the
          card the answer would have stood in — and a navigation lands at the top, so this is where
          the eye already is. Above the session header: it is about what just happened, and the
          header is about the afternoon. */}
        {recordRemoved ? (
          <Confirmation
            text={de.distribution.serve.correct.removed}
            testId="serve-removed-confirmation"
          />
        ) : null}

        {/* The archive is offered at the foot of this screen too, and lands back here rather than on
          the record: the queue is what the staff member has to get back to. The number comes off the
          lookup that is still on screen — an archived household still resolves, so the counter can
          still name whose slot came free. */}
        {justArchived &&
        counter !== null &&
        counter.lookup !== null &&
        counter.lookup.customer !== null ? (
          <Confirmation
            text={de.customers.archive.saved(counter.lookup.customer.customerNumber)}
            testId="archive-saved"
          />
        ) : null}

        {counterReads === null ? (
          /* Between afternoons the screen has two jobs: start the next afternoon and say what the
             last one did (US-34.7, US-34.8). The counter lookup and the group tally are not
             offered, there being nothing to record against — and a `?nummer=` left in the URL is
             inert for the same reason, never an error. */
          <>
            <StartSessionForm
              proposed={session.proposedGroups === null ? null : optionFor(session.proposedGroups)}
            />
            {session.lastEnded === null ? null : <LastSessionCard ended={session.lastEnded} />}
          </>
        ) : (
          <>
            <SessionHeader running={counterReads.running} />

            {/* How far through the group the afternoon is (US-23), between the session header and the
          counter: it is a fact about the afternoon, like the header, and it must be readable without
          scrolling past the field staff type into. The group(s) it names are the running
          session's.

          Keyed by the number looked up, because a `<details>` keeps `open` through any re-render and
          only a remount closes it (`docs/guideline/ui_styling_guide.md` §6): clicking a name in the list is a
          soft navigation, so without the key the household's verdict would arrive underneath a
          hundred rows the staff member has to scroll past. */}
            <GroupProgressCard
              key={typeof nummer === "string" ? nummer : ""}
              roster={counterReads.roster}
            />

            {/* The counter loop, keyboard only: type the number, press Enter, read the verdict. The form
          navigates, so the input comes back empty and — being autofocused — ready for the next
          customer without touching the mouse. A native `<label>` rather than the shadcn one: this
          form is deliberately server-rendered with no client component, and Radix's label would drag
          a client boundary onto the counter's critical path for nothing.

          No hint under the heading. It used to spell out the two formats and say to press Enter, on
          every lookup of every afternoon, for a field that is labelled, autofocused and the only one
          on the screen. The formats are worth stating at the one moment they are not obvious — a
          mistyped entry — and `errors.notANumber` states them there. */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  <h2>{de.distribution.counter.heading}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <form method="get" className="flex flex-wrap items-end gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="counter-input" className="text-sm font-medium">
                      {de.distribution.counter.label}
                    </label>
                    <Input
                      // Keyed on the hand-out just recorded, and that is what re-focuses the field. A
                      // `redirect` out of a server action is a *soft* navigation: React reconciles an
                      // input that is already in the tree, so `autoFocus` — which only fires on mount —
                      // would not fire again and the cursor would be left nowhere. The lookup form's
                      // own GET submit is a full document navigation and never needed this. The key
                      // changes exactly when a hand-out lands, so nothing else remounts the field.
                      key={recorded === null ? "" : String(recorded.customerNumber)}
                      // Not `type="number"`: a card number carries a `k`, and a spinner has no meaning here.
                      type="text"
                      name="nummer"
                      id="counter-input"
                      inputMode="numeric"
                      autoComplete="off"
                      autoFocus
                      data-testid="counter-input"
                      className="h-12 w-44 text-2xl tabular-nums md:text-2xl"
                    />
                  </div>
                  <Button type="submit" size="lg" className="h-12 px-6">
                    <Search aria-hidden="true" data-icon="inline-start" />
                    {de.distribution.counter.submit}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {counter === null ? null : counter.lookup === null ? (
              <ErrorNote message={counter.error} testId="counter-error" />
            ) : (
              <>
                <VerdictBanner verdict={counter.lookup.verdict} />
                {/* One guard, not two. `customer` and `customerId` are null on exactly the same
                NOT_FOUND branch — `lookupCustomer` says so where it defines `CounterLookup` — so
                testing them separately said there were cases where a household has an id but no
                details, and there are none. Both are narrowed here because `CustomerDetails` now
                needs the id, and a non-null assertion is not an option. The banner stays outside:
                a number nobody holds still gets a verdict. */}
                {counter.lookup.customer === null || counter.lookup.customerId === null ? null : (
                  <>
                    <CustomerDetails
                      customer={counter.lookup.customer}
                      customerId={counter.lookup.customerId}
                    />
                    {/* Keyed by customer so a confirmation from one lookup cannot survive into the
                    next customer's screen; within one customer the state rides out revalidation,
                    which is what keeps the renewal confirmation visible once the certificate
                    reads as valid again. */}
                    {/* `customer.certificateExpired`, and deliberately not the verdict kind it used to
                    be compared against. Since US-32 an already-collected household answers
                    ALREADY_SERVED, which outranks CLEAR_TO_SERVE_CERTIFICATE_EXPIRED — so
                    reading the reminder controls off the verdict would make them vanish the moment
                    the household was served, on the very re-lookup a staff member does to correct
                    the record. Whether the certificate has lapsed is a fact about the household;
                    `lookupCustomer` derives it at the same instant the verdict is evaluated. */}
                    <CertificateControls
                      key={counter.lookup.customerId}
                      customerId={counter.lookup.customerId}
                      expired={counter.lookup.customer.certificateExpired}
                      reminderLoggedInSession={counter.lookup.reminderLoggedInSession}
                      certificateTypes={counterReads.certificateTypes}
                    />
                    {/* Every figure the payment turns on comes off the lookup, derived there from the
                    household's own hand-out history (US-29.5). Nothing about money is worked out on
                    this page: it hands the amounts down and the controls render them. */}
                    <ServeControls
                      customerId={counter.lookup.customerId}
                      customerNumber={counter.lookup.customer.customerNumber}
                      canServe={permitsServing(counter.lookup.verdict)}
                      amountToPayCents={counter.lookup.customer.amountToPayCents}
                      balanceCents={counter.lookup.customer.balanceCents}
                      lookedUpNumber={typeof nummer === "string" ? nummer : ""}
                      sessionRecord={
                        counter.lookup.sessionRecord === null
                          ? null
                          : {
                              recordId: counter.lookup.sessionRecord.recordId,
                              time: germanTime(counter.lookup.sessionRecord.at),
                              paidCents: counter.lookup.sessionRecord.paidCents,
                              askedCents: counter.lookup.sessionRecord.askedCents,
                              balanceWithoutRecordCents:
                                counter.lookup.sessionRecord.balanceWithoutRecordCents,
                            }
                      }
                    />
                    {/* Blocking and archiving are offered here because the reasons for both show up at
                    the counter: the certificate still expired after several reminders, the no-show
                    run above (FR-2), and whatever a household does in front of the person serving
                    them. US-08.4 shipped the block controls on the record only, which left a staff
                    member who had decided at the counter with no route off this screen (US-16.5).
                    Both are the same closed disclosures as on the record, last on the screen and
                    never a prompt: the queue must not have to dismiss anything to get the next
                    customer served (PRD §6). Keyed by customer, like the certificate controls, so
                    nothing typed about one household survives into the next lookup. Still the
                    pre-shadcn disclosures: they are shared with the customer record, so restyling
                    them is that screen's change, not this one's.

                    In a card, because everything else after a lookup is one and these two used to
                    float against the page like something left over. The heading is the record's
                    own — the same two acts, offered from a different screen, and a second wording
                    of one fact is how two screens come to disagree. It is read from
                    `customers.record` rather than copied into `distribution`, which is the same
                    call `cardsDue` makes for the reissue words. No hint paragraph and no `<h3>`
                    per control: the record needs those to tell three controls apart, and here each
                    `<summary>` names itself. */}
                    <Card>
                      <CardHeader>
                        <CardTitle>
                          <h2>{de.customers.record.dangerHeading}</h2>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-3">
                        <BlockControls
                          key={`block-${counter.lookup.customerId}`}
                          customerId={counter.lookup.customerId}
                          status={counter.lookup.customer.status}
                          blockReason={counter.lookup.customer.blockReason}
                        />
                        <ArchiveControls
                          key={counter.lookup.customerId}
                          customerId={counter.lookup.customerId}
                          customerNumber={counter.lookup.customer.customerNumber}
                          status={counter.lookup.customer.status}
                          returnTo={`/ausgabe?nummer=${encodeURIComponent(
                            typeof nummer === "string" ? nummer : "",
                          )}`}
                        />
                      </CardContent>
                    </Card>
                  </>
                )}
              </>
            )}
          </>
        )}
      </main>
    </NoticeBoard>
  );
}
