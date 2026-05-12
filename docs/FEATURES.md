# Wesentliche Features

## Multi-Board-Unterstützung (zwei Projekt-IDs)

Das Script unterstützt die gleichzeitige Abfrage von **zwei verschiedenen Portal-Projekten** pro GitLab-Board. Dies ist
nützlich, wenn Tickets über mehrere Abteilungen oder Kostenplätze gebuchte Stunden abbilden sollen.

### Einrichtung der zweiten Projekt-ID:

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
