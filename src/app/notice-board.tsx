"use client";

/**
 * One answer at a time, on a screen that has several things to answer for.
 *
 * The customer record carries eight write controls — five editors, the reissue, the block, the
 * archive — and each holds its own `useActionState`, which keeps its last result until the component
 * unmounts. Nothing ever cleared one. Observed on `/kunden/266`: the „Gespeichert." from the group
 * control — a control US-31 has since removed, because a group is the parity of a number — was still
 * on screen through a card reissue and a block afterwards, because neither of those had anything to
 * say.
 *
 * That was untidy while most writes said nothing. Now that every write confirms, it is the way a
 * staff member concludes an action succeeded when it never reported: a green banner sitting beside a
 * button that has just done something else looks exactly like that button's answer.
 *
 * The rule: **the screen shows the answer to the last thing that was asked, and nothing older.** A
 * control still renders its own notice, in its own place beside its own button — the viewport rule
 * (`docs/guideline/ui_styling_guide.md` §7) is not up for negotiation — it just stops rendering it once
 * another control has been answered.
 *
 * Screens without a board behave as they always did: `useNoticeSlot` returns what it was given, so a
 * card view with one control on it needs nothing. This is for screens carrying several.
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
 * Whether this control is the one whose answer the screen is currently showing.
 *
 * `answer` is the action state itself, not a boolean, and that is load-bearing: `useActionState`
 * hands back a **new object** for every submission, so a control answering twice in a row claims the
 * board twice. A boolean would stay `true` between the two, the effect would not fire again, and a
 * control that had been superseded once could never speak again.
 *
 * Pass `null` while the control has nothing to say.
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
