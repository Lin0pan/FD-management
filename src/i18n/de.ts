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
    settingsLink: "Einstellungen",
  },
  settings: {
    heading: "Einstellungen",
    intro:
      "Änderungen gelten sofort. Beim Speichern wird eine neue Fassung angelegt; frühere " +
      "Fassungen bleiben erhalten, damit vergangene Ausgaben nachvollziehbar bleiben.",
    currentHeading: "Aktuell gültige Werte",
    fields: {
      quotaN: "Höchstzahl der Kundinnen und Kunden (N)",
      portionsPerGrownUp: "Portionen je Erwachsenem",
      portionsPerChild: "Portionen je Kind",
      weekAnchorIsoWeek: "Ankerwoche (ISO, z. B. 2026-W02)",
      weekAnchorColour: "Gruppe der Ankerwoche",
      distributionWeekday: "Ausgabetag",
      pricePerGrownUp: "Preis je Erwachsenem",
      pricePerChild: "Preis je Kind",
    },
    colours: {
      RED: "Rot",
      BLUE: "Blau",
    },
    weekdays: {
      1: "Montag",
      2: "Dienstag",
      3: "Mittwoch",
      4: "Donnerstag",
      5: "Freitag",
      6: "Samstag",
      7: "Sonntag",
    },
    prices: {
      heading: "Preise",
      hint:
        "Der Preis wird je Kopf berechnet: je Erwachsenem und je Kind. Was ein Haushalt zahlt, " +
        "ergibt sich daraus automatisch.",
    },
    /**
     * German names for the fields a domain error can name. The keys are the `field` values
     * `InvalidSettings` carries, so a rejected value never quotes an English identifier at staff.
     */
    errorFields: {
      quotaN: "Höchstzahl der Kundinnen und Kunden (N)",
      portionsPerGrownUp: "Portionen je Erwachsenem",
      portionsPerChild: "Portionen je Kind",
      distributionWeekday: "Ausgabetag",
      "weekAnchor.isoWeek": "Ankerwoche (ISO, z. B. 2026-W02)",
      "weekAnchor.colour": "Gruppe der Ankerwoche",
      pricePerGrownUp: "Preis je Erwachsenem",
      pricePerChild: "Preis je Kind",
    } as Record<string, string | undefined>,
    reason: "Grund der Änderung (optional)",
    reasonHint: "Wird, falls angegeben, im Änderungsprotokoll festgehalten.",
    save: "Speichern",
    saving: "Wird gespeichert …",
    saved: "Gespeichert. Die neuen Werte gelten ab sofort.",
    history: {
      heading: "Frühere Fassungen",
      empty: "Es gibt noch keine weiteren Fassungen.",
      recordedAt: "Geändert am",
      current: "aktuell gültig",
    },
    errors: {
      notAnInteger: "Bitte eine ganze Zahl ab 0 eingeben.",
      notAnAmount: "Bitte einen Betrag wie 2,50 eingeben.",
      noSettings:
        "Es sind noch keine Einstellungen hinterlegt. Bitte die Grundeinstellungen einspielen.",
      unknown: "Die Änderung konnte nicht gespeichert werden.",
      quotaBelowActiveCustomers: (quotaN: number, activeCustomers: number): string =>
        `Die Höchstzahl ${quotaN} liegt unter den derzeit ${activeCustomers} aktiven Kundinnen ` +
        `und Kunden. Es wurde nichts gespeichert.`,
      invalidSettings: (field: string): string => `Ungültiger Wert im Feld „${field}“.`,
      invalidAmount: (text: string): string => `„${text}“ ist kein Betrag wie 2,50.`,
    },
  },
} as const;

export type Dictionary = typeof de;
