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

- Platziert eine Toolbar rechts in der GitLab-Topbar, zeigt dort Versionslabel, `Anzeigen`- und `Debug`-Toggles,
  einen Gear-Button sowie die „Cache leeren"- und „Einstellungen speichern"-Actions.
- Fügt pro Board-Spalte eine Checkbox direkt neben dem Spalten-Titel ein, damit du die Listen zur Progress-Anzeige
  ein- oder ausschaltest. Die Auswahl wird lokal gespeichert (haftet an den Projekt-Keys) und aktiviert den
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
