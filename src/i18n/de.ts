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
    newCustomerLink: "Neue Kundin oder neuen Kunden aufnehmen",
  },
  customers: {
    groups: {
      RED: "Rot",
      BLUE: "Blau",
    },
    status: {
      ACTIVE: "aktiv",
      BLOCKED: "gesperrt",
      ARCHIVED: "archiviert",
    },
    /** The registration screen. */
    new: {
      heading: "Neue Kundin oder neuen Kunden aufnehmen",
      intro:
        "Kundennummer und Gruppe schlägt die Anwendung vor. Erwachsene und Kinder werden aus den " +
        "Geburtsdaten berechnet und können nicht eingetragen werden.",
      personalHeading: "Person",
      addressHeading: "Anschrift",
      certificateHeading: "Bedarfsnachweis",
      householdHeading: "Haushalt",
      householdHint:
        "Die aufgenommene Person zählt selbst zum Haushalt und steht in der ersten Zeile. " +
        "Weitere Mitglieder bitte ergänzen.",
      assignmentHeading: "Zuordnung",
      addMember: "Weiteres Haushaltsmitglied",
      removeMember: "Zeile entfernen",
      memberRow: (position: number): string => `Haushaltsmitglied ${position}`,
      submit: "Aufnehmen",
      submitting: "Wird gespeichert …",
    },
    fields: {
      firstName: "Vorname",
      lastName: "Nachname",
      birthDate: "Geburtsdatum",
      street: "Straße",
      houseNumber: "Hausnummer",
      zip: "PLZ",
      city: "Ort",
      certificateType: "Art des Nachweises",
      certificateValidUntil: "Nachweis gültig bis",
      notes: "Bemerkung (optional)",
      group: "Gruppe",
      customerNumber: "Kundennummer",
      cardNumber: "Kartennummer",
      status: "Status",
    },
    derived: {
      grownUps: "Erwachsene (ab 13 Jahren)",
      children: "Kinder (unter 13 Jahren)",
      hint: "Berechnet aus den Geburtsdaten — nicht eingebbar.",
      unknown: "—",
    },
    assignment: {
      proposedNumber: "Vorgeschlagene Kundennummer",
      suggestedGroup: (group: string): string => `Vorschlag: ${group}`,
      groupSizes: (red: number, blue: number): string =>
        `Aktuell: Rot ${red}, Blau ${blue} Haushalte`,
    },
    /**
     * German names for the fields a `MissingRequiredField` can name. The keys are the `field` values
     * the domain error carries, so a rejected value never quotes an English identifier at staff.
     */
    errorFields: {
      firstName: "Vorname",
      lastName: "Nachname",
      birthDate: "Geburtsdatum",
      "address.street": "Straße",
      "address.houseNumber": "Hausnummer",
      "address.zip": "PLZ",
      "address.city": "Ort",
      "certificate.type": "Art des Nachweises",
      "certificate.validUntil": "Nachweis gültig bis",
    } as Record<string, string | undefined>,
    errors: {
      missingField: (field: string): string => `Bitte das Feld „${field}“ ausfüllen.`,
      emptyHousehold:
        "Der Haushalt hat kein Mitglied. Die aufgenommene Person zählt selbst dazu — bitte " +
        "mindestens eine Zeile ausfüllen.",
      birthDateInFuture: "Ein Geburtsdatum liegt in der Zukunft. Bitte das Datum prüfen.",
      noFreeCustomerNumber: (quotaN: number): string =>
        `Alle ${quotaN} Kundennummern sind vergeben. Bitte einen Haushalt archivieren oder die ` +
        `Höchstzahl in den Einstellungen erhöhen. Es wurde nichts gespeichert.`,
      customerNumberTaken:
        "Die Kundennummer wurde zwischenzeitlich vergeben. Bitte erneut speichern.",
      notADate: "Bitte ein Datum im Format TT.MM.JJJJ auswählen.",
      unknown: "Die Aufnahme konnte nicht gespeichert werden.",
      notFound: "Diese Kundin oder dieser Kunde wurde nicht gefunden.",
    },
    /** The customer overview a registration lands on. */
    card: {
      heading: "Kundenkarte",
      householdHeading: "Haushalt",
      certificateHeading: "Bedarfsnachweis",
      validUntil: "gültig bis",
      registered: "Aufgenommen",
      backToHome: "Zur Startseite",
      cardViewLink: "Kundenkarte anzeigen",
    },
    /** Why a card was handed over — the four reasons `CardIssueReason` names. */
    cardReasons: {
      FIRST_ISSUE: "Erstausstellung",
      LOST: "Verlust",
      STALE_COUNTS: "Geänderte Haushaltszahlen",
      OTHER: "Sonstiger Grund",
    },
    /** The card view at /kunden/[id]/karte — what staff copy onto the physical card. */
    cardView: {
      heading: "Kundenkarte",
      current:
        "Dies ist die aktuell gültige Karte. Frühere Karten sind damit ungültig und dürfen an " +
        "der Ausgabe nicht mehr angenommen werden.",
      issuedAt: "Ausgestellt am",
      issuedBecause: "Grund der Ausstellung",
      supersededHeading: "Ersetzte Kartennummern",
      supersededNone: "Diese Karte ist die erste des Haushalts und ersetzt keine frühere.",
      // The reason belongs to the card named here — why *it* was handed over — not to its
      // replacement, so it reads as a note on that line rather than as the cause of the reissue.
      supersededEntry: (number: string, date: string, reason: string): string =>
        `${number} — ausgestellt am ${date}, Grund: ${reason}`,
      countsHint: "Erwachsene und Kinder werden bei jedem Aufruf aus den Geburtsdaten berechnet.",
      reissue: "Karte neu ausstellen",
      reissueHint: "Die Neuausstellung folgt in einem späteren Schritt.",
      backToCustomer: "Zurück zur Kundenübersicht",
    },
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
      heading: "Änderungsverlauf",
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

/** A household field as the domain names it, e.g. `householdMembers.1.firstName`. */
const HOUSEHOLD_FIELD = /^householdMembers\.(\d+)\.(firstName|lastName|birthDate)$/;

/**
 * The German label for a field a customer error names.
 *
 * Household rows are numbered rather than listed in the dictionary: the domain names them by index,
 * and there is no upper bound on how many people live in a household. Rows count from 1 on screen
 * while the domain counts from 0.
 */
export function customerFieldLabel(field: string): string {
  const householdMatch = HOUSEHOLD_FIELD.exec(field);
  if (householdMatch !== null) {
    const position = Number(householdMatch[1]) + 1;
    const part = de.customers.fields[householdMatch[2] as "firstName" | "lastName" | "birthDate"];
    return `${de.customers.new.memberRow(position)}: ${part}`;
  }
  return de.customers.errorFields[field] ?? field;
}
