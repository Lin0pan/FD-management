/**
 * Offer a waiting applicant the slot that has come free (US-12.2) — the step between the banner and
 * the registration form.
 *
 * A **read**: the applicant stays on the list, and registering them is `registerFromWaitingList`'s.
 *
 * The applicant is named by id rather than taken from the head of the queue, because DF has not yet
 * decided what to do about an expired certificate there — skipping to the next applicant is one of
 * the answers on the table (PRD §9), and deciding it in code would close it off.
 */

import type { NeedsCertificate } from "@/domain/customer/customer";
import { isExpired } from "@/domain/customer/certificate";
import { lowestFreeNumber } from "@/domain/customer/customerNumber";
import { WaitingListEntryNotFound } from "@/domain/errors";
import type { RegistrationDraft } from "../customers/draft-from-archived";
import type {
  Clock,
  CustomerRepository,
  SettingsRepository,
  WaitingListRepository,
} from "../ports";
import { readCurrentSettings } from "../settings/read-current-settings";

export interface PromoteFromWaitingListDeps {
  readonly waitingList: WaitingListRepository;
  readonly customers: CustomerRepository;
  readonly settings: SettingsRepository;
  readonly clock: Clock;
}

export interface PromoteFromWaitingListInput {
  readonly entryId: number;
}

/**
 * A registration form filled in from a waiting-list entry.
 *
 * It carries two things the archived-record draft drops (US-11.2), for the opposite reason in each
 * case: the **certificate**, seen when the applicant joined rather than a lapsed copy nobody has
 * looked at in years, and the **contact note** as the notes, the most current thing DF knows.
 *
 * The household holds the applicant alone — DF does not ask who someone lives with until they are
 * registered (PRD §7), so the form opens with the one row it can fill in honestly.
 */
export interface WaitingListRegistrationDraft extends RegistrationDraft {
  readonly certificate: NeedsCertificate;
  readonly notes: string;
}

/** The offer: who, which slot, and whether their certificate held out. */
export interface Promotion {
  /** The entry this offer came from — what `registerFromWaitingList` is handed back. */
  readonly entryId: number;
  /**
   * The lowest free slot — read, not reserved, like the registration screen's own proposal. The
   * database has the final say when the write lands (US-01.4).
   */
  readonly customerNumber: number;
  /** Whether their certificate lapsed while they waited — a warning, never a block (FR-5). */
  readonly certificateExpired: boolean;
  readonly draft: WaitingListRegistrationDraft;
}

/**
 * Read the entry and hand back the offer.
 *
 * @throws {WaitingListEntryNotFound} if nobody is waiting under `entryId`.
 * @throws {NoFreeCustomerNumber} if every slot up to the quota is taken.
 * @throws {NoSettingsInForce} if the database was never seeded.
 */
export async function promoteFromWaitingList(
  deps: PromoteFromWaitingListDeps,
  { entryId }: PromoteFromWaitingListInput,
): Promise<Promotion> {
  const today = deps.clock.now();

  const entry = await deps.waitingList.findWaiting(entryId);
  if (entry === null) {
    throw new WaitingListEntryNotFound(entryId);
  }

  const settings = await readCurrentSettings({ settings: deps.settings, clock: deps.clock });
  const takenNumbers = await deps.customers.takenActiveNumbers();

  return {
    entryId,
    customerNumber: lowestFreeNumber(takenNumbers, settings.quotaN),
    certificateExpired: isExpired(entry.certificate, today),
    draft: {
      firstName: entry.firstName,
      lastName: entry.lastName,
      birthDate: entry.birthDate,
      address: entry.address,
      certificate: entry.certificate,
      householdMembers: [
        {
          firstName: entry.firstName,
          lastName: entry.lastName,
          birthDate: entry.birthDate,
        },
      ],
      notes: entry.contactNote,
    },
  };
}
