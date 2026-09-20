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
import { GROUP_STYLES } from "../accents";

export function SessionGroupBadges({
  groups,
  testId,
}: {
  groups: SessionGroups;
  testId: string;
}): React.ReactElement {
  return (
    <div data-testid={testId} className="flex flex-wrap items-center gap-2">
      {groups.map((group) => (
        <Badge key={group} variant="outline" className={GROUP_STYLES[group]}>
          {de.distribution.colours[group]}
        </Badge>
      ))}
    </div>
  );
}
