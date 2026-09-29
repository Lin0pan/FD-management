/**
 * What the Start screen's „Zu erledigen" lists (`tasks/prd-us-38-overviews-and-to-dos.md`
 * §US-38.1). A to-do is a list a person can bring back to 0 — which is why the Ausgabetermine are
 * an overview and never one — and its count is the same one its Übersichten tile shows.
 */

import {
  countCardsDueForReissue,
  type CardsDueForReissueDeps,
} from "../customers/cards-due-for-reissue";

export type ToDoKind = "CARDS_DUE";

export interface ToDo {
  readonly kind: ToDoKind;
  readonly count: number;
}

export type ListToDosDeps = CardsDueForReissueDeps;

/**
 * The to-dos with something waiting, in the order they are shown. One at 0 is left out here, not
 * by the screen, so an empty answer means there is nothing to do.
 *
 * @throws {EmptyHousehold} if a stored household has no members — a record that cannot be counted.
 * @throws {BirthDateInFuture} if a stored birthdate lies after today.
 */
export async function listToDos(deps: ListToDosDeps): Promise<ReadonlyArray<ToDo>> {
  const toDos: ReadonlyArray<ToDo> = [
    { kind: "CARDS_DUE", count: await countCardsDueForReissue(deps) },
  ];
  return toDos.filter((toDo) => toDo.count > 0);
}
