# Changelog

## 2026.10.18

- Dropdowns (Ticket-Aktionen, Spalte sortieren, MRs) im Stil der GitLab-Dropdowns: Kopfzeile mit Titel und Trennlinie,
  größere Zeilen mit Hover; MR-Einträge zeigen Titel und darunter `!iid`.

## 2026.10.17

- Mehrere MRs zu einem Ticket: Das MR-Badge öffnet jetzt ein Dropdown mit allen MRs (statt einer gefilterten
  MR-Suche); Auswahl öffnet den MR in einem neuen Tab.

## 2026.10.16

- Platzhalter (Skeletons) auch für die Verweildauer auf der Karte und den Median im Spaltenkopf, solange die
  Label-Events laden. Geladene Werte (Progress-Bar, Verweildauer, Median, MR-Badge) blenden weich ein
  (bei „Bewegung reduzieren“ ohne Animation).

## 2026.10.15

- Verweildauer robuster: Ein versehentliches Verschieben in eine andere Spalte und gleich wieder zurück (unter
  15 Minuten) unterbricht den Aufenthalt nicht mehr. Außerdem zählt ein früherer Aufenthalt nicht mehr als „seit X
  Tagen“, wenn das Spalten-Label gar nicht mehr am Ticket liegt (z. B. Label-Events noch nicht aktuell nach dem
  Verschieben) – dann beginnt die Verweildauer bei 0.

## 2026.10.14

- Einstellungs-Panel neu gestaltet: Abschnitte als Karten mit Chevron, feste Kopf- und Speichern-Leiste, Schalter in
  zwei Spalten, Status-Karte (Version, Anzeige, Aktualisierung) oben, GitLab-Formularfelder mit Beschriftung und
  Hinweisen statt Großbuchstaben-Überschriften; redundante „Aktuell:“-Zeilen entfallen.
- Kein „Einstellungen speichern“-Button mehr: Änderungen an der Projekt-Konfiguration werden entprellt (0,7 s) sofort
  übernommen, das Board lädt ohne Seiten-Reload neu und das geänderte Feld leuchtet kurz grün. Ungültige Eingaben
  werden nicht gespeichert, sondern am Feld erklärt.

## 2026.10.13

- Einstellungen als Seitenpanel nach dem Vorbild von GitLabs Ticket-Vorschau: rechts angedockt unter der Top-Bar, etwa
  die halbe Fensterbreite (min. 480 px), mit Titel und Schließen-Button; schließt auch mit Escape oder Klick daneben.
- MR-Badge auf den Karten hat jetzt einen Hover-Zustand (Hintergrund + Unterstreichung, ohne Layout-Sprung).

## 2026.10.12

- Einstellungsmenü größer (Breite 400 px, Zoom 1.15) und mit GitLab-Buttons: Datentools, Experimente-Buttons,
  „Jetzt aktualisieren“ und „Einstellungen speichern“ nutzen `btn gl-button` (Standard bzw. `btn-confirm`) statt der
  Eigenbau-Optik mit festen Farben.

## 2026.10.11

- Buttons um die Progress-Bar (Portal ↗, Timesheet, Ticket-Aktionen im MR, Assignee-Schnellauswahl) nutzen jetzt
  GitLabs eigene Button-Klassen (`btn gl-button btn-default btn-sm`) statt der dunklen Eigenbau-Pillen: 24 px große
  Icon-Buttons mit GitLab-Rahmen, -Hover und -Fokusring, passend zu Zahnrad und Plus im Spalten-Header.

## 2026.10.10

- Ticket-Aktionen auf Karten: Klick öffnet das Ticket nicht mehr. Ursache (live im Board gemessen): GitLab legt einen
  unsichtbaren Link (`a.board-card-button`, `inset-0`) über die Karte; der Button hatte weder `position` noch
  `z-index` und lag darunter. Die Hitbox war nie das Problem.
- Spalten-Header: Bei knappem Platz schrumpft der Scope-Teil („Workflow“) zu einem schmalen Farbbalken, damit mehr
  vom Label-Namen sichtbar bleibt.

## 2026.10.9

- Spalten-Header: Label sitzt auf einer Linie mit den Icons (GitLabs `h2` hatte 20px/10px Standard-Abstand und stand
  ~5px zu tief; live im Board gemessen).

## 2026.10.8

- Split-Labels: lange Titel werden mit „…“ gekürzt (volle Beschriftung im Tooltip) statt die Buttons aus dem Header zu
  schieben; in eingeklappten Spalten bleibt GitLabs Original stehen.
- Ticket-Aktionen: eigenes Drei-Punkte-Icon (unabhängig vom GitLab-Sprite); Maus-/Pointer-Events werden schon am
  `document` gestoppt, damit die Karte das Ticket-Detail nicht öffnet.
- Hover-Zustand für alle Script-Buttons (Portal-, Timesheet-, Aktions- und Einstellungs-Buttons).

## 2026.10.7

- Sortieren jetzt pro Spalte: Sortier-Icon im Spalten-Header (neben dem Auge) mit „Unassigned nach oben“ und
  „Nach Assignee gruppieren“. Die globalen Knöpfe unter Erweitert sind entfallen.
- Ticket-Aktionen: Klick öffnet nicht mehr das Ticket-Detail; Optik jetzt wie GitLabs Icon-Buttons (Drei-Punkte-Icon,
  im Issue-Detail mit Text).
- Split-Labels sitzen auf einer Linie mit den Icons im Spalten-Header (Höhe/Ausrichtung des Originals übernommen).

## 2026.10.6

- Übernommen: Warnfarbe (gelb ab 80 %), Stale-while-revalidate, Cache-Alter, Aktualisieren ohne Reload, weitere
  Portal-Projekt-IDs, Fehlerprotokoll, Median-Verweildauer mit Verlauf, Verweildauer-Cache, Update nach Drag & Drop,
  Changelog im Update-Hinweis, Auto-Selbsttest, englische Oberfläche (teilweise).
- Neu: Ticket-Aktionen als Dropdown mit Blitz-Icon (Karte und Issue-Detail); Knöpfe „Unassigned nach oben“ und „Nach Assignee gruppieren“.
- Split-Labels jetzt auch im Issue-Detail, Board-Drawer und MR-Detail.
- Entfernt: Spalten-Summe, „nur überzogene“, Schwellen pro Spalte, Sortierung nach Auslastung, MR-Marker (Draft,
  Konflikt, Stale), `[!Label]`, ↻ pro Karte, Prognose, Timesheet-Vorbefüllung.
- Bleibt Experiment: Pipeline-Status am MR-Badge, Konfig-Link.

## 2026.10.5

- Neu: Menü „Experimente (zum Testen)“ unter Zahnrad → Globale Einstellungen → Erweitert. Alle Experimente sind
  standardmäßig aus und einzeln schaltbar.
- Spalten-Summe, Filter „nur überzogene“, Warnschwellen (auch pro Spalte), Sortierung nach Auslastung.
- MR-Badge: Pipeline-Status, Draft-/Konflikt-/Approval-Marker, Stale-Hinweis.
- Ticket-Aktionen: Bestätigung per `[!Label]`, auch im Issue-Detail und auf Karten.
- Cache: Stale-while-revalidate, ↻ pro Karte, Cache-Alter, Aktualisieren ohne Reload, weitere Portal-Projekt-IDs,
  Fehlerprotokoll.
- Zeit: Verlauf pro Spalte, Median, persistenter Verweildauer-Cache, Update nach Drag & Drop, Prognose,
  Timesheet-Link mit Titel.
- Betrieb: Konfig-Link, Changelog im Update-Hinweis, Auto-Selbsttest nach Update, teilweise englische Oberfläche.
