# Wesentliche Features

## Multi-Board-Unterstützung (zwei Projekt-IDs)

Das Script unterstützt die gleichzeitige Abfrage von **zwei verschiedenen Portal-Projekten** pro GitLab-Board. Dies ist
nützlich, wenn Tickets über mehrere Abteilungen oder Kostenplätze gebuchte Stunden abbilden sollen.

### Einrichtung der zweiten Projekt-ID

1. Öffne das Zahnrad-Menü in der GitLab-Topbar und navigiere zur „Projekt-Konfiguration"
2. Aktiviere das Kontrollkästchen **„Zweite Projekt-ID verwenden"**
3. Gib deine **zweite Portal-Projekt-ID** in das neu erscheinende Eingabefeld ein (z. B. `5678`)
4. Klicke auf „Einstellungen speichern"

Das Script lädt dann beim nächsten Scan Fortschrittsdaten von **beiden Projekt-IDs** und aggregiert sie:

- Verbrachte Stunden beider Projekte addieren sich zur angezeigten Progressbar
- Verbleibende Stunden werden kombiniert
- Sollte eines der beiden Portale nicht antwortet, zeigt das Script trotzdem die Daten des anderen an

**Hinweis**: Beide Projekt-IDs müssen mit der gleichen Portal-Base-URL erreichbar sein. Die Einstellung wirkt sich auf
das **gesamte Projekt** aus und wird lokal gespeichert.

## Toolbar & Bedienelemente

- Platziert eine Toolbar rechts in der GitLab-Topbar mit einem Gear-Button. Das Menü zeigt Version, `Anzeigen`-Schalter
  und letzte Aktualisierung, darunter jedes Feature einzeln schaltbar als „Globale Einstellungen" sowie die
  „Board-Einstellungen" (roter Rahmen, Projekt-Konfiguration). Details siehe [Lokale Controls](CONTROLS.md).
- Fügt pro Board-Spalte einen Augen-Button in GitLabs Button-Gruppe (neben `+` und `⚙`) ein, mit dem du das Script
  für die Spalte ein- oder ausschaltest (Auge = an, durchgestrichenes Auge = aus). In eingeklappten Spalten blendet
  GitLab die Button-Gruppe samt Augen-Button aus. Die Auswahl wird lokal gespeichert (haftet an den Projekt-Keys) und aktiviert den
  expliziten Modus, wenn du manuell eingreifst.
- Fügt pro Board-Karte ein Overlay-Badge ein, das eine farbige Progressbar, `spent`/`remaining`-Labels (oder
  Over-/Booked-Hours-Fallback) sowie einen `↗`-Button zum entsprechenden Portal-Ticket enthält. Booked-Hours-Fallbacks
  nutzen einen deutlich blauen Balken, damit sie sich besser von den normalen Fortschrittsdaten abheben.
- Zeigt die gleichen Progressdaten direkt im Issue-Detail unterhalb der Teilnehmer-Liste an, sofern auf dem Ticket
  bereits Daten im Cache liegen. Das Detail-Widget versucht weder einen zusätzlichen Board-Scan noch einen erneuten
  Portal-Request, sondern greift ausschließlich auf die zuletzt geladenen Werte zurück, die durch ein Board-Scan oder
  eine manuelle Aktualisierung (Cache leeren / Jetzt aktualisieren) gespeichert wurden. Beim Detail greift das Script
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
- Beobachtet das Board via `MutationObserver`, reagiert auf neue Karten/Listen und führt bei Bedarf neue Scans aus.
- Zeigt im Dropdown eine Zeile mit dem Zeitstempel der letzten Portal-Anfrage und einen Button zum sofortigen
  Neuladen aller Tickets; der Button löscht den lokalen Cache, setzt den Zeitstempel zurück und lädt die Seite neu,
  damit wirklich alle Tickets erneut vom Portal angefragt werden.
- Unterstützt die optionale Konfiguration einer **zweiten Projekt-ID**, um Fortschrittsdaten aus zwei verschiedenen
  Portal-Projekten zu kombinieren. Wenn aktiviert, lädt das Script Daten von beiden Projekt-IDs und aggregiert sie in
  der angezeigten Progressbar (Summe aller Stunden, kombinierte Auslastung). Jedes Board-Projekt speichert diese
  Einstellung separat.
- Zeigt in der Toolbar zwei MR-Icon-Buttons („Meine MRs" / „MRs, bei denen ich Reviewer bin"), die direkt zur
  gefilterten Merge-Request-Liste des aktuellen Projekts verlinken.

## MR-Badge auf Board-Karten

- Erkennt pro Issue-Karte automatisch, ob ein oder mehrere Merge Requests zum Ticket existieren (Matching über die
  Ticket-ID als Wortgrenzen-Token im MR-Titel, z. B. `#1891`) und zeigt rechts neben der Ticket-ID ein MR-Icon an.
- Genau ein Treffer: Icon verlinkt direkt (neuer Tab) zum MR und zeigt `!<MR-Nummer>` daneben.
- Mehrere Treffer: Icon zeigt eine Anzahl-Badge, Tooltip listet alle Titel, Klick öffnet die nach der Ticket-ID
  gefilterte MR-Liste im Projekt (neuer Tab).
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
  Gezählt wird ab dem letzten Mal, an dem das Spalten-Label hinzugefügt wurde.
- Pro aktivierter Spalte wird der Median über alle geladenen Karten berechnet und bei jeder neu
  geladenen Karte aktualisiert. Tickets, die länger als der Median in der Spalte liegen, bekommen einen
  roten Rahmen – aber nur in Spalten, die in den Einstellungen (Zahnrad) unter „Roter Rahmen bei
  Median-Überschreitung" ausgewählt sind. Die Auswahl wird pro Board im localStorage gespeichert.
- Der Spalten-Median steht im Spalten-Header mit Uhr-Icon direkt vor GitLabs Issue-Zähler (`🕓 4d  ▢ 12`, ab der ersten
  geladenen Karte) und nutzt dessen Schrift und Farbe. Beim Hovern erklärt ein Hilfetext, was der Wert bedeutet.
- Spalten ohne Label (`Open`, `Closed`) sowie Tickets, deren Label-Event nicht (mehr) auffindbar ist, zeigen keine
  Dauer an.
- Die Events werden nur im Speicher gecacht. Wird eine Karte per Drag & Drop verschoben, aktualisiert sich die
  Dauer erst nach einem Neuladen der Seite.

## Ticket-Assignee direkt im MR

- Auf der Merge-Request-Detailseite zeigt das Script oberhalb des GitLab-Assignee-Blocks an, wer aktuell dem
  verlinkten Ticket (Issue) zugewiesen ist.
- Zwei Quick-Buttons erlauben das Umzuweisen des Tickets auf den MR-Assignee und eine zweite Person, ohne das
  Ticket selbst öffnen zu müssen. Die zweite Person ist normalerweise der MR-Author – bist du selbst aber der
  MR-Assignee (z. B. weil du einen MR vertretungsweise übernommen hast), zeigt der zweite Button stattdessen den
  MR-Reviewer, da der Author in diesem Fall meist nicht relevant ist. Sind beide Personen identisch oder bereits
  Ticket-Assignee, wird der jeweilige Button ausgeblendet.
- Das Umzuweisen erfolgt per `PUT /api/v4/projects/:id/issues/:issue_iid` (Session-Auth + CSRF-Token aus der
  Seite), keine zusätzliche Anmeldung nötig.

## Ticket-Aktionen im MR

Eigene Buttons in der Progress-Box auf der MR-Detailseite. Sie führen per Klick beliebige
[GitLab Quick Actions](https://docs.gitlab.com/user/project/quick_actions/) auf dem verknüpften Ticket aus. Das ist
z. B. nützlich, um ein Ticket nach dem Merge in die nächste Board-Spalte zu schieben, ohne das Ticket zu öffnen.

### Einrichtung

1. Zahnrad → Board-Einstellungen → Projekt-Konfiguration aufklappen.
2. Im Feld **„Ticket-Aktionen im MR“** die Aktionen eintragen (Format siehe unten).
3. „Einstellungen speichern“. Die Seite lädt neu, die Buttons erscheinen unter der Progressbar im MR.

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

## Neu in 2026.10.6 (aus den Experimenten übernommen)

- **Warnfarbe im Balken:** gelb ab 80 % verbrauchter Stunden; der Prozentwert steht im Tooltip und Screenreader-Text.
- **Stale-while-revalidate:** abgelaufene Portal-Werte (bis 24 h) erscheinen sofort gedimmt und werden im Hintergrund
  erneuert; schlägt das fehl, bleibt der alte Wert mit Hinweis stehen.
- **Cache-Alter** („geladen vor …“) im Balken-Tooltip. **Jetzt aktualisieren** leert den Cache und scannt neu, ohne
  Seiten-Reload.
- **Weitere Portal-Projekt-IDs** (bis zu 3 zusätzliche Balken): Zahnrad → Erweitert.
- **Portal-Fehlerprotokoll:** Zahnrad → Erweitert → „Portal-Fehler anzeigen“.
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
  **teilweise englische Oberfläche** (Zahnrad → Erweitert, Reload nötig).

## Experimente (zum Testen)

Zahnrad → Globale Einstellungen → Erweitert → **Experimente (zum Testen)**. Standardmäßig aus.

| Experiment | Hinweis |
|---|---|
| Pipeline-Status am MR-Badge | farbiger Punkt; wird bei Bedarf pro MR nachgeladen |
| Konfiguration als Link teilen | `#ptp-config=…`; Empfänger bestätigt vor dem Übernehmen, braucht den Schalter ebenfalls |

Die reinen Funktionen lassen sich ohne npm prüfen: `node tests/pure.check.js`.
