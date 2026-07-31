/**
 * The page frame every converted screen wears.
 *
 * It is one constant rather than a string per page because the width is not a per-screen decision:
 * the navigation bar in `layout.tsx` uses the same `max-w-6xl` container, so a screen that picks a
 * different width stops lining up with the bar above it — which is exactly what `/kunden/neu` and
 * `/kunden/[id]` did at `max-w-4xl`, a 128px step measured at both 1440 and 1920.
 *
 * A plain module with no `"use client"` directive, so a server component may import it: a string
 * exported from a client module arrives across the boundary as a client-reference proxy rather than
 * as a string (`docs/ui_conversion_guide.md`, the `/warteliste` findings).
 */
export const SHELL = "mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-6 md:p-8";
