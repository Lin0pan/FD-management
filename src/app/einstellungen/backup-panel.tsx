"use client";

/**
 * The Datensicherung section on the settings screen: when the last backup was taken, „Jetzt
 * sichern", and — set apart behind its fold — putting a backup back. No rules: what may be restored
 * is `stageRestore`'s.
 */

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { de } from "@/i18n/de";
import { stageRestoreAction } from "./actions";
import { initialRestoreActionState } from "./backup-state";
import { ControlSummary } from "../disclosure";
import { Notice } from "../notice";

/** The file name the route chose, read off its `Content-Disposition`. */
function fileNameOf(response: Response): string {
  const header = response.headers.get("Content-Disposition") ?? "";
  return /filename="([^"]+)"/.exec(header)?.[1] ?? "fd-backup.db";
}

/** A fetch and a synthetic link rather than a plain form post, so the page can re-read its date. */
function CreateBackup(): React.ReactElement {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function download(): Promise<void> {
    setPending(true);
    setFailed(false);
    try {
      const response = await fetch("/einstellungen/datensicherung", { method: "POST" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = fileNameOf(response);
      link.click();
      URL.revokeObjectURL(url);
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <Button
        type="button"
        disabled={pending}
        onClick={() => void download()}
        data-testid="backup-create"
      >
        {pending ? de.settings.backup.creating : de.settings.backup.create}
      </Button>
      {failed ? (
        <Notice tone="error" text={de.settings.backup.createFailed} testId="backup-create-error" />
      ) : null}
    </div>
  );
}

const POLL_MS = 1500;
/** The watchdog restarts within seconds; past this, say that it may not be coming back. */
const OVERDUE_MS = 30_000;

type RestartPhase = "waiting" | "overdue" | "restored" | "failed";

/**
 * Wait for a start other than the one that staged the restore, then say whether it swapped the
 * backup in. A failed fetch only means the server is still down, so it is polled again.
 */
function AwaitRestart({
  restartingFrom,
  supervised,
}: {
  restartingFrom: string;
  supervised: boolean;
}): React.ReactElement {
  const words = de.settings.backup;
  const router = useRouter();
  const [phase, setPhase] = useState<RestartPhase>("waiting");

  useEffect(() => {
    const startedAt = performance.now();
    let done = false;
    const timer = setInterval(() => {
      void (async () => {
        try {
          const response = await fetch("/einstellungen/datensicherung/status", {
            cache: "no-store",
          });
          const status = (await response.json()) as { bootId: string; staged: boolean };
          if (!done && status.bootId !== restartingFrom) {
            done = true;
            clearInterval(timer);
            setPhase(status.staged ? "failed" : "restored");
            router.refresh();
          }
        } catch {
          if (!done && performance.now() - startedAt > OVERDUE_MS) {
            setPhase("overdue");
          }
        }
      })();
    }, POLL_MS);
    return () => {
      done = true;
      clearInterval(timer);
    };
  }, [restartingFrom, router]);

  if (phase === "restored") {
    return <Notice tone="success" text={words.restored} testId="backup-restored" />;
  }
  if (phase === "failed") {
    return <Notice tone="error" text={words.restoreFailed} testId="backup-restore-failed" />;
  }
  const waiting = !supervised
    ? words.restartByHand
    : phase === "overdue"
      ? words.restartOverdue
      : words.restarting;
  return (
    <p role="status" data-testid="backup-restarting" className="max-w-prose text-sm">
      {waiting}
    </p>
  );
}

function RestoreBackup(): React.ReactElement {
  const words = de.settings.backup;
  const [state, action, pending] = useActionState(stageRestoreAction, initialRestoreActionState);

  if (state.status === "staged") {
    return (
      <div className="border-t pt-6">
        <AwaitRestart restartingFrom={state.restartingFrom} supervised={state.supervised} />
      </div>
    );
  }

  return (
    <details className="group border-t pt-6">
      <ControlSummary testId="backup-restore-open">{words.restore}</ControlSummary>
      <form action={action} className="mt-3 flex flex-col items-start gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="backup-file" className="text-sm font-medium">
            {words.file}
          </label>
          <input
            id="backup-file"
            name="backup"
            type="file"
            accept=".db"
            required
            data-testid="backup-restore-file"
            className="text-sm"
          />
        </div>
        <Alert variant="destructive">
          <AlertDescription data-testid="backup-restore-warning" className="max-w-prose">
            {words.restoreWarning}
          </AlertDescription>
        </Alert>
        <Button type="submit" variant="destructive" disabled={pending} data-testid="backup-restore">
          {pending ? words.restoring : words.restoreConfirm}
        </Button>
        {state.status === "error" ? (
          <Notice tone={state.tier ?? "error"} text={state.message} testId="backup-restore-error" />
        ) : null}
      </form>
    </details>
  );
}

export function BackupPanel({ lastBackup }: { lastBackup: string | null }): React.ReactElement {
  const words = de.settings.backup;
  return (
    // No `CardTitle`: the section heading in `page.tsx` names this block (§2, §9).
    <Card>
      <CardContent className="flex flex-col gap-6">
        <span data-testid="backup-last" className="text-sm font-medium">
          {lastBackup === null ? words.noBackupYet : words.lastBackup(lastBackup)}
        </span>
        <CreateBackup />
        <RestoreBackup />
      </CardContent>
    </Card>
  );
}
