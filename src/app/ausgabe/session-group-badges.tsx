/**
 * Which group or groups an afternoon serves, named in words and wearing what the Kundenliste and a
 * customer's record wear — one colour means one thing application-wide
 * (`docs/guideline/ui_styling_guide.md` §12).
 *
 * A module of its own because three panels state the same afternoon: the counter's header, the
 * last-session card beside the start form, and the Start screen's running-session panel (US-34.9).
 */

import { Badge } from "@/components/ui/badge";
import type { SessionGroups } from "@/domain/distribution/session";
import { de } from "@/i18n/de";
import { cn } from "@/lib/utils";
import { GROUP_STYLES } from "../accents";

export function SessionGroupBadges({
  groups,
  testId,
  className,
}: {
  groups: SessionGroups;
  testId: string;
  /** The counter's header sets them a size larger (US-41.3). */
  className?: string;
}): React.ReactElement {
  return (
    <div data-testid={testId} className="flex flex-wrap items-center gap-2">
      {groups.map((group) => (
        <Badge key={group} variant="outline" className={cn(GROUP_STYLES[group], className)}>
          {de.distribution.colours[group]}
        </Badge>
      ))}
    </div>
  );
}
