"use server";

/**
 * The write actions of the afternoon itself (`tasks/prd-us-34-distribution-session.md` §US-34.7):
 * start it, end it, throw an empty one away. Each reads the form, calls one use case and turns a
 * typed domain error into a German sentence — every rule about *whether* the act is allowed lives in
 * the use cases and, for „one at a time", in the database's own index (US-34.3).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { discardDistributionSession } from "@/application/distribution/discard-distribution-session";
import { endDistributionSession } from "@/application/distribution/end-distribution-session";
import { startDistributionSession } from "@/application/distribution/start-distribution-session";
import {
  DistributionSessionAlreadyRunning,
  DistributionSessionNotEmpty,
  MissingRequiredField,
  NoDistributionSessionRunning,
} from "@/domain/errors";
import { de } from "@/i18n/de";
import { tierOf } from "../notice-tier";
import { counterActionDeps } from "./deps";
import { GROUP_OPTIONS, GROUP_OPTIONS_IN_ORDER } from "./session-options";
import type { SessionActionState } from "./session-state";

/** What the radio group sends: one of the three options, never a list of groups (US-34.7). */
const groupsField = z.enum(GROUP_OPTIONS_IN_ORDER);

/** Start the afternoon. The chosen groups are the form's only field. */
export async function startSessionAction(
  _previous: SessionActionState,
  formData: FormData,
): Promise<SessionActionState> {
  const chosen = groupsField.safeParse(String(formData.get("groups") ?? ""));
  if (!chosen.success) {
    return {
      status: "error",
      message: de.distribution.session.start.errors.noGroup,
      tier: tierOf(new MissingRequiredField("groups")),
    };
  }

  try {
    await startDistributionSession(counterActionDeps, { groups: GROUP_OPTIONS[chosen.data] });
  } catch (error: unknown) {
    return {
      status: "error",
      message:
        error instanceof DistributionSessionAlreadyRunning
          ? de.distribution.session.start.errors.alreadyRunning
          : de.distribution.session.start.errors.unknown,
      tier: tierOf(error),
    };
  }
  revalidatePath("/ausgabe");
  return { status: "idle" };
}

/**
 * End the afternoon. The summary the use case returns is not carried back: ending replaces this
 * screen with the one that states what the session came to, so a sentence here would be the same
 * figures twice.
 */
export async function endSessionAction(): Promise<SessionActionState> {
  try {
    await endDistributionSession(counterActionDeps);
  } catch (error: unknown) {
    return {
      status: "error",
      message:
        error instanceof NoDistributionSessionRunning
          ? de.distribution.session.end.errors.notRunning
          : de.distribution.session.end.errors.unknown,
      tier: tierOf(error),
    };
  }
  revalidatePath("/ausgabe");
  return { status: "idle" };
}

/** Throw an empty afternoon away. Nothing is written down about it (FR-7). */
export async function discardSessionAction(): Promise<SessionActionState> {
  try {
    await discardDistributionSession(counterActionDeps);
  } catch (error: unknown) {
    return { status: "error", message: discardMessage(error), tier: tierOf(error) };
  }
  revalidatePath("/ausgabe");
  return { status: "idle" };
}

/** Why the afternoon could not be thrown away — it has been served at, or it is no longer running. */
function discardMessage(error: unknown): string {
  if (error instanceof DistributionSessionNotEmpty) {
    return de.distribution.session.discard.errors.notEmpty;
  }
  if (error instanceof NoDistributionSessionRunning) {
    return de.distribution.session.discard.errors.notRunning;
  }
  return de.distribution.session.discard.errors.unknown;
}
