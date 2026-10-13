# PRD: Shorter messages — text only (US-42)

> **Source:** the review DF's developer made of every message in the UI,
> `local_only/ui-messages/messages-overview.md` (local only, not committed). Its **Proposed** column
> is the agreed wording. This PRD restates every change, so an implementer never needs that file.

## Introduction

Reviewing the UI, DF's developer found that many messages say more than the moment needs. Success
messages explain consequences, refusals end in „Es wurde nichts gespeichert.“ when the amber or red
box already says that, and confirmations recite rules. All ~150 messages were reviewed, and about 75
get a shorter wording.

**This is a wording change and nothing else.** Every button, link, confirmation step, colour, icon,
test id and condition under which a message appears stays exactly as it is. Only the sentences
change, plus two hints that are dropped entirely.

## Goals

- Every message listed below reads exactly as the „New“ column says.
- No behaviour changes: the same messages appear in the same situations, in the same tone (green /
  amber / red / grey), with the same buttons beside them.
- The e2e suite is green on Chromium and WebKit, and unit tests and lint pass.
- `docs/guideline/ui_styling_guide.md` §8 no longer cites examples that the code no longer contains.

## What must not change (applies to every story)

The implementer changes **strings in `src/i18n/de.ts`**, the **call sites whose arguments change**
because a string takes fewer or differently shaped parameters, and the **two `<p>` elements** whose
hint is dropped. Nothing else. In particular, these all stay as they are:

- **Every control that comes with a message:** „Rückgängig“ (Karten drucken), „Korrigieren“ (counter),
  „Ja, Betrag so buchen“, „Ja, entfernen“, „Ja, Ausgabe beenden“, „Ja, verwerfen“, „Ja, wieder
  öffnen“, „Jetzt archivieren“, „Sperre jetzt aufheben“, „Kundennummer jetzt ändern“, „Neue Karte
  jetzt ausstellen“, „Erinnerung löschen“, „Verstanden, jetzt aufnehmen“, „Übernahme verwerfen und
  leer beginnen“, „Stattdessen auf die Warteliste setzen“, „Jetzt registrieren“, „Warteliste öffnen“.
  Their labels, their position and what they do are all unchanged.
- **Every confirmation step.** A confirmation that is shortened still appears, still has to be
  confirmed, and still opens from the same disclosure.
- **The reason fields** (archive, block, waiting-list removal, reopening) and whether they are
  required.
- **Tones.** `notice-tier.ts` is not touched, and no message moves between green, amber, red or grey.
  The destructive `Alert`s stay destructive.
- **Conditions and placement:** when a message shows, where it shows, and the `NoticeBoard`
  „last answer only“ rule.
- **`data-testid`s and `data-tier`s.**
- **Emphasis:** a figure set bold today stays bold. One string gains bold (reissue, US-42.1).
- **The keys themselves.** Keys are renamed or deleted only where this PRD says so. A key that keeps
  its text keeps its name.

## User Stories

Notation: `{x}` is a runtime value, **bold** is a `Segment` with `strong: true`. Keys are paths under
`de.` in `src/i18n/de.ts`.

### US-42.1: Success messages say the result and stop

**Description:** As a staff member, I want a success message to name what happened in a few words,
so I can read it at a glance and carry on.

| Key                                        | Current                                                                                                                  | New                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `customers.new.saved`                      | Kunde erfolgreich hinzugefügt.                                                                                           | Kunde aufgenommen.                                                     |
| `distribution.certificate.renewal.saved`   | Nachweis gespeichert. Erinnerungen zurückgesetzt: 0.                                                                     | Nachweis gespeichert.                                                  |
| `distribution.certificate.reminder.logged` | Erinnerung erfasst                                                                                                       | Erinnerung erfasst.                                                    |
| `customers.block.blocked`                  | Der Kunde ist jetzt gesperrt und erhält an der Ausgabe nichts.                                                           | Kunde gesperrt.                                                        |
| `customers.block.unblocked`                | Die Sperre ist aufgehoben. Der Kunde ist wieder bezugsberechtigt.                                                        | Sperre aufgehoben.                                                     |
| `customers.archive.saved`                  | Der Haushalt ist archiviert. Die Kundennummer {n} ist wieder frei.                                                       | Haushalt archiviert.                                                   |
| `customers.numberChange.saved`             | Kundennummer geändert {from} → **{to}**; Gruppe **{group}**; neue Karte **{card}** ausgestellt.                          | Neue Kundennummer **{to}**, Gruppe **{group}**, neue Karte **{card}**. |
| `customers.reissue.saved`                  | Die neue Karte {card} ist ausgestellt. Die alte Karte ist ungültig und darf an der Ausgabe nicht mehr angenommen werden. | Neue Karte **{card}** ist ausgestellt.                                 |
| `cardsToPrint.done`                        | Karte {card} von {name} ist als gedruckt abgehakt.                                                                       | Karte {card} ({name}) als gedruckt abgehakt.                           |
| `waitingList.remove.saved`                 | Der Eintrag ist von der Warteliste genommen.                                                                             | Von der Warteliste genommen.                                           |
| `distribution.serve.correct.saved`         | Eintrag aktualisiert.                                                                                                    | Betrag gespeichert.                                                    |
| `distribution.serve.correct.removed`       | Eintrag entfernt. Der Haushalt kann erneut erfasst werden.                                                               | Eintrag entfernt.                                                      |
| `settings.saved`                           | Gespeichert. Die neuen Werte gelten ab sofort.                                                                           | Gespeichert.                                                           |

**Signature changes, and their call sites:**

- `customers.archive.saved` becomes a plain string with no parameter. Update the call sites in
  `src/app/kunden/[id]/page.tsx` and `src/app/ausgabe/page.tsx`, plus the specs that call it.
- `customers.numberChange.saved` loses its unused `from` parameter. Update
  `src/app/kunden/[id]/number-control.tsx` and the specs.
- `customers.reissue.saved` returns `ReadonlyArray<Segment>` instead of a string, so that the card
  number can be bold, as it is in `numberChange.saved`. `Confirmation` already accepts segments.
  Specs that compare against it use `plain(…)`.

**Acceptance Criteria:**

- [ ] Each key in the table renders the „New“ text.
- [ ] „Rückgängig“ still appears inside the Karten-drucken confirmation and still takes the tick back.
- [ ] „Korrigieren“ still appears inside the counter's recorded confirmation, and the
      `distribution.serve.recorded` text is unchanged.
- [ ] The reissue confirmation shows the card number in bold.
- [ ] The doc comments above the changed keys in `de.ts` no longer describe the removed content. One
      example is the comment on `archive.saved` saying it „names the freed number“.
- [ ] `npm run lint`, `npm run typecheck` and `npm test` pass.
- [ ] Verified in the browser with the `playwright-cli` skill: block → unblock, archive, reissue
      (record and Karten neu ausstellen), number change, Karten drucken + Rückgängig.

### US-42.2: Confirmations name what changes and stop

**Description:** As a staff member, I want a confirmation to state what is about to happen in one
line, so I actually read it before I click.

| Key                                        | Current                                                                                                                           | New                                                          |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `customers.archive.confirm`                | Die Kundennummer {n} wird frei. Rückgängig machen lässt sich die Archivierung nicht.                                              | Kundennummer {n} wird frei. Rückgängig machen nicht möglich. |
| `customers.block.unblockConfirm`           | Diese Sperre wird aufgehoben: „{reason}“. Der Kunde ist danach wieder bezugsberechtigt.                                           | Sperre wird aufgehoben: „{reason}“.                          |
| `waitingList.remove.confirm`               | {name} wird von der Warteliste genommen. Der Eintrag bleibt mit dem Grund erhalten, damit die Reihenfolge nachvollziehbar bleibt. | {name} wird von der Warteliste genommen.                     |
| `distribution.session.end.confirm`         | {n} Haushalte versorgt, {€} eingenommen. Nach dem Beenden sind die Einträge nicht mehr korrigierbar.                              | {n} Haushalte versorgt, {€} eingenommen.                     |
| `distribution.session.discard.confirm`     | Diese Ausgabe wird verworfen. Es wird nichts darüber festgehalten.                                                                | Diese Ausgabe wird verworfen.                                |
| `distribution.serve.correct.removeConfirm` | Diesen Eintrag wirklich entfernen? Der Saldo steht danach wieder bei: {saldo}.                                                    | Eintrag entfernen? Saldo danach: {saldo}.                    |

`session.end.confirm` keeps its parameters and still builds the clause with `servedAndTook`, which
`session.last.summary` shares.

**Acceptance Criteria:**

- [ ] Each key renders the „New“ text inside the same box (same tone, same `data-testid`).
- [ ] Every confirmation still requires its confirming button: „Jetzt archivieren“, „Sperre jetzt
      aufheben“, „Von der Warteliste nehmen“, „Ja, Ausgabe beenden“, „Ja, verwerfen“, „Ja, entfernen“.
- [ ] The archive and waiting-list-removal reason fields are still required.
- [ ] The confirmations not in the table (number change, reissue, reopen, overpayment, campaign
      reminder deletion) are unchanged.
- [ ] Lint, typecheck and unit tests pass.
- [ ] Verified in the browser with `playwright-cli`: open each of the six confirmations, read the text,
      and complete each action once.

### US-42.3: Banners, notices and empty states say only what the screen does not

**Description:** As a staff member, I want standing notices and empty lists to say the one thing I
need, so the screen stays calm.

| Key                                              | Current                                                                                                                                                                     | New                                                                                                                   |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `customers.archive.bannerDetail`                 | Archiviert am {date}. Grund: „{reason}“                                                                                                                                     | Am {date}. Grund: „{reason}“                                                                                          |
| `customers.archive.bannerReadOnly`               | Der Datensatz kann nicht mehr geändert werden. Die Kundennummer ist wieder frei und gehört möglicherweise bereits einem anderen Haushalt.                                   | Nicht mehr änderbar. Die Kundennummer kann inzwischen einem anderen Haushalt gehören.                                 |
| `customers.archiveSearch.prefilled.detail`       | Übernommen von „{name}“, archiviert am {date} unter der Kundennummer {n}. Es wird ein neuer Datensatz mit einer neu vergebenen Kundennummer und einer neuen Karte angelegt. | Von „{name}“ (archiviert am {date}, frühere Nr. {n}). Der Haushalt erhält eine neue Kundennummer und eine neue Karte. |
| `waitingList.certificateExpiredHint`             | Der Platz auf der Liste bleibt bestehen. Vor der Aufnahme wird ein neuer Nachweis benötigt.                                                                                 | vor der Aufnahme wird ein neuer benötigt.                                                                             |
| `waitingList.promote.intro`                      | {name} steht am längsten auf der Warteliste und erhält die Kundennummer {n}. Die Angaben von der Warteliste sind vorausgefüllt und lassen sich hier noch ändern.            | {name} steht am längsten auf der Warteliste und erhält die Kundennummer {n}.                                          |
| `waitingList.promote.expiredDetail`              | Der vorgelegte Nachweis galt bis zum {date}. Für die Aufnahme wird ein aktueller Nachweis benötigt.                                                                         | Gültig bis {date}. Für die Aufnahme wird ein aktueller Nachweis benötigt.                                             |
| `distribution.pastSessions.detail.live`          | Diese Ausgabe wurde beendet, bevor der Stand festgehalten wurde — die Tabelle zeigt die Haushalte, wie sie heute im Register stehen.                                        | Kein festgehaltener Stand — die Tabelle zeigt die Haushalte, wie sie heute sind.                                      |
| `distribution.counter.verdicts.blocked.noReason` | Es ist kein Grund hinterlegt. Bitte in der Kundenakte nachsehen.                                                                                                            | Kein Grund hinterlegt.                                                                                                |
| `waitingList.orderRule`                          | Wer am längsten wartet, steht oben. Die Liste lässt sich nicht umsortieren.                                                                                                 | Wer am längsten wartet, steht oben.                                                                                   |
| `customerList.empty.filtered`                    | Kein Haushalt entspricht den gewählten Filtern ({filters}). Bitte die Suche oder die Filter ändern.                                                                         | Kein Haushalt entspricht den Filtern ({filters}).                                                                     |
| `customers.cardView.supersededNone`              | Diese Karte ist die erste des Haushalts und ersetzt keine frühere.                                                                                                          | Keine früheren Karten.                                                                                                |
| `cardsDue.empty`                                 | Zurzeit ist keine Karte neu auszustellen.                                                                                                                                   | Keine Karte neu auszustellen.                                                                                         |
| `waitingList.empty`                              | Zurzeit steht niemand auf der Warteliste.                                                                                                                                   | Niemand auf der Warteliste.                                                                                           |
| `customers.archiveSearch.noMatches`              | Kein archivierter Haushalt gefunden. Bitte die Schreibweise prüfen — oder die Aufnahme einfach leer ausfüllen.                                                              | Kein archivierter Haushalt gefunden.                                                                                  |
| `customers.archiveSearch.tooMany`                | Es werden {n} Treffer angezeigt; es gibt weitere. Bitte die Suche eingrenzen — mit dem Vornamen oder dem Geburtsdatum.                                                      | Mehr als {n} Treffer. Bitte mit Vorname oder Geburtsdatum eingrenzen.                                                 |

Notes for the implementer:

- `waitingList.certificateExpiredHint` is rendered as „{certificateExpired} — {hint}“ in
  `free-slot-banner.tsx`, so the new hint starts lower-case. The result reads „Nachweis abgelaufen —
  vor der Aufnahme wird ein neuer benötigt.“ The markup stays the same.
- The banner **heading** „Archiviert“ (`bannerHeading`) stays above `bannerDetail`, which is why the
  detail drops the repeated word. `bannerNoReason` is unchanged.
- The prefill heading „Daten aus dem Archiv übernommen“ and the „Übernahme verwerfen und leer
  beginnen“ button are unchanged.
- The „Verstanden, jetzt aufnehmen“ step on the expired-certificate promotion is unchanged.

**Acceptance Criteria:**

- [ ] Each key renders the „New“ text in the same element, with the same `data-testid`.
- [ ] The free-slot banner still offers „Jetzt registrieren“ and „Warteliste öffnen“.
- [ ] Lint, typecheck and unit tests pass.
- [ ] Verified in the browser with `playwright-cli`: an archived record, registration pre-filled from
      the archive, the archive search with no match and with too many matches, the waiting list empty and
      with a free slot, a promotion with an expired certificate, and the customer list filtered to no
      result.

### US-42.4: Refusals and errors — customers, cards, waiting list

**Description:** As a staff member, I want a refusal to say what is wrong and, only when I could not
guess it, what to do.

The rules applied: drop „Es wurde nichts gespeichert.“ (the box's colour says it). Keep „Bitte die
Seite neu laden.“ where the screen is out of date, because that is the one useful action there.

| Key                                          | Current                                                                                                                                               | New                                                                                               |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `customers.errors.emptyHousehold`            | Der Haushalt hat kein Mitglied. Die aufgenommene Person zählt selbst dazu — bitte mindestens eine Zeile ausfüllen.                                    | Der Haushalt ist leer. Bitte mindestens die aufgenommene Person eintragen.                        |
| `customers.errors.customerNotInHousehold`    | {name} zählt selbst zum Haushalt und fehlt in der Liste. Bitte eine Zeile mit Namen und Geburtsdatum ergänzen.                                        | {name} fehlt in der Haushaltsliste. Bitte eine Zeile ergänzen.                                    |
| `customers.errors.birthDateInFuture`         | Ein Geburtsdatum liegt in der Zukunft. Bitte das Datum prüfen.                                                                                        | Ein Geburtsdatum liegt in der Zukunft.                                                            |
| `customers.errors.noFreeCustomerNumber`      | Alle {N} Kundennummern sind vergeben. Bitte einen Haushalt archivieren oder die Höchstzahl in den Einstellungen erhöhen. Es wurde nichts gespeichert. | Alle {N} Kundennummern sind vergeben.                                                             |
| `customers.errors.customerNumberUnavailable` | Die Kundennummer {n} ist nicht mehr verfügbar. Bitte eine andere Nummer wählen.                                                                       | Kundennummer {n} ist nicht mehr frei. Bitte eine andere wählen.                                   |
| `customers.errors.customerNumberUnchanged`   | Der Haushalt hat bereits die Kundennummer {n}. Es wurde nichts geändert; bitte eine andere Nummer wählen.                                             | Der Haushalt hat bereits die Kundennummer {n}.                                                    |
| `customers.errors.cardNumberTaken`           | Die Kartennummer {card} ist bereits vergeben und wird kein zweites Mal ausgestellt. Es wurde nichts gespeichert. Bitte die Seite neu laden.           | Kartennummer {card} ist bereits vergeben. Bitte die Seite neu laden.                              |
| `customers.errors.cardIndexTaken`            | Für diesen Haushalt wurde inzwischen eine neue Karte ausgestellt. Es wurde nichts gespeichert. Bitte die Seite neu laden.                             | Inzwischen wurde eine neue Karte ausgestellt. Bitte die Seite neu laden.                          |
| `customers.errors.notesTooLong`              | Die Notiz ist mit {len} Zeichen zu lang. Es sind höchstens {max} Zeichen möglich — bitte kürzen.                                                      | Die Notiz ist zu lang ({len} Zeichen, höchstens {max}).                                           |
| `customers.record.errors.archived`           | Dieser Haushalt ist archiviert; sein Datensatz kann nicht mehr geändert werden. Bitte die Seite neu laden.                                            | Dieser Haushalt ist archiviert. Bitte die Seite neu laden.                                        |
| `customers.block.errors.missingReason`       | Bitte einen Grund für die Sperre angeben.                                                                                                             | Bitte einen Grund angeben.                                                                        |
| `customers.archive.errors.missingReason`     | Bitte einen Grund für die Archivierung angeben.                                                                                                       | Bitte einen Grund angeben.                                                                        |
| `customers.archiveSearch.noCriteria`         | Bitte mindestens ein Feld ausfüllen: Nachname, Vorname oder Geburtsdatum.                                                                             | Bitte Nachname, Vorname oder Geburtsdatum eingeben.                                               |
| `customers.archiveSearch.errors.notFound`    | Dieser archivierte Datensatz wurde nicht gefunden. Bitte die Suche erneut ausführen.                                                                  | Datensatz nicht gefunden. Bitte erneut suchen.                                                    |
| `customers.archiveSearch.errors.notArchived` | Dieser Haushalt ist nicht archiviert und kann nicht übernommen werden. Bitte die Seite neu laden.                                                     | Dieser Haushalt ist nicht archiviert. Bitte die Seite neu laden.                                  |
| `customers.reissue.errors.archived`          | Dieser Kunde ist archiviert und erhält keine neue Karte. Bitte die Seite neu laden.                                                                   | Dieser Kunde ist archiviert. Bitte die Seite neu laden.                                           |
| `cardsToPrint.errors.superseded`             | Diese Karte ist inzwischen durch eine neue ersetzt worden. Bitte die Seite neu laden.                                                                 | Diese Karte wurde inzwischen ersetzt. Bitte die Seite neu laden.                                  |
| `waitingList.errors.certificateExpired`      | Der Bedarfsnachweis ist am {date} abgelaufen. Für die Warteliste wird — wie für die Aufnahme — ein gültiger Nachweis benötigt.                        | Der Bedarfsnachweis ist am {date} abgelaufen. Für die Warteliste ist ein gültiger Nachweis nötig. |
| `waitingList.errors.noFreeCustomerNumber`    | Zurzeit ist keine Kundennummer frei. Es kann niemand von der Warteliste aufgenommen werden.                                                           | Zurzeit ist keine Kundennummer frei.                                                              |

`customers.errors.noFreeCustomerNumber` is also the standing red box on `/kunden/neu`. That box keeps
its „Stattdessen auf die Warteliste setzen“ link, and the link is now the only advice beside the
sentence.

**Acceptance Criteria:**

- [ ] Each key renders the „New“ text. Tier (amber/red) is unchanged for every error code.
- [ ] The full register on `/kunden/neu` still shows the waiting-list link.
- [ ] The doc comments on the changed keys in `de.ts` match the new text. For example, the
      `cardNumberTaken` comment about „vergeben“ vs. „ausgestellt“ is trimmed to what still applies.
- [ ] Lint, typecheck and unit tests pass.
- [ ] Verified in the browser with `playwright-cli`: register with an empty household and with a
      future birthdate, block and archive without a reason, and run the archive search with no criteria.

### US-42.5: Refusals and errors — distribution and settings

**Description:** As a staff member at the counter or in the settings, I want refusals as short as the
ones elsewhere.

Rules applied: drop „Bitte erneut versuchen.“ (the button is still there) and drop „Es wurde nichts
gespeichert.“

| Key                                                        | Current                                                                                                                                                                               | New                                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `distribution.session.start.errors.unknown`                | Die Ausgabe konnte nicht gestartet werden. Bitte erneut versuchen.                                                                                                                    | Die Ausgabe konnte nicht gestartet werden.                                       |
| `distribution.session.end.errors.unknown`                  | Die Ausgabe konnte nicht beendet werden. Bitte erneut versuchen.                                                                                                                      | Die Ausgabe konnte nicht beendet werden.                                         |
| `distribution.session.discard.errors.unknown`              | Die Ausgabe konnte nicht verworfen werden. Bitte erneut versuchen.                                                                                                                    | Die Ausgabe konnte nicht verworfen werden.                                       |
| `distribution.session.reopen.errors.unknown`               | Die Ausgabe konnte nicht geöffnet werden. Bitte erneut versuchen.                                                                                                                     | Die Ausgabe konnte nicht geöffnet werden.                                        |
| `distribution.counter.errors.notANumber`                   | Das ist keine Kundennummer und keine Kartennummer. Erwartet werden zum Beispiel 50 oder 50k3.                                                                                         | Keine Kunden- oder Kartennummer. Beispiel: 50 oder 50k3.                         |
| `distribution.serve.errors.alreadyServed`                  | Dieser Haushalt hat bei dieser Ausgabe bereits etwas erhalten.                                                                                                                        | Dieser Haushalt hat bereits etwas erhalten.                                      |
| `distribution.serve.errors.notAnAmount`                    | Kein gültiger Betrag. Bitte so eingeben: 4,00                                                                                                                                         | Kein gültiger Betrag, z. B. 4,00.                                                |
| `distribution.serve.errors.unknown`                        | Die Ausgabe konnte nicht gespeichert werden. Bitte erneut versuchen.                                                                                                                  | Die Ausgabe konnte nicht gespeichert werden.                                     |
| `distribution.certificate.reminder.errors.alreadyLogged`   | Für diesen Haushalt ist bei dieser Ausgabe bereits eine Erinnerung erfasst.                                                                                                           | Die Erinnerung ist bereits erfasst.                                              |
| `distribution.certificate.reminder.errors.stillValid`      | Der Bedarfsnachweis ist noch gültig. Es gibt nichts zu erinnern.                                                                                                                      | Der Nachweis ist noch gültig.                                                    |
| `distribution.certificate.reminder.errors.unknown`         | Die Erinnerung konnte nicht gespeichert werden. Bitte erneut versuchen.                                                                                                               | Die Erinnerung konnte nicht gespeichert werden.                                  |
| `distribution.certificate.renewal.errors.validUntilInPast` | Das Datum „gültig bis“ liegt in der Vergangenheit. Bitte das Datum prüfen.                                                                                                            | „Gültig bis“ liegt in der Vergangenheit.                                         |
| `distribution.certificate.renewal.errors.unknown`          | Der Nachweis konnte nicht gespeichert werden. Bitte erneut versuchen.                                                                                                                 | Der Nachweis konnte nicht gespeichert werden.                                    |
| `distribution.errors.noSettings`                           | Für dieses Datum sind keine Einstellungen hinterlegt. Bitte die Grundeinstellungen einspielen.                                                                                        | _(written as `de.settings.errors.noSettings`, see below)_                        |
| `settings.errors.quotaBelowActiveCustomers`                | Die Höchstzahl {N} liegt unter den derzeit {n} aktiven Kunden. Es wurde nichts gespeichert.                                                                                           | Die Höchstzahl {N} liegt unter den {n} aktiven Kunden.                           |
| `settings.eggs.duplicateThreshold`                         | Es gibt zwei Zeilen ab {n} Personen. Jede Stufe darf nur einmal vorkommen. Es wurde nichts gespeichert.                                                                               | Die Stufe ab {n} Personen steht doppelt.                                         |
| `settings.eggs.eggsNotIncreasing`                          | Die Zeile ab {n} Personen gibt {x} Eier und damit nicht mehr als die {y} Eier ab {m} Personen. Größere Haushalte müssen mehr Eier erhalten als kleinere. Es wurde nichts gespeichert. | Ab {n} Personen: {x} Eier — das muss mehr sein als die {y} Eier ab {m} Personen. |
| `settings.certificateTypes.errors.duplicate`               | „{label}“ steht bereits in der Liste. Es wurde nichts gespeichert.                                                                                                                    | „{label}“ steht bereits in der Liste.                                            |
| `settings.certificateTypes.errors.tooLong`                 | Die Art ist mit {len} Zeichen zu lang. Es sind höchstens {max} Zeichen möglich. Es wurde nichts gespeichert.                                                                          | Die Art ist zu lang ({len} Zeichen, höchstens {max}).                            |
| `settings.campaignReminder.errors.tooLong`                 | Der Name ist mit {len} Zeichen zu lang. Es sind höchstens {max} Zeichen möglich.                                                                                                      | Der Name ist zu lang ({len} Zeichen, höchstens {max}).                           |

Notes:

- `distribution.errors.noSettings` and `settings.errors.noSettings` state the same fact. Following
  `ui_styling_guide.md` §8 („Where two screens state the same fact, write one key in terms of the
  other“), `distribution.errors.noSettings` is defined as a reference to `de.settings.errors.noSettings`
  („Es sind noch keine Einstellungen hinterlegt. Bitte die Grundeinstellungen einspielen.“). The
  red box on the counter stays red, with the same test id.
- `eggsNotIncreasing` keeps all four parameters and still builds its phrases with `fromPersons` and
  `eggCount`. The `x` and `y` figures stay inflected („1 Ei“ / „6 Eier“).
- The three „too long“ strings share one shape. If a helper makes them read alike, it lives in `de.ts`
  at module level like `fromPersons`.

**Acceptance Criteria:**

- [ ] Each key renders the „New“ text. Tier is unchanged for every error code.
- [ ] The overpayment question and „Ja, Betrag so buchen“ are unchanged and still required for an
      overpayment.
- [ ] Lint, typecheck and unit tests pass.
- [ ] Verified in the browser with `playwright-cli`: on the counter, an invalid lookup, an invalid
      amount and a past „gültig bis“; in the settings, a quota below the active households, a duplicate
      egg tier, a non-increasing egg tier and a duplicate Nachweis-Art.

### US-42.6: Hints — two dropped, three shortened; the styling guide follows

**Description:** As a staff member, I want the record and the settings to carry no hint that restates
the screen.

| Key                               | Current                                                                                                                      | New                                                                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `customers.record.detailsHint`    | Korrekturen an Name, Geburtsdatum und Anschrift.                                                                             | **removed**: delete the key and its `<p>` in `src/app/kunden/[id]/details-editor.tsx`                        |
| `customers.record.dangerHint`     | Diese Aktionen wirken sofort und werden einzeln bestätigt.                                                                   | **removed**: delete the key and its `<p>` in `src/app/kunden/[id]/page.tsx`                                  |
| `customers.record.householdHint`  | Ändert sich die Zahl der Köpfe, muss die Karte unter „Karten neu ausstellen“ neu ausgestellt werden.                         | Ändert sich die Kopfzahl, erscheint die Karte unter „Karten neu ausstellen“.                                 |
| `waitingList.add.contactNoteHint` | Freitext, z. B. „über die Nachbarin, dienstags vormittags“. Telefonnummern und E-Mail-Adressen werden bewusst nicht erfasst. | Freitext, z. B. „über die Nachbarin, dienstags vormittags“. Bitte keine Telefonnummern oder E-Mail-Adressen. |
| `settings.reasonHint`             | Wird, falls angegeben, im Änderungsprotokoll festgehalten.                                                                   | Wird im Änderungsprotokoll festgehalten.                                                                     |

Kept on purpose, because each states something the screen does not show: `notesHint`,
`groupBalanceHint`, `distribution.certificate.renewal.hint` (now the only place the reset to 0 is
stated), `settings.intro` (now the only place „gilt sofort“ is stated) and
`archiveSearch.result.formerNumberHint`.

**Documentation that has to follow** (same PR, no behaviour):

- `docs/guideline/ui_styling_guide.md` §8 cites two examples that this story removes from the code:
  „Nach dem Beenden sind die Einträge nicht mehr korrigierbar“ (a window that closes) and „Die Liste
  lässt sich nicht umsortieren“ (a rule the missing control would raise). It also quotes the archive
  confirmation as „Rückgängig machen lässt sich die Archivierung nicht“.
  - Update the archive quote to „Rückgängig machen nicht möglich“.
  - For the two examples, either cite a surviving string of the same kind, or drop the bullet and
    record in one line that DF chose terseness over these two warnings (US-42). Do not leave a
    citation of a string that no longer exists.
- Add a short bullet to §8 recording the two rules from this review: an amber or red box already
  means nothing was saved, so no message says „Es wurde nichts gespeichert.“; and „Bitte die Seite
  neu laden.“ appears only where the screen is out of date.
- `docs/handout/betriebsanleitung.md` quotes none of the changed sentences (checked when this PRD was
  written). Re-check with a grep after the change and adjust any prose that describes a removed
  sentence.

**Acceptance Criteria:**

- [ ] `detailsHint` and `dangerHint` no longer exist in `de.ts`, and nothing references them. The
      „Person und Anschrift“ form and the „Aktionen mit Folgen“ section render without them, and with
      everything else unchanged.
- [ ] The three shortened hints render the „New“ text.
- [ ] `ui_styling_guide.md` §8 cites no string that no longer exists in `de.ts`.
- [ ] `npm run lint` passes, including any doc checks CI runs.
- [ ] Verified in the browser with `playwright-cli`: the customer record (details form, household form,
      danger section) and the waiting-list add form.

## Functional Requirements

- FR-1: Every key listed in US-42.1 to US-42.6 must render exactly the „New“ text, including
  punctuation and typographic quotes („ “, ‚ ‘, —, →).
- FR-2: No key outside those tables changes its text.
- FR-3: Every button, link, disclosure, reason field and confirmation step beside a changed message
  must keep its label, its position and its behaviour (see „What must not change“).
- FR-4: The tier of every error code (`src/app/notice-tier.ts`) and the tone of every notice must be
  unchanged.
- FR-5: Every `data-testid` and `data-tier` must be unchanged. The only elements removed are the two
  hint paragraphs in US-42.6.
- FR-6: A changed function signature (`archive.saved`, `numberChange.saved`, `reissue.saved`) must be
  updated at every call site in `src/` and `tests/`. No call site keeps passing a parameter the
  string no longer uses.
- FR-7: Doc comments in `de.ts` on changed keys must describe the new string. A comment that only
  justified removed content is deleted, not left behind.

## Non-Goals (Out of Scope)

- **No „Neu laden“ button in the red box.** It was discussed as a way to drop „Bitte die Seite neu
  laden.“ from 22 messages, but it is a functionality change and stays out of this PRD.
- No change to when a message appears, to the `NoticeBoard`, to tiers or colours, or to icons.
- No change to buttons, headings, labels, table columns, field placeholders or the counter's verdict
  chips.
- No change to messages not listed here. About 75 of ~150 were reviewed and kept.
- No new messages and no new i18n keys, except a module-level helper in `de.ts` if one makes the
  three „zu lang“ strings share their shape.
- No change to `docs/handout/` beyond what US-42.6 finds.

## Technical Considerations

- **Most specs need no edit.** The e2e suite compares against `de.*` rather than German literals
  (`grep` found no hard-coded copy of the changed sentences in `tests/` or `src/`). A spec only
  changes where a signature changes: `archive.spec.ts`, `customer-record.spec.ts`,
  `card-number.spec.ts`, `reissue.spec.ts`, `cards-to-print.spec.ts`, `session-detail.spec.ts`
  reference `archive.saved` / `reissue.saved` / `numberChange.saved`.
- `reissue.saved` becomes a `Segment[]`. Specs asserting it compare against
  `plain(de.customers.reissue.saved(…))`, as the number-change specs already do.
- Run both engines: `npm run test:e2e` and `npm run test:e2e:webkit`, with the dev server stopped
  first.
- One commit per story is natural: each is a `feat(app)` (or `docs` for the guide) change with no
  refactor mixed in.

## Success Metrics

- Every message in the tables reads as specified. Spot-checked in the browser per story.
- Both e2e suites, the unit tests and lint are green with no test weakened. A changed assertion
  compares the new `de.*` value, never a removed one.
- `grep "Es wurde nichts gespeichert\|Bitte erneut versuchen" src/i18n/de.ts` returns nothing.

## Open Questions

- None blocking. The „Neu laden“ button (Non-Goals) can become its own story if DF want „Bitte die
  Seite neu laden.“ gone entirely.
