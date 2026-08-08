/**
 * Move a customer between the RED and BLUE halves of the distribution cycle (US-16.4).
 *
 * The two groups collect in alternating weeks, so they have to stay roughly equal in size — a
 * lopsided split overwhelms the volunteers one week and wastes the food collected for the other.
 * Registration proposes the smaller group (`suggestGroup`), but the register drifts as households
 * are archived and added, and this is how staff correct it.
 *
 * The change is in force **immediately**, including for today: the counter derives its verdict from
 * the group column every time it is asked (US-04), so a household moved to RED on a RED distribution
 * day is servable the same afternoon with nothing to re-run. That is a consequence of deriving
 * rather than a feature implemented here, and the test says so by asking the real counter.
 *
 * What does *not* follow automatically is the card: it prints the group, so the household is left
 * carrying a piece of paper naming the wrong week. That is the one thing this use case makes stale,
 * and the cards-due list (US-13.2) derives it on its next read with reason `GROUP_CHANGE` — nothing
 * is enqueued, and there is nothing to forget.
 *
 * It returns the resulting group sizes because the decision it serves is a comparison: staff move
 * somebody *in order to* balance the register, and the answer to "did that help" is the two numbers
 * afterwards. Counting them here rather than on the screen keeps the figure the caller sees the one
 * the write produced.
 */

import { CustomerArchived, CustomerNotFound, GroupUnchanged } from "@/domain/errors";
import type { Group, GroupCounts } from "@/domain/customer/group";
import type { AuditLog, Clock, CustomerRepository } from "../ports";

/** The audit event name every group move is recorded under. */
const GROUP_CHANGED = "customer.groupChanged";

/**
 * What the audit entry names as changed.
 *
 * One field, and no `why`: the group is the whole of what moved, and unlike a block or an archive
 * it turns on no judgement about the household — it is arithmetic about the register's balance
 * (docs/architecture/adr/006-record-what-when-and-why-in-the-audit-log-never-who.md, and the root CLAUDE.md rule that a reason is
 * required only where it is the record).
 */
const GROUP_FIELDS = ["group"] as const;

export interface ChangeGroupDeps {
  readonly customers: CustomerRepository;
  readonly audit: AuditLog;
  readonly clock: Clock;
}

export interface ChangeGroupInput {
  readonly customerId: number;
  /** The group the customer should be in afterwards — never a direction to toggle. */
  readonly group: Group;
}

/**
 * Move the customer, write the audit trail and report where the register now stands.
 *
 * A **blocked** customer may be moved: a block pauses them at the counter and does not freeze their
 * record, and balancing the two groups is FD's business rather than the household's. An **archived**
 * one may not — their record is read-only (PRD §FR-8) and they hold no place in either group, so
 * moving them would change a balance they are not part of.
 *
 * @returns how many **active** customers each group holds once the move has landed.
 * @throws {CustomerNotFound} if no customer holds `customerId`.
 * @throws {CustomerArchived} if the customer has left the register.
 * @throws {GroupUnchanged} if they are already in that group.
 */
export async function changeGroup(
  deps: ChangeGroupDeps,
  { customerId, group }: ChangeGroupInput,
): Promise<GroupCounts> {
  const now = deps.clock.now();

  const customer = await deps.customers.findById(customerId);
  if (customer === null) {
    throw new CustomerNotFound(customerId);
  }
  if (customer.status === "ARCHIVED") {
    throw new CustomerArchived(customerId);
  }
  if (customer.group === group) {
    throw new GroupUnchanged(group);
  }

  await deps.customers.setGroup(customerId, group);
  await deps.audit.append({
    what: GROUP_CHANGED,
    changedFields: [...GROUP_FIELDS],
    when: now,
    why: "",
  });

  // Counted after the write, so the caller is told where the register stands and not where it stood
  // a moment ago — the numbers are the point of the answer.
  return deps.customers.groupCounts();
}
