/** Polled by the settings screen while the software restarts after a restore has been staged. */

import { readRestoreStatus } from "@/application/backup/read-restore-status";
import { backupDeps } from "../../deps";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json(await readRestoreStatus(backupDeps), {
    headers: { "Cache-Control": "no-store" },
  });
}
