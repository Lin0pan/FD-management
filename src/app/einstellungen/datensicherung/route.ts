/**
 * „Jetzt sichern" — a POST, so nothing that prefetches or replays a GET can take a backup. The body
 * is the register itself, handed to the browser as a download (Safari saves it to „Downloads“ or
 * asks where, depending on its own settings).
 */

import { createBackup } from "@/application/backup/create-backup";
import { backupDeps } from "../deps";

export async function POST(): Promise<Response> {
  const backup = await createBackup(backupDeps);
  return new Response(new Blob([backup.content.slice()]), {
    headers: {
      "Content-Type": "application/vnd.sqlite3",
      "Content-Disposition": `attachment; filename="${backup.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
