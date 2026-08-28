/**
 * German UI strings for FD-Management.
 *
 * The application is used exclusively by the Füllhorn Delbrück staff, so all user-facing
 * text is German while code identifiers stay English (see docs/architecture/08-crosscutting-concepts.md §Internationalisation).
 * Keeping the strings in one dictionary module makes the surface easy to review and, if it is ever
 * needed, to translate.
 *
 * The imports below are the module's only ones, and all three are pure domain: an amount of money is
 * written by `formatEuros` and nowhere else (`CLAUDE.md` §Coding style), and a balance is *named*
 * from its `BalanceKind` rather than from its sign. Formatting the amounts here is what keeps a
 * leading minus off every screen at once — an entry taking a ready-made string would leave each
 * caller to remember, and rule 6 forbids making a staff member read a sign.
 */

import { balanceKind, type BalanceKind, type PaymentStanding } from "@/domain/distribution/balance";
import { formatEuros } from "@/domain/money";

/**
 * „ab 3 Personen“, and „ab 1 Person“ for the threshold of one the egg rule allows (US-28).
 *
 * A module-level helper rather than a dictionary entry: it is a fragment of grammar the three row
 * phrasings below share, never a string a screen asks for on its own.
 */
function fromPersons(minPersons: number): string {
  return `ab ${minPersons === 1 ? "1 Person" : `${minPersons} Personen`}`;
}

/** „6 Eier“, and „1 Ei“ for the single egg nothing in the rule forbids. */
function eggCount(eggs: number): string {
  return eggs === 1 ? "1 Ei" : `${eggs} Eier`;
}

/**
 * One row of the egg rule as it stands: „ab 3 Personen: 6 Eier“ (US-28).
 *
 * Module-level because it is the clause four dictionary entries share — the row on its own, which
 * the summary of the version in force states, and that same row with what happened to it appended,
 * which the history states.
 */
function eggRow(minPersons: number, eggs: number): string {
  return `${fromPersons(minPersons)}: ${eggCount(eggs)}`;
}

/**
 * The two column headings of the egg-rule table, module-level because they are said twice: once over
 * the column and once inside the name of every control in it ({@link de.settings.eggs.fieldLabel}).
 *
 * „Ab wie vielen Personen“ rather than „Personenzahl“, because the column holds a **floor** and not
 * a count — the distinction the whole rule turns on (US-28).
 */
const EGG_THRESHOLD_COLUMN = "Ab wie vielen Personen";
const EGG_COUNT_COLUMN = "Eier";

/**
 * A balance in words: „Guthaben 2,00 €“, „Offen 2,00 €“, „ausgeglichen“ (US-29).
 *
 * **Never signed.** The word says which way the amount runs, so the figure is printed from its
 * absolute value and no screen in the application shows a leading minus — rule 6 forbids making a
 * staff member read a sign. Which way it runs is read once, by `balanceKind` in the domain, and only
 * named here; a screen that compared the number to zero itself would decide the rule a second time.
 *
 * A settled balance is a word and not „0,00 €“: it is the state staff look for, and a zero beside a
 * euro sign reads like an amount that merely happens to be nothing.
 *
 * Module-level because two entries say it — the tile on the counter and the record, and the sentence
 * warning what a removal does to the balance.
 */
function balanceWording(kind: BalanceKind, cents: number): string {
  if (kind === "SETTLED") {
    return "ausgeglichen";
  }
  const amount = formatEuros(Math.abs(cents));
  return kind === "CREDIT" ? `Guthaben ${amount}` : `Offen ${amount}`;
}

export const de = {
  app: {
    name: "Füllhorn Delbrück – Verwaltung",
    tagline: "Kundenverwaltung und Erfassung der Lebensmittelausgabe",
  },
  /**
   * How a day is written, everywhere it is typed or refused (ADR-013).
   *
   * One string rather than the literal repeated at eight fields: the placeholder in the box and the
   * sentence a rejection uses have to agree, and they only stay agreed if they are the same value.
   */
  day: {
    /** Shown in an empty day field. Also the answer to "what does this box want?". */
    placeholder: "TT.MM.JJJJ",
  },
  /**
   * The grammar every form on the app uses to summarise a refusal by its button, once the fields it
   * names are known (`src/app/field-refusal.ts`).
   *
   * Its own group rather than a corner of `customers.errors`, where it started: the settings screen
   * refuses fields too, and reaching into the customer dictionary for a sentence about a price per
   * head would say these words belong to a screen when they belong to a *shape* — a summary that
   * names fields, with the marks doing the rest.
   */
  forms: {
    /**
     * The summary for a refusal the *form* raised — a day that cannot be read, a field left blank —
     * where the schema's own message says only what is wrong and the field has to be named around
     * it.
     *
     * The label is quoted because a household field is itself „Haushaltsmitglied 2: Geburtsdatum“,
     * and „Haushaltsmitglied 2: Geburtsdatum: Datum fehlt.“ is three colons deep.
     */
    fieldProblem: (field: string, problem: string): string => `„${field}“: ${problem}`,
    /**
     * The same summary when more than one field was refused at once, which a form with a day field
     * per household member makes ordinary. It names them rather than counting them: the marks are
     * at the fields, but a staff member scrolled to the button has to know how far up to look and
     * how many times.
     */
    severalFieldProblems: (fields: ReadonlyArray<string>): string =>
      `Bitte ${fields.length} Felder prüfen: ${fields.map((field) => `„${field}“`).join(", ")}.`,
  },
  /**
   * The navigation bar (US-17.1). Four words, and each is the *only* name that area has: the label
   * here and the heading on the page it leads to are deliberately identical, so a staff member
   * following "Kunden verwalten" lands on a page that says it back to them.
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
   * The Start dashboard (US-17.3). It is a screen to be read, not a menu: the nav bar carries the
   * links now, so what is left is the date and the answer to "wann ist die nächste Ausgabe".
   */
  home: {
    /**
     * The greeting *is* the heading. There is no second welcoming sentence: it said in a paragraph
     * what the two lines below it then state as facts, which is the sort of text staff stop reading
     * after the first week.
     */
    heading: "Willkommen im Delbrücker Füllhorn",
    /** The day, written out — and no clock time: the page has nothing that ticks (FR-7). */
    today: (date: string): string => `Heute ist ${date}.`,
    distribution: {
      /**
       * Today and a coming day are two sentences rather than one sentence styled two ways: on the
       * day itself the line reads differently, not louder (PRD §6).
       *
       * The group is a note in brackets rather than a clause of its own — DF's wording, once they
       * had seen it as `– Gruppe Rot holt ab.` Nothing is lost by it: the screen is no longer
       * tinted, so the word in brackets is now the *only* thing saying which group collects, which
       * is the way round US-03.4 asks for anyway (never colour alone).
       */
      isToday: (colour: string): string => `Heute ist Ausgabetag (${colour}).`,
      next: (date: string, colour: string): string =>
        `Die nächste Ausgabe findet am ${date} statt (${colour}).`,
      /**
       * An unseeded database is not an error screen (FR-10). The date above still stands; only the
       * distribution rhythm is missing, and the way to supply it is named.
       */
      notConfigured:
        "Der Ausgaberhythmus ist noch nicht hinterlegt. Sobald Ausgabetag und Wochenfarbe in den " +
        "Einstellungen stehen, steht hier die nächste Ausgabe.",
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
      /**
       * „schlägt die Anwendung vor“ was true of both fields until US-24, and is now true of one:
       * the number is the staff member's to pick from a list, with the lowest free one preselected.
       * „vorausgewählt … können geändert werden“ is right about both.
       */
      intro:
        "Kundennummer und Gruppe sind vorausgewählt und können geändert werden. Erwachsene und " +
        "Kinder werden aus den Geburtsdaten berechnet und können nicht eingetragen werden.",
      addressHeading: "Anschrift",
      certificateHeading: "Bedarfsnachweis",
      householdHeading: "Haushalt",
      /**
       * Says which row is the applicant's and why it cannot be typed in, rather than promising it
       * is the first: a form filled from an archived record or a waiting-list entry carries the
       * household as that record listed it, and the applicant may stand anywhere in it.
       */
      householdHint:
        "Die aufgenommene Person zählt selbst zum Haushalt. Ihre Zeile wird oben aus Name und " +
        "Geburtsdatum übernommen und lässt sich hier nicht ändern oder entfernen. Weitere " +
        "Mitglieder bitte ergänzen.",
      assignmentHeading: "Zuordnung",
      addMember: "Weiteres Haushaltsmitglied",
      removeMember: "Zeile entfernen",
      memberRow: (position: number): string => `Haushaltsmitglied ${position}`,
      /**
       * The household table's first column: the row's position, which used to be carried inside the
       * first field's label and wrapped there. Short because the column holds one or two digits.
       */
      memberNumberColumn: "Nr.",
      submit: "Aufnehmen",
      submitting: "Wird gespeichert …",
      /**
       * Shown on the record the registration lands on, not on the form — a successful registration
       * redirects, so the form itself never has good news to report.
       *
       * One sentence, and only the fact. It once went on to say the card could now be printed; DF
       * asked for that dropped, and they are right that the screen does not need it — the button
       * that prints the card is in the header, a hand's width above this line.
       */
      saved: "Kunde erfolgreich hinzugefügt.",
      /**
       * The way out of a full register (US-12.4). It stands beside the "alle Nummern sind vergeben"
       * message because that message is otherwise a dead end, and turning an applicant away is
       * exactly what the waiting list exists to prevent.
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
       * The egg allowance (US-28). „Eier“ and nothing else: the figure is a plain number of whole
       * eggs, so a „Stück“ or a note about the threshold would be the screen explaining a rule
       * nobody at the counter has to know — they hand over what it says.
       */
      eggs: "Eier",
      /**
       * The consecutive-no-show count (US-10.4). Shown only when it is greater than zero, and
       * inflected at one — the software states the number and draws no conclusion from it.
       */
      noShows: "Ausgaben in Folge verpasst",
      noShowsValue: (count: number): string => (count === 1 ? "1 Ausgabe" : `${count} Ausgaben`),
      /**
       * The two counts as one phrase, for the places that show a *pair* of them side by side — the
       * card and the household today (US-13.4). Written with labels rather than as "1 Erwachsener"
       * because the number is as often 0 or 2 as it is 1, and this form is right at every number
       * and names nobody's gender.
       */
      countsValue: (grownUps: number, children: number): string =>
        `Erwachsene: ${grownUps}, Kinder: ${children}`,
      /**
       * What the household hands over today: the price offset by their balance (US-29). „Zu zahlen“
       * and not „Preis“ — the two differ exactly when a balance is standing, and the tile beside
       * this one still says what the week itself cost.
       */
      amountToPay: "Zu zahlen",
      /** Where the household stands over all their hand-outs: a credit, an open amount, or neither. */
      balance: "Saldo",
      /** A balance in words, never signed — {@link balanceWording}, which says why. */
      balanceValue: balanceWording,
      hint: "Berechnet aus den Geburtsdaten — nicht eingebbar.",
      standardValues: "Standardpreis; am Ausgabetisch nicht anpassbar.",
      unknown: "—",
    },
    assignment: {
      /**
       * The hint under the number dropdown (US-24): how much of the register is left. Inflected at
       * one, because „1 freie Nummern“ is the kind of German that makes staff distrust the rest of
       * the screen.
       *
       * It said „die niedrigste ist vorausgewählt“ as well until the field was narrowed to the two
       * columns a three-digit box asks for, where that ran to three ragged lines. The preselection
       * is said once, in the page's intro, and the control shows the number it opened on — so what
       * is left here is the one fact only this line carries: how many are still free.
       */
      freeNumberCount: (count: number): string =>
        count === 1 ? "Noch 1 freie Nummer" : `Noch ${count} freie Nummern`,
      /**
       * The folded group choice (US-20): what the summary offers, after the badge naming the
       * proposed group in its own colour — and a colour never travels without the word it names
       * (US-03.4). It used to be prefixed with „Gruppe:“, which the column's own field label now
       * says once, above the control rather than inside it.
       */
      groupChoiceOverride: "andere Gruppe wählen",
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
      /**
       * Names the person the household is missing rather than the rule it broke: on the record the
       * customer's row is locked, so a household without them is one that was written before the
       * rule — and the answer is to type that row back in.
       */
      customerNotInHousehold: (name: string): string =>
        `${name} zählt selbst zum Haushalt und fehlt in der Liste. Bitte eine Zeile mit Namen ` +
        `und Geburtsdatum ergänzen.`,
      birthDateInFuture: "Ein Geburtsdatum liegt in der Zukunft. Bitte das Datum prüfen.",
      noFreeCustomerNumber: (quotaN: number): string =>
        `Alle ${quotaN} Kundennummern sind vergeben. Bitte einen Haushalt archivieren oder die ` +
        `Höchstzahl in den Einstellungen erhöhen. Es wurde nichts gespeichert.`,
      /**
       * One sentence for both `CustomerNumberTaken` and `CustomerNumberOutOfRange` (US-24): staff
       * do not act differently on „somebody just took it“ than on „the quota moved under you“ —
       * either way they pick another number. The two codes stay apart because the program branches
       * on them; only the sentence is shared.
       *
       * It names the number and asks for a different one. Its predecessor said „bitte erneut
       * speichern“, which was right while the software picked the number and is wrong now that
       * staff do: a chosen number that is gone fails identically however often it is re-submitted.
       */
      customerNumberUnavailable: (customerNumber: number): string =>
        `Die Kundennummer ${customerNumber} ist nicht mehr verfügbar. Bitte eine andere Nummer ` +
        `wählen.`,
      /**
       * Two answers, not one. A blank field and an unreadable one are different mistakes, and the
       * old single sentence told somebody who had typed nothing that their *format* was wrong —
       * which is what sent DF hunting for a typo that was never there (ADR-013). Both are kept
       * short: they sit under the field, beside a placeholder that already shows the format.
       */
      dateMissing: "Datum fehlt.",
      notADate: "Kein gültiges Datum.",
      /**
       * The rest of the marks that sit **under** a refused control, in the register
       * {@link dateMissing} set: three or four words, because the field they name is right above
       * them and the summary by the button says the rest.
       *
       * They are deliberately not the finished sentences beside them — `missingField` names its
       * field because it is read 1 600px away from it, and a mark that named its own field would
       * say it twice in the same eyeful.
       */
      fieldRequired: "Pflichtfeld.",
      valueTooLong: "Zu lang.",
      numberUnavailable: "Nicht mehr verfügbar.",
      /** The mark for a `gültig bis` that has already passed — {@link fieldRequired}'s register. */
      dateInPast: "Liegt in der Vergangenheit.",
      notesTooLong: (maxLength: number, length: number): string =>
        `Die Notiz ist mit ${length} Zeichen zu lang. Es sind höchstens ${maxLength} Zeichen ` +
        `möglich — bitte kürzen.`,
      groupUnchanged: (group: string): string =>
        `Der Haushalt gehört bereits zur Gruppe ${group}. Es wurde nichts geändert.`,
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
     * Blocking and unblocking a customer from their record (US-08). A block pauses a household
     * without freeing their slot; the reason is its only record and is shown verbatim at the counter.
     */
    block: {
      heading: "Sperre",
      currentReason: "Sperrgrund",
      action: "Sperren",
      reasonLabel: "Grund der Sperre",
      reasonHint:
        "Der Grund wird an der Ausgabe wortwörtlich angezeigt und ist die einzige Notiz zur " +
        "Sperre. Bitte so schreiben, dass jede Kollegin und jeder Kollege sie versteht.",
      submit: "Sperren",
      submitting: "Wird gesperrt …",
      unblock: "Sperre aufheben",
      unblockConfirm: (reason: string): string =>
        `Diese Sperre wird aufgehoben: „${reason}“. Der Kunde ist danach wieder bezugsberechtigt.`,
      unblockSubmit: "Sperre jetzt aufheben",
      unblocking: "Wird aufgehoben …",
      /**
       * The two confirmations. Each names the state the household is now in rather than the button
       * that was pressed: the controls swap places after the write — "Sperren" becomes "Sperre
       * aufheben" — and a sentence saying what was clicked would be read next to a control that
       * says the opposite.
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
     * Archiving a household (US-10). It is how someone leaves the register and the only action that
     * frees a customer number, so the confirmation says both of the things staff would otherwise
     * learn from a support call: the number goes back into circulation, and nothing is deleted.
     */
    archive: {
      heading: "Archivieren",
      action: "Diesen Haushalt archivieren",
      reasonLabel: "Grund der Archivierung",
      reasonHint:
        "Der Grund bleibt dauerhaft auf dem archivierten Datensatz stehen und ist die einzige " +
        "Erklärung, die spätere Kolleginnen und Kollegen dazu finden.",
      confirm: (customerNumber: number): string =>
        `Die Kundennummer ${customerNumber} wird sofort frei und kann bei der nächsten Aufnahme ` +
        `neu vergeben werden — möglicherweise schon morgen an einen anderen Haushalt. Der ` +
        `Datensatz bleibt vollständig erhalten und auffindbar; gelöscht wird nichts. Rückgängig ` +
        `machen lässt sich die Archivierung nicht: Wer zurückkommt, wird neu aufgenommen.`,
      submit: "Jetzt archivieren",
      submitting: "Wird archiviert …",
      /**
       * The confirmation, read at the top of the screen the archive navigated back to.
       *
       * It says what the standing banner beneath it does not: that *this click* did it. The banner
       * is a fact about the household and will be there next year; this is the receipt, and it names
       * the freed number because that is the consequence staff act on — somebody on the waiting list
       * can have it.
       */
      saved: (customerNumber: number): string =>
        `Der Haushalt ist archiviert. Die Kundennummer ${customerNumber} ist wieder frei.`,
      /** The banner an archived record carries — the reason and the day, on every screen it shows on. */
      bannerHeading: "Archiviert",
      bannerDetail: (date: string, reason: string): string =>
        `Archiviert am ${date}. Grund: „${reason}“`,
      bannerNoReason: "Zu dieser Archivierung ist kein Grund hinterlegt.",
      bannerReadOnly:
        "Der Datensatz wird nur noch angezeigt und kann nicht mehr geändert werden. Die " +
        "Kundennummer ist freigegeben und gehört möglicherweise bereits einem anderen Haushalt.",
      errors: {
        missingReason: "Bitte einen Grund für die Archivierung angeben.",
        notArchivable: "Dieser Haushalt ist bereits archiviert. Bitte die Seite neu laden.",
        unknown: "Die Archivierung konnte nicht gespeichert werden.",
      },
    },
    /**
     * Searching the archive for a returning applicant, and the pre-fill that follows (US-11).
     *
     * The riskiest moment in this whole feature is a staff member believing the old record was
     * reactivated (PRD §6), so every string that names the archived household — the result row and
     * the banner over the pre-filled form — says in the same breath that a *new* number and a *new*
     * card are being issued. The former number appears only as something to recognise the household
     * by, never as the number about to be assigned.
     */
    archiveSearch: {
      heading: "Im Archiv suchen",
      /**
       * One line, and it asks the question rather than explaining the feature. It was three lines
       * describing how the pre-fill works to somebody who has not used it yet — and the two things
       * it explained are both said again, in the right place, by the notice over a filled form.
       */
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
       * What is shown instead of a twenty-first result. There is no paging: the answer to a list
       * this long is a narrower search, and the message says which fields would narrow it rather
       * than only that there were too many.
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
        /**
         * The number this household used to hold. Labelled "früher" in the label itself, because
         * a bare "Kundennummer" beside a name is exactly what would be copied onto a new card.
         */
        formerNumber: "Frühere Kundennummer",
        formerNumberHint:
          "Nur zur Wiedererkennung. Diese Nummer ist seit der Archivierung wieder frei und " +
          "gehört möglicherweise bereits einem anderen Haushalt.",
        select: "Daten übernehmen",
        selecting: "Wird übernommen …",
        /** What the row that filled the form says instead of offering to fill it again. */
        applied: "Übernommen",
        /**
         * What opens the rest of one result row. A match row answers "is this them?" with the name,
         * the birthdate and the address; the household size, the archive reason and the former
         * number are what is read once that answer is probably yes.
         */
        moreDetail: "Mehr zu diesem Haushalt",
      },
      /**
       * The banner over a pre-filled form. It states the one thing a staff member could otherwise
       * get wrong — that this is a new registration and not a reactivation — and it names the household
       * the data came from, so a pre-fill from the wrong row is visible without scrolling.
       *
       * It names no card index and must not gain one back. It said „einer neuen Karte (k1)" until
       * US-25, when an index came to count the *slot's* cards rather than the record's: a household
       * registering on a freed number is handed the next number on that run, so the first card of a
       * new record can be `66k2`. The banner could not name it anyway — it renders before the slot
       * is chosen, and the number is on the card view a click after the form is submitted.
       */
      prefilled: {
        heading: "Daten aus dem Archiv übernommen",
        detail: (name: string, formerNumber: number, archivedOn: string): string =>
          `Übernommen von „${name}“, archiviert am ${archivedOn} unter der Kundennummer ` +
          `${formerNumber}. Es wird ein neuer Datensatz mit einer neu vergebenen Kundennummer und ` +
          `einer neuen Karte angelegt. Der archivierte Datensatz bleibt unverändert erhalten.`,
        editableHint:
          "Alle übernommenen Felder können geändert werden — der Haushalt kann seither " +
          "gewachsen, kleiner geworden oder umgezogen sein.",
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
      issuedHeading: "Ausgestellte Karten",
      issuedCount: "Karten insgesamt",
      lossCount: "davon nach Verlust",
      // Stated as plainly as the numbers themselves: DF decides case by case whether a household
      // loses cards too often, and the software must not tilt that judgement with a warning
      // (tasks/prd-us-09-reissue-card-after-loss.md §FR-4).
      issuedHint:
        "Die Zahlen dienen nur der Information. Neuausstellungen sind unbegrenzt möglich; die " +
        "Anwendung begrenzt und mahnt nichts an.",
      backToCustomer: "Zurück zur Kundenübersicht",
    },
    /**
     * Maintaining the record (US-16.5) — the screen where a household is corrected as they change.
     *
     * Every editable part of the record is its own form with its own save button, because each is
     * its own decision with its own audit entry: a household that has grown, a name spelt wrong, a
     * move between the groups and a note for the counter are four different things to have done, and
     * one "Speichern" over all of them would say they were one.
     *
     * The hints all answer the same question — *what follows from this?* — because that is what the
     * screen is for: the counts and the price follow from the birthdates, the group applies to
     * today's distribution, the note is read out at the counter, and each of the last three leaves
     * the card the household is carrying out of date.
     */
    record: {
      /**
       * What the hand-out history says about itself while it is folded away.
       *
       * It names what is behind the fold, not an occasion for opening it. A disputed visit is the
       * reason the history is a disclosure rather than the whole screen, but it is not the only
       * reason to open one — and a label that gives a single reason reads as the only permitted
       * one.
       */
      historyDisclosure: "Ausklappen, um alle bisherigen Ausgaben zu sehen",
      detailsHeading: "Person und Anschrift",
      detailsHint:
        "Korrekturen an Name, Geburtsdatum und Anschrift. Der Name gilt zugleich für die Zeile " +
        "dieser Person im Haushalt. Die Kundennummer lässt sich nicht ändern.",
      detailsSubmit: "Person und Anschrift speichern",
      /**
       * Names all four derived figures, and says „aus dem Haushalt“ rather than „aus den
       * Geburtsdaten“ since US-28: the eggs follow the number of people and not their ages, so the
       * older wording would have been wrong about the fourth tile. It stops at *that* the figures
       * are derived — which rule turns a household into six eggs is not something a staff member
       * has to know at the table.
       */
      householdHint:
        "Erwachsene, Kinder, Eier und Preis werden aus dem Haushalt berechnet und gelten " +
        "sofort. Ändert sich dabei die Zahl der Köpfe, steht der Haushalt danach auf der Liste " +
        "„Karten neu ausstellen“ — die Karte nennt die alten Zahlen.",
      householdSubmit: "Haushalt speichern",
      /**
       * Why one row's „Zeile entfernen“ is greyed out and its Felder nicht beschreibbar sind. It
       * says where the correction *does* belong, because the form that owns it is on the same page,
       * directly above.
       */
      customerRowHint:
        "Die aufgenommene Person zählt selbst zum Haushalt: Ihre Zeile lässt sich hier weder " +
        "entfernen noch ändern. Name und Geburtsdatum werden oben unter „Person und Anschrift“ " +
        "korrigiert.",
      notesHeading: "Bemerkung",
      notesHint:
        "Die Bemerkung wird an der Ausgabe angezeigt, sobald die Kundennummer eingegeben wird. " +
        "Leer lassen ist erlaubt.",
      notesSubmit: "Bemerkung speichern",
      notesEmpty: "Keine Bemerkung hinterlegt.",
      groupHeading: "Gruppe",
      groupHint:
        "Der Wechsel gilt sofort, auch für eine Ausgabe am selben Tag. Die Karte nennt weiterhin " +
        "die alte Gruppe; der Haushalt steht danach auf der Liste „Karten neu ausstellen“.",
      groupSubmit: "Gruppe wechseln",
      /** Both sizes beside the choice, because a move is decided by comparing them (FR-4). */
      groupSizes: (red: number, blue: number): string =>
        `Aktuell: Rot ${red}, Blau ${blue} Haushalte`,
      /** The hand-out history (US-16.5) — newest first, each row priced as it was priced then. */
      historyHeading: "Bisherige Ausgaben",
      /**
       * Two sentences under the table: what the price on a row means, and what to do about a wrong
       * one. The second is there because the software offers no answer to it — a hand-out can be
       * corrected only on the day it was recorded (US-29.4), so a mistake found a week later is put
       * right by asking for more or less at the next hand-out, which the balance then carries. The
       * screen states the procedure rather than leaving a staff member to look for a button.
       */
      historyHint:
        "Der Preis ist der, der an diesem Tag galt — spätere Änderungen an den Einstellungen " +
        "ändern ihn nicht. Eine Ausgabe lässt sich nur am selben Tag korrigieren; ein später " +
        "bemerkter Fehler wird bei der nächsten Ausgabe über den geforderten Betrag ausgeglichen.",
      historyEmpty: "Für diesen Haushalt ist noch keine Ausgabe erfasst.",
      /**
       * The accessible name of the scrolling box the history sits in. It has to be spoken, because
       * the box carries `tabIndex={0}` so that it can be scrolled by keyboard at all (WCAG 2.1.1),
       * and a focus stop that announces nothing is worse than none. It names the table *and* says
       * why focus landed there; the heading's own words would announce the same string twice.
       */
      historyRegionLabel: "Bisherige Ausgaben, scrollbare Liste",
      /**
       * How many hand-outs the fold holds, stated while it is still shut — otherwise the summary
       * answers nothing until it is opened, including whether opening it is worth the click.
       *
       * Zero gets wording of its own rather than `0 Ausgaben`, for the two reasons already written
       * down elsewhere in this file and in `group-progress-card.tsx`: a count that disappears cannot
       * be told apart from one that failed to load ({@link waitingListBadge}), and a disclosure that
       * opens onto nothing invites a click to discover there is nothing to discover.
       */
      historyCount: (count: number): string => {
        if (count === 0) {
          return "Noch keine Ausgabe erfasst";
        }
        return count === 1 ? "1 Ausgabe" : `${count} Ausgaben`;
      },
      /**
       * The household table's age column. It used to live inside the birthdate label — where it
       * made that label differ on every row — and a column is what stops it doing that.
       */
      ageColumn: "Alter",
      /**
       * The history's columns. „Bezahlt“ was one column answering ja/nein and is now two, because a
       * payment is an amount and an amount means nothing without what was asked for beside it
       * (US-29.8): „Gefordert“ is the price offset by the balance the household carried into that
       * day, „Gezahlt“ what they actually handed over.
       */
      historyColumns: {
        date: "Datum",
        showedUp: "Erschienen",
        asked: "Gefordert",
        paid: "Gezahlt",
        price: "Preis",
      },
      /**
       * How the payment stood against what was asked for that day, said in words beside the amount.
       *
       * **Unsigned, like every other amount in this file.** „offen“ and „zu viel“ each say which way
       * the difference runs, so a minus in front of one of them would be the sign arithmetic the
       * wording exists to remove — the source document's illustrative „−2,00 € offen“ deliberately
       * loses its minus here.
       *
       * An exact payment says so rather than showing „0,00 €“, for the reason {@link balanceWording}
       * gives at a settled balance: a zero beside a euro sign reads like an amount, not like the
       * state everything is in order.
       */
      historyStanding: (standing: PaymentStanding, differenceCents: number): string => {
        if (standing === "EXACT") {
          return "genau";
        }
        const amount = formatEuros(Math.abs(differenceCents));
        return standing === "SHORT" ? `${amount} offen` : `${amount} zu viel`;
      },
      yes: "ja",
      no: "nein",
      /**
       * The section holding everything that cannot simply be typed over again. It is separated and
       * named so that no irreversible action sits a stray click away from the household editor
       * (PRD §6); each control inside it keeps its own confirmation.
       */
      dangerHeading: "Aktionen mit Folgen",
      dangerHint:
        "Diese Aktionen wirken sofort und werden einzeln bestätigt. Eine Archivierung lässt sich " +
        "nicht rückgängig machen.",
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
     * Reissuing a card after a loss (US-09). The action is offered on the customer record and on the
     * card view; both name the old and the new number before anything is written, because the new
     * number is what staff have to copy onto the physical card.
     */
    reissue: {
      heading: "Kartenverlust",
      action: "Karte neu ausstellen (Verlust)",
      confirm: (current: string, next: string): string =>
        `Die Karte ${current} wird damit ungültig und darf an der Ausgabe nicht mehr angenommen ` +
        `werden. Ausgestellt wird die Nummer ${next}.`,
      hint:
        "Status, Kundennummer, Gruppe und bisherige Ausgaben bleiben unverändert. Ein Kartenverlust " +
        "kostet den Haushalt nichts.",
      submit: "Neue Karte jetzt ausstellen",
      submitting: "Wird ausgestellt …",
      /**
       * The confirmation, naming the number again after the write.
       *
       * It was named before the write too, in `confirm` — deliberately, because the number is what
       * staff copy onto the physical card and the reissue is not something they can take back. This
       * repeats it because the sentence is now a receipt rather than a warning, and because on
       * `/karten-neuausstellung` the row it was read from is gone by the time this is read.
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
   * Every filter is named in words, and so is every state a row can be in: the group and the status
   * are painted, but the paint only ever repeats what the cell already says (PRD §US-15.3). Staff
   * read this list across a shared machine in variable lighting, and a row that could only be told
   * apart by its colour would be a row that half the team cannot read.
   *
   * The group balance is worded so it cannot be mistaken for a count of the rows below it: it is the
   * number staff decide a new household's group by (US-01), and it stays whole whatever is filtered.
   */
  customerList: {
    heading: "Kunden verwalten",
    /*
     * There is deliberately no intro paragraph. It used to say that the counts and the price are
     * recalculated on every request, which explains the software to an audience that learned it
     * years ago — two lines of tax at the top of a screen staff open twenty times a day, and the
     * screen has one job, which is the register below.
     */
    /** The two cards the screen is made of. Each is a real `<h2>`, so the page has an outline. */
    overviewTitle: "Übersicht und Aktionen",
    listTitle: "Kundenliste",
    /**
     * The three things staff do with customers, above the list (US-17.2). They are worded as the
     * acts themselves rather than as the pages they lead to, and each says the same words as the
     * heading of the screen it opens.
     */
    actions: {
      newCustomer: "Neuen Kunden aufnehmen",
      waitingList: "Warteliste",
      cardsDue: "Karten neu ausstellen",
      /**
       * The badge beside the reissue link (US-13.4). It states a number and nothing else — no
       * colour, no exclamation mark, no "offen": the list is a to-do list, and a screen that looks
       * alarmed about it is how staff learn to ignore it (PRD §6). Shown at zero too, because
       * "nothing to do" is the answer staff most often want from it.
       */
      cardsDueBadge: (count: number): string => (count === 1 ? "1 Karte" : `${count} Karten`),
      /**
       * The badge beside the waiting-list link (US-18.1). Same shape and same reasoning as the
       * reissue badge beside it: a number, shown at zero as well, because "niemand wartet" is the
       * answer staff most often want and a badge that disappears cannot be told apart from a badge
       * that failed to load. It names nobody and no customer number — the hub is deliberately not
       * where that decision is made (PRD §5, FR-5).
       */
      waitingListBadge: (count: number, freeSlot: boolean): string => {
        // The count itself is the waiting list's own wording — the two screens state one number and
        // must state it identically. What the hub adds is only the second clause.
        const waiting = de.waitingList.waitingCount(count);
        // `freeSlot` is a required argument rather than an optional flag: when a number is free the
        // badge is tinted, and a tint is a distinction only some of the staff can make (US-03.4), so
        // the word has to travel with it. Requiring the caller to state it is what keeps them
        // together. It says *that* a number is free and not *which* one, and it names nobody — the
        // applicant and the number belong to the banner, on the screen where somebody is actually
        // being registered (US-18.2, FR-5).
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
     * The same three as filter options. "Gültig" says out loud that it includes the ones expiring
     * soon: they may still shop, and a staff member picking it is asking who is allowed in, not who
     * has nothing to renew.
     */
    certificateFilters: {
      VALID: "gültig (auch bald ablaufende)",
      expiringSoon: (days: number): string => `läuft in den nächsten ${days} Tagen ab`,
      EXPIRED: "abgelaufen",
    },
    /** The group balance above the table — the number staff keep even (FR-3). */
    groupBalance: (red: number, blue: number): string => `Rot: ${red} · Blau: ${blue}`,
    groupBalanceHint:
      "Alle aktiven Haushalte, unabhängig von den gewählten Filtern. Die kleinere Gruppe wird bei " +
      "der nächsten Aufnahme vorgeschlagen.",
    /** How many rows are shown; German inflects the one. */
    resultCount: (count: number): string => (count === 1 ? "1 Haushalt" : `${count} Haushalte`),
    table: {
      customerNumber: "Nr.",
      name: "Name",
      cardNumber: "Karte",
      group: "Gruppe",
      status: "Status",
      /**
       * Erwachsene and Kinder stand in one column, because they are read as one fact: how many
       * people the household is. Two columns headed by two long German words cost 174px to show one
       * digit each, and the name — the thing staff actually scan — was the column that paid for it.
       */
      household: "Erw. + Kinder",
      price: "Preis",
      /**
       * "Nachweis gültig bis" set the column's floor at 217px — a fifth of the table — to show a
       * ten-character date, and every pixel of it came out of the name, which is the column staff
       * scan. Shortened, but not to "Nachweis" alone: the cell holds a date, and a date under that
       * heading could as easily be read as the day the certificate was handed in.
       */
      certificate: "Nachweis bis",
      reminders: "Erinnerungen",
      /**
       * A tally of nought, printed as a dash. Thirteen zeroes down a column of fifteen is noise a
       * reader has to look past to find the two rows where somebody was actually reminded; a dash
       * reads as "nothing here" without competing for the eye. Kept as a word in the dictionary
       * rather than a literal in the JSX, like every other thing the screen says.
       */
      noReminders: "–",
    },
    /**
     * The filters in force, one clause each, joined into a list by whichever message states them.
     *
     * They sit here rather than under `empty` because two messages read them: the empty table's, and
     * `filterSummary` above a table that has rows. Whether archived households are included is a
     * clause like any other, and is named even when it is the default — "keine Treffer" under a
     * hidden-by-default filter is precisely how a staff member concludes that a household was
     * deleted.
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
     * What stands over a table that **has** rows, whenever anything is filtered.
     *
     * The same clauses as `empty.filtered`, deliberately — a filtered list and the whole register
     * were indistinguishable, so neither the staff member looking at it nor anyone they showed it to
     * could say which one it was. Only the presence of this line answers that, which is why it is
     * absent on the unfiltered register rather than saying so.
     */
    filterSummary: (filters: string): string => `Gefiltert: ${filters}`,
    /**
     * What stands where the table would be empty. It names the same filters as `filterSummary`,
     * because "keine Treffer" under a filter somebody set three screens ago is how staff conclude
     * that a household was deleted.
     */
    empty: {
      unfiltered: "Es ist noch niemand aufgenommen.",
      filtered: (filters: string): string =>
        `Kein Haushalt entspricht den gewählten Filtern (${filters}). Bitte die Suche oder die ` +
        `Filter ändern.`,
    },
  },
  /**
   * The cards-due-for-reissue screen at /karten-neuausstellung (US-13.4).
   *
   * The tone *is* the feature. This is a to-do list, not an alert queue: everything on it can wait,
   * and the one thing it must never do is suggest that a household with an outdated card should be
   * turned away (PRD §6, FR-5). Hence "keine Eile" stated before the list rather than after it, and
   * no word anywhere that reads as a deadline.
   */
  cardsDue: {
    heading: "Karten neu ausstellen",
    /**
     * The list itself, under the "keine Eile" sentence. Its count is `customerList.actions
     * .cardsDueBadge`, deliberately not a second wording of its own: the hub states the same number
     * in the same words, and two phrasings of one fact are how the two screens come to disagree.
     */
    listTitle: "Karten",
    notUrgent:
      "Das hat keine Eile. Erwachsene, Kinder und Preis berechnet die Anwendung bei " +
      "jedem Aufruf neu; die Karte ist nur ein Ausdruck. Eine veraltete Karte ist nie ein Grund, " +
      "jemanden an der Ausgabe wegzuschicken.",
    empty: "Zurzeit ist keine Karte neu auszustellen.",
    countsOnCard: "Auf der Karte gedruckt",
    countsToday: "Haushalt heute",
    /** Why the card and the record differ — the three cases `StaleCardReason` names. */
    reasons: {
      AGE_13: "13. Geburtstag",
      HOUSEHOLD_CHANGE: "Haushalt geändert",
      GROUP_CHANGE: "Gruppe gewechselt",
    },
    /**
     * The row's action. Only the label is its own: the confirmation, the button and the rejections
     * are `customers.reissue`'s, because a reissue from here is the same act as one from the record
     * (US-09) and staff should not have to notice that they started it from a different screen.
     */
    action: "Karte neu ausstellen",
    /**
     * The way from a row to the whole record. Worded exactly as `distribution.counter.recordLink`,
     * and for the same reason it is worded that way there: the screen it opens calls itself
     * "Kundenübersicht" (`customers.record.heading`), so that is what the links to it say. It read
     * "Kundenakte öffnen" until a household's record turned out to be going by three names — one
     * per screen linking to it — none of which was the name on the page itself.
     */
    customerLink: "Zur Kundenübersicht",
  },
  /**
   * The waiting list at /warteliste (US-12.4).
   *
   * The order is the feature, so the screen states it in words above the list and offers nothing that
   * could change it — no column headings that invite a sort, no "nach vorne" anywhere (PRD §6). The
   * only applicant ever offered a freed slot is the one at the top, and the banner names them rather
   * than leaving staff to read the list and decide.
   *
   * An expired certificate is written as a fact and never as a verdict: the applicant keeps their
   * place, and what is asked for is a renewed notice, not that they start waiting again.
   */
  waitingList: {
    heading: "Warteliste",
    /**
     * The list itself. `orderRule` is its description, because it is the rule it is ordered by, and
     * a caption two blocks above the rows it governs is not a caption.
     *
     * There is no `intro` any more. It defined who ends up on the list, which whoever is reading it
     * already knows — they either put somebody here or came to serve somebody from it.
     */
    listTitle: "Wer wartet",
    /**
     * How many are on it, in the hub badge's words minus the "Platz frei" the hub adds — which is
     * why `customerList.actions.waitingListBadge` is written in terms of this rather than the other
     * way round. Two phrasings of one number is how the two screens come to disagree.
     */
    waitingCount: (count: number): string =>
      count === 0 ? "niemand wartet" : count === 1 ? "1 Wartende:r" : `${count} Wartende`,
    /** The list's own description, because it is the rule the list exists to keep. */
    orderRule:
      "Die Reihenfolge ist das Datum der Anmeldung — wer am längsten wartet, steht oben und ist " +
      "als Nächstes an der Reihe. Die Liste lässt sich bewusst nicht umsortieren.",
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
      hint:
        "Der Haushalt wird erst bei der Aufnahme erfasst. Hier genügen die Person, die Anschrift " +
        "und der Bedarfsnachweis.",
      contactNoteLabel: "Erreichbarkeit (optional)",
      contactNoteHint:
        "Freitext, zum Beispiel „über die Nachbarin, dienstags vormittags“. Telefonnummern und " +
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
       * Read on the list itself, after the row and the control that produced it are gone.
       *
       * It names nobody. The applicant was named in `confirm`, one click earlier, and a name in a
       * banner would have to come from the URL the removal redirects through — which is where the
       * one place DF's data must not end up is a browser history. What is left to say is that the
       * entry was kept, which is the thing the shortened list does not say.
       */
      saved:
        "Der Eintrag ist von der Warteliste genommen. Er bleibt mit dem Grund erhalten, damit die " +
        "Reihenfolge nachvollziehbar bleibt.",
    },
    /** Registering the applicant a freed slot belongs to. */
    promote: {
      heading: "Von der Warteliste aufnehmen",
      intro: (applicant: string, customerNumber: number): string =>
        `${applicant} steht am längsten auf der Warteliste und erhält die Kundennummer ` +
        `${customerNumber}. Die Angaben von der Warteliste sind vorausgefüllt und lassen sich hier ` +
        `noch ändern.`,
      /**
       * Shown *before* the form when the certificate lapsed during the wait. It is a step, not a
       * dialog: staff read it, then decide to go on — and the applicant is never sent away, because
       * DF has not decided how such a case is handled (PRD §9).
       */
      expiredHeading: "Der Bedarfsnachweis ist abgelaufen",
      expiredDetail: (validUntil: string): string =>
        `Der bei der Anmeldung vorgelegte Nachweis galt bis zum ${validUntil}. Für die Aufnahme ` +
        `wird ein aktueller Nachweis benötigt — bitte ihn vorlegen lassen und das Feld unten ` +
        `entsprechend ändern.`,
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
       * The week number alone — `KW 02`, not `Kalenderwoche 2026-W02`. The banner prints this beside
       * the date, which already carries the year, and staff check it against a wall calendar that
       * prints two digits. The argument is the number (`isoWeekNumber`), not the ISO string.
       */
      week: (week: string): string => `KW ${week}`,
    },
    /**
     * The counter lookup — the most-read text in the product, and therefore the text held to the
     * strictest account: every string here is paid for on every lookup of every afternoon, so one
     * that only restates what the screen already shows costs more than it gives
     * (tasks/prd-us-04-lookup-customer.md §US-04.4). The verdict's colour never travels without the
     * word it names, and the word is always a full German phrase.
     *
     * There is no `hint` beneath the heading any more. It named the two number formats and said to
     * press Enter, for a field labelled `Nummer` that is autofocused and alone on the screen. The
     * formats do need stating where they are genuinely unclear — after something unreadable was
     * typed — and `errors.notANumber` states them there, to the one person who needs them.
     */
    counter: {
      heading: "Kunden nachschlagen",
      label: "Nummer",
      submit: "Nachschlagen",
      /**
       * A verdict is its headline. The sentence that used to sit under each one restated what the
       * record below already prints — the certificate's date and the reminder count are rows in it,
       * the counts and the price are tiles, the group and the status are badges — so it was one
       * more thing to read with a queue waiting, not help.
       *
       * `blocked.noReason` is the exception that proves the shape: the block reason is the only
       * words at the counter a colleague typed rather than the screen derived, so it is the only
       * detail left. If a verdict ever needs a sentence again, that is the test it has to pass.
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
       * Two words for one control, because the two acts are not the same one. „hinzufügen" is a
       * household nobody has written anything about yet; „bearbeiten" warns that there is already
       * a colleague's sentence in the field, and that saving replaces it. The button is read at a
       * glance with a queue waiting, so which of the two it is has to be legible before it is
       * clicked rather than after.
       *
       * No hint under the field, unlike the same editor on the customer record: that one says the
       * note „wird an der Ausgabe angezeigt", which at the Ausgabe describes where the reader is
       * standing.
       */
      notes: {
        add: "Bemerkung hinzufügen",
        edit: "Bemerkung bearbeiten",
      },
      /**
       * The note for a card whose printed counts the household has outgrown (US-13.4).
       *
       * Deliberately not a verdict and deliberately not a warning: it names the difference, says
       * which numbers apply, and stops. A stale card is never grounds to turn anyone away (FR-5),
       * so the sentence must not read as one — no "Achtung", no exclamation mark, and nothing that
       * asks the counter to do anything before the next customer is served.
       */
      staleCard: (cardNumber: string, onCard: string, today: string): string =>
        `Die Karte ${cardNumber} ist noch mit anderen Zahlen gedruckt (${onCard}); heute zählt ` +
        `der Haushalt ${today}. Ausgegeben wird nach den heutigen Zahlen. Eine neue Karte kann bei ` +
        `Gelegenheit ausgestellt werden.`,
      /**
       * The same note for a card that names the wrong group (US-16.4). Its own sentence rather than
       * the one above with other words in it: nothing about the household's numbers has changed, and
       * quoting two identical counts at the counter would read as a mistake.
       */
      staleCardGroup: (cardNumber: string, onCard: string, today: string): string =>
        `Die Karte ${cardNumber} ist noch für die Gruppe ${onCard} gedruckt; der Haushalt ` +
        `gehört jetzt zu ${today}. Es gilt die heutige Gruppe. Eine neue Karte kann bei ` +
        `Gelegenheit ausgestellt werden.`,
      /**
       * The way from the counter to the whole record (US-16.5). Named after what it leads to rather
       * than "Mehr": the counter shows a slice of the record, and the next question — who else lives
       * there, what was noted, when did they last collect — is answered only there.
       */
      recordLink: "Zur Kundenübersicht",
      errors: {
        notANumber:
          "Das ist keine Kundennummer und keine Kartennummer. Erwartet werden zum Beispiel 50 " +
          "oder 50k3.",
      },
    },
    /**
     * Walking today's group at the counter (tasks/prd-us-21-step-through-group.md §US-021.3).
     *
     * The two controls are named after the movement, not after the household: `Weiter` and `Zurück`
     * say what pressing them does, while "Nächster Haushalt" would claim the software knows who is
     * standing outside — it knows only the customer numbers of the group (PRD §Non-Goals).
     *
     * The hint reads differently in each of the four states the walk can be in, rather than one
     * sentence that hedges over all of them. It always names the group in words: the controls
     * navigate a group the staff member cannot see, and the banner above is the only other thing
     * that says which one.
     */
    walk: {
      previous: "Zurück",
      next: "Weiter",
      hints: {
        /** Nothing looked up yet: `Zurück` is unavailable, so say where `Weiter` lands (FR-4). */
        fromStart: (group: string): string =>
          `${group} durchgehen: Weiter beginnt bei der ersten Nummer.`,
        /** Standing on a number, with somewhere to go in at least one direction. */
        walking: (group: string): string =>
          `${group} durchgehen: Weiter zur nächsten, Zurück zur vorherigen Nummer.`,
        /** The last number of the group. Said in words because a disabled button alone is mute. */
        end: (group: string): string =>
          `Ende von ${group}: nach dieser Nummer kommt keine weitere.`,
        /** No walkable household at all — not the same thing as having walked to the end. */
        empty: (group: string): string => `${group} hat zurzeit keinen Haushalt.`,
      },
    },
    /**
     * How far through today's group the afternoon is, and who is still missing
     * (tasks/prd-us-23-group-progress.md §US-023.4).
     *
     * The summary *is* the tally, not a label that hides one: a staff member must never have to open
     * the list to learn the number. Both figures stand in that one sentence, because `34` and `61`
     * are read together and a screen reader must not announce them as unrelated fragments.
     *
     * `open` and `close` are the affordance beside it — the disclosure is a fold, and a triangle
     * alone would be chrome saying nothing (US-03.4). They are deliberately not part of the tally
     * sentence: which of the two is shown depends on the fold's state, and the tally does not.
     */
    progress: {
      summary: (group: string, served: number, expected: number): string =>
        `${group}: ${served} von ${expected} Haushalten abgeholt`,
      open: "Liste anzeigen",
      close: "Liste ausblenden",
      /** The mark on a household that has collected today. Only these rows are marked. */
      served: "abgeholt",
      /**
       * An empty group, said in words rather than shown as a disclosure that opens onto nothing.
       * Its own sentence rather than the walk's: this one is about the tally having no denominator.
       */
      empty: (group: string): string => `${group}: zurzeit ist kein Haushalt zugeordnet.`,
    },
    /**
     * Recording the hand-out — the one write the counter makes (tasks/prd-us-05-record-attendance.md
     * §US-05.4). The serve action appears only for a verdict that permits it; once a record exists
     * for today, the same place shows it and the controls to correct or remove it.
     */
    serve: {
      submit: "Ausgabe erfassen",
      /**
       * The label of the field DF type the handed-over amount into (US-29.7). „Betrag“ and not
       * „Bezahlt“: the field takes a number, and the flag it replaced could not say a part payment.
       */
      amount: "Betrag",
      /**
       * What the counter asked for on the day a record was made, stated above the correction field
       * so the amount in it can be read against something. „Gefordert“ rather than „Preis“ — a
       * household settling an old debt was asked for more than the week cost.
       */
      asked: (cents: number): string => `Gefordert: ${formatEuros(cents)}`,
      /**
       * Shown after a successful hand-out, in place of the serve button and nowhere else. It once
       * ended "Nächste Nummer eingeben.", which was an instruction about a cursor the screen used to
       * place; it no longer does (see `serve-controls.tsx`), so the sentence would be telling staff
       * to do something the screen had not prepared for them.
       */
      confirmed: (time: string): string => `Ausgabe um ${time} Uhr erfasst.`,
      /**
       * Shown on a customer who already has a record today, in place of the serve action — the time,
       * and what was handed over against what was asked for (US-29.7). It used to end in „bezahlt“
       * or „nicht bezahlt“, which is exactly the third case DF kept in the Excel list by hand: a
       * household that hands over 2,00 € of 5,00 € is neither.
       */
      alreadyServed: (time: string, paidCents: number, askedCents: number): string =>
        `Heute bereits versorgt um ${time} Uhr. ` +
        `(${formatEuros(paidCents)} von ${formatEuros(askedCents)} gezahlt)`,
      /**
       * The question an amount above what was asked for raises (US-29.7).
       *
       * A question and not a fault: paying ahead is a thing households do, and it is never refused
       * outright. It is asked at all because a mistyped credit is the one error this design cannot
       * undo — it silently pays for the household's next weeks — while a shortfall shows up as an
       * open amount at the very next hand-out, in front of the person serving them.
       */
      overpayment: {
        question: (paidCents: number, amountToPayCents: number): string =>
          `${formatEuros(paidCents)} statt ${formatEuros(amountToPayCents)} — wirklich so buchen? ` +
          `Der Rest von ${formatEuros(paidCents - amountToPayCents)} bleibt als Guthaben stehen ` +
          `und wird bei der nächsten Ausgabe verrechnet.`,
        /** Names the act rather than answering „ja“, so the button says what pressing it does. */
        confirm: "Ja, Betrag so buchen",
      },
      correct: {
        heading: "Heutigen Eintrag korrigieren",
        save: "Betrag speichern",
        saved: "Eintrag aktualisiert.",
        remove: "Eintrag entfernen",
        /**
         * The whole consequence of a removal, in the order it is felt: the hand-out goes, the
         * payment goes with it, and the household's balance returns to where it stood before today
         * (US-29, rule 9). The third clause is the one no other line on the screen carries — the
         * balance is a derivation over the surviving records, so a removal moves it.
         */
        removeConfirm: (balanceWithoutRecordCents: number): string =>
          `Diesen Eintrag wirklich entfernen? Die Ausgabe gilt dann als nicht erfolgt, und der ` +
          `gezahlte Betrag wird mit entfernt. Der Saldo des Haushalts steht danach wieder bei: ` +
          `${balanceWording(balanceKind(balanceWithoutRecordCents), balanceWithoutRecordCents)}.`,
        removeConfirmButton: "Ja, entfernen",
        removeCancel: "Abbrechen",
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
     * The certificate actions at the counter (tasks/prd-us-06-certificate-reminder.md §US-06.4):
     * logging the verbal reminder an expired certificate prompts, and recording the renewal that
     * resets the count. The screen states facts and offers the two actions — it never advises what
     * the count should mean, because that judgement is deliberately the staff's (FR-6).
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
        hint:
          "Bringt der Haushalt den verlängerten Nachweis mit, hier eintragen. Die Erinnerungen " +
          "werden dabei auf 0 zurückgesetzt.",
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
     * Both are reachable from the banner alone: the screen resolves the settings in force today, and
     * either there are none or the anchor week they name is not a week of the calendar. The strings
     * the retired week-colour lookup owned are gone with it (US-22) — there is no date to type here
     * any more, so nothing left says "Datum".
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
    intro:
      "Änderungen gelten sofort. Beim Speichern wird eine neue Fassung angelegt; frühere " +
      "Fassungen bleiben erhalten, damit vergangene Ausgaben nachvollziehbar bleiben.",
    /**
     * The three card headings, and they are the grouping: the four settings that decide *what* a
     * household gets, the three that decide *when*, and the write itself. What stood here before
     * was `Aktuell gültige Werte` over the quota, the amounts and all three calendar settings — a
     * heading that described everything on the screen and therefore distinguished nothing, with the
     * two price fields under `Preise` next door.
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
      /**
       * Not the bare „Maximalpreis“: the screen holds two per-head prices beside it, and what tells
       * this one apart is that it is a limit per household per distribution.
       */
      priceCap: "Maximalpreis je Ausgabe",
      /**
       * „Eierregel“ and not the bare „Eier“: the figure a household receives is announced as „Eier“
       * on the counter and on the record, and a change to the *rule* that decides it must not
       * arrive in the history under the same word as the figure it changes.
       */
      eggRule: "Eierregel",
    },
    /**
     * The egg allowance (US-28), the one policy value that is a list of rows. Its words are here
     * rather than in `history` because the same phrasings state a rule and state a change to it.
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
       * What names one control of the table, wherever it is named: the `aria-label` on the input and
       * the field a refusal points at from the summary („Eier, Zeile 2: Eier“).
       *
       * One function for both, because they have to be the same string — the summary sits by the
       * button and names a field the staff member then has to find in the table. Rows count from 1
       * on screen while the domain and the form count from 0, as they already do for household
       * members.
       */
      fieldLabel: (position: number, part: "minPersons" | "eggs"): string =>
        `Eier, Zeile ${position}: ${part === "minPersons" ? EGG_THRESHOLD_COLUMN : EGG_COUNT_COLUMN}`,
      /** The rule in one sentence, under the table — both halves of it, including the bottom. */
      hint:
        "Ein Haushalt erhält die Eier der höchsten Stufe, die er erreicht. Ein Haushalt, der keine " +
        "Stufe erreicht, erhält keine Eier.",
      /**
       * What an empty table says. No rows is a legitimate setting, and an empty area on a screen
       * cannot be told apart from one that failed to render — so it is stated in words.
       */
      empty: "Keine Stufen hinterlegt. Kein Haushalt erhält Eier.",
      /**
       * The two collisions between rows, said by the button and naming **no** field.
       *
       * Marking one of the two rows would say that row is malformed when the two are merely
       * inconsistent — the division `quotaBelowActiveCustomers` already keeps. So the sentence has
       * to name the thresholds itself: with no mark, that is the only way the rows are findable.
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
       * One row of the rule as it is, for the summary of the version in force: „ab 3 Personen:
       * 6 Eier“. The three phrasings below are this clause plus what became of the row, which is
       * why the reader of a change and the reader of a rule are told a row in the same words.
       */
      row: eggRow,
      /**
       * What a rule with no rows reads as, wherever a whole rule is stated — the counterpart of
       * {@link de.settings.prices.noCap}, and there for the same reason. „keine Eier“ and „0 Eier
       * ab 1 Person“ are two different configurations, and an empty stretch of screen cannot be
       * told apart from one that failed to render.
       */
      none: "keine Eier",
      /** A row that was not in the previous rule: „ab 8 Personen: 18 Eier (neu)“. */
      rowAdded: (minPersons: number, eggs: number): string => `${eggRow(minPersons, eggs)} (neu)`,
      /** A row the new rule no longer has: „ab 3 Personen: 6 Eier (entfernt)“. */
      rowRemoved: (minPersons: number, eggs: number): string =>
        `${eggRow(minPersons, eggs)} (entfernt)`,
      /**
       * A row whose count moved: „ab 5 Personen: 12 → 14 Eier“. The unit is stated once, at the
       * end — a threshold cannot change, because the threshold is what identifies the row.
       */
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
       * Both halves of the rule, because the screen now holds both: the per-head calculation and
       * the ceiling on it. The last sentence is what makes an empty field readable as a decision
       * rather than as something nobody has filled in yet.
       */
      hint:
        "Der Preis wird je Kopf berechnet: je Erwachsenem und je Kind. Der Maximalpreis ist der " +
        "Höchstbetrag, den ein Haushalt je Ausgabe zahlt, ganz gleich wie groß er ist. Bleibt das " +
        "Feld leer, gibt es keinen Maximalpreis.",
      /**
       * What an empty Maximalpreis says, wherever a cap is read back — the history and the version
       * summary. „kein Maximalpreis“ and „0,00 €“ are two different configurations: the second one
       * means every household collects for free, so neither may ever be printed for the other.
       */
      noCap: "kein Maximalpreis",
    },
    /**
     * German names for the fields a domain error can name. The keys are the `field` values
     * `InvalidSettings` carries, so a rejected value never quotes an English identifier at staff.
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
     * The version history, folded away and written as a diff.
     *
     * Each superseded version states only what moved — `Preis je Erwachsenem: 1,80 € → 2,00 €` —
     * because the list used to restate all 136 characters per row so that one of them could change.
     * The labels are `fields`, `colours` and `weekdays` above: a change is named with the same
     * words as the control that made it.
     */
    history: {
      heading: "Änderungsverlauf",
      empty: "Es gibt noch keine weiteren Fassungen.",
      recordedAt: "Geändert am",
      current: "aktuell gültig",
      disclosure: "Ausklappen, um alle bisherigen Fassungen zu sehen",
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
       * A list-valued setting's change, stated as the rows that moved rather than as two values:
       * `Eierregel: ab 8 Personen: 18 Eier (neu) · ab 5 Personen: 12 → 14 Eier`.
       *
       * The rows arrive in threshold order and already carry their own words, so this only joins
       * them under the label — printing the whole rule on either side of an arrow is the
       * restatement this history exists to avoid.
       */
      rowChanges: (label: string, rows: ReadonlyArray<string>): string =>
        `${label}: ${rows.join(" · ")}`,
    },
    errors: {
      /**
       * The two marks that sit **under** a refused control, in the same register as
       * {@link invalidValue} and as `customers.errors.dateMissing`: a short clause, no „Bitte“ and
       * no example, because the field they name is directly above them and the summary by the
       * button says the rest.
       *
       * They were finished sentences — „Bitte einen Betrag wie 2,50 eingeben.“ — and read correctly
       * while they were only ever the *summary*. Once the summary started naming the field and the
       * mark started carrying the problem, they were the only long things in a slot whose whole job
       * is to point, and „Preis je Erwachsenem“: Bitte einen Betrag wie 2,50 eingeben.“ says in a
       * dozen words what „Kein gültiger Betrag.“ says in three.
       *
       * The example goes with them, and is not missed: the two money fields beside the refused one
       * still show `2,00` and `1,00`, so the format staff are being asked for is demonstrated on the
       * same row. That is the same argument the day fields make from their placeholder.
       *
       * `ab 0` stays, short as this is, because it is not a hint but the other half of the rule:
       * `wholeNumber` refuses `-1` on the same regex it refuses `1,5` on, and „Keine ganze Zahl.“
       * would call a negative something it is not. The `min={0}` on the control makes that
       * unreachable from a browser, which is a fact about the control and not about the message.
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
       * The mark under the field itself, where the label above it has already named the field.
       *
       * Deliberately terser than the summary by the button rather than a copy of it: the summary
       * has to say *which* field, because it is 442px away from every one of them, and repeating
       * that name directly beneath its own label reads as a stutter. What this has to do is point,
       * and the `aria-invalid` border points with it.
       */
      invalidValue: "Ungültiger Wert.",
    },
  },
} as const;

export type Dictionary = typeof de;

/** A household field as the domain names it, e.g. `householdMembers.1.firstName`. */
const HOUSEHOLD_FIELD = /^householdMembers\.(\d+)\.(firstName|lastName|birthDate)$/;

/**
 * The German label for a field a customer error names, in the **domain's** vocabulary —
 * `address.street`, `certificate.type`, `householdMembers.1.firstName`.
 *
 * It always answers: a field it has no words for is quoted as it stands, because a sentence naming
 * an English identifier is still better than a sentence naming nothing. {@link customerFormFieldLabel}
 * is the same question asked of a form, and deliberately does not.
 */
export function customerFieldLabel(field: string): string {
  return householdFieldLabel(field) ?? de.customers.errorFields[field] ?? field;
}

/**
 * „Haushaltsmitglied 2: Geburtsdatum“ for a household row, `null` for anything else.
 *
 * Rows are numbered rather than listed in the dictionary: they are named by index, and there is no
 * upper bound on how many people live in a household. Rows count from 1 on screen while both the
 * domain and the form count from 0. The spelling is the same on both sides, which is why this one
 * function serves {@link customerFieldLabel} and {@link customerFormFieldLabel} alike.
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
 * Two things separate it from {@link customerFieldLabel}. It speaks the form's vocabulary rather
 * than the domain's — `street` and `certificateType`, the names the `<input>`s actually carry,
 * where the domain says `address.street` and `certificate.type` — because what the browser can mark
 * is an input, and translating one into the other is the action's job (`registration-input.ts`).
 *
 * And it **misses**, where `customerFieldLabel` falls back to the identifier. That is the whole
 * point of the return type: a path with no label is a field nobody can see, so it is a tampered
 * hidden input rather than a mistyped value — an error, not a refusal
 * (`docs/guideline/ui_styling_guide.md` §7). Quoting `previousCustomerId` at staff would be the
 * alternative, and it would name a field they cannot find.
 */
export function customerFormFieldLabel(path: string): string | null {
  return householdFieldLabel(path) ?? FORM_FIELDS[path] ?? null;
}

/** The names of the fields the settings form submits, as `de.settings.fields` keys them. */
const SETTINGS_FORM_FIELDS = de.settings.fields as Record<string, string | undefined>;

/** A row of the egg rule as the domain and the form both name it, e.g. `eggRule.1.eggs`. */
const EGG_RULE_FIELD = /^eggRule\.(\d+)\.(minPersons|eggs)$/;

/**
 * „Eier, Zeile 2: Eier“ for one control of the egg-rule table, `null` for anything else.
 *
 * {@link householdFieldLabel} for the one list-valued policy value (US-28), and it exists for that
 * function's reason: rows are named by index and there is no upper bound on how many of them a rule
 * has, so they cannot be listed in the dictionary. Without it a refused row would be a path with no
 * label — dropped as a field nobody can see (§7) — and the summary would fall through to „nichts
 * gespeichert“ for a box that is right there on the screen.
 */
function eggRuleFieldLabel(field: string): string | null {
  const match = EGG_RULE_FIELD.exec(field);
  if (match === null) {
    return null;
  }
  return de.settings.eggs.fieldLabel(Number(match[1]) + 1, match[2] as "minPersons" | "eggs");
}

/**
 * {@link customerFormFieldLabel} for the settings screen, and it misses for the same reason.
 *
 * `de.settings.fields` is already keyed by the `name` each input carries, so seven of the eight need
 * no translation; the eighth is `reason`, which is named separately because it is not one of the
 * values being set. It is listed here anyway — it is a box on the screen, and a summary that skipped it
 * would fall through to „nichts gespeichert“ for a field staff can see. Nothing refuses it today
 * (`z.string()` accepts everything, and an empty reason is allowed), which is exactly why it would
 * go unnoticed if it ever did.
 *
 * The egg rule is the one setting that is not a field but a table of them, so its paths are answered
 * by {@link eggRuleFieldLabel} rather than by a key.
 */
export function settingsFormFieldLabel(name: string): string | null {
  if (name === "reason") {
    return de.settings.reason;
  }
  return eggRuleFieldLabel(name) ?? SETTINGS_FORM_FIELDS[name] ?? null;
}
