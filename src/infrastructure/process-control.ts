import { randomUUID } from "node:crypto";
import type { ProcessControl } from "@/application/ports";

/** Long enough for the server action's answer to be written to the browser. */
const GRACE_MS = 1500;

/** The code `scripts/start.mjs` restarts on; the two must agree. */
const RESTART_EXIT_CODE = 75;

const bootId = randomUUID();
const supervised = process.env.FD_SUPERVISED === "1";

export const nodeProcessControl: ProcessControl = {
  bootId,
  supervised,
  restartSoon: () => {
    setTimeout(() => {
      console.info(
        supervised
          ? "FD-Management: a restore is staged; restarting so the start swaps it in."
          : "FD-Management: a restore is staged; stopping. Start the software again to swap it in.",
      );
      process.exit(RESTART_EXIT_CODE);
    }, GRACE_MS);
  },
};
