/**
 * The id of the "auf die Warteliste setzen" card, and the fragment the button beside the `h1` jumps
 * to (US-12.4, FR-2).
 *
 * It lives in a module of its own for the same reason every `*-state.ts` here does — a directive
 * decides what a module may export. `add-applicant-form.tsx` is `"use client"`, and a plain string
 * exported from a client module and read by a **server** component does not arrive as a string: it
 * arrives as a client-reference proxy, which React stringifies into "Attempted to call
 * ADD_FORM_ANCHOR() from the server". Nothing fails — the page renders, the suite stays green, and
 * the link simply has a nonsense `href`. It was visible only in the accessibility snapshot.
 */
export const ADD_FORM_ANCHOR = "warteliste-aufnehmen";
