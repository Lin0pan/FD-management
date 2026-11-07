import { TableCell } from "@/components/ui/table";
import { de } from "@/i18n/de";
import { ROW_TEXT, typedAge } from "./household-row";

/**
 * A household row's Alter cell, as both household tables show it: the age the typed birthdate gives
 * as of `today`, or „—" while {@link typedAge} has none. One component for both, for
 * `household-row.ts`'s reason.
 */
export function AgeCell({
  index,
  birthDate,
  today,
}: {
  index: number;
  birthDate: string;
  today: Date;
}): React.ReactElement {
  const age = typedAge(birthDate, today);
  return (
    <TableCell
      className="align-top whitespace-nowrap tabular-nums"
      data-testid={`member-age-${index}`}
    >
      <div className={ROW_TEXT}>{age === null ? "—" : de.customers.card.memberAge(age)}</div>
    </TableCell>
  );
}
