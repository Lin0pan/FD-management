# FD-Management — Betriebsanleitung

**Testversion · Stand: 20. September 2026**

Diese Software unterstützt die Kundenverwaltung und die Ausgabe des Delbrücker Füllhorns. Sie läuft
auf **einem einzigen Rechner**, ohne Internet und ohne Anmeldung.

> **Diese Version ist zum Ausprobieren gedacht, nicht für den Echtbetrieb.** Die Excel-Liste bleibt
> bis auf Weiteres maßgeblich. Bitte legen Sie noch **keine echten Kundendaten** an — es gibt noch
> keine automatische Sicherung, und die Daten dieser Testphase werden vor dem Echtstart gelöscht.

## Starten und beenden

1. Das Programm starten: _(Verknüpfung im Dock — vor der Übergabe einzurichten)_. Es öffnet sich
   zuerst ein Fenster mit Textzeilen („Terminal“) — das gehört dazu und muss **offen bleiben**,
   solange Sie arbeiten.
2. **Safari** öffnen und das Lesezeichen **FD-Management** anklicken (`http://localhost:3000`).
3. Zum Beenden den Safari-Tab schließen und danach das Terminal-Fenster schließen.

Es kann immer nur **ein Rechner** das Programm betreiben. Zwei Personen können nicht gleichzeitig von
zwei Geräten aus arbeiten.

## Wo die Daten liegen

Alle Kundendaten stehen in **einer einzigen Datei**: `data/fd.db` im Programmordner. Diese Datei ist
das gesamte Register — Kunden, Karten, Ausgaben, Einstellungen. Sonst gibt es nichts: keine Kopie in
der Cloud, keinen Server, keinen zweiten Speicherort.

**Wenn diese Datei verloren geht, sind alle Daten verloren.** Deshalb der nächste Abschnitt.

## Sicherung — die wichtigste Aufgabe

Eine Sicherung ist das **Kopieren eines Ordners**. Sie brauchen dafür keine EDV-Kenntnisse.

1. Das Programm **beenden** (siehe oben). Das ist wichtig: eine Kopie im laufenden Betrieb kann
   unvollständig sein.
2. Den kompletten Ordner `data` auf einen USB-Stick oder eine externe Festplatte kopieren.
3. Den Ordner auf dem Stick mit dem heutigen Datum benennen, zum Beispiel `data-2026-08-08`.

**Wann:** nach jedem Ausgabetag, an dem Sie mit dem Programm gearbeitet haben.
**Wohin:** auf einen Datenträger, der **nicht** im selben Raum liegt wie der Rechner.
**Wer:** _(vor dem Echtstart festzulegen)_

Bewahren Sie die letzten Sicherungen auf und überschreiben Sie nicht immer dieselbe — ein Fehler
fällt manchmal erst Wochen später auf.

## Wiederherstellen

Ist der Rechner defekt oder die Datei beschädigt, wird die Sicherung zurückkopiert: den gesicherten
Ordner `data` an die ursprüngliche Stelle im Programmordner kopieren und das Programm neu starten.
Der Stand entspricht dann dem Tag der Sicherung. Bitte melden Sie sich in diesem Fall, bevor Sie es
selbst versuchen.

## Eier

Neben den Lebensmitteln erhält jeder Haushalt Eier. Wie viele, hängt davon ab, **wie viele Personen**
zum Haushalt gehören — Kinder und Babys zählen mit, ein Geburtstag ändert daran nichts. Unter
**Ausgabe** steht die Zahl neben Erwachsenen, Kindern und Preis, und zwar auch dann, wenn es keine
Eier gibt: dann steht dort **0**. Beim Kunden selbst finden Sie dieselbe Zahl. Auf der Kundenkarte
steht sie nicht — die Eier werden an der Ausgabe übergeben.

Ändern können Sie die Regel unter **Einstellungen**, Abschnitt **Eier**: eine Zeile je Stufe — ab wie
vielen Personen sie gilt und wie viele Eier es dann gibt. **Zeile hinzufügen** legt eine Stufe an,
das **×** rechts neben einer Zeile nimmt sie wieder weg; entfernen Sie alle, erhält niemand Eier.
In welcher Reihenfolge Sie tippen, ist gleichgültig. Zwei Zeilen mit derselben Personenzahl nimmt
die Software nicht an, und eine höhere Stufe muss mehr Eier geben als die darunter — sonst wird
nichts gespeichert und Sie erhalten eine Meldung. Nach dem Speichern gilt die neue Regel sofort;
die bisherige bleibt im Änderungsverlauf darunter stehen.

## Art des Nachweises

Überall dort, wo die Software nach dem Nachweis fragt — bei der Aufnahme, beim Erneuern an der
**Ausgabe** oder beim Kunden und auf der **Warteliste** —, wählen Sie die **Art des Nachweises** aus
einer Liste aus, statt sie zu tippen. So heißt derselbe Bescheid überall gleich.

Welche Arten in der Liste stehen, bestimmen Sie unter **Einstellungen**, Abschnitt **Arten des
Nachweises**: eine Zeile je Art. **Art hinzufügen** legt eine Zeile an, das **×** rechts neben einer
Zeile nimmt sie wieder weg, **Arten speichern** übernimmt die Änderungen. Dieselbe Art zweimal nimmt
die Software nicht an. Nach dem Speichern steht die Liste sofort überall zur Auswahl.

**Eine entfernte Art ändert nichts an dem, was schon gespeichert ist.** Wo ein Nachweis mit dieser
Art erfasst wurde, steht sie weiterhin; sie wird nur nicht mehr zur Auswahl angeboten.

Bringt jemand einen Nachweis, der nicht in der Liste steht, wählen Sie **Sonstiges** — der letzte
Eintrag der Liste. Darunter erscheint das Feld **Welche Art?**, in das Sie die Bezeichnung
schreiben. Sie wird beim Haushalt genau so gespeichert, wie Sie sie eintippen, und rückt nicht von
selbst in die Liste. Solange Sie noch keine Arten eingerichtet haben, steht überall **Sonstiges** —
Sie tippen die Art dann ein wie bisher.

## Die Ausgabe starten und beenden

Eine Ausgabe wird **von Hand begonnen und von Hand beendet**. Erst danach richtet sich alles
Weitere: Erfasst wird nur, solange eine Ausgabe läuft, und ein Eintrag gehört immer zu genau der
Ausgabe, bei der er entstanden ist — nicht zu einem Kalendertag. Deshalb darf eine Ausgabe auch über
Mitternacht hinaus laufen.

**Beginnen.** Unter **Ausgabe** steht, solange keine läuft, **Ausgabe starten**. Davor wählen Sie
die Gruppe:

| Auswahl          | Wer heute abholen darf                                                                 |
| ---------------- | -------------------------------------------------------------------------------------- |
| **Rot**          | Nur Haushalte mit ungerader Kundennummer                                               |
| **Blau**         | Nur Haushalte mit gerader Kundennummer                                                 |
| **Rot und Blau** | Alle Haushalte — die zusammengelegte Ausgabe, für die es keine eigene Einstellung gibt |

Eine Auswahl ist bereits vorbelegt: die Gruppe, die beim letzten Mal **nicht** an der Reihe war —
waren es beide, sind es wieder beide. Sie können jedes Mal davon abweichen; die Software fragt nicht
nach einem Grund und warnt nicht. **Während die Ausgabe läuft, lässt sich die Gruppe nicht mehr
ändern.** Wurde versehentlich die falsche gewählt, verwerfen Sie die Ausgabe (siehe unten) und
starten sie neu.

Es kann immer nur **eine** Ausgabe gleichzeitig laufen.

**Beenden.** Am Ende des Nachmittags **Ausgabe beenden**. Die Software beendet von sich aus nie eine
Ausgabe — nicht um Mitternacht, nicht nach einer Wartezeit und auch nicht, wenn Sie die nächste
starten. Vor dem Beenden nennt sie Ihnen, wie viele Haushalte versorgt wurden und wie viel Geld
eingenommen wurde. Dass nicht alle Haushalte einer Gruppe gekommen sind, ist der Normalfall und wird
nirgends angemahnt.

> **Mit dem Beenden sind die Einträge dieser Ausgabe festgeschrieben.** Betrag ändern und Eintrag
> entfernen sind danach nicht mehr möglich.

**Eine vergessene Ausgabe fällt auf.** Läuft noch eine, steht das ganz oben auf dem
Startbildschirm — mit der Gruppe, dem Zeitpunkt des Beginns und einem Weg direkt zur Ausgabe. Wer am
nächsten Morgen den Rechner einschaltet, sieht also sofort, dass der Nachmittag noch offen ist.

**Versehentlich gestartet: verwerfen.** Solange bei einer laufenden Ausgabe **nichts** erfasst
wurde — keine Lebensmittel, keine Erinnerung — bietet der Bildschirm **Ausgabe verwerfen** an. Eine
verworfene Ausgabe hat es für die Software nie gegeben; es wird nichts darüber festgehalten. Sobald
der erste Haushalt erfasst ist, verschwindet diese Möglichkeit und es bleibt nur das Beenden.

**Was eine beendete Ausgabe festhält.** Zu jeder beendeten Ausgabe hält die Software fest, welche
Haushalte versorgt wurden — mit Name, Nummer, Karte, Erwachsenen und Kindern, Nachweisdatum und
Erinnerungen **so, wie sie an jenem Nachmittag waren**, nicht wie sie heute sind. Wer später
heiratet, umzieht oder eine neue Nummer bekommt, steht dort weiterhin mit dem, was damals galt.
**Solange die Ausgabe läuft, kommt jede Korrektur noch an** — ein Name, der erst nach der Erfassung
als falsch geschrieben auffällt, wird auch dort richtiggestellt. **Mit dem Beenden ist dieser Stand
festgehalten**; beim Wiederöffnen gilt wieder der aktuelle, und das nächste Beenden hält ihn erneut
fest.

**Zu früh beendet: wieder öffnen.** Solange **keine neue** Ausgabe läuft, lässt sich die **zuletzt
beendete** unter **Ausgabe** über **Ausgabe wieder öffnen** noch einmal öffnen. Dafür ist ein Grund
erforderlich, der protokolliert wird. Danach sind ihre Einträge wieder zu korrigieren wie vorher.
Ältere Ausgaben bleiben festgeschrieben.

**Solange keine Ausgabe läuft**, zeigt der Ausgabe-Bildschirm nur den Start und die letzte Ausgabe
mit ihren Zahlen. Eine Kundennummer lässt sich dann nicht nachschlagen — Kunden anlegen, sperren,
ändern und Karten ausstellen geht wie immer.

## Saldo — Guthaben und offene Beträge

Nicht jeder Haushalt zahlt genau den Betrag, der an diesem Tag fällig ist. Mancher gibt weniger,
mancher gibt mehr, damit er es sich bis zur nächsten Woche nicht merken muss. Bisher stand das
handschriftlich in der Excel-Liste; die Software rechnet es jetzt selbst mit und nennt das Ergebnis
**Saldo**.

Der Saldo steht unter **Ausgabe** neben Erwachsenen, Kindern und Preis, und beim Kunden selbst über
der Liste **Bisherige Ausgaben**. Ein Vorzeichen sagt, wie der Haushalt dasteht:

| Anzeige          | Bedeutung                                                                  |
| ---------------- | -------------------------------------------------------------------------- |
| **ausgeglichen** | Der Haushalt schuldet nichts und hat nichts gut. Der Normalfall.           |
| **−2,00 €**      | Der Haushalt schuldet noch 2,00 €. Der Betrag wird heute mit gefordert.    |
| **+2,00 €**      | Der Haushalt hat 2,00 € zu viel gezahlt. Der Betrag wird heute verrechnet. |

Unter **Ausgabe** ist das Feld zusätzlich schwach eingefärbt: **rot**, wenn der Haushalt noch etwas
schuldet, **blau**, wenn er etwas gut hat, und grau wie die übrigen Felder, wenn alles ausgeglichen
ist. Die Farbe wiederholt nur das Vorzeichen — wer sie nicht unterscheiden kann oder das Blatt in
Schwarzweiß ausdruckt, liest dasselbe am **−** oder **+** ab.

In der Liste **Bisherige Ausgaben** beim Kunden trägt jede Zeile denselben Vorzeichen-Hinweis: neben
dem gezahlten Betrag steht **−2,00 €**, wenn an dem Tag 2,00 € zu wenig übergeben wurden, **+2,00 €**,
wenn es 2,00 € zu viel waren, und **genau**, wenn der geforderte Betrag genau gezahlt wurde. Dieser
Hinweis ist zusätzlich rot, blau oder grün hinterlegt — auch hier nur als Wiederholung dessen, was
schon dasteht. **Gefordert** ist dabei der Betrag, der an jenem Tag verlangt wurde (der Preis, um den
damaligen Saldo verschoben), **Preis** die reinen Kosten der Woche.

**Zu zahlen** ist der Betrag, den Sie heute kassieren: der Preis dieser Woche, um den Saldo erhöht
oder verringert. Er kann höher sein als der Preis — dann zahlt der Haushalt eine alte Schuld mit ab —
oder niedriger bis hinunter auf **0,00 €**, wenn ein Guthaben die ganze Woche deckt. Ausgezahlt wird
ein Guthaben nie; es bleibt stehen und wird bei den nächsten Ausgaben verbraucht.

### Beim Erfassen

Das Feld **Betrag** ist bereits mit dem geforderten Betrag ausgefüllt. **Im Normalfall bestätigen Sie
es einfach** mit **Ausgabe erfassen** — Sie müssen nichts rechnen und nichts eintippen.

Gibt der Haushalt weniger, tragen Sie den tatsächlich erhaltenen Betrag ein; der Rest steht ab sofort
mit einem **Minus** im Saldo des Haushalts und wird bei der nächsten Ausgabe mit gefordert. Gibt jemand mehr, fragt
die Software einmal nach („… wirklich so buchen?“) und bucht den Betrag erst nach Ihrer Bestätigung.
Diese Rückfrage ist keine Ablehnung — sie fängt nur den vertippten Betrag ab, denn ein zu hoch
gebuchtes Guthaben würde stillschweigend die nächsten Wochen bezahlen.

Wer heute nichts zahlt, bekommt trotzdem Lebensmittel: tragen Sie **0** ein. Der offene Betrag wird
festgehalten, mehr passiert nicht — was mit einer Schuld geschieht, entscheiden weiterhin Sie und
nicht das Programm.

**Nach dem Erfassen ist der Bildschirm wieder leer.** Der Haushalt, die Beträge und die Schaltflächen
verschwinden, das Nummernfeld steht leer und bereit für den nächsten. Ganz oben steht eine Zeile, die
sagt, was gebucht wurde: Kundennummer, Name, Betrag und Uhrzeit. Daneben führt **Korrigieren** mit
einem Klick zurück zu genau diesem Haushalt. Die Zeile bleibt stehen, bis Sie die nächste Nummer
eingeben.

### Einen Fehler berichtigen

**Solange die Ausgabe läuft** können Sie einen Eintrag ändern. Zwei Wege führen zum Haushalt zurück:
die Nummer unter **Ausgabe** noch einmal eingeben — oder, solange die Bestätigungszeile der eben
erfassten Ausgabe oben steht, dort auf **Korrigieren** klicken. Statt der Schaltfläche zum Erfassen
steht dann dort, was bei dieser Ausgabe schon gebucht wurde, und darunter **Eintrag korrigieren** —
den richtigen Betrag eintragen und **Betrag speichern**. Mit **Eintrag entfernen** verschwindet die
Buchung ganz; der Saldo steht danach wieder so wie vorher, und die Rückfrage nennt Ihnen diesen
Stand, bevor Sie bestätigen.

**Ist die Ausgabe beendet, geht das nicht mehr** — festgeschriebene Einträge sind das Protokoll
dessen, was tatsächlich geschehen ist, und werden nicht nachträglich verändert. Fällt der Fehler
kurz nach dem Beenden auf, können Sie die Ausgabe noch einmal öffnen (siehe **Die Ausgabe starten
und beenden**), solange keine neue läuft. Sonst gibt es einen einfachen Weg:

> **Fällt ein Fehler später auf, wird er bei der nächsten Ausgabe des Haushalts ausgeglichen.**
> Haben Sie 5,00 € gebucht, obwohl nur 3,00 € übergeben wurden, tragen Sie bei der nächsten Ausgabe
> 2,00 € weniger ein als gefordert — der Rest bleibt als **Minusbetrag** stehen. Umgekehrt tragen Sie
> 2,00 € mehr ein, wenn zu wenig gebucht wurde. Der Saldo trägt die Korrektur von selbst weiter, und
> die Kasse stimmt wieder.

Notieren Sie einen solchen Fall bitte kurz, solange Sie ihn im Kopf haben — die Software kann nicht
wissen, dass eine spätere Zahlung eine Berichtigung war.

## Kundennummer ändern

Die Kundennummer eines Haushalts liegt nicht mehr für immer fest. Sie können sie beim Kunden im
Abschnitt **Gruppe und Kundennummer** auf jede freie Nummer umstellen — etwa wenn eine Familie
zurückkommt und ihre alte Nummer wieder haben möchte, wenn Nummern beieinander liegen sollen oder
wenn sich jemand schlicht vertippt hat. Einen Grund fragt die Software nicht ab.

Sie wählen dort zuerst die Gruppe und darunter eine Nummer — angeboten werden die freien Nummern
dieser Gruppe. Ist in einer Gruppe keine Nummer mehr frei, steht das dort und die Gruppe lässt sich
nicht wählen.

> **Die Nummer bestimmt die Gruppe**, so wie im Papierregister: **gerade Nummern sind BLAU, ungerade
> ROT.** Deshalb gibt es keine eigene Einstellung für die Gruppe — wer den Haushalt in die andere
> Woche holen will, gibt ihm eine Nummer der anderen Sorte. Und weil beide Hälften getrennt voll
> laufen können, kann in einer Woche keine Nummer mehr frei sein, während in der anderen noch
> welche sind.

Bevor gespeichert wird, nennt Ihnen die Software alle drei Angaben: die neue Kundennummer, die
**Gruppe** und die neue **Kartennummer**. Alle drei brauchen Sie:

> **Mit dem Speichern wird eine neue Karte ausgestellt.** Schreiben Sie die genannte Kartennummer auf
> eine Karte der genannten Gruppe und geben Sie sie dem Haushalt mit. Die alte Karte ist ab sofort
> ungültig und darf an der Ausgabe nicht mehr angenommen werden — bitte nehmen Sie sie wieder an
> sich.

Zwei Dinge sehen dabei ungewohnt aus und sind trotzdem richtig:

- **Die neue Kartennummer zählt nicht bei dem Haushalt weiter, sondern bei der Nummer.** Wer bisher
  `100k2` hatte und auf die 105 wechselt, bekommt vielleicht `105k7` — weil auf der 105 schon sechs
  Karten ausgegeben wurden. Der Sprung gehört zur Nummer, nicht zum Haushalt.
- **Die alten Karten behalten in der Übersicht ihre alten Nummern.** Sie werden nicht umgeschrieben.
  Nur so kann keine Kartennummer zweimal in Umlauf geraten.

Die frei gewordene Nummer steht **sofort** wieder für eine Aufnahme zur Verfügung. Rückgängig machen
lässt sich ein Wechsel nicht: Wenn Sie die alte Nummer wieder vergeben möchten, ist das ein zweiter
Wechsel — und der stellt wieder eine neue Karte aus.

## Wenn etwas nicht funktioniert

| Beobachtung                                            | Was zu tun ist                                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Die Seite lädt nicht                                   | Prüfen, ob das Terminal-Fenster noch offen ist. Wenn nicht: Programm neu starten.                |
| Eine Meldung erscheint, die Sie nicht kennen           | Bildschirmfoto machen und melden. Nichts weiter anklicken.                                       |
| Eine Karte wird abgewiesen, obwohl sie gültig aussieht | Nicht überschreiben, sondern melden — dafür ist die Testphase da.                                |
| Das Programm reagiert nicht mehr                       | Terminal-Fenster schließen, Programm neu starten. Gespeicherte Daten gehen dabei nicht verloren. |

## Was Sie wissen sollten

- **Es gibt keine Anmeldung.** Wer den Rechner benutzen kann, sieht und ändert das ganze Register.
  Der Bildschirm sollte gesperrt werden, sobald jemand den Platz verlässt.
- **Nichts verlässt den Rechner.** Es werden keine Daten ins Internet übertragen.
- **Nichts wird endgültig gelöscht.** Kunden werden archiviert und bleiben auffindbar.
- **Änderungen sind sofort wirksam** und werden protokolliert — mit Datum und Grund, aber ohne Namen,
  da es keine Anmeldung gibt.

## Rückmeldungen und Fragen

_(Name und Kontakt der betreuenden Person hier eintragen)_

Alles, was Ihnen auffällt, ist in dieser Phase willkommen — auch Kleinigkeiten und
„das habe ich anders erwartet“. Bitte notieren Sie dazu: **welcher Bildschirm**, **was Sie getan
haben**, **was Sie erwartet haben** und **was stattdessen passiert ist**.
