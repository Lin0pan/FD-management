"use client";

/**
 * One answer at a time, on a screen that has several things to answer for.
 *
 * The customer record carries eight write controls, each holding its own `useActionState`, which keeps
 * its last result until the component unmounts. A green banner sitting beside a button that has just
 * done something else looks exactly like that button's answer.
 *
 * The rule: **the screen shows the answer to the last thing asked, and nothing older.** A control
 * still renders its own notice beside its own button — the viewport rule
 * (`docs/guideline/ui_styling_guide.md` §7) is not up for negotiation — it just stops once another
 * control has been answered.
 *
 * Screens without a board are unaffected: `useNoticeSlot` returns what it was given.
 */

import { createContext, useContext, useEffect, useMemo, useState } from "react";

interface Board {
  /** The id of the control whose answer the screen is showing, or `null` before the first write. */
  readonly showing: string | null;
  readonly claim: (id: string) => void;
}

const BoardContext = createContext<Board | null>(null);

export function NoticeBoard({ children }: { children: React.ReactNode }): React.ReactElement {
  const [showing, setShowing] = useState<string | null>(null);
  const board = useMemo((): Board => ({ showing, claim: setShowing }), [showing]);
  return <BoardContext.Provider value={board}>{children}</BoardContext.Provider>;
}

/**
 * Whether this control is the one whose answer the screen is currently showing. Pass `null` while it
 * has nothing to say.
 *
 * **`answer` is the action state itself, not a boolean, and that is load-bearing**: `useActionState`
 * hands back a new object per submission, so a control answering twice claims the board twice. A
 * boolean would stay `true` between them, and a control superseded once could never speak again.
 */
export function useNoticeSlot(id: string, answer: object | null): boolean {
  const board = useContext(BoardContext);
  const claim = board?.claim;

  useEffect((): void => {
    if (answer !== null && claim !== undefined) {
      claim(id);
    }
  }, [answer, claim, id]);

  if (board === null) {
    return answer !== null;
  }
  return answer !== null && board.showing === id;
}
