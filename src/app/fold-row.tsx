"use client";

/**
 * A row of fold toggles whose one open panel stands under the whole row, right-aligned — the counter
 * mask's footer (US-41.7), and `ControlToggle`'s case in `ui_styling_guide.md` §6.
 *
 * Toggles and panels are siblings in one flex row, and `order-last basis-full` drops every panel
 * below it, so a control keeps its toggle and its form in one component. Opening one closes the
 * other: one heavy step at a time.
 */

import { createContext, useContext, useId, useState } from "react";
import { cn } from "@/lib/utils";
import { ControlToggle } from "./disclosure";

/** The footer's red text, which a ghost button's hover would otherwise turn back to the foreground. */
export const FOOTER_RED = "text-red-700 hover:text-red-700 aria-expanded:text-red-700";

interface FoldRowContext {
  readonly open: string | null;
  readonly toggle: (fold: string) => void;
  readonly idFor: (fold: string) => string;
}

const Context = createContext<FoldRowContext | null>(null);

function useFoldRow(): FoldRowContext {
  const context = useContext(Context);
  if (context === null) {
    throw new TypeError("a fold-row control rendered outside FoldRow");
  }
  return context;
}

export function FoldRow({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}): React.ReactElement {
  const [open, setOpen] = useState<string | null>(null);
  const base = useId();
  const context: FoldRowContext = {
    open,
    toggle: (fold) => setOpen(open === fold ? null : fold),
    idFor: (fold) => `${base}-${fold}`,
  };
  return (
    <Context.Provider value={context}>
      <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>
    </Context.Provider>
  );
}

export function FoldToggle({
  fold,
  testId,
  variant,
  className,
  children,
}: {
  /** Unique within the row. Block and unblock take two, so a block that succeeds closes its fold. */
  fold: string;
  testId: string;
  variant?: "outline" | "ghost";
  className?: string;
  children: React.ReactNode;
}): React.ReactElement {
  const { open, toggle, idFor } = useFoldRow();
  return (
    <ControlToggle
      testId={testId}
      controls={idFor(fold)}
      expanded={open === fold}
      onToggle={() => toggle(fold)}
      variant={variant}
      className={className}
    >
      {children}
    </ControlToggle>
  );
}

/** What a toggle opens, under the row, in the heavy actions' red frame. */
export function FoldPanel({
  fold,
  children,
}: {
  fold: string;
  children: React.ReactNode;
}): React.ReactElement | null {
  const { open, idFor } = useFoldRow();
  if (open !== fold) {
    return null;
  }
  return (
    <FoldLine>
      <div
        id={idFor(fold)}
        className="flex max-w-prose flex-col items-end gap-3 rounded-lg border border-red-700/35 px-3 py-2.5"
      >
        {children}
      </div>
    </FoldLine>
  );
}

/** A line of its own under the row, right-aligned — a panel, or the answer to one. */
export function FoldLine({ children }: { children: React.ReactNode }): React.ReactElement {
  return <div className="order-last flex basis-full justify-end">{children}</div>;
}
