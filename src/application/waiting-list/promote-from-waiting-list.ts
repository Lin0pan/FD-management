/**
 * Offer a waiting applicant the slot that has come free (US-12.2) — the step between the banner and
 * the registration form.
 *
 * It is a **read**. Nothing is written, nobody is registered and the applicant stays on the list:
 * what comes back is a registration form filled in from their entry, which staff check with the
 * person in front of them before anything is saved. Registering them — and only then taking them off
 * the list — is `registerFromWaitingList`'s.
 *
 * The applicant is named by id rather than taken from the head of the queue. The order is stated by
 * `listWaiting` and by the banner, which names the longest waiting applicant and no one else; what is
 * left open here is the one case DF has not yet decided — an expired certificate at the head, where
 * skipping to the next applicant is one of the answers on the table (PRD §9). Deciding it in code
 * would close it off before DF has chosen.
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
 * It carries two things the archived-record draft deliberately drops (US-11.2), and for the opposite
 * reason in each case: the **certificate**, because it was seen when the applicant joined and is
 * checked again here rather than being a lapsed copy of one nobody has looked at in years; and the
 * **contact note** as the record's notes, because it was written about these people while they waited
 * and is the most current thing DF knows about them. Both stay editable, like every other field.
 *
 * The household holds the applicant alone. DF does not ask who someone lives with until they are
 * registered (PRD §7), and the applicant is by definition a member of their own household — so the
 * form opens with the row it can fill in honestly and staff add the rest.
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
   * The number the applicant would take: the lowest free slot. Like the registration screen's own
   * proposal it is read, not reserved — the register may move on before the form is submitted, and
   * the database has the final say when the write lands (US-01.4).
   */
  readonly customerNumber: number;
  /**
   * Whether the certificate they joined with has lapsed while they waited. The registration is not
   * blocked by it: the screen warns first and staff ask for a renewal (FR-5).
   */
  readonly certificateExpired: boolean;
  readonly draft: WaitingListRegistrationDraft;
}

/**
 * Read the entry and hand back the offer.
 *
 * @throws {WaitingListEntryNotFound} if nobody is waiting under `entryId`.
 * @throws {NoFreeCustomerNumber} if every slot up to the quota is taken — the offer only exists
 *   because one came free, and a promotion into a full register would have nowhere to put anybody.
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
