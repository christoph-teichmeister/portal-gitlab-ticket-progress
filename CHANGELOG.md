# Changelog

## 2026.10.51

- Nach dem Scan-Limit (80 Portal-Abfragen pro Durchlauf) legt das Script nach 2 Sekunden selbst einen weiteren Durchlauf
  nach. Bisher blieben die übrigen Karten ohne Balken, bis sich auf der Seite zufällig etwas änderte (fiel vor allem
  in der Closed-Spalte beim Scrollen auf).

## 2026.10.50

- Closed-Spalte bekommt ihr Auge jetzt auch, wenn GitLab dort keine Button-Gruppe (`+`/`⚙`) zeichnet: das Script
  setzt eine eigene neben den Zähler. Damit lässt sich die Closed-Ansicht aus 2026.10.49 überhaupt einschalten.

## 2026.10.49

- Closed-Spalte: Schaltest du ihr Auge an, läuft das Script nur auf Tickets, die in den letzten 28 Tagen geschlossen
  wurden (Balken, MR-Badge, Ticket-Aktionen; keine Verweildauer-Uhr). Ältere Karten bekommen nur das SP-Badge.
  Zeitraum pro Board einstellbar: Zahnrad → Dieses Board → „Closed-Spalte“ (1–40 Tage). Eine API-Abfrage pro Board,
  5 Minuten zwischengespeichert.

## 2026.10.48

- Ohne Portal-URL und Projekt-ID zeigen die Spalten kein Auge mehr (es hätte nichts zu schalten); das Gruppieren
  bleibt.

## 2026.10.47

- Timebox-Schätzungen auch ohne „Timebox:“/„Spike:“ und in Tagen: `(4h)`, `(3 Std.)`, `(1 Tag)`, `[2d]` werden als
  Badge erkannt (`Timebox 1 Tag`). Eigene Muster: Gruppe 2 ist optional die Einheit.

## 2026.10.46

- Neu: Klick auf einen Schätzungs-Badge einer Board-Karte zeigt nur noch Karten mit derselben Schätzung, erneuter
  Klick zeigt wieder alle. Gilt bis zum Neuladen.

## 2026.10.45

- Neu: **SP-Summe im Spalten-Header** (`Σ 13 SP`) für Label-Spalten und Closed. Zählt alle Tickets der Spalte per
  GitLab-API, nicht nur die geladenen Karten, und berücksichtigt die Filter der Suchleiste. Schalter unter Anzeige →
  Board-Karten, Unterpunkt von „Schätzung als Badge“.

## 2026.10.44

- Neu: Schalter **Warnung bei fehlender Portal-URL** unter Zahnrad → Dieses Board. Aus = kein gelber Toast auf
  Boards, die bewusst ohne Portal laufen.

## 2026.10.42

- „Zweites Portal-Projekt“ und „Weitere Projekt-IDs“ zusammengelegt: ein Feld **Weitere Projekt-IDs** pro Board
  (Tab „Dieses Board“, bis zu 3, je ein eigener Balken). Eine bisher eingetragene zweite Projekt-ID und die bisherige
  globale ID-Liste werden automatisch übernommen. Der orange Balken und der Hinweis „In beiden Portal-Projekten
  gefunden“ entfallen.
- Konfigurations-Export und Konfigurations-Link enthalten jetzt `extraProjectIds`; Importe im alten Format
  (zweite Projekt-ID) werden weiter angenommen.
- Anzeigen, Debug-Logs und MR-Buttons lesen nur noch die globalen Feature-Schalter; die alten Werte von vor den
  Feature-Schaltern werden nicht mehr berücksichtigt.
- Aufgeräumt: ungenutzte Host-Konfiguration, wirkungslose Versions-Bereinigung, doppelte localStorage-Helfer und
  Prüfungen, die nie greifen konnten, entfernt.

## 2026.10.41

- Aufgeräumt, ohne sichtbare Funktionsänderung: Ticket-Detail und MR-Seite laden über einen gemeinsamen Weg, die
  Zeile „Timesheet | Balken | Portal" wird an allen fünf Stellen von einem Helfer gebaut, GitLab-API-Aufrufe und
  ihr Caching laufen über zwei gemeinsame Helfer.
- Geteilte Scoped Labels werden einmal pro Scan angewendet statt dreimal (weniger Layout-Arbeit bei jeder DOM-Änderung).
- Liefert das Portal die Stunden im title-Attribut, wird das Dokument nicht mehr ein zweites Mal nach „Booked Hours"
  durchsucht.
- Stunden werden auf zwei Nachkommastellen gerundet angezeigt (keine Float-Reste wie 6.4999999h).

## 2026.10.40

- Schätzungs-Badge pro Board abschaltbar: Zahnrad → Dieses Board → „Schätzung als Badge auf diesem Board“. Boards ohne
  SP/Timeboxen zeigen dann kein rotes `? SP` mehr auf jeder Karte. Der globale Schalter unter Anzeige zeigt per Chip,
  auf wie vielen Boards er überstimmt ist.
- Neuer Unterpunkt „Schätzung aus dem Titel nehmen“ (Standard an): ausgeschaltet bleibt `(3 SP)` zusätzlich zum Badge im
  Titel stehen, damit andere Scripte die SP weiter aus dem Titel zählen können.

## 2026.10.39

- Aufgeräumt, ohne sichtbare Funktionsänderung: feste Stile (Fortschrittsbalken, Toast, Einstellungs-Panel, Tabs,
  Schalter, Dropdown-Menüs, Zahnrad- und MR-Buttons) liegen jetzt im Stylesheet statt inline im Code.
- Schalter sind native Checkboxen (`role=switch`), per CSS gezeichnet.
- Hintergrund- und Textfarbe der Toolbar und des Panels kommen aus GitLabs CSS-Variablen; ein Theme-Wechsel baut die
  Toolbar nicht mehr neu auf. Die Dark-Mode-Erkennung wird gecacht statt für jede Karte neu berechnet.
- Füll-Animation und Hover des Fortschrittsbalkens laufen per CSS statt per JavaScript-Listener pro Karte.
- Fix: Der Balken auf der MR-Seite wird ab 80 % verbrauchter Stunden gelb, wie auf dem Board und im Ticket-Detail
  (blieb dort grün).

## 2026.10.38

- Ticket-Detail und MR-Seite fragen das Portal nicht mehr bei jedem Scan erneut an, wenn eine Anfrage fehlschlägt oder
  keine Daten liefert, und respektieren die Projekt-Sperre nach Fehlern (wie das Board).
- Baut GitLab die Toolbar neu, werden die Listener des alten Einstellungs-Panels jetzt abgeräumt (vorher sammelten
  sie sich an).
- Die Board-Kennung wird nicht mehr für jede Karte bei jedem Scan in den localStorage geschrieben, nur noch bei Wechsel.

## 2026.10.37

- Einstellungen neu aufgebaut: vier Tabs (Anzeige, Dieses Board, Erweitert, Experimente) statt verschachtelter
  aufklappbarer Bereiche. Im Kopf der Hauptschalter „Aktiv/Pausiert“, im Fuß Datenstand und „↻ Daten neu laden“.
- Anzeige: Unterreiter Board-Karte, Ticket, Merge Request und Topbar, jeder Schalter mit kurzer Beschreibung,
  Unterpunkte eingerückt direkt unter ihrem Eltern-Feature. Jeder Unterreiter hat eine angepinnte Vorschau, simuliert
  mit Beispieldaten, aber mit denselben Funktionen gezeichnet wie Board, Ticket- und MR-Seite (die Board-Karte nutzt eine
  Karte dieses Boards als Gerüst); Hover auf einem Schalter umrandet sein Element. Portal-Buttons und Ticket-Aktionen sind jetzt pro Ort (Karte, Ticket, MR)
  getrennt schaltbar, das ⋮-Menü auf der Karte hat einen eigenen Schalter.
- Dieses Board: Portal-Verbindung mit Status; ein noch nicht eingerichtetes Board öffnet direkt hier mit nummerierten
  Feldern. Spalten für den roten Rahmen als Chips, Ticket-Aktionen mit Vorschau der Buttons. „Weitere Projekt-IDs“
  sitzen jetzt neben dem zweiten Portal-Projekt.
- Erweitert: Sprache als Umschalter, Schätzungs-Muster mit Gültigkeitsanzeige und „Auf Standard zurücksetzen“,
  Diagnose-Werkzeuge als beschriftete Zeilen, „Alle lokalen Daten löschen“ abgesetzt in einer roten Gefahrenzone.
- Schalter in GitLab-Blau, ganze Zeile klickbar; Tabs per Pfeiltasten bedienbar.
- Das Panel fährt von rechts herein und nach rechts hinaus (ohne Ausblenden); Reiter und Unterreiter gleiten beim
  Wechsel kurz aus der Richtung ein (aus bei `prefers-reduced-motion`).

## 2026.10.36

- Update-Hinweis deutlicher: gelber Kasten oben im Panel über der Status-Karte mit Schritt-für-Schritt-Anleitung (Tampermonkey-Dashboard),
  statt einer unauffälligen Zeile unter der Status-Karte; Trennlinie im Update- und Rate-Limit-Hinweis entfernt.
- ↻-Knopf heißt jetzt „Daten neu laden“, die Zeitangabe „Daten geladen“, damit beides nicht mehr wie ein Script-Update wirkt.

## 2026.10.35

- Schätzungs-Badge im Ticket-Detail, im Drawer und auf der MR-Seite vertikal mittig zum Titel statt leicht nach unten versetzt.

## 2026.10.34

- Schätzungs-Badge im Ticket-Detail, im Drawer und auf der MR-Seite größer: skaliert jetzt mit der Titelschrift,
  statt in fester Badge-Größe neben der großen Überschrift zu verschwinden. Board-Karten unverändert.

## 2026.10.33

- Schätzung als Badge am Titel (#16) auf Board-Karten, im Ticket-Detail (auch Drawer und mitlaufender Kopf) und auf
  der MR-Seite: `(3 SP)` erscheint als grünes `3 SP`, `(Timebox: 4h)` / `[Spike 2h]` als
  gelbes `Timebox 4h`, ohne Schätzung ein rotes `? SP` (nicht bei MRs). Nur die Anzeige ändert sich, der GitLab-Titel bleibt.
  Schaltbar unter Globale Einstellungen → Karten; eigene Muster (Regex, eine Zeile pro Muster) unter Erweitert.
- Bei schmalem Fenster kürzen sich die Breadcrumbs, MR-Buttons und Zahnrad bleiben rechts in derselben Zeile.

## 2026.10.32

- Nach dem GitLab-Update (ohne `#js-injected-page-breadcrumbs`) sitzen Einstellungs-Icon und die beiden MR-Buttons
  wieder in der Breadcrumb-Zeile, statt in eine zweite Zeile bzw. in die Aktionsleiste zu rutschen.

## 2026.10.30

- Ticket-Assignee-Buttons im MR: MR-Assignee, MR-Author und MR-Reviewer haben jetzt je einen eigenen Button (doppelte
  Personen nur einmal), statt Author oder Reviewer je nach Rolle.

## 2026.10.29 / 2026.10.31

- Split-Labels auch in der MR-Sidebar und bei eingeklappter linker GitLab-Navigation.

## 2026.10.28

- Split-Labels für alle Scoped Labels (`scope::Name`), nicht mehr nur `workflow::`.

## 2026.10.27

- Die MR-Buttons „R" (Reviewer) und „A" (Assignee) filtern jetzt nach dem eingeloggten GitLab-User statt nach einem
  fest eingetragenen Benutzernamen.

## 2026.10.26

- Split-Labels im Ticket-Detail behalten ihren Entfernen-Button (`×`).

## 2026.10.20 – 2026.10.24

- Rechte Hälfte der Split-Labels nutzt die Label-Farbe als Schrift (wie GitLab), bei zu wenig Kontrast
  aufgehellt bzw. abgedunkelt.
- Toolbar wird neu aufgebaut, wenn GitLab sie beim Neu-Rendern entfernt.
- Startzeile `v<Version> injiziert auf …` immer in der Konsole (auch ohne Debug).
- Start-Absturz beim Laden des Progress-Caches behoben.

## 2026.10.19

- „Anzeigen" aus entfernt jetzt auch die Spalten-Buttons (Sortierung blieb sichtbar) und unterdrückt den
  Auto-Selbsttest-Toast. Übrig bleibt nur die Toolbar zum Wiedereinschalten.

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
