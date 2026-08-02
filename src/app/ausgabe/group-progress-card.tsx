/**
 * How far through today's group the counter is, and who is still missing (US-23).
 *
 * Two questions staff have all afternoon, both unanswerable from a screen that speaks about one
 * household at a time: *how many of today's group have collected*, and *who has not yet*. The first
 * is the summary and is readable without any interaction (§FR-1); the second is folded behind it,
 * because a hundred-odd rows between the banner and the number field would be a lot of screen for a
 * question staff ask twice an afternoon.
 *
 * Three things about the shape are deliberate:
 *
 * - **A `<details>`, never a `Dialog`.** At the counter the queue is waiting, so nothing may have to
 *   be dismissed before the next customer is served (`docs/ui_conversion_guide.md` rule 4). It is
 *   also what keeps this a server component: the fold is the browser's, so 120 links cross no client
 *   boundary.
 * - **No group tint.** The banner directly above already carries the group's colour, and 120 tinted
 *   rows would be texture rather than emphasis. The group is named in words in the summary, which is
 *   the way round US-03.4 asks for anyway.
 * - **Only the served rows are marked**, and blocked ones say so in the words `/kunden` already uses.
 *   The unserved are the default state and get their name and nothing else — chrome marks the
 *   exception (`docs/ui_conversion_guide.md`).
 *
 * Nothing here is a second place to serve someone: a row navigates, exactly as typing the number
 * does, and the verdict and the serve control stay where they are (§FR-7).
 */

import Link from "next/link";
import type { GroupRosterView } from "@/application/distribution/read-group-roster";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { de } from "@/i18n/de";
import { STATUS_CHROME, StateWord } from "../kunden/state-word";

/** The summary reads as the card's header, so — unlike a control — it is never `w-fit`. */
const SUMMARY = "cursor-pointer list-none [&::-webkit-details-marker]:hidden";

/**
 * The mark on a served household. `outline` rather than a colour of its own: having collected is a
 * plain fact about the afternoon, not a warning, and the only other badge in this list is the block.
 */
const SERVED_CHROME = { variant: "outline" } as const;

/**
 * One household of the group: their number and name as one link, and their state after it.
 *
 * The number and the name sit *inside* the link so the accessible name is "312 Ada Lovelace" — what
 * a staff member would say out loud — rather than a bare name a screen reader cannot place in the
 * column of numbers. `gesperrt` is the same word, the same badge and the same module `/kunden` marks
 * a blocked household with; one meaning gets one treatment across the application.
 */
function MemberRow({ member }: { member: GroupRosterView["members"][number] }): React.ReactElement {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-0.5">
      <Link
        href={`/ausgabe?nummer=${member.customerNumber}`}
        data-testid={`group-member-${member.customerNumber}`}
        className="hover:underline focus-visible:underline"
      >
        <span className="tabular-nums text-muted-foreground">{member.customerNumber}</span>{" "}
        <span>
          {member.firstName} {member.lastName}
        </span>
      </Link>
      {member.blocked ? (
        <StateWord
          word={de.customers.status.BLOCKED}
          testId={`blocked-${member.customerNumber}`}
          chrome={STATUS_CHROME.BLOCKED}
        />
      ) : null}
      {member.servedToday ? (
        <StateWord
          word={de.distribution.progress.served}
          testId={`served-${member.customerNumber}`}
          chrome={SERVED_CHROME}
        />
      ) : null}
    </li>
  );
}

export function GroupProgressCard({
  roster,
  groupName,
}: {
  roster: GroupRosterView;
  /** The group in words — `Gruppe Rot`, as the banner and the walk hint say it. */
  groupName: string;
}): React.ReactElement {
  const words = de.distribution.progress;

  // A group with nobody in it says so. A disclosure that opens onto an empty list would invite a
  // click to find out that there is nothing to find out.
  if (roster.isEmpty) {
    return (
      <Card>
        <CardContent data-testid="group-progress">{words.empty(groupName)}</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      {/* `group` so the affordance beside the tally can name the *other* state — the fold is the
          browser's, the page is a server component, and `group-open:` is the only thing here that
          knows whether the list is open. The hidden word is out of the accessibility tree, so the
          summary is announced with one of the two and never both. */}
      <details className="group">
        <summary className={SUMMARY}>
          {/* Two columns rather than the header's default stack: the fold's affordance belongs on
              the same line as the tally, and every line this card takes is a line the verdict below
              it loses (§FR-10). */}
          <CardHeader className="grid-cols-[1fr_auto] items-center">
            <CardTitle data-testid="group-progress">
              {words.summary(groupName, roster.progress.served, roster.progress.expected)}
            </CardTitle>
            <span className="text-sm text-muted-foreground">
              <span className="group-open:hidden">{words.open}</span>
              <span className="hidden group-open:inline">{words.close}</span>
            </span>
          </CardHeader>
        </summary>
        {/* The list scrolls inside its own box: a group is ~120 households, and pushing the number
            field off the bottom of the screen is exactly what opening this must not do. Columns from
            `sm` up, because a single column of 120 names is a scroll rather than a scan. */}
        <CardContent className="mt-(--card-spacing) max-h-72 overflow-y-auto">
          <ul className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
            {roster.members.map((member) => (
              <MemberRow key={member.customerId} member={member} />
            ))}
          </ul>
        </CardContent>
      </details>
    </Card>
  );
}
