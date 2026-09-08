/**
 * German UI strings — the one dictionary, so the surface is easy to review and, if ever needed, to
 * translate (`docs/architecture/08-crosscutting-concepts.md` §Internationalisation).
 *
 * The three imports are the module's only ones, all pure domain: money is written by `formatEuros`
 * and nowhere else, and a balance is signed from its `BalanceKind` rather than from a comparison a
 * screen makes for itself — which is what puts one glyph in front of every balance at once.
 */

import { balanceKind, type BalanceKind, type PaymentStanding } from "@/domain/distribution/balance";
import { formatEuros } from "@/domain/money";

/**
 * „ab 3 Personen“, „ab 1 Person“ (US-28). Module-level rather than an entry: a fragment of grammar
 * three phrasings share, never a string a screen asks for on its own.
 */
function fromPersons(minPersons: number): string {
  return `ab ${minPersons === 1 ? "1 Person" : `${minPersons} Personen`}`;
}

/** „6 Eier“, and „1 Ei“ for the single egg nothing in the rule forbids. */
function eggCount(eggs: number): string {
  return eggs === 1 ? "1 Ei" : `${eggs} Eier`;
}

/** One row of the egg rule: „ab 3 Personen: 6 Eier“ (US-28) — the clause four entries share. */
function eggRow(minPersons: number, eggs: number): string {
  return `${fromPersons(minPersons)}: ${eggCount(eggs)}`;
}

/**
 * The egg-rule table's column headings, module-level because they are said twice — over the column
 * and inside every control's name ({@link de.settings.eggs.fieldLabel}).
 *
 * „Ab wie vielen Personen“ rather than „Personenzahl“: the column holds a **floor**, not a count,
 * which is the distinction the whole rule turns on (US-28).
 */
const EGG_THRESHOLD_COLUMN = "Ab wie vielen Personen";
const EGG_COUNT_COLUMN = "Eier";

/**
 * A sentence written as parts, some emphasised when rendered. The dictionary still owns the whole
 * sentence and only says which fragments carry the weight — a component assembling German from
 * pieces is the split `CLAUDE.md` §Coding style forbids.
 *
 * Emphasis is for a figure a staff member acts on off the screen: the number they write on a
 * physical card, the slot the household now holds. A sentence where everything matters marks nothing.
 */
export type Segment = { readonly text: string; readonly strong?: true };

/**
 * A segmented sentence as flat text — what a test asserts and a screen reader hears, so a spec can
 * compare against the dictionary rather than a copy of it.
 */
export function plain(segments: ReadonlyArray<Segment>): string {
  return segments.map((segment) => segment.text).join("");
}

/**
 * A directed amount: „+2,00 €“, „−2,00 €“. **The house form for any amount that runs two ways**, so
 * a third such quantity comes here rather than inventing a third vocabulary.
 *
 * The glyph is **U+2212 MINUS SIGN, not a hyphen**: it matches the `+` in width, where a hyphen
 * shrinks to a stray stroke at the sizes the counter reads at. That is why the amount is printed
 * from its absolute value with the sign prefixed rather than let out of `formatEuros`.
 */
function signedAmount(cents: number): string {
  return `${cents < 0 ? "−" : "+"}${formatEuros(Math.abs(cents))}`;
}

/**
 * A balance, signed: „+2,00 €“, „−2,00 €“, „ausgeglichen“ (US-29).
 *
 * **The sign is the word**, and it is what keeps the tint honest (US-03.4): a colour is a distinction
 * only some staff can make and does not survive a photocopier, while a `+` or `−` is there in
 * greyscale, in print and in the accessibility snapshot.
 *
 * A settled balance stays a **word** and not „0,00 €“ — a zero beside a euro sign reads like an
 * amount that merely happens to be nothing. The sign is for the two directions, never for being in
 * neither.
 */
function balanceWording(kind: BalanceKind, cents: number): string {
  return kind === "SETTLED" ? "ausgeglichen" : signedAmount(cents);
}

export const de = {
  app: {
    name: "Füllhorn Delbrück – Verwaltung",
    tagline: "Kundenverwaltung und Erfassung der Lebensmittelausgabe",
  },
  /**
   * How a day is written, everywhere it is typed or refused (ADR-013). One string rather than the
   * literal at eight fields: the placeholder and the rejection only stay agreed if they are one value.
   */
  day: {
    /** Shown in an empty day field. Also the answer to "what does this box want?". */
    placeholder: "TT.MM.JJJJ",
  },
  /**
   * The grammar every form uses to summarise a refusal by its button (`src/app/field-refusal.ts`).
   *
   * Its own group rather than a corner of `customers.errors`, because these words belong to a
   * *shape* — a summary that names fields, with the marks doing the rest — and the settings screen
   * refuses fields too.
   */
  forms: {
    /**
     * The summary for a refusal the *form* raised, where the schema's message says only what is wrong
     * and the field has to be named around it. The label is quoted because a household field is
     * itself „Haushaltsmitglied 2: Geburtsdatum“, and an unquoted join runs three colons deep.
     */
    fieldProblem: (field: string, problem: string): string => `„${field}“: ${problem}`,
    /**
     * The same for several fields at once, which a day field per household member makes ordinary. It
     * names them rather than counting them: a staff member scrolled to the button has to know how far
     * up to look and how many times.
     */
    severalFieldProblems: (fields: ReadonlyArray<string>): string =>
      `Bitte ${fields.length} Felder prüfen: ${fields.map((field) => `„${field}“`).join(", ")}.`,
  },
  /**
   * The navigation bar (US-17.1). Each label is the *only* name that area has — identical to the
   * heading on the page it leads to, so a staff member lands on a page that says it back to them.
   */
  nav: {
    /** Names the bar for a screen reader, which otherwise hears four links and no context. */
    label: "Hauptnavigation",
    start: "Start",
    distribution: "Ausgabe",
    customers: "Kunden verwalten",
    settings: "Einstellungen",
  },
  /**
   * The Start dashboard (US-17.3) — a screen to be read, not a menu: the nav bar carries the links,
   * so what is left is the date and the answer to "wann ist die nächste Ausgabe".
   */
  home: {
    /** The greeting *is* the heading — a second welcoming sentence would restate the lines below. */
    heading: "Willkommen im Delbrücker Füllhorn",
    /** The day, written out — and no clock time: the page has nothing that ticks (FR-7). */
    today: (date: string): string => `Heute ist ${date}.`,
    distribution: {
      /**
       * Today and a coming day are two sentences rather than one styled two ways: on the day itself
       * the line reads differently, not louder (PRD §6).
       *
       * The group is a bracketed note, DF's own wording. It is the *only* thing saying which group
       * collects — the screen is not tinted — which is the way round US-03.4 asks for.
       */
      isToday: (colour: string): string => `Heute ist Ausgabetag (${colour}).`,
      next: (date: string, colour: string): string =>
        `Die nächste Ausgabe findet am ${date} statt (${colour}).`,
      /** An unseeded database is not an error screen (FR-10) — only the rhythm is missing. */
      notConfigured: "Der Ausgaberhythmus ist noch nicht hinterlegt.",
    },
    /** Also the way off the distribution screen and the hub when no settings are in force. */
    settingsLink: "Einstellungen",
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
      heading: "Neuen Kunden aufnehmen",
      addressHeading: "Anschrift",
      certificateHeading: "Bedarfsnachweis",
      householdHeading: "Haushalt",
      assignmentHeading: "Zuordnung",
      addMember: "Weiteres Haushaltsmitglied",
      removeMember: "Zeile entfernen",
      memberRow: (position: number): string => `Haushaltsmitglied ${position}`,
      /** The row's position. Short, because the column holds one or two digits. */
      memberNumberColumn: "Nr.",
      submit: "Aufnehmen",
      submitting: "Wird gespeichert …",
      /**
       * Shown on the record the registration lands on, not on the form — a successful registration
       * redirects. One sentence and only the fact: the button that prints the card is in the header,
       * a hand's width above this line.
       */
      saved: "Kunde erfolgreich hinzugefügt.",
      /**
       * The way out of a full register (US-12.4), beside the "alle Nummern sind vergeben" message,
       * which is otherwise a dead end.
       */
      waitingListLink: "Stattdessen auf die Warteliste setzen",
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
      price: "Preis",
      /**
       * The egg allowance (US-28). „Eier“ and nothing else — a „Stück“ or a note about the threshold
       * would explain a rule nobody at the counter has to know.
       */
      eggs: "Eier",
      /** The consecutive-no-show count (US-10.4), shown only above zero and drawing no conclusion. */
      noShows: "Ausgaben in Folge verpasst",
      noShowsValue: (count: number): string => (count === 1 ? "1 Ausgabe" : `${count} Ausgaben`),
      /**
       * The two counts as one phrase, where a *pair* is shown side by side (US-13.4). Labelled rather
       * than inflected („1 Erwachsener“): this form is right at every number and names nobody's
       * gender.
       */
      countsValue: (grownUps: number, children: number): string =>
        `Erwachsene: ${grownUps}, Kinder: ${children}`,
      /**
       * What the household hands over today (US-29). „Zu zahlen“ and not „Preis“ — the two differ
       * exactly when a balance is standing, and the tile beside this still says what the week cost.
       */
      amountToPay: "Zu zahlen",
      /** Where the household stands over all their hand-outs: a credit, an open amount, or neither. */
      balance: "Saldo",
      /** A balance, signed — {@link balanceWording}, which says why the sign is the word. */
      balanceValue: balanceWording,
      unknown: "—",
    },
    assignment: {
      /**
       * How many slots each group has left, under the number dropdown on both screens that offer one
       * (US-31.6, US-31.7).
       *
       * Two figures rather than one total, because a group can be full while the register is not —
       * only 120 even slots below a quota of 240 — and this is the only place staff learn that before
       * the radio above turns out to be unselectable. On the record the household's own slot is not
       * counted: they hold it, so it is not free.
       */
      freeNumbersByGroup: (red: number, blue: number): string =>
        `Noch frei — Rot: ${red}, Blau: ${blue}`,
      /**
       * Why a group cannot be picked (US-31.6) — and what the disabled radio is described by, so a
       * screen reader hears the reason rather than meeting a control that refuses without one.
       */
      groupFull: (group: string): string => `In ${group} ist keine Nummer mehr frei.`,
      suggestedGroup: (group: string): string => `Vorschlag: ${group}`,
      /**
       * Both group sizes, beside the choice. That is what the decision is made of: staff pick a week
       * *in order to* even the register out, and fetching the balance from another screen first would
       * mean using the control blind (FR-4).
       */
      groupSizes: (red: number, blue: number): string =>
        `Aktuell: Rot ${red}, Blau ${blue} Haushalte`,
    },
    /**
     * German names for the fields a `MissingRequiredField` can name, keyed by the domain error's own
     * `field` values so a refusal never quotes an English identifier at staff.
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
      /**
       * Names the person the household is missing rather than the rule it broke: the customer's row is
       * locked on the record, so a household without them predates the rule and has to be typed back.
       */
      customerNotInHousehold: (name: string): string =>
        `${name} zählt selbst zum Haushalt und fehlt in der Liste. Bitte eine Zeile mit Namen ` +
        `und Geburtsdatum ergänzen.`,
      birthDateInFuture: "Ein Geburtsdatum liegt in der Zukunft. Bitte das Datum prüfen.",
      noFreeCustomerNumber: (quotaN: number): string =>
        `Alle ${quotaN} Kundennummern sind vergeben. Bitte einen Haushalt archivieren oder die ` +
        `Höchstzahl in den Einstellungen erhöhen. Es wurde nichts gespeichert.`,
      /**
       * One sentence for both `CustomerNumberTaken` and `CustomerNumberOutOfRange` (US-24): staff act
       * the same on either — they pick another number. The two codes stay apart because the program
       * branches on them.
       *
       * It asks for a *different* number rather than a retry: a chosen number that is gone fails
       * identically however often it is re-submitted.
       */
      customerNumberUnavailable: (customerNumber: number): string =>
        `Die Kundennummer ${customerNumber} ist nicht mehr verfügbar. Bitte eine andere Nummer ` +
        `wählen.`,
      /**
       * Two answers, not one: a blank field and an unreadable one are different mistakes (ADR-013).
       * Both short — they sit under the field, beside a placeholder that already shows the format.
       */
      dateMissing: "Datum fehlt.",
      notADate: "Kein gültiges Datum.",
      /**
       * The marks that sit **under** a refused control, in {@link dateMissing}'s register: three or
       * four words, because the field is right above and the summary by the button says the rest.
       * `missingField` names its field because it is read 1 600px away from it; a mark naming its own
       * would say it twice in one eyeful.
       */
      fieldRequired: "Pflichtfeld.",
      valueTooLong: "Zu lang.",
      numberUnavailable: "Nicht mehr verfügbar.",
      /** The mark for a `gültig bis` that has already passed — {@link fieldRequired}'s register. */
      dateInPast: "Liegt in der Vergangenheit.",
      notesTooLong: (maxLength: number, length: number): string =>
        `Die Notiz ist mit ${length} Zeichen zu lang. Es sind höchstens ${maxLength} Zeichen ` +
        `möglich — bitte kürzen.`,
      /**
       * The number a household is moved to is the one they already hold (US-30) — refused, because it
       * would print a fresh card for a move that never happened.
       *
       * The control does not offer the step that produces this (the confirmation appears only once
       * another number is picked), so it is read when the record was moved in a second tab — which is
       * why it ends by asking for another number rather than for the same one again.
       */
      customerNumberUnchanged: (customerNumber: number): string =>
        `Der Haushalt hat bereits die Kundennummer ${customerNumber}. Es wurde nichts geändert; ` +
        `bitte eine andere Nummer wählen.`,
      /**
       * `cardNumberTaken` is the *slot's* run read stale (US-25): the number was printed on that slot
       * already, and a card number is never printed twice — so the answer is to reload, not retype,
       * which is why it is red in `notice-tier.ts`.
       *
       * A *Nummer* is „vergeben“ and a *Karte* „ausgestellt“; a spent card number is both at once,
       * and swapping the verbs makes staff read the sentence twice.
       *
       * It takes the number **already formatted** — writing `50k3` is `formatCardNumber`'s job, and
       * this module owns no second spelling of it.
       */
      cardNumberTaken: (cardNumber: string): string =>
        `Die Kartennummer ${cardNumber} ist bereits vergeben und wird kein zweites Mal ` +
        `ausgestellt. Es wurde nichts gespeichert. Bitte die Seite neu laden.`,
      /**
       * `cardIndexTaken` is the *record's* run read stale: the household was issued another card
       * while this one was being decided — a second tab, or the colleague at the next chair, since
       * DF share one machine. So the answer is to read the record again, and the sentence points at
       * the household rather than at a number. It does **not** guess which of the two happened:
       * naming a second window would send somebody hunting through their own tabs for a card a
       * colleague issued.
       *
       * It names **no** card number, and deliberately so. The error carries a `customerId` and an
       * index — no slot — and the card that took the index may well have been printed under the
       * number a move is leaving (`PrismaCustomerRepository.changeCustomerNumber`), so composing
       * one from the slot in hand would quote a card that was never printed. A staff member sent to
       * look for it would be looking for nothing.
       */
      cardIndexTaken:
        "Für diesen Haushalt wurde inzwischen eine neue Karte ausgestellt. Es wurde nichts " +
        "gespeichert. Bitte die Seite neu laden.",
      unknown: "Die Aufnahme konnte nicht gespeichert werden.",
      notFound: "Dieser Kunde wurde nicht gefunden.",
    },
    /** The customer overview a registration lands on, and the record every later edit is made on. */
    card: {
      // Not "Kundenkarte": that is the printed card at /kunden/[id]/karte. This screen is the whole
      // record — everything known about a household, and everything editable about them (US-16.5).
      heading: "Kundenübersicht",
      householdHeading: "Haushalt",
      certificateHeading: "Bedarfsnachweis",
      validUntil: "gültig bis",
      registered: "Aufgenommen",
      reminderCount: "Erinnerungen an den Nachweis",
      cardViewLink: "Kundenkarte anzeigen",
      /** A member's age beside their birthdate; German inflects the year at one. */
      memberAge: (age: number): string => (age === 1 ? "1 Jahr" : `${age} Jahre`),
    },
    /**
     * Blocking and unblocking from the record (US-08). A block pauses a household without freeing
     * their slot; the reason is its only record and is shown verbatim at the counter.
     */
    block: {
      heading: "Sperre",
      currentReason: "Sperrgrund",
      action: "Sperren",
      reasonLabel: "Grund der Sperre",
      submit: "Sperren",
      submitting: "Wird gesperrt …",
      unblock: "Sperre aufheben",
      unblockConfirm: (reason: string): string =>
        `Diese Sperre wird aufgehoben: „${reason}“. Der Kunde ist danach wieder bezugsberechtigt.`,
      unblockSubmit: "Sperre jetzt aufheben",
      unblocking: "Wird aufgehoben …",
      /**
       * Each names the state the household is now in rather than the button pressed: the controls
       * swap places after the write, so a sentence about the click would sit next to a control
       * saying the opposite.
       */
      blocked: "Der Kunde ist jetzt gesperrt und erhält an der Ausgabe nichts.",
      unblocked: "Die Sperre ist aufgehoben. Der Kunde ist wieder bezugsberechtigt.",
      errors: {
        missingReason: "Bitte einen Grund für die Sperre angeben.",
        notBlockable: "Dieser Kunde kann nicht gesperrt werden. Bitte die Seite neu laden.",
        notBlocked: "Dieser Kunde ist nicht gesperrt. Bitte die Seite neu laden.",
        unknown: "Die Änderung konnte nicht gespeichert werden.",
      },
    },
    /**
     * Archiving a household (US-10) — the only action that frees a customer number, which is why the
     * confirmation names it.
     *
     * Two facts and no more: the freed number and the one-way door are what staff act on. The
     * irreversibility is stated **here and only here**, beside the click that does it.
     */
    archive: {
      heading: "Archivieren",
      action: "Diesen Haushalt archivieren",
      reasonLabel: "Grund der Archivierung",
      confirm: (customerNumber: number): string =>
        `Die Kundennummer ${customerNumber} wird frei. Rückgängig machen lässt sich die ` +
        `Archivierung nicht.`,
      submit: "Jetzt archivieren",
      submitting: "Wird archiviert …",
      /**
       * The receipt, read above the standing banner. It says what the banner does not — that *this
       * click* did it — and names the freed number, because somebody on the waiting list can have it.
       */
      saved: (customerNumber: number): string =>
        `Der Haushalt ist archiviert. Die Kundennummer ${customerNumber} ist wieder frei.`,
      /** The banner an archived record carries — the reason and the day, on every screen it shows on. */
      bannerHeading: "Archiviert",
      bannerDetail: (date: string, reason: string): string =>
        `Archiviert am ${date}. Grund: „${reason}“`,
      bannerNoReason: "Zu dieser Archivierung ist kein Grund hinterlegt.",
      /**
       * „frei“ and „gehört bereits jemand anderem“ are two facts, and the second is the one acted on
       * wrongly: the number is still printed on this record with nothing to say it has moved on.
       */
      bannerReadOnly:
        "Der Datensatz kann nicht mehr geändert werden. Die Kundennummer ist wieder frei und " +
        "gehört möglicherweise bereits einem anderen Haushalt.",
      errors: {
        missingReason: "Bitte einen Grund für die Archivierung angeben.",
        notArchivable: "Dieser Haushalt ist bereits archiviert. Bitte die Seite neu laden.",
        unknown: "Die Archivierung konnte nicht gespeichert werden.",
      },
    },
    /**
     * Searching the archive for a returning applicant, and the pre-fill that follows (US-11).
     *
     * The riskiest moment is a staff member believing the old record was reactivated (PRD §6), so
     * every string naming the archived household says in the same breath that a *new* number and a
     * *new* card are being issued. The former number is for recognition only.
     */
    archiveSearch: {
      heading: "Im Archiv suchen",
      /** One line, asking the question rather than explaining the feature. */
      intro: "War dieser Haushalt schon einmal aufgenommen?",
      submit: "Suchen",
      submitting: "Wird gesucht …",
      /** The result list, headed by how many of them there are — German inflects the one. */
      resultsHeading: (count: number): string =>
        count === 1
          ? "1 archivierter Haushalt gefunden"
          : `${count} archivierte Haushalte gefunden`,
      noMatches:
        "Kein archivierter Haushalt gefunden. Bitte die Schreibweise prüfen — oder die Aufnahme " +
        "einfach leer ausfüllen.",
      /**
       * What is shown instead of a twenty-first result — there is no paging, and the message names
       * the fields that would narrow the search rather than only saying there were too many.
       */
      tooMany: (shown: number): string =>
        `Es werden ${shown} Treffer angezeigt; es gibt weitere. Bitte die Suche eingrenzen — mit ` +
        `dem Vornamen oder dem Geburtsdatum.`,
      /** The refusal when staff press Search with every field empty. */
      noCriteria: "Bitte mindestens ein Feld ausfüllen: Nachname, Vorname oder Geburtsdatum.",
      /** The labels on one result row — enough to tell two people of the same name apart. */
      result: {
        householdSize: (size: number): string =>
          size === 1 ? "1 Person im Haushalt" : `${size} Personen im Haushalt`,
        archivedOn: "Archiviert am",
        archiveReason: "Grund der Archivierung",
        /** „Frühere“ is in the label itself: a bare „Kundennummer“ is what gets copied onto a card. */
        formerNumber: "Frühere Kundennummer",
        /**
         * {@link archive.bannerReadOnly}'s fact, for its reason: this panel is read while a *new*
         * number is being handed out, exactly when copying the old one across is the natural mistake.
         */
        formerNumberHint:
          "Nur zur Wiedererkennung — diese Nummer gehört möglicherweise bereits einem anderen " +
          "Haushalt.",
        select: "Daten übernehmen",
        selecting: "Wird übernommen …",
        /** What the row that filled the form says instead of offering to fill it again. */
        applied: "Übernommen",
        /**
         * What opens the rest of a result row. The name, birthdate and address answer "is this them?";
         * the size, the reason and the former number are read once that answer is probably yes.
         */
        moreDetail: "Mehr zu diesem Haushalt",
      },
      /**
       * The banner over a pre-filled form: this is a new registration, not a reactivation, and here is
       * the household the data came from — so a pre-fill from the wrong row is visible without
       * scrolling.
       *
       * **It names no card index and must not gain one**: an index counts the *slot's* cards (US-25),
       * so a new record's first card can be `66k2`, and the banner renders before the slot is chosen
       * anyway.
       */
      prefilled: {
        heading: "Daten aus dem Archiv übernommen",
        detail: (name: string, formerNumber: number, archivedOn: string): string =>
          `Übernommen von „${name}“, archiviert am ${archivedOn} unter der Kundennummer ` +
          `${formerNumber}. Es wird ein neuer Datensatz mit einer neu vergebenen Kundennummer und ` +
          `einer neuen Karte angelegt.`,
        clear: "Übernahme verwerfen und leer beginnen",
      },
      errors: {
        notFound:
          "Dieser archivierte Datensatz wurde nicht gefunden. Bitte die Suche erneut ausführen.",
        notArchived:
          "Dieser Haushalt ist nicht archiviert und kann nicht übernommen werden. Bitte die " +
          "Seite neu laden.",
        unknown: "Die Suche im Archiv ist fehlgeschlagen.",
        prefillFailed: "Die Daten konnten nicht übernommen werden.",
      },
    },
    /** Why a card was handed over — the four reasons `CardIssueReason` names. */
    cardReasons: {
      FIRST_ISSUE: "Erstausstellung",
      LOST: "Verlust",
      STALE_COUNTS: "Geänderte Haushaltszahlen",
      CUSTOMER_NUMBER_CHANGED: "Kundennummer geändert",
      OTHER: "Sonstiger Grund",
    },
    /** The card view at /kunden/[id]/karte — what staff copy onto the physical card. */
    cardView: {
      heading: "Kundenkarte",
      issuedAt: "Ausgestellt am",
      issuedBecause: "Grund der Ausstellung",
      supersededHeading: "Ersetzte Kartennummern",
      supersededNone: "Diese Karte ist die erste des Haushalts und ersetzt keine frühere.",
      // The reason belongs to the card named here — why *it* was handed over, not why it was
      // replaced — so it reads as a note on that line.
      supersededEntry: (number: string, date: string, reason: string): string =>
        `${number} — ausgestellt am ${date}, Grund: ${reason}`,
      issuedHeading: "Ausgestellte Karten",
      issuedCount: "Karten insgesamt",
      lossCount: "davon nach Verlust",
      // Unadorned: whether a household loses cards too often is DF's judgement, and the software
      // must not tilt it (prd-us-09 §FR-4).
      backToCustomer: "Zurück zur Kundenübersicht",
    },
    /**
     * Maintaining the record (US-16.5). Every editable part is its own form with its own save button,
     * because each is its own decision with its own audit entry — one "Speichern" over all of them
     * would say they were one.
     *
     * The hints all answer the same question: *what follows from this?*
     */
    record: {
      detailsHeading: "Person und Anschrift",
      /**
       * About the boxes above it and nothing else: a form that says where a *different* form lives is
       * how a screen cross-references itself, and one that narrates its own effect describes what the
       * next scroll already shows.
       */
      detailsHint: "Korrekturen an Name, Geburtsdatum und Anschrift.",
      detailsSubmit: "Person und Anschrift speichern",
      /**
       * The one thing saving a household does that this screen cannot show: the card in their hand
       * still names the old counts. The only place on the record where a save leaves that to be done
       * by hand.
       */
      householdHint:
        "Ändert sich die Zahl der Köpfe, muss die Karte unter „Karten neu ausstellen“ neu " +
        "ausgestellt werden.",
      householdSubmit: "Haushalt speichern",
      notesHeading: "Bemerkung",
      /** Where the note is read — the one thing about it this screen cannot show. */
      notesHint: "Die Bemerkung wird an der Ausgabe angezeigt.",
      notesSubmit: "Bemerkung speichern",
      notesEmpty: "Keine Bemerkung hinterlegt.",
      /**
       * The number and the week it collects in, on the badge beside the name (US-31.7). Reading „37“
       * and knowing „Rot“ without looking anything up is the whole benefit of DF's rule, so the two
       * are shown as one thing wherever either is.
       *
       * The tile below still states the number alone — that is the figure staff copy onto a card.
       */
      numberAndGroup: (customerNumber: number, group: string): string =>
        `Nr. ${customerNumber} · ${group}`,
      /** The hand-out history (US-16.5) — newest first, each row priced as it was priced then. */
      historyHeading: "Bisherige Ausgaben",
      /**
       * The one fact the table cannot show: the correction window (US-29.4). Nothing on screen closes
       * at midnight in front of anybody, so a staff member looking at a week-old row would otherwise
       * hunt for a button that is not there.
       */
      historyHint: "Korrekturen sind nur am selben Tag möglich.",
      historyEmpty: "Für diesen Haushalt ist noch keine Ausgabe erfasst.",
      /**
       * The accessible name of the scrolling box. It must be spoken: the box carries `tabIndex={0}` so
       * it can be scrolled by keyboard (WCAG 2.1.1), and a focus stop announcing nothing is worse than
       * none. It says why focus landed there, which the heading's own words would not.
       */
      historyRegionLabel: "Bisherige Ausgaben, scrollbare Liste",
      /**
       * How many hand-outs the fold holds, stated while it is still shut — otherwise it answers
       * nothing until opened, including whether opening it is worth the click. Zero is worded rather
       * than `0 Ausgaben`: a disclosure that opens onto nothing invites a click to find that out.
       */
      historyCount: (count: number): string => {
        if (count === 0) {
          return "Noch keine Ausgabe erfasst";
        }
        return count === 1 ? "1 Ausgabe" : `${count} Ausgaben`;
      },
      /** Its own column, so the birthdate label does not differ on every row. */
      ageColumn: "Alter",
      /**
       * „Gefordert“ and „Gezahlt“ are two columns rather than one ja/nein, because a payment is an
       * amount and an amount means nothing without what was asked beside it (US-29.8).
       */
      historyColumns: {
        date: "Datum",
        showedUp: "Erschienen",
        asked: "Gefordert",
        paid: "Gezahlt",
        price: "Preis",
      },
      /**
       * How the payment stood against what was asked that day: „−2,00 €“ short, „+2,00 €“ over,
       * „genau“ exact.
       *
       * **Signed, like the balance** ({@link signedAmount}): this column is read down the page against
       * the Gefordert and Gezahlt figures beside it, and a sign scans with them where a trailing word
       * does not. „genau“ rather than „+0,00 €“ for {@link balanceWording}'s reason.
       */
      historyStanding: (standing: PaymentStanding, differenceCents: number): string =>
        standing === "EXACT" ? "genau" : signedAmount(differenceCents),
      yes: "ja",
      no: "nein",
      /**
       * The section holding everything that cannot simply be typed over again, separated so no
       * irreversible action sits a stray click from the household editor (PRD §6).
       */
      dangerHeading: "Aktionen mit Folgen",
      /** The one-way door is stated in {@link archive.confirm}, beside the button that opens it. */
      dangerHint: "Diese Aktionen wirken sofort und werden einzeln bestätigt.",
      saving: "Wird gespeichert …",
      saved: "Gespeichert.",
      errors: {
        unknown: "Die Änderung konnte nicht gespeichert werden.",
        archived:
          "Dieser Haushalt ist archiviert; sein Datensatz kann nicht mehr geändert werden. Bitte " +
          "die Seite neu laden.",
      },
    },
    /**
     * Moving a household to another customer number, and with it to the other week (US-30, US-31.7).
     * One section, because *which group* and *which number in it* are two halves of one sentence:
     * choosing a group here is choosing among that group's free numbers (ADR-017).
     *
     * The words carry the two things the screen cannot show — that a move prints a card, and *which*
     * card. All three values are named before the write and again after it, because they are what
     * staff copy onto the physical card and a move cannot be undone by picking the old number again.
     *
     * There is deliberately no word for a *reason*: the use case asks for none (ADR-016).
     */
    numberChange: {
      heading: "Gruppe und Kundennummer",
      /**
       * Said instead of the per-group figures when the household's own number is the only one on
       * offer — „Noch frei — Rot: 0, Blau: 0“ states a shortage twice without saying what it means.
       * The dropdown stays enabled: a greyed-out control says something cannot be done, never why.
       */
      noOtherNumber: "Zurzeit ist keine andere Kundennummer frei.",
      /** Reveals the confirmation. Nothing is written by it — {@link submit} is the save. */
      action: "Kundennummer ändern",
      /**
       * The number, the week and the card, before anything happens. All three come off the read
       * model; none is worked out in the browser.
       *
       * The group is named whether or not the parity changed — it is printed on the physical card, so
       * it is a value being copied out rather than a status line, and a clause that appeared only
       * sometimes would read as a warning.
       */
      confirm: (
        customerNumber: number,
        group: string,
        nextCard: string,
      ): ReadonlyArray<Segment> => [
        { text: "Neue Kundennummer " },
        { text: String(customerNumber), strong: true },
        { text: ", Gruppe " },
        { text: group, strong: true },
        { text: ", neue Karte " },
        { text: nextCard, strong: true },
        { text: "." },
      ],
      submit: "Kundennummer jetzt ändern",
      submitting: "Wird geändert …",
      /**
       * The receipt: the confirmation's three values plus the slot that was freed. It names the old
       * number because the record above now says the new one everywhere, and this is the only thing
       * left saying which slot came free.
       *
       * The weight is on what is *acted on* — the slot, the week and the card number, which are what
       * gets copied onto the card in the household's hand.
       */
      saved: (
        from: number,
        to: number,
        group: string,
        cardNumber: string,
      ): ReadonlyArray<Segment> => [
        { text: `Kundennummer geändert ${from} → ` },
        { text: String(to), strong: true },
        { text: "; Gruppe " },
        { text: group, strong: true },
        { text: "; neue Karte " },
        { text: cardNumber, strong: true },
        { text: " ausgestellt." },
      ],
    },
    /**
     * Reissuing a card after a loss (US-09), offered on the record and the card view. Both name the
     * old and new numbers before the write, because the new one is copied onto the physical card.
     */
    reissue: {
      heading: "Kartenverlust",
      action: "Karte neu ausstellen (Verlust)",
      /**
       * The two numbers and nothing else, in {@link numberChange.confirm}'s shape. A confirmation
       * that recites rules the four people using this already know gets clicked past unread.
       */
      confirm: (current: string, next: string): string =>
        `Karte ${current} wird ungültig. Neue Karte: ${next}.`,
      submit: "Neue Karte jetzt ausstellen",
      submitting: "Wird ausgestellt …",
      /**
       * The number again after the write — deliberately repeated from `confirm`, because this is a
       * receipt rather than a warning and on `/karten-neuausstellung` the row it was read from is
       * gone by the time this is read.
       */
      saved: (next: string): string =>
        `Die neue Karte ${next} ist ausgestellt. Die alte Karte ist ungültig und darf an der ` +
        `Ausgabe nicht mehr angenommen werden.`,
      errors: {
        archived:
          "Dieser Kunde ist archiviert und erhält keine neue Karte. Bitte die Seite neu laden.",
        unknown: "Die neue Karte konnte nicht ausgestellt werden.",
      },
    },
  },
  /**
   * The customer list at /kunden (US-15.3) — the screen that replaces the spreadsheet.
   *
   * Every filter and every row state is named in words; the group and status are painted, but the
   * paint only repeats what the cell already says (PRD §US-15.3). The group balance is worded so it
   * cannot be mistaken for a count of the rows below — it stays whole whatever is filtered.
   */
  customerList: {
    heading: "Kunden verwalten",
    /** The two cards the screen is made of. Each is a real `<h2>`, so the page has an outline. */
    overviewTitle: "Übersicht und Aktionen",
    listTitle: "Kundenliste",
    /**
     * The three things staff do with customers, above the list (US-17.2) — worded as the acts
     * themselves, each in the same words as the heading of the screen it opens.
     */
    actions: {
      newCustomer: "Neuen Kunden aufnehmen",
      waitingList: "Warteliste",
      cardsDue: "Karten neu ausstellen",
      /**
       * The badge beside the reissue link (US-13.4): a number and nothing else — no colour, no
       * exclamation mark. A screen that looks alarmed about a to-do list is how staff learn to ignore
       * it (PRD §6). Shown at zero too, "nothing to do" being the answer most often wanted.
       */
      cardsDueBadge: (count: number): string => (count === 1 ? "1 Karte" : `${count} Karten`),
      /**
       * The waiting-list badge (US-18.1), in the reissue badge's shape and for its reasons — plus one:
       * a badge that disappears cannot be told apart from one that failed to load. It names nobody and
       * no customer number, the hub not being where that decision is made (PRD §5, FR-5).
       */
      waitingListBadge: (count: number, freeSlot: boolean): string => {
        // The waiting list's own wording — one number, stated identically on both screens. The hub
        // adds only the second clause.
        const waiting = de.waitingList.waitingCount(count);
        // Required rather than optional: a free slot tints the badge, and a tint is a distinction
        // only some staff can make (US-03.4), so the word has to travel with it. It says *that* a
        // number is free, not which — the applicant and the number belong to the banner (US-18.2).
        return freeSlot ? `${waiting} · Platz frei` : waiting;
      },
    },
    search: {
      label: "Suche",
      /** One box for all three, because choosing between them would be a question about the software. */
      placeholder: "Name, Kundennummer (50) oder Kartennummer (50k3)",
    },
    filters: {
      status: "Status",
      group: "Gruppe",
      certificate: "Bedarfsnachweis",
      /** The unset option of every filter — "no filter", never "no results". */
      all: "Alle",
      includeArchived: "Archivierte Haushalte anzeigen",
      submit: "Filtern",
      reset: "Filter zurücksetzen",
    },
    /** Where a certificate stands today, stated beside its date on every row. */
    certificateStates: {
      VALID: "gültig",
      EXPIRING_SOON: "läuft bald ab",
      EXPIRED: "abgelaufen",
    },
    /**
     * The same three as filter options. „Gültig“ says out loud that it includes the ones expiring
     * soon: a staff member picking it is asking who is allowed in, not who has nothing to renew.
     */
    certificateFilters: {
      VALID: "gültig (auch bald ablaufende)",
      expiringSoon: (days: number): string => `läuft in den nächsten ${days} Tagen ab`,
      EXPIRED: "abgelaufen",
    },
    /** The group balance above the table — the number staff keep even (FR-3). */
    groupBalance: (red: number, blue: number): string => `Rot: ${red} · Blau: ${blue}`,
    // „Alle“ carries the filter-independence in one word, which is the misreading this prevents.
    groupBalanceHint: "Alle aktiven Haushalte je Gruppe.",
    /** How many rows are shown; German inflects the one. */
    resultCount: (count: number): string => (count === 1 ? "1 Haushalt" : `${count} Haushalte`),
    table: {
      customerNumber: "Nr.",
      name: "Name",
      cardNumber: "Karte",
      group: "Gruppe",
      status: "Status",
      /**
       * One column, because the two are read as one fact — and two long German headings cost 174px to
       * show one digit each, out of the name, which is the column staff scan.
       */
      household: "Erw. + Kinder",
      price: "Preis",
      /**
       * Shortened from „Nachweis gültig bis“, which set the column's floor at 217px for a ten-character
       * date — but not to „Nachweis“ alone: a date under that heading could as easily be the day the
       * certificate was handed in.
       */
      certificate: "Nachweis bis",
      reminders: "Erinnerungen",
      /**
       * A tally of nought as a dash: thirteen zeroes down a column of fifteen is noise to look past
       * to find the two rows where somebody was reminded.
       */
      noReminders: "–",
    },
    /**
     * The filters in force, one clause each, read by two messages — the empty table's and
     * `filterSummary`. Whether archived households are included is named even at its default:
     * „keine Treffer“ under a hidden-by-default filter is how a staff member concludes a household
     * was deleted.
     */
    filterClauses: {
      search: (text: string): string => `Suche „${text}“`,
      status: (label: string): string => `Status: ${label}`,
      group: (label: string): string => `Gruppe: ${label}`,
      certificate: (label: string): string => `Bedarfsnachweis: ${label}`,
      archivedIncluded: "einschließlich archivierter Haushalte",
      archivedHidden: "ohne archivierte Haushalte",
    },
    /**
     * What stands over a table that **has** rows, whenever anything is filtered — the same clauses as
     * `empty.filtered`. Its mere presence is what tells a filtered list from the whole register,
     * which is why the unfiltered one carries no line rather than a line saying so.
     */
    filterSummary: (filters: string): string => `Gefiltert: ${filters}`,
    /**
     * What stands where the table would be empty, naming the same filters — „keine Treffer“ under a
     * filter set three screens ago is how staff conclude a household was deleted.
     */
    empty: {
      unfiltered: "Es ist noch niemand aufgenommen.",
      filtered: (filters: string): string =>
        `Kein Haushalt entspricht den gewählten Filtern (${filters}). Bitte die Suche oder die ` +
        `Filter ändern.`,
    },
  },
  /**
   * The cards-due-for-reissue screen (US-13.4). **The tone is the feature**: a to-do list, not an
   * alert queue, and it must never suggest that a household with an outdated card be turned away
   * (PRD §6, FR-5) — so no word here reads as a deadline.
   */
  cardsDue: {
    heading: "Karten neu ausstellen",
    /**
     * The list itself. Its count is `customerList.actions.cardsDueBadge` rather than a second wording:
     * two phrasings of one fact are how two screens come to disagree.
     */
    listTitle: "Karten",
    // That a stale card turns nobody away is said where it could be got wrong — at the counter
    // ({@link distribution.counter.staleCard}), not in a caption over this list.
    empty: "Zurzeit ist keine Karte neu auszustellen.",
    countsOnCard: "Auf der Karte gedruckt",
    countsToday: "Haushalt heute",
    /** Why the card and the record differ — the two cases `StaleCardReason` names. */
    reasons: {
      AGE_13: "13. Geburtstag",
      HOUSEHOLD_CHANGE: "Haushalt geändert",
    },
    /**
     * Only the label is its own — the confirmation, button and rejections are `customers.reissue`'s,
     * because a reissue from here is the same act as one from the record (US-09).
     */
    action: "Karte neu ausstellen",
    /**
     * Worded exactly as `distribution.counter.recordLink`: the screen it opens calls itself
     * „Kundenübersicht“, so that is what every link to it says.
     */
    customerLink: "Zur Kundenübersicht",
  },
  /**
   * The waiting list at /warteliste (US-12.4).
   *
   * **The order is the feature**, so the screen states it in words and offers nothing that could
   * change it — no sortable headings, no „nach vorne“ (PRD §6). An expired certificate is written as
   * a fact and never a verdict: the applicant keeps their place and is asked for a renewed notice.
   */
  waitingList: {
    heading: "Warteliste",
    /** The list itself; `orderRule` is its description, being the rule it is ordered by. */
    listTitle: "Wer wartet",
    /**
     * How many are on it. `customerList.actions.waitingListBadge` is written in terms of this rather
     * than the other way round: two phrasings of one number is how two screens come to disagree.
     */
    waitingCount: (count: number): string =>
      count === 0 ? "niemand wartet" : count === 1 ? "1 Wartende:r" : `${count} Wartende`,
    /** The list's own description, because it is the rule the list exists to keep. */
    orderRule: "Wer am längsten wartet, steht oben. Die Liste lässt sich nicht umsortieren.",
    empty: "Zurzeit steht niemand auf der Warteliste.",
    position: "Platz",
    addedOn: "Angemeldet am",
    waited: "Wartet",
    contactNote: "Erreichbarkeit",
    /** German inflects the day at one; "heute" is friendlier than "0 Tage" and just as exact. */
    waitedValue: (days: number): string => {
      if (days === 0) {
        return "seit heute";
      }
      return days === 1 ? "1 Tag" : `${days} Tage`;
    },
    /** The badge on a row whose certificate lapsed while the applicant waited (FR-5). */
    certificateExpired: "Nachweis abgelaufen",
    certificateExpiredHint:
      "Der Platz auf der Liste bleibt bestehen. Vor der Aufnahme wird ein neuer Nachweis benötigt.",
    /**
     * The "a slot is free" banner — the feature's whole value (PRD §6). It names one applicant and
     * one number, because a banner that only said "es ist etwas frei" would leave the decision it
     * exists to make to whoever happens to read it.
     */
    banner: {
      heading: "Ein Platz ist frei",
      names: (applicant: string, customerNumber: number): string =>
        `Kundennummer ${customerNumber} ist frei. Am längsten wartet ${applicant}.`,
      action: "Jetzt registrieren",
      /** On the home screen, where the list itself is not on view. */
      listLink: "Warteliste öffnen",
    },
    /** Putting somebody on the list. */
    add: {
      heading: "Auf die Warteliste setzen",
      contactNoteLabel: "Erreichbarkeit (optional)",
      /**
       * The example does the work — it is what makes „Freitext“ mean more than an empty box. The
       * second sentence is a deliberate decision about DF's data, stated nowhere else on any screen.
       *
       * Phrased as what the software does rather than as an instruction: „Keine Telefonnummern und
       * E-Mail-Adressen“ would put one „keine“ in front of two nouns and read as forbidding only the
       * pair. „bewusst“ is the word that makes it a decision rather than an order.
       */
      contactNoteHint:
        "Freitext, z. B. „über die Nachbarin, dienstags vormittags“. Telefonnummern und " +
        "E-Mail-Adressen werden bewusst nicht erfasst.",
      submit: "Auf die Warteliste setzen",
      submitting: "Wird gespeichert …",
      saved: (applicant: string): string => `${applicant} steht jetzt auf der Warteliste.`,
    },
    /** Taking somebody off the list before they were ever registered (FR-6). */
    remove: {
      action: "Von der Warteliste nehmen",
      confirm: (applicant: string): string =>
        `${applicant} wird von der Warteliste genommen. Der Eintrag bleibt mit dem Grund ` +
        `erhalten, damit die Reihenfolge nachvollziehbar bleibt.`,
      reasonLabel: "Grund",
      reasonHint: "Zum Beispiel: zurückgezogen, umgezogen, nicht mehr erreichbar.",
      submit: "Von der Warteliste nehmen",
      submitting: "Wird entfernt …",
      /**
       * Read on the list after the row is gone. **It names nobody**: a name here would have to travel
       * through the URL the removal redirects via, and a browser history is the one place DF's data
       * must not end up. What is left to say is that the entry was kept.
       */
      saved: "Der Eintrag ist von der Warteliste genommen.",
    },
    /** Registering the applicant a freed slot belongs to. */
    promote: {
      heading: "Von der Warteliste aufnehmen",
      intro: (applicant: string, customerNumber: number): string =>
        `${applicant} steht am längsten auf der Warteliste und erhält die Kundennummer ` +
        `${customerNumber}. Die Angaben von der Warteliste sind vorausgefüllt und lassen sich hier ` +
        `noch ändern.`,
      /**
       * Shown *before* the form when the certificate lapsed during the wait — a step, not a dialog.
       * The applicant is never sent away: DF has not decided how such a case is handled (PRD §9).
       */
      expiredHeading: "Der Bedarfsnachweis ist abgelaufen",
      expiredDetail: (validUntil: string): string =>
        `Der vorgelegte Nachweis galt bis zum ${validUntil}. Für die Aufnahme wird ein aktueller ` +
        `Nachweis benötigt.`,
      expiredContinue: "Verstanden, jetzt aufnehmen",
      backToList: "Zurück zur Warteliste",
    },
    errors: {
      certificateExpired: (validUntil: string): string =>
        `Der Bedarfsnachweis ist am ${validUntil} abgelaufen. Für die Warteliste wird — wie für ` +
        `die Aufnahme — ein gültiger Nachweis benötigt.`,
      missingReason: "Bitte einen Grund angeben.",
      notFound: "Dieser Eintrag steht nicht mehr auf der Warteliste. Bitte die Seite neu laden.",
      noFreeCustomerNumber:
        "Zurzeit ist keine Kundennummer frei. Es kann niemand von der Warteliste aufgenommen werden.",
      unknown: "Die Änderung konnte nicht gespeichert werden.",
    },
  },
  /** The distribution screen at /ausgabe — which group collects today, and who is at the counter. */
  distribution: {
    heading: "Ausgabe",
    colours: {
      RED: "Rot",
      BLUE: "Blau",
    },
    /** The colour is always named in words; the banner's colour only repeats what the text says. */
    group: (colour: string): string => `Gruppe ${colour}`,
    banner: {
      isDistributionDay: "Heute ist Ausgabe",
      noDistributionDay: "Heute ist keine Ausgabe",
      next: (date: string, colour: string): string => `Nächste Ausgabe: ${date}, Gruppe ${colour}`,
      /**
       * The week number alone — `KW 02`, not `Kalenderwoche 2026-W02`: the date beside it carries the
       * year, and staff check it against a wall calendar that prints two digits.
       */
      week: (week: string): string => `KW ${week}`,
    },
    /**
     * The counter lookup — the most-read text in the product, and held to the strictest account:
     * every string here is paid for on every lookup of every afternoon
     * (`tasks/prd-us-04-lookup-customer.md` §US-04.4). The verdict's colour never travels without the
     * word it names.
     *
     * The number formats are stated only in `errors.notANumber`, where they are genuinely unclear —
     * to the one person who has just typed something unreadable.
     */
    counter: {
      heading: "Kunden nachschlagen",
      label: "Nummer",
      submit: "Nachschlagen",
      /**
       * A verdict is its headline — everything a sentence beneath it could add is already a tile, a
       * badge or a row below.
       *
       * `blocked.noReason` is the exception that sets the bar: the block reason is the only words at
       * the counter a colleague typed rather than the screen derived. A verdict that ever needs a
       * sentence again has to pass that test.
       */
      verdicts: {
        notFound: { headline: "Nummer nicht gefunden" },
        archived: { headline: "Archiviert" },
        blocked: {
          headline: "Gesperrt",
          noReason: "Es ist kein Grund hinterlegt. Bitte in der Kundenakte nachsehen.",
        },
        wrongGroup: { headline: "Falsche Gruppe" },
        outdatedCard: { headline: "Karte ungültig" },
        alreadyServedToday: { headline: "Heute bereits ausgegeben" },
        clearToServe: { headline: "Ausgabe frei" },
        certificateExpired: { headline: "Ausgabe frei — Nachweis abgelaufen" },
      },
      details: {
        heading: "Angaben zum Haushalt",
        reminderCount: "Erinnerungen an den Nachweis",
        noNotes: "Keine Bemerkung hinterlegt.",
      },
      /**
       * The disclosure that lets the counter write the note it is reading (US-16.3).
       *
       * Two words for one control: „bearbeiten“ warns that a colleague's sentence is already in the
       * field and that saving replaces it, and that has to be legible before the click rather than
       * after. No hint under the field — the record's says the note is shown „an der Ausgabe“, which
       * here would describe where the reader is standing.
       */
      notes: {
        add: "Bemerkung hinzufügen",
        edit: "Bemerkung bearbeiten",
      },
      /**
       * The note for a card whose printed counts the household has outgrown (US-13.4).
       *
       * Deliberately neither a verdict nor a warning: a stale card is never grounds to turn anyone
       * away (FR-5), so no „Achtung“, no exclamation mark, and nothing asking the counter to act
       * before the next customer. DF were offered „Achtung“ and did not want it.
       *
       * Today's counts are **not** repeated — they are tiles a thumb's width away.
       */
      staleCard: (cardNumber: string, onCard: string): string =>
        `Karte ${cardNumber} ist veraltet — gedruckt: ${onCard}. Es gelten die heutigen Zahlen.`,
      /**
       * The way from the counter to the whole record (US-16.5) — named after what it leads to rather
       * than „Mehr“, the counter showing only a slice of it.
       */
      recordLink: "Zur Kundenübersicht",
      errors: {
        notANumber:
          "Das ist keine Kundennummer und keine Kartennummer. Erwartet werden zum Beispiel 50 " +
          "oder 50k3.",
      },
    },
    /**
     * How far through today's group the afternoon is (`tasks/prd-us-23-group-progress.md` §US-23.4).
     *
     * The summary *is* the tally, not a label hiding one: nobody should have to open the list to
     * learn the number, and both figures stand in one sentence so a screen reader does not announce
     * them as unrelated fragments.
     *
     * `open`/`close` are the fold's affordance, deliberately outside that sentence: which of the two
     * shows depends on the fold's state, and the tally does not.
     */
    progress: {
      summary: (group: string, served: number, expected: number): string =>
        `${group}: ${served} von ${expected} Haushalten abgeholt`,
      open: "Liste anzeigen",
      close: "Liste ausblenden",
      /** The mark on a household that has collected today. Only these rows are marked. */
      served: "abgeholt",
      /** An empty group in words, rather than a disclosure that opens onto nothing. */
      empty: (group: string): string => `${group}: zurzeit ist kein Haushalt zugeordnet.`,
    },
    /**
     * Recording the hand-out — the one write the counter makes
     * (`tasks/prd-us-05-record-attendance.md` §US-05.4). Once a record exists for today, the same
     * place shows it and the controls to correct or remove it.
     */
    serve: {
      submit: "Ausgabe erfassen",
      /** „Betrag“ and not „Bezahlt“ (US-29.7): the field takes a number, not a yes-or-no. */
      amount: "Betrag",
      /**
       * What was asked on the day, above the correction field so the amount can be read against
       * something. „Gefordert“ rather than „Preis“: a household settling a debt was asked for more.
       */
      asked: (cents: number): string => `Gefordert: ${formatEuros(cents)}`,
      /**
       * Read on the empty counter the write navigates to (US-32.7). The household is gone from the
       * screen by then, so the sentence names all four facts needed to be sure the right record was
       * made: number, name, amount, time.
       *
       * The **balance is deliberately absent** — a household that still owes money is not something
       * to be told about once they have left, and „Korrigieren“ leads back to the screen that says it.
       */
      recorded: (customerNumber: number, name: string, paidCents: number, time: string): string =>
        `Ausgabe für #${customerNumber} ${name} erfasst — ` +
        `${formatEuros(paidCents)} um ${time} Uhr.`,
      /** The link back to the household this confirmation names, one click from the correction. */
      correctRecorded: "Korrigieren",
      /**
       * Shown in place of the serve action for a household already recorded today: the time, and what
       * was handed over against what was asked (US-29.7). Two amounts rather than „bezahlt“/„nicht
       * bezahlt“, which cannot say 2,00 € of 5,00 €.
       */
      alreadyServed: (time: string, paidCents: number, askedCents: number): string =>
        `Heute bereits versorgt um ${time} Uhr. ` +
        `(${formatEuros(paidCents)} von ${formatEuros(askedCents)} gezahlt)`,
      /**
       * The question an amount above what was asked raises (US-29.7). A question and not a fault —
       * paying ahead is never refused outright — asked because a mistyped credit is the one error
       * this design cannot undo, where a shortfall shows up at the very next hand-out.
       */
      overpayment: {
        question: (paidCents: number, amountToPayCents: number): string =>
          `${formatEuros(paidCents)} statt ${formatEuros(amountToPayCents)} — wirklich so buchen? ` +
          `${formatEuros(paidCents - amountToPayCents)} bleiben als Guthaben stehen.`,
        /** Names the act rather than answering „ja“, so the button says what pressing it does. */
        confirm: "Ja, Betrag so buchen",
      },
      correct: {
        heading: "Heutigen Eintrag korrigieren",
        save: "Betrag speichern",
        saved: "Eintrag aktualisiert.",
        remove: "Eintrag entfernen",
        /**
         * The one consequence of a removal that „entfernen“ does not already say: the balance returns
         * to where it stood before today (US-29, rule 9), and it is the only figure on the screen a
         * removal moves invisibly.
         */
        removeConfirm: (balanceWithoutRecordCents: number): string =>
          `Diesen Eintrag wirklich entfernen? Der Saldo steht danach wieder bei: ` +
          `${balanceWording(balanceKind(balanceWithoutRecordCents), balanceWithoutRecordCents)}.`,
        removeConfirmButton: "Ja, entfernen",
        removed: "Eintrag entfernt. Der Haushalt kann heute erneut erfasst werden.",
      },
      errors: {
        notClearToServe: "Ausgabe nicht möglich. Bitte den Hinweis oben beachten.",
        alreadyServed: "Dieser Haushalt hat heute bereits eine Ausgabe erhalten.",
        noLongerCorrectable:
          "Dieser Eintrag stammt nicht von heute und kann nicht mehr geändert werden.",
        notFound: "Der Eintrag wurde nicht gefunden. Bitte die Seite neu laden.",
        /** The field takes euros as DF write them — `4`, `4,00` and `4.00` all read the same. */
        notAnAmount: "Kein gültiger Betrag. Bitte so eingeben: 4,00",
        unknown: "Die Ausgabe konnte nicht gespeichert werden. Bitte erneut versuchen.",
      },
    },
    /**
     * The certificate actions at the counter (`tasks/prd-us-06-certificate-reminder.md` §US-06.4).
     * The screen states facts and offers the two actions; it never advises what the count should
     * mean, that judgement being deliberately the staff's (FR-6).
     */
    certificate: {
      /** Names the pair of actions as one thing on the counter screen; the renewal keeps its own. */
      heading: "Bedarfsnachweis",
      reminder: {
        submit: "Erinnerung erfassen",
        /** The explanatory label the disabled button carries for the rest of the day (FR-5). */
        loggedToday: "Erinnerung heute bereits erfasst",
        confirmed: (count: number): string =>
          `Erinnerung erfasst. Bisherige Erinnerungen: ${count}.`,
        errors: {
          alreadyLogged: "Für diesen Haushalt ist heute bereits eine Erinnerung erfasst.",
          stillValid: "Der Bedarfsnachweis ist noch gültig. Es gibt nichts zu erinnern.",
          unknown: "Die Erinnerung konnte nicht gespeichert werden. Bitte erneut versuchen.",
        },
      },
      renewal: {
        heading: "Neuen Bedarfsnachweis erfassen",
        /** The side effect — the only part of this form the form itself does not show. */
        hint: "Erinnerungen werden dabei auf 0 zurückgesetzt.",
        submit: "Nachweis speichern",
        saved: "Nachweis gespeichert. Erinnerungen zurückgesetzt: 0.",
        errors: {
          validUntilInPast:
            "Das Datum „gültig bis“ liegt in der Vergangenheit. Bitte das Datum prüfen.",
          dateMissing: "Datum fehlt.",
          notADate: "Kein gültiges Datum.",
          unknown: "Der Nachweis konnte nicht gespeichert werden. Bitte erneut versuchen.",
        },
      },
    },
    /**
     * Both reachable from the banner alone: the screen resolves today's settings, and either there
     * are none or the anchor week is not a week of the calendar.
     */
    errors: {
      noSettings:
        "Für dieses Datum sind keine Einstellungen hinterlegt. Bitte die Grundeinstellungen " +
        "einspielen.",
      invalidAnchor:
        "Die Ankerwoche in den Einstellungen benennt keine Woche des Kalenders. Bitte die " +
        "Einstellungen prüfen.",
    },
  },
  settings: {
    heading: "Einstellungen",
    intro: "Änderungen gelten sofort. Frühere Fassungen bleiben erhalten.",
    /**
     * The three card headings, and they are the grouping: what a household gets, when they get it,
     * and the write itself.
     */
    amountsHeading: "Mengen und Preise",
    rhythmHeading: "Ausgaberhythmus",
    /** The section that held the reason and the save button unnamed until now (§3.8). */
    changeHeading: "Änderung speichern",
    fields: {
      quotaN: "Höchstzahl der Kunden (N)",
      weekAnchorIsoWeek: "Ankerwoche (ISO, z. B. 2026-W02)",
      weekAnchorColour: "Gruppe der Ankerwoche",
      distributionWeekday: "Ausgabetag",
      pricePerGrownUp: "Preis je Erwachsenem",
      pricePerChild: "Preis je Kind",
      /** Not the bare „Maximalpreis“: what tells it from the two per-head prices beside it. */
      priceCap: "Maximalpreis je Ausgabe",
      /**
       * „Eierregel“ and not „Eier“: the *figure* a household receives is „Eier“ elsewhere, and a
       * change to the rule must not arrive in the history under the same word as the figure.
       */
      eggRule: "Eierregel",
    },
    /**
     * The egg allowance (US-28), the one list-valued policy setting. Its words are here rather than
     * in `history` because the same phrasings state a rule and state a change to it.
     */
    eggs: {
      /** The card the rule is edited in, between „Mengen und Preise“ und „Ausgaberhythmus“. */
      heading: "Eier",
      thresholdColumn: EGG_THRESHOLD_COLUMN,
      eggsColumn: EGG_COUNT_COLUMN,
      addRow: "Zeile hinzufügen",
      /** The same words the household table's remove control carries — it is the same gesture. */
      removeRow: "Zeile entfernen",
      /**
       * One control of the table, wherever it is named — the input's `aria-label` and the field a
       * refusal points at from the summary. One function for both, because they must be the same
       * string: the summary names a field the staff member then has to find. Rows count from 1 on
       * screen, from 0 in the domain and the form.
       */
      fieldLabel: (position: number, part: "minPersons" | "eggs"): string =>
        `Eier, Zeile ${position}: ${part === "minPersons" ? EGG_THRESHOLD_COLUMN : EGG_COUNT_COLUMN}`,
      /** No rows is a legitimate setting, and an empty area cannot be told from one that failed. */
      empty: "Keine Stufen hinterlegt. Kein Haushalt erhält Eier.",
      /**
       * The two collisions between rows, said by the button and naming **no** field: marking one row
       * would call it malformed when the two are merely inconsistent. So the sentence names the
       * thresholds itself — with no mark, that is the only way the rows are findable.
       */
      duplicateThreshold: (minPersons: number): string =>
        `Es gibt zwei Zeilen ${fromPersons(minPersons)}. Jede Stufe darf nur einmal vorkommen. ` +
        `Es wurde nichts gespeichert.`,
      eggsNotIncreasing: (
        minPersons: number,
        eggs: number,
        lowerMinPersons: number,
        lowerEggs: number,
      ): string =>
        `Die Zeile ${fromPersons(minPersons)} gibt ${eggCount(eggs)} und damit nicht mehr als die ` +
        `${eggCount(lowerEggs)} ${fromPersons(lowerMinPersons)}. Größere Haushalte müssen mehr ` +
        `Eier erhalten als kleinere. Es wurde nichts gespeichert.`,
      /**
       * One row as it stands: „ab 3 Personen: 6 Eier“. The three phrasings below are this clause plus
       * what became of the row, so a rule and a change to it name a row in the same words.
       */
      row: eggRow,
      /**
       * What a rule with no rows reads as — {@link de.settings.prices.noCap}'s counterpart. „keine
       * Eier“ and „0 Eier ab 1 Person“ are two different configurations.
       */
      none: "keine Eier",
      /** A row that was not in the previous rule: „ab 8 Personen: 18 Eier (neu)“. */
      rowAdded: (minPersons: number, eggs: number): string => `${eggRow(minPersons, eggs)} (neu)`,
      /** A row the new rule no longer has: „ab 3 Personen: 6 Eier (entfernt)“. */
      rowRemoved: (minPersons: number, eggs: number): string =>
        `${eggRow(minPersons, eggs)} (entfernt)`,
      /** „ab 5 Personen: 12 → 14 Eier“ — the unit once, at the end; a threshold cannot change. */
      rowChanged: (minPersons: number, from: number, to: number): string =>
        `${fromPersons(minPersons)}: ${from} → ${eggCount(to)}`,
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
      /**
       * What makes an empty Maximalpreis readable as a decision rather than an unfilled field — the
       * one thing on this screen that can be got wrong by doing nothing, and why `aria-describedby`
       * points here from that field.
       */
      hint: "Leer lassen: kein Maximalpreis.",
      /**
       * What an empty Maximalpreis says wherever a cap is read back. „kein Maximalpreis“ and „0,00 €“
       * are two different configurations — the second means every household collects for free.
       */
      noCap: "kein Maximalpreis",
    },
    /**
     * German names for the fields `InvalidSettings` can name, keyed by its own `field` values so a
     * refusal never quotes an English identifier at staff.
     */
    errorFields: {
      quotaN: "Höchstzahl der Kunden (N)",
      distributionWeekday: "Ausgabetag",
      "weekAnchor.isoWeek": "Ankerwoche (ISO, z. B. 2026-W02)",
      "weekAnchor.colour": "Gruppe der Ankerwoche",
      pricePerGrownUp: "Preis je Erwachsenem",
      pricePerChild: "Preis je Kind",
      /** Spelled `priceCap` on both sides, so the refusal marks the field without a translation. */
      priceCap: "Maximalpreis je Ausgabe",
    } as Record<string, string | undefined>,
    reason: "Grund der Änderung (optional)",
    reasonHint: "Wird, falls angegeben, im Änderungsprotokoll festgehalten.",
    save: "Speichern",
    saving: "Wird gespeichert …",
    saved: "Gespeichert. Die neuen Werte gelten ab sofort.",
    /**
     * The version history, folded away and written as a diff: each superseded version states only
     * what moved. The labels are `fields`, `colours` and `weekdays` above, so a change is named in
     * the same words as the control that made it.
     */
    history: {
      heading: "Änderungsverlauf",
      empty: "Es gibt noch keine weiteren Fassungen.",
      recordedAt: "Geändert am",
      current: "aktuell gültig",
      /** Stated at zero in words, so a count that failed to load cannot pass for an empty history. */
      count: (count: number): string => {
        if (count === 0) {
          return "Noch keine Fassung";
        }
        return count === 1 ? "1 Fassung" : `${count} Fassungen`;
      },
      /** With the fold shut, the other half of what the summary answers: when this last moved. */
      lastChange: (date: string): string => `zuletzt geändert am ${date}`,
      /** A single version was never *changed* — it is where the configuration started. */
      created: (date: string): string => `angelegt am ${date}`,
      initial: "Erstkonfiguration",
      noChange: "Keine Änderung an den Werten",
      /** One changed field, both sides of it: `Preis je Erwachsenem: 1,80 € → 2,00 €`. */
      change: (label: string, from: string, to: string): string => `${label}: ${from} → ${to}`,
      /**
       * A list-valued setting's change, as the rows that moved rather than two whole values. The rows
       * arrive in threshold order carrying their own words, so this only joins them under the label —
       * a rule on either side of an arrow is the restatement this history exists to avoid.
       */
      rowChanges: (label: string, rows: ReadonlyArray<string>): string =>
        `${label}: ${rows.join(" · ")}`,
    },
    errors: {
      /**
       * The two marks that sit **under** a refused control, in {@link invalidValue}'s register: a
       * short clause, no „Bitte“ and no example, because the field is directly above and the summary
       * by the button says the rest. No example is needed either — the money fields beside the
       * refused one still show `2,00` and `1,00`.
       *
       * `ab 0` stays because it is not a hint but the other half of the rule: `wholeNumber` refuses
       * `-1` on the same regex it refuses `1,5` on, and „Keine ganze Zahl.“ would call a negative
       * something it is not.
       */
      notAnInteger: "Keine ganze Zahl ab 0.",
      notAnAmount: "Kein gültiger Betrag.",
      noSettings:
        "Es sind noch keine Einstellungen hinterlegt. Bitte die Grundeinstellungen einspielen.",
      unknown: "Die Änderung konnte nicht gespeichert werden.",
      quotaBelowActiveCustomers: (quotaN: number, activeCustomers: number): string =>
        `Die Höchstzahl ${quotaN} liegt unter den derzeit ${activeCustomers} aktiven Kunden. ` +
        `Es wurde nichts gespeichert.`,
      invalidSettings: (field: string): string => `Ungültiger Wert im Feld „${field}“.`,
      invalidAmount: (text: string): string => `„${text}“ ist kein Betrag wie 2,50.`,
      /**
       * The mark under the field itself, terser than the summary rather than a copy: the summary has
       * to say *which* field because it is 442px from every one of them, and repeating that name
       * beneath its own label reads as a stutter.
       */
      invalidValue: "Ungültiger Wert.",
    },
  },
} as const;

export type Dictionary = typeof de;

/** A household field as the domain names it, e.g. `householdMembers.1.firstName`. */
const HOUSEHOLD_FIELD = /^householdMembers\.(\d+)\.(firstName|lastName|birthDate)$/;

/**
 * The German label for a field a customer error names, in the **domain's** vocabulary. It always
 * answers — an unknown field is quoted as it stands, an English identifier being better than
 * nothing. {@link customerFormFieldLabel} asks the same of a form and deliberately does not.
 */
export function customerFieldLabel(field: string): string {
  return householdFieldLabel(field) ?? de.customers.errorFields[field] ?? field;
}

/**
 * „Haushaltsmitglied 2: Geburtsdatum“ for a household row, `null` for anything else. Rows are
 * numbered rather than listed, there being no upper bound on how many people live in a household;
 * they count from 1 on screen and from 0 in the domain and the form.
 */
function householdFieldLabel(field: string): string | null {
  const householdMatch = HOUSEHOLD_FIELD.exec(field);
  if (householdMatch === null) {
    return null;
  }
  const position = Number(householdMatch[1]) + 1;
  const part = de.customers.fields[householdMatch[2] as "firstName" | "lastName" | "birthDate"];
  return `${de.customers.new.memberRow(position)}: ${part}`;
}

/** The names of the fields the registration form submits, as `de.customers.fields` keys them. */
const FORM_FIELDS = de.customers.fields as Record<string, string | undefined>;

/**
 * The German label for a field of a **form**, or `null` for a path no field on screen carries.
 *
 * It speaks the form's vocabulary rather than the domain's — `street`, not `address.street` —
 * because what the browser can mark is an input; translating between them is the action's job
 * (`registration-input.ts`).
 *
 * And it **misses** where {@link customerFieldLabel} falls back to the identifier, which is the point
 * of the return type: a path with no label is a field nobody can see, so it is a tampered hidden
 * input — an error, not a refusal (`docs/guideline/ui_styling_guide.md` §7).
 */
export function customerFormFieldLabel(path: string): string | null {
  return householdFieldLabel(path) ?? FORM_FIELDS[path] ?? null;
}

/** The names of the fields the settings form submits, as `de.settings.fields` keys them. */
const SETTINGS_FORM_FIELDS = de.settings.fields as Record<string, string | undefined>;

/** A row of the egg rule as the domain and the form both name it, e.g. `eggRule.1.eggs`. */
const EGG_RULE_FIELD = /^eggRule\.(\d+)\.(minPersons|eggs)$/;

/**
 * {@link householdFieldLabel} for the egg rule (US-28), and for its reason. Without it a refused row
 * would be a path with no label — dropped as a field nobody can see (§7) — and the summary would fall
 * through to „nichts gespeichert“ for a box right there on the screen.
 */
function eggRuleFieldLabel(field: string): string | null {
  const match = EGG_RULE_FIELD.exec(field);
  if (match === null) {
    return null;
  }
  return de.settings.eggs.fieldLabel(Number(match[1]) + 1, match[2] as "minPersons" | "eggs");
}

/**
 * {@link customerFormFieldLabel} for the settings screen, missing for the same reason.
 *
 * `de.settings.fields` is keyed by the `name` each input carries, so only `reason` needs a case of
 * its own — it is not one of the values being set, but it *is* a box on the screen, and a summary
 * that skipped it would fall through to „nichts gespeichert“. Nothing refuses it today, which is
 * exactly why it would go unnoticed if it ever did.
 *
 * The egg rule is a table rather than a field, so {@link eggRuleFieldLabel} answers its paths.
 */
export function settingsFormFieldLabel(name: string): string | null {
  if (name === "reason") {
    return de.settings.reason;
  }
  return eggRuleFieldLabel(name) ?? SETTINGS_FORM_FIELDS[name] ?? null;
}
