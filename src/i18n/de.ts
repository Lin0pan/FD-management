/**
 * German UI strings for FD-Management.
 *
 * The application is used exclusively by the Füllhorn Delbrück staff, so all user-facing
 * text is German while code identifiers stay English (see docs/tech_stack_architecture_sketch.md §3).
 * Keeping the strings in one dictionary module makes the surface easy to review and, if it is ever
 * needed, to translate.
 */
export const de = {
  app: {
    name: "Füllhorn Delbrück – Verwaltung",
    tagline: "Kundenverwaltung und Erfassung der Lebensmittelausgabe",
  },
  home: {
    heading: "Füllhorn Delbrück – Verwaltung",
    subheading:
      "Die Anwendung ist einsatzbereit. Die Fachfunktionen folgen in den nächsten Schritten.",
  },
} as const;

export type Dictionary = typeof de;
