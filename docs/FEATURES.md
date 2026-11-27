# Wesentliche Features

## Weitere Portal-Projekte

Werden Tickets eines Boards auch in anderen Portal-Projekten gebucht (andere Abteilung, anderer Kostenplatz), zeigt
die Karte pro weiterem Projekt einen eigenen Balken in eigener Farbe.

1. Zahnrad → Tab **„Dieses Board“** → Karte „Portal-Verbindung“
2. Feld **„Weitere Projekt-IDs“**: bis zu 3 IDs, kommagetrennt (z. B. `5678, 5679`); gespeichert wird automatisch
   (Feld leuchtet kurz grün)

Ein Balken erscheint nur, wenn das Ticket im jeweiligen Projekt gefunden wurde. Alle Projekte nutzen die Portal-Base-URL
des Boards; die Einstellung gilt pro Board. Das frühere „zweite Portal-Projekt“ wird automatisch in dieses Feld
übernommen.

## Toolbar & Bedienelemente

- Platziert eine Toolbar rechts in der Breadcrumb-Zeile mit einem Gear-Button (bei schmalem Fenster kürzen sich die
  Breadcrumbs, Toolbar und MR-Buttons bleiben in derselben Zeile; rendert GitLab die Zeile neu, wird sie wieder aufgebaut). Das Menü öffnet als Seitenpanel rechts (wie GitLabs Ticket-Vorschau) mit Hauptschalter
  „Aktiv“ und den Tabs Anzeige (jedes Feature einzeln, mit Vorschau), Dieses Board (Portal-Verbindung, roter Rahmen,
  Ticket-Aktionen), Global und Experimente. Details siehe [Lokale Controls](CONTROLS.md).
- Fügt pro Board-Spalte einen Augen-Button in GitLabs Button-Gruppe (neben `+` und `⚙`) ein, mit dem du das Script
  für die Spalte ein- oder ausschaltest (Auge = an, durchgestrichenes Auge = aus). In eingeklappten Spalten blendet
  GitLab die Button-Gruppe samt Augen-Button aus. Die Auswahl wird lokal gespeichert (haftet an den Projekt-Keys) und aktiviert den
  expliziten Modus, wenn du manuell eingreifst. Zeichnet GitLab in der Closed-Spalte keine Button-Gruppe, setzt das Script dort eine eigene neben den Zähler. In der Closed-Spalte wirkt das Auge nur auf Tickets, die in den
  letzten 28 Tagen geschlossen wurden (einstellbar unter Dieses Board → Board-Darstellung → Closed-Spalte: Zeitraum, höchstens 40).
- Fügt pro Board-Karte ein Overlay-Badge ein, das eine farbige Progressbar, `spent`/`remaining`-Labels (oder
  Over-/Booked-Hours-Fallback) sowie einen `↗`-Button zum entsprechenden Portal-Ticket enthält. Booked-Hours-Fallbacks
  nutzen einen deutlich blauen Balken, damit sie sich besser von den normalen Fortschrittsdaten abheben.
- Zeigt die gleichen Progressdaten direkt im Issue-Detail unterhalb der Teilnehmer-Liste an, sofern auf dem Ticket
  bereits Daten im Cache liegen. Das Detail-Widget versucht weder einen zusätzlichen Board-Scan noch einen erneuten
  Portal-Request, sondern greift ausschließlich auf die zuletzt geladenen Werte zurück, die durch ein Board-Scan oder
  eine manuelle Aktualisierung (Cache leeren / Daten neu laden) gespeichert wurden. Beim Detail greift das Script
  auf den passenden Board-Cache zu und nutzt zur Not den zuletzt gefundenen Board-Eintrag, damit auch direkte
  Detailseiten (ohne Board-URL) dieselben Daten wiederverwenden können.
- Passt die Hintergrundfarbe der Toolbar-Dropdowns, Projekt-Konfiguration und Detail-Widgets an das aktuell gesetzte
  GitLab-Farbschema an (bei Dark Mode wird die dort hinterlegte Light-Mode-Farbe priorisiert) und stellt automatisch
  kontrastreiche Schriftfarben bereit, damit sich die Overlays nahtlos und gut lesbar in die Oberfläche einfügen.
- Lädt die Daten über `GM_xmlhttpRequest` aus dem Portal, cached sie lokal (60-min TTL) und merkt sich Zeitstempel +
  Fortschritts-Daten in `localStorage`, sodass ein einfacher Reload keine neuen Portal-Requests auslöst, solange die
  letzte Aktualisierung jünger als eine Stunde ist. Die Cache-Einträge werden pro Board getrennt gespeichert, damit
  jede Board-Ansicht ihre eigenen Fortschrittsdaten nutzen darf. Beim Laden prüft das Skript außerdem, ob der
  hinterlegte Cache älter als 60 Minuten ist, und leert ihn automatisch, damit direkt nach einem Reload frische
  Daten vom Portal abgefragt werden.
- Blockiert weitere Requests nach Fehlern (403/404), bis du den Cache leerst oder die Portal-URL neu speicherst.
- Begrenzt neue Portal-Requests pro Board-Scan auf max. 80 Tickets, um Request-Bursts bei großen Boards (viele Spalten)
  zu vermeiden. Überschüssige Karten werden beim nächsten Scan automatisch nachgeladen. Wird das Limit erreicht,
  erscheint einmalig ein Warn-Toast sowie ein roter Indikator am Einstellungen-Icon mit der Bitte, weniger Spalten
  auszuwählen; beides verschwindet automatisch, sobald ein Scan wieder unter dem Limit bleibt.
- Beim ersten Request nach dem Speichern einer neuen Portal-Base-URL erscheint ein Tampermonkey-Popup, das dich um
  Erlaubnis für den Zugriff auf diese URL bittet (`GM_xmlhttpRequest`). Gib dort „Allow" oder „Ja", damit das Skript
  tatsächlich auf das Portal zugreifen darf.
- Meldungen erscheinen als Toast im GitLab-Look (dunkel, Status-Icon, Schließen-Button) unten rechts; „Toast-Test“ unter Global → Diagnose & Daten zeigt alle Varianten.
- „Was ist neu“ (Zahnrad → Global): zeigt den Changelog je Version, geladen aus `CHANGELOG.md` im Repository (nur beim Öffnen, einmal je Seitenladung). Bei einer neuen Version zeigt der Update-Hinweis zusätzlich die Neuerungen.
- Beobachtet das Board via `MutationObserver`, reagiert auf neue Karten/Listen und führt bei Bedarf neue Scans aus.
- Zeigt im Panel eine Zeile mit dem Zeitstempel der letzten Portal-Anfrage und einen Button zum sofortigen
  Neuladen aller Tickets; der Button löscht den lokalen Cache, setzt den Zeitstempel zurück und scannt das Board neu
  (ohne Seiten-Reload), damit alle Tickets erneut vom Portal angefragt werden.
- Zeigt optional Balken für bis zu 3 **weitere Portal-Projekte** pro Board (siehe oben).
- Zeigt neben dem Zahnrad zwei MR-Buttons „R“ („MRs, bei denen ich Reviewer bin“) und „A“ („Meine MRs“), die direkt
  zur gefilterten Merge-Request-Liste des aktuellen Projekts verlinken. Gefiltert wird nach dem eingeloggten
  GitLab-User.

## MR-Badge auf Board-Karten

- Erkennt pro Issue-Karte automatisch, ob ein oder mehrere Merge Requests zum Ticket existieren (Matching über die
  Ticket-ID als Wortgrenzen-Token im MR-Titel, z. B. `#1891`) und zeigt rechts neben der Ticket-ID ein MR-Icon an.
- Genau ein Treffer: Icon verlinkt direkt (neuer Tab) zum MR und zeigt `!<MR-Nummer>` daneben.
- Mehrere Treffer: Icon zeigt eine Anzahl-Badge, Tooltip listet alle Titel, Klick öffnet ein Dropdown mit allen MRs
  (Titel, darunter `!iid`, ggf. „merged“); die Auswahl öffnet den MR in einem neuen Tab. Das Badge fadet beim Laden
  ein, und beim Überfahren bekommt es einen Hover-Zustand.
- Ist der MR bereits gemerged, wird das Badge ausgegraut und mit einem Häkchen markiert.
- Bei genau einem Treffer werden zusätzlich kleine, überlappende Avatare für MR-Assignee und ersten Reviewer
  angezeigt (Reviewer überlappt Assignee um ca. 25 %). Fehlt ein Assignee/Reviewer, erscheint ein grauer
  Platzhalter mit „?“. Der Reviewer-Platzhalter ist klickbar: „Mich als Reviewer zuweisen“ trägt dich direkt per
  API als Reviewer auf dem MR ein.
- Die MR-Liste pro Projekt wird über `GET /api/v4/projects/:id/merge_requests` geladen und 5 Minuten im Speicher
  gecacht (kein localStorage, nur für die laufende Seiten-Session).

## Verweildauer in der Spalte

- Im Karten-Footer (hinter Nummer, MR und Sprint) zeigt jede Karte in aktivierten Spalten mit einem Uhr-Icon, wie
  lange das Ticket schon in der Spalte liegt, relativ als `45min`, `5h` oder `10d`. Beim Hovern erscheint das
  genaue Datum.
- Grundlage ist die Label-Historie des Tickets (`GET /api/v4/projects/:id/issues/:iid/resource_label_events`):
  Gezählt wird ab dem Beginn des aktuellen Aufenthalts: Ein versehentliches Verschieben in eine andere Spalte und
  innerhalb von 15 Minuten zurück unterbricht den Aufenthalt nicht. Liegt das Spalten-Label gar nicht mehr am Ticket
  (z. B. Events noch nicht aktuell), beginnt die Dauer bei 0 statt mit einem alten Eintritt.
- Pro aktivierter Spalte wird der Median über alle geladenen Karten berechnet und bei jeder neu
  geladenen Karte aktualisiert. Tickets, die länger als der Median in der Spalte liegen, bekommen einen
  roten Rahmen – aber nur in Spalten, die in den Einstellungen (Zahnrad → Dieses Board) unter
  „Liegezeit hervorheben“ ausgewählt sind. Die Auswahl wird pro Board im localStorage gespeichert.
- Der Spalten-Median steht im Spalten-Header mit Uhr-Icon direkt vor GitLabs Issue-Zähler (`🕓 4d  ▢ 12`, ab der ersten
  geladenen Karte) und nutzt dessen Schrift und Farbe. Beim Hovern erklärt ein Hilfetext, was der Wert bedeutet.
- Spalten ohne Label (`Open`, `Closed`) sowie Tickets, deren Label-Event nicht (mehr) auffindbar ist, zeigen keine
  Dauer an.
- Solange die Events laden, zeigen Karte und Spaltenkopf kleine Platzhalter (Skeletons); fertige Werte blenden ein
  (bei „Bewegung reduzieren“ ohne Animation). Wird eine Karte per Drag & Drop verschoben, aktualisiert sich die
  Dauer nach kurzer Wartezeit von selbst.

## Ticket-Assignee direkt im MR

- Auf der Merge-Request-Detailseite zeigt das Script oberhalb des GitLab-Assignee-Blocks an, wer aktuell dem
  verlinkten Ticket (Issue) zugewiesen ist.
- Bis zu drei Quick-Buttons erlauben das Umzuweisen des Tickets auf MR-Assignee, MR-Author und MR-Reviewer, ohne
  das Ticket selbst öffnen zu müssen. Ist eine Person mehrfach vertreten (z. B. Author = Assignee), erscheint sie nur
  einmal; fehlt eine Rolle, entfällt ihr Button.
- Das Umzuweisen erfolgt per `PUT /api/v4/projects/:id/issues/:issue_iid` (Session-Auth + CSRF-Token aus der
  Seite), keine zusätzliche Anmeldung nötig.

## Ticket-Aktionen im MR

Eigene Buttons in der Progress-Box auf der MR-Detailseite. Sie führen per Klick beliebige
[GitLab Quick Actions](https://docs.gitlab.com/user/project/quick_actions/) auf dem verknüpften Ticket aus. Das ist
z. B. nützlich, um ein Ticket nach dem Merge in die nächste Board-Spalte zu schieben, ohne das Ticket zu öffnen.

### Einrichtung

1. Zahnrad → Tab „Dieses Board“.
2. Im Feld **„Ticket-Aktionen im MR“** die Aktionen eintragen (Format siehe unten).
3. Die Eingabe wird automatisch gespeichert (Feld leuchtet kurz grün); die Buttons erscheinen nach dem nächsten
   Laden der MR-Seite unter der Progressbar.

Die Konfiguration gilt pro Projekt und wird nur lokal im Browser gespeichert. Jedes Team kann so seinen eigenen
Workflow und seine eigenen Labels hinterlegen.

### Format

- Eine Zeile `[Button-Text]` beginnt einen neuen Button.
- Alle folgenden Zeilen bis zum nächsten `[...]` sind die Quick Actions dieses Buttons, eine pro Zeile.
- Text vor dem ersten `[...]` und Buttons ohne Quick Actions werden ignoriert.
- Beim Hovern über einen Button siehst du die hinterlegten Quick Actions.

### Beispiele

**Scoped-Labels-Workflow (Board-Spalten = `workflow::*`-Labels):**

```
[Ticket abschließen]
/unassign me
/label ~"workflow::Closed this iteration"
/unlabel ~"workflow::PO-Review"

[Zurück in WIP]
/label ~"workflow::WIP"
/unlabel ~"workflow::PO-Review"
```

Bei Scoped Labels (`scope::wert`) ersetzt `/label` automatisch das bisherige Label desselben Scopes. Das `/unlabel`
schadet aber nicht und macht die Absicht klar.

**Ticket schließen statt Spalte wechseln:**

```
[Erledigt]
/unassign me
/close
```

**Zurück an den Entwickler mit Kommentar:**

```
[Änderungen nötig]
/assign @max.mustermann
/label ~"workflow::In Progress"
Bitte die Review-Kommentare im MR anschauen.
```

Normaler Text neben den Quick Actions wird als sichtbarer Kommentar auf dem Ticket gepostet.

**Weitere nützliche Quick Actions:**

| Quick Action                          | Wirkung                                      |
|---------------------------------------|----------------------------------------------|
| `/assign me` / `/assign @user`        | Ticket zuweisen                              |
| `/unassign me` / `/unassign @user`    | Bestimmte Person entfernen                   |
| `/unassign`                           | **Alle** Assignees entfernen                 |
| `/label ~"a" ~"b"`                    | Labels hinzufügen                            |
| `/unlabel ~"a"`                       | Label entfernen                              |
| `/relabel ~"a"`                       | Alle Labels durch die angegebenen ersetzen   |
| `/close` / `/reopen`                  | Ticket schließen / wieder öffnen             |
| `/milestone %"Sprint 42"`             | Milestone setzen                             |
| `/iteration *iteration:"Sprint 42"`   | Iteration setzen (Premium)                   |
| `/weight 3`                           | Gewicht setzen (Premium)                     |
| `/spend 30m`                          | Zeit buchen (GitLab-Zeiterfassung)           |
| `/todo`                               | To-do für dich anlegen                       |

### Technik & Voraussetzungen

- Das Ticket ist die `#<IID>` aus dem MR-Titel (dieselbe, die auch für die Progressbar genutzt wird).
- Ein Klick sendet `POST /api/v4/projects/:id/issues/:iid/notes` mit den Quick Actions als Kommentar-Text. GitLab
  führt die Aktionen aus. Ein Kommentar, der nur aus Quick Actions besteht, erscheint auf dem Ticket nur als
  System-Notiz (z. B. „changed labels“).
- Auth läuft über die bestehende GitLab-Session plus CSRF-Token aus der Seite. Es wird kein Token und kein Passwort
  gespeichert.
- Erfolg oder Fehler (inkl. HTTP-Status) erscheinen als Toast. Es gibt keine Rückfrage vor dem Ausführen.
- Die Buttons erscheinen nur, wenn auch die Progress-Box im MR angezeigt wird (Portal konfiguriert, „Progress im
  MR“ aktiv, Ticket-Nummer im MR-Titel).
- Du brauchst im Projekt die Rechte, die jeweiligen Quick Actions auszuführen (für Labels/Assignees mind.
  Reporter/Developer). Unbekannte Labels werden von GitLab stillschweigend ignoriert, prüfe deshalb die Schreibweise.

## Schätzung als Badge am Titel

Auf Board-Karten (nur in Spalten, in denen das Script aktiv ist), im Ticket-Detail (inkl. Board-Drawer und mitlaufendem Kopf) und auf der MR-Seite wird
die Schätzung aus dem angezeigten Titel genommen und als runder Badge gezeigt (auf Karten fest oben rechts, der
Titel bricht davor um; sonst direkt hinter dem Titel): `(3 SP)` → grünes `3 SP`,
`(Timebox: 4h)` / `[Spike 2h]` → gelbes `Timebox 4h`, keine Schätzung → rotes `? SP`. Bei MRs gibt es kein `? SP`,
weil das zugehörige Ticket trotzdem geschätzt sein kann. Der echte GitLab-Titel bleibt unverändert (das Portal liest
die Schätzung daraus).

- Schalter: Zahnrad → Anzeige → Board-Karten → „Schätzung als Badge“ (Standard an).
- Unterpunkt „Schätzung aus dem Titel nehmen“ (Standard an): aus, bleibt `(3 SP)` zusätzlich zum Badge im Titel stehen,
  z. B. für andere Scripte, die SP aus dem angezeigten Titel zusammenzählen.
- Pro Board: Zahnrad → Dieses Board → „Schätzung als Badge auf diesem Board“. Aus für Boards ohne Schätzungen, dann
  gibt es dort weder Badges noch rote `? SP`. Der globale Schalter zeigt dann einen Chip „aus auf N Boards“ bzw. „aus auf
  diesem Board“ (Tooltip: welche Boards).
- Muster: Zahnrad → Global → „Schätzungs-Muster“ (mit Gültigkeitsanzeige). Eine Zeile pro Muster, `sp: <Regex>` oder `timebox: <Regex>`,
  Gruppe 1 ist die Zahl, Groß-/Kleinschreibung egal, das erste passende Muster gewinnt. Leeres Feld = Standard-Muster
  (wie der Issue-Syncer des Portals: `(n SP)`, `(Timebox: nh)`, `(Spike: nh)`, `(nh)`, `(n Tage)`, auch mit `[]`, ohne Doppelpunkt und
  mit `,5` / `.5`). Ungültige Zeilen werden ignoriert und unter dem Feld gemeldet.
- SP-Summe im Spalten-Header: `Σ 13 SP` neben GitLabs Zähler, für Label-Spalten und Closed (Open nicht). Zählt alle
  Tickets der Spalte über die GitLab-API, nicht nur die geladenen Karten, und übernimmt die Board-Filter aus der URL
  (Labels, Assignee, Autor, Milestone, Suche, …). Tooltip: Anzahl Tickets und wie viele ohne Schätzung. Neu gezählt,
  wenn sich Filter oder GitLabs Zähler ändern, sonst 5 min Cache. Ab 1000 Tickets (Closed ohne Filter) `≥`.
  Mit „Kosten anzeigen“ folgen die echten Kosten der Spalte (Buchungen der Tickets, deren Fortschritt geladen ist; `≥`, wenn nicht
  alle) und, bei gepflegtem VP, der Wert SP × VP mit Ampel: `Σ 12 SP · 9,4k € / 10,8k €`. Ohne VP nur die Kosten.
  Unterpunkt von „Schätzung als Badge“, also auch pro Board abschaltbar. Die gespeicherte Board-Konfiguration
  (Milestone/Labels im Board selbst) wird nicht berücksichtigt, nur die Filter in der Suchleiste.

## Verkaufte SP (Meilenstein oder gesamt)

- Für Projekte mit Story-Point-Abrechnung: Chip hinter den Breadcrumbs, z. B. `M1: 11 / 10 SP` (rot = mehr SP im Board als
  verkauft, grün = genau gleich, grau = noch SP frei). Gezählt werden alle Tickets des Meilensteins (offen und geschlossen,
  SP aus dem Titel wie bei der SP-Summe). Tooltip: Differenz und Tickets ohne Schätzung. Klick lädt neu, sonst 5 min Cache.
- Pflege: Zahnrad → „Dieses Board“ → „Schätzung & Verkauf“ → „Verkaufte SP“. Pro Eintrag Meilenstein (Dropdown mit den noch nicht eingetragenen aus GitLab; „Gesamt“ = ganzes Projekt, Chip „Gesamt“), verkaufte SP,
  Häkchen zum Ein-/Ausblenden und ✕ zum Entfernen. „Nur Chip des gefilterten Meilensteins“ zeigt von den Meilensteinen nur den, nach
  dem das Board gerade gefiltert ist („Gesamt“ bleibt). Globaler Schalter: Anzeige → Topbar → „SP im Board vs. verkauft“.
- Die verkauften SP liegen nur lokal im Browser (pro Projekt), nicht im GitLab und nicht im Team geteilt.

## Kostensätze (Kosten je Ticket)

- Die Karten unter Zahnrad → „Dieses Board“ sind nach Thema sortiert und einklappbar (Klick auf den Titel; Standard zu, der Zustand wird gemerkt). Nur „Portal-Verbindung“ ist offen, solange die Verbindung fehlt; bei fehlenden Kostensätzen zeigt der eingeklappte Kopf ein rotes „⚠ Sätze fehlen“.

- Zahnrad → „Dieses Board“ → „Kostensätze“. „Rollen aus Portal laden“ liest Name, Rolle und Tagessatz (extern) aus
  `/management/project/detail/<ID>/` (Browser-Login, kein Token; Spaltenköpfe englisch oder deutsch).
- Aufbau des Blocks: oben der Hauptschalter „Kosten anzeigen“ (aus = alles darunter abgeblendet und ohne Wirkung), dann Modus
  (extern/intern), Sätze-Tabelle, Story-Point-Abrechnung mit VP, zuletzt die Darstellung („Ergebnis anzeigen als“).
- Alle Geld-Anzeigen lassen sich global im Tab Anzeige abschalten (Gruppe „Kosten & Marge“: Pille, Break-even-Marker, Tooltip; Reiter „Spalten-Header“: SP-Summe, Kosten, Median; Topbar: Meilenstein-Chip, Finanz-Dashboard-Button). Voraussetzung bleibt „Kosten anzeigen“ pro Board.
- Interne Projekte (Portal-Kategorie „Internal“, Zeile „Category“ der Projektseite) werden erkannt: Verkauf (extern, SP-Abrechnung, Zeitlimit, Ergebnis-Darstellung) ist dann ausgegraut und erklärt, gerechnet wird nur mit internen Sätzen.
- Zeitabrechnung mit SP-Limit (Schalter pro Projekt, für Kundenprojekte nach Zeit): statt der Marge zeigt die Pille neben dem
  Balken „gebuchte h / maximale h“ für die SP des Tickets (z. B. `6,5 / 8 h`): grün, gelb ab der Warnschwelle, rot ab dem
  Eskalationslimit. Im Balken markiert ein Strich die Warnschwelle, die Füllung läuft gegen das Limit. Die Limits liest „Limits aus Portal
  laden“ aus dem Formular `/management/project/<ID>/ticket-story-points/escalation-limits` (je SP Warn- und Eskalationsstunden; Werte
  zwischen den Stufen linear, darüber mit der Steigung der letzten Stufe). Ist dort nichts gepflegt, gilt „Standard: Stunden pro SP“
  (Vorgabe 1 SP = 8 h, einstellbar). Die Kosten stehen im Tooltip. Hat Vorrang vor der Marge; läuft unter „Kosten anzeigen“.
- Wartungsprojekte mit Stundenkontingent: hat ein Portal-Projekt (Hauptprojekt oder zusätzliches) in den Financial data die Zeile
  „Hour quota“, zeigt dessen Balkenzeile eine Pille `gebucht / Kontingent h` (grün, gelb ab 80 %, rot ab 100 %; Tooltip: Zeitraum,
  h pro Monat, Verfall). Das Finanz-Dashboard zeigt das Kontingent als breite Kachel. Nur mit „Kosten anzeigen“.
- „Interne Sätze aus Admin laden“ (nur mit Portal-Staff-Zugang): findet den Weg ohne feste Admin-URL über Links (Portal-Seite →
  „Django Admin“ → Link der Level-Kostensätze → Tabelle, nur auf dem Portal-Host), liest Level, Projektrolle und internen Satz und
  trägt sie für die Rollen der Tabelle ein (Schlüssel „Rolle (Level X)“). Ohne Zugriff meldet der Button das, die Hand-Eingabe bleibt.
- Die internen €/h pro Rolle (z. B. „Developer (Level 3)“) trägst du selbst ein. Es gibt keine API dafür, die Werte
  liegen nur lokal im Tampermonkey-Speicher (`GM_*`, wie der API-Token, nicht in `localStorage`, den andere Scripte lesen könnten) und gelten nur für das jeweilige Projekt (Board). Extern = Tagessatz ÷ 8.
- Schalter „Mit externen Sätzen rechnen“ (pro Projekt, Standard an): an = extern (Tagessatz ÷ 8; die Supportrollen sind darin
  querfinanziert, so bleiben Kosten und SP-Preis vergleichbar), aus = intern (interne €/h, für die interne Kostenrechnung).
  Wartungsprojekte (Portal-Projekt mit „Hour quota“) rechnen im Finanz-Dashboard und in der Zeile für zusätzliche Projekte immer extern gegen das Budget, der Schalter gilt dort nicht.
- Schalter „Kosten anzeigen“ (Standard aus, damit bei Screenshares nichts auffällt) und „Verkaufspreis pro SP“. Erlös eines
  Tickets = SP × Preis; Marge = Erlös − Kosten (intern) bzw. „Abstand zum SP-Preis“ (extern, keine echte Marge).
- Bei „Kosten anzeigen“ an prüft der Block selbst und warnt rot (mit rot markierten Feldern): keine Rollen geladen, interner Satz je Rolle fehlt, Verkaufspreis pro SP fehlt.
- Tickets ohne SP im Titel (oder ohne SP-Preis) bekommen nur die Kosten als Pille, ohne Ampel.
- Ampel: die Kostenzahl (Pille, Meilenstein-Chip) ist grün, gelb ab 80 % des Erlöses (wie die Warnschwelle des Balkens) und rot ab 100 %.
- Dropdown „Ergebnis anzeigen als“ (Marge oder Kosten / Erlös; pro Projekt, Standard Marge; nur mit SP-basierter Abrechnung aktiv): Pille und Meilenstein-Chip zeigen `722 € / 2.700 €` statt der Marge als Summe (`+1.978 €`).
- Anzeige mit Schalter an: Marge-Pille neben dem Balken (`+340 €`, rot bei Minus); Break-even-Strich auf dem Balken, wenn
  das Ticket ein Stundenbudget hat (Stunden, bei denen die Kosten den Erlös erreichen; liegt der Punkt hinter dem Budget, steht der Strich gestrichelt am rechten Rand), rote Umrandung des Balkens, sobald
  mehr gebucht ist; Meilenstein-Chip `… · Kosten / Erlös` aus den Buchungen der Tickets, deren Fortschritt geladen ist (Tooltip nennt die Abdeckung).
- Tooltip des Fortschrittsbalkens: `Kosten (intern): 1.234 €`. Gebuchte Stunden je Person stammen aus den
  Ticket-Buchungen; Personen ohne Satz zählen nicht mit und stehen im Tooltip. Nach dem Laden der Rollen greift es beim
  nächsten Refresh der Karte.

## Finanz-Dashboard

- Button „Finanzen“ (€-Symbol) direkt vor den Einstellungen (nach den MR-Links), öffnet ein Seitenpanel wie die Einstellungen. Quelle:
  `/management/project/financial-rows/load/<ID>/` (Browser-Login, kein Token): Initial budget und Tabelle „Hours per employee“.
- Anzeige: Budget, Kosten (Ampel), Rest, ein Balken für das ganze Budget mit je einem Segment pro Person (Tooltip: Kosten und Anteil; über Budget wächst die Skala, roter Strich am Budget) und je Person Stunden, €/h, Kosten und Anteil am Budget, absteigend
  nach Kosten. Sätze und Modus (intern/extern) kommen aus Einstellungen → Kostensätze.
- Kachel „Kosten pro SP“ (nur mit VP, für Gesamt und jeden Zeitraum): Kosten der Buchungen auf den im Zeitraum geschlossenen Tickets (Schließdatum aus GitLab, die 300 jüngsten) ÷ deren SP gegen den VP, mit Ampel; darunter VP, SP, Ticketzahl und Kosten. Im Verlauf steht je Monat eine Spalte „€ / SP“ als Trend. In „Gesamt“ zeigt die Kachel „Nicht zugeordnet“ den Rest der Gesamtkosten (offene Tickets, Termine, PO/SM, Tickets ohne SP). Die Buchungen je Ticket kommen aus dem Fortschritts-Cache, sonst gebündelt über die Portal-API. Ohne API-Token lädt das Dashboard nichts nach: die Kacheln zeigen „braucht API-Token“. Karte „Nach Rolle“ (Gesamt und Zeiträume):
  Stunden sowie Anteil an Stunden und Kosten je Rolle (z. B. Umsetzung gegen PO, Design, SM) als Grundlage für Pauschalen neben den SP.
- Zeitbasierte Kundenprojekte (Kosten gegen Stundenbudget) sind mangels Testprojekt noch nicht an echten Daten geprüft.
- Zeitraum (oben im Panel) und Vergleich (Auswahl im Abschnitt „Verlauf“, wirkt nur auf den Verlauf; beides pro Projekt gemerkt): „Gesamt“ nutzt die Summen des Portals. Ein Monat (dieser oder
  einer der letzten 12) oder eine Spanne (letzte 3/6/12 Monate, dieses Jahr, „Eigene Spanne“ von–bis) lädt die Timesheets (`/management/timesheet/table-grid/data/`, 50 je Seite) und zeigt nur Personen mit
  Buchungen im Zeitraum (je Person mit ↗-Link zur vorgefilterten Timesheet-Tabelle im Portal): Stunden, Ø €/h, Kosten, Δ zum Vormonat bzw. zur gleich langen Vorperiode (Tooltip: Stunden) und Anteil am Budget. „Vergleich“ (nur Vormonat
  oder 3/6/12 Monate) ergänzt einen Verlauf mit Balken je Monat in Personenfarben und Δ zum jeweiligen Vormonat.
- Δ-Spalten stehen mit Pfeil in fester Spalte untereinander: Kosten gestiegen = rot (▲), gesunken = grün (▼).
- Monate werden mit dem Level zum Buchungsdatum bepreist: je Person wird die Level-Historie aus dem Mitarbeiterprofil
  (`/account/employee/detail/<ID>/tab/new-pay-history/`, 24 h im localStorage gecacht) gelesen. Ohne Zugriff oder Historie gilt
  das aktuelle Level. Rollen aus der Historie ohne Satz erscheinen in der Sätze-Tabelle der Einstellungen („aus der
  Level-Historie“). „Gesamt“ rechnet weiter mit dem aktuellen Level.
- Ladeanzeige mit Schritten und Balken: Finanzdaten → Timesheets (Seiten) → Level-Historien (Personen), je mit Zähler, dazu ein Gesamtbalken. Im Modus „Gesamt“ erscheint die Tabelle sofort, die Rollen der Buchenden laden mit eigenem Balken nach.
- Der Finanz-Button erscheint nur bei eingeschaltetem „Kosten anzeigen“.
- Schalter „Story-Point-basierte Abrechnung“ (Einstellungen → Kostensätze): an = „Verkaufspreis (VP) pro SP“ ist Pflicht (rote
  Warnung, solange er fehlt) und Erlös/Marge/Break-even zählen; aus = nur Kosten, das Preisfeld ist ausgegraut. Bestehende
  Konfigurationen mit Preis gelten als „an“.
- Buchende, die nicht in der Personentabelle des Projekts stehen, laden ihre Rolle aus dem Portal-Profil (`/account/employee/detail/<ID>/`,
  Zeile „Level“) nach und erscheinen danach auch bei den Kostensätzen. Gelingt das nicht, wählst du die Rolle im Dashboard von Hand.
- Ohne „Initial budget“ (Abrechnung nach Aufwand) zeigt das Dashboard nur Kosten, ohne Anteile. Zum Abgleich steht der
  interne Kostenwert des Portals darunter.

## Split-Labels

- Scoped Labels (`scope::Name`, z. B. `workflow::Design`, `prio::Hoch`) werden als `[Scope | Name]` gezeichnet: links
  in der Label-Farbe, rechts die Label-Farbe als Schrift (wie bei GitLab), bei zu wenig Kontrast automatisch
  aufgehellt bzw. abgedunkelt.
- Gilt auf Karten, in Spalten-Headern, im Issue-Detail, Board-Drawer und in der MR-Sidebar (auch bei eingeklappter
  linker Navigation), nicht in Dropdowns und der Filterleiste.
- Entfernbare Labels (Ticket-Detail) behalten ihr `×`, es klickt GitLabs ausgeblendeten Entfernen-Button.
- Schalter: Zahnrad → Anzeige → Board-Karten → „Geteilte Scoped Labels“.

## Neu in 2026.10.6 (aus den Experimenten übernommen)

- **Warnfarbe im Balken:** gelb ab 80 % verbrauchter Stunden; der Prozentwert steht im Tooltip und Screenreader-Text.
- **Stale-while-revalidate:** abgelaufene Portal-Werte (bis 24 h) erscheinen sofort gedimmt und werden im Hintergrund
  erneuert; schlägt das fehl, bleibt der alte Wert mit Hinweis stehen.
- **Cache-Alter** („geladen vor …“) im Balken-Tooltip. **Daten neu laden** leert den Cache und scannt neu, ohne
  Seiten-Reload.
- **Weitere Portal-Projekt-IDs** (bis zu 3 zusätzliche Balken): Zahnrad → Global.
- **Portal-Fehlerprotokoll:** Zahnrad → Global → „Portal-Fehler anzeigen“.
- **Verweildauer:** Median statt Durchschnitt; Verlauf pro Spalte im Tooltip; Eintrittszeiten 30 min in `localStorage`;
  Aktualisierung nach Drag & Drop.
- **Ticket-Aktionen als Dropdown** (Drei-Punkte-Icon) auf Karten und im Issue-Detail, im GitLab-Stil.
- **Unassigned nach oben / Nach Assignee gruppieren:** pro Spalte über das Sortier-Icon im Spalten-Header. „Unassigned nach oben“ sortiert die Spalte per
  `PUT …/issues/:iid/reorder` um. **Achtung:** das ändert die gespeicherte Reihenfolge für das ganze Team; es gibt eine
  Rückfrage. „Nach Assignee gruppieren“ setzt zusätzlich die Tickets je Person (erster Assignee, alphabetisch) hintereinander,
  Unassigned zuerst; innerhalb einer Gruppe bleibt die bisherige Reihenfolge.
- **Split-Labels** (`workflow::…`) auch im Issue-Detail, Board-Drawer und auf der MR-Seite (nicht in Dropdowns und
  der Filterleiste).
- **Changelog** im Update-Hinweis (liest `CHANGELOG.md`), **Auto-Selbsttest** einmal nach jedem Script-Update und eine
  **teilweise englische Oberfläche** (Zahnrad → Global, Reload nötig).

## Neu in 2026.10.12 bis 2026.10.18

- **Einstellungen als Seitenpanel** mit Karten-Layout, zwei Schalter-Spalten und festem Kopf; Autosave statt
  „Einstellungen speichern“ (siehe [Lokale Controls](CONTROLS.md)).
- **GitLab-Optik:** Buttons rund um die Progressbar und im Panel nutzen GitLabs Button-Klassen; alle Dropdowns
  (Ticket-Aktionen, Spalte sortieren, MRs) haben Kopfzeile, größere Zeilen und Hover wie GitLabs eigene Dropdowns.
- **Verweildauer:** robuster gegen versehentliche Spaltenwechsel, Skeletons und Einblend-Animation.

## Experimente (zum Testen)

Zahnrad → Tab **Experimente**. Standardmäßig aus.

| Experiment | Hinweis |
|---|---|
| Pipeline-Status am MR-Badge | farbiger Punkt; wird bei Bedarf pro MR nachgeladen |
| Konfiguration als Link teilen | `#ptp-config=…`; Empfänger bestätigt vor dem Übernehmen, braucht den Schalter ebenfalls |

Die reinen Funktionen lassen sich ohne npm prüfen: `node tests/pure.check.js`.
