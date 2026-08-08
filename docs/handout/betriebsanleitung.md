# FD-Management — Betriebsanleitung

**Testversion · Stand: 8. August 2026**

Diese Software unterstützt die Kundenverwaltung und die Ausgabe des Delbrücker Füllhorns. Sie läuft
auf **einem einzigen Rechner**, ohne Internet und ohne Anmeldung.

> **Diese Version ist zum Ausprobieren gedacht, nicht für den Echtbetrieb.** Die Excel-Liste bleibt
> bis auf Weiteres maßgeblich. Bitte legen Sie noch **keine echten Kundendaten** an — es gibt noch
> keine automatische Sicherung, und die Daten dieser Testphase werden vor dem Echtstart gelöscht.

## Starten und beenden

1. Das Programm starten: _(Verknüpfung auf dem Desktop — vor der Übergabe einzurichten)_. Es öffnet
   sich zuerst ein schwarzes Fenster mit Textzeilen — das gehört dazu und muss **offen bleiben**,
   solange Sie arbeiten.
2. Den Browser öffnen und das Lesezeichen **FD-Management** anklicken (`http://localhost:3000`).
3. Zum Beenden den Browser-Tab schließen und danach das schwarze Fenster schließen.

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

## Wenn etwas nicht funktioniert

| Beobachtung                                            | Was zu tun ist                                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Die Seite lädt nicht                                   | Prüfen, ob das schwarze Fenster noch offen ist. Wenn nicht: Programm neu starten.                 |
| Eine Meldung erscheint, die Sie nicht kennen           | Bildschirmfoto machen und melden. Nichts weiter anklicken.                                        |
| Eine Karte wird abgewiesen, obwohl sie gültig aussieht | Nicht überschreiben, sondern melden — dafür ist die Testphase da.                                 |
| Das Programm reagiert nicht mehr                       | Schwarzes Fenster schließen, Programm neu starten. Gespeicherte Daten gehen dabei nicht verloren. |

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
