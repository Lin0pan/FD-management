/**
 * The box every answer in the counter's status slot wears beside the `h-14` button (US-41.4). Its
 * own module, with no directive, because the server page and the client serve form both read it —
 * and a client module's exports reach a server component as references, not values.
 */
export const SLOT_NOTICE = "w-auto py-2.5 text-base";
