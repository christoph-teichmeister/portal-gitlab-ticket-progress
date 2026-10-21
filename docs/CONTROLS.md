# Lokale Controls

Das Einstellungs-Menü (Zahnrad) öffnet als **Seitenpanel** rechts unter der Top-Bar (wie GitLabs Ticket-Vorschau,
höchstens 720 px breit). Es schließt mit dem X, Escape oder einem Klick daneben und überdeckt das Board, ohne es zu
verschieben. Im festen Kopf stehen Titel, Version, der Hauptschalter **Aktiv/Pausiert** und vier **Tabs**; im festen Fuß
der Datenstand und **↻ Daten neu laden**. Es gibt keinen „Speichern“-Button: Schalter und Felder wirken sofort bzw.
entprellt, das geänderte Feld leuchtet kurz grün. Das Panel ist per Tastatur bedienbar (Tab, Pfeiltasten wechseln den
Tab, Escape schließt); jede Schalter-Zeile ist als Ganzes klickbar.

- **Aktiv/Pausiert** (im Kopf, global): Hauptschalter – blendet alles aus, was das Script einfügt
  (Karten-Badges, Spalten-Buttons und Median, roter Rahmen, MR-Buttons, Issue-/MR-Detail), z. B. fürs Screensharing.
  Sichtbar bleibt nur das Zahnrad, um es wieder einzuschalten. Beim Aktivieren wird das Board erneut gescannt. Im Tab
  Anzeige steht dann ein Hinweis mit „Fortsetzen“.
- **Tab Anzeige** (`ambientProgressFeatures`, gilt für alle Boards): vier Unterreiter mit je eigener, angepinnter
  **Vorschau**. Die Vorschau ist simuliert, aber mit denselben Funktionen gezeichnet wie die echten Seiten, mit
  Beispieldaten (Balken, MR, Verweildauer, Ticket-Aktionen): unter *Board-Karte* dient eine Karte dieses Boards samt
  Spalten-Header nur als GitLab-Gerüst, unter *Ticket*, *Merge Request* und *Topbar* ein Ausschnitt der jeweiligen
  Seite. Jedes eingeschaltete Element ist dadurch immer zu sehen. Ausgeschaltetes fehlt dort wie später auch; Hover oder Fokus auf einem
  Schalter umrandet sein Element. Je Gruppe ein Zähler „x von y an“.
  - *Board-Karte*: Board-Karten (Fortschrittsbalken mit Unterpunkt Portal- & Timesheet-Buttons, MR-Badge mit Unterpunkt
    Assignee- & Reviewer-Avatare, Schätzung als Badge, Geteilte Scoped Labels, Ticket-Aktionen-Menü ⋮) und Verweildauer
    (Uhr im Karten-Footer mit Unterpunkt Median im Spalten-Header).
  - *Ticket*: Fortschrittsbalken mit Unterpunkten Portal- & Timesheet-Buttons und Ticket-Aktionen (Dropdown).
  - *Merge Request*: Fortschrittsbalken mit Unterpunkten Portal- & Timesheet-Buttons und Ticket-Aktionen (Buttons),
    dazu Ticket-Assignee-Buttons.
  - *Topbar*: MR-Schnellzugriff.

  Die Portal-Buttons und Ticket-Aktionen sind pro Ort (Karte, Ticket, MR) getrennt schaltbar; Schätzung als Badge und
  Geteilte Scoped Labels gelten überall.

  Unterpunkte sind eingerückt und ausgegraut, solange das übergeordnete Feature aus ist. Ausgeschaltete Features laden
  auch keine Daten mehr (z. B. keine MR-Liste ohne MR-Badge, keine Label-Historie ohne Verweildauer). Standard: alles an.
  Anzeigen, Debug und MR-Buttons waren früher pro Projekt gespeichert; der bisherige Wert wird beim ersten Start als
  Ausgangswert übernommen.
- **Tab Dieses Board** (gilt nur für das aktuelle Board, Pfad steht oben):
  - *Portal-Verbindung*: Portal-URL und Portal-Projekt-ID mit Status („Verbunden · Projekt …“ / „Nicht eingerichtet“).
    Ist das Board noch nicht eingerichtet, öffnet das Panel direkt hier, der Tab trägt ein „!“, die beiden Felder sind
    nummeriert und die übrigen Karten gesperrt. Nach der Einrichtung: Schalter **Zweites Portal-Projekt** mit Feld
    und **Weitere Projekt-IDs** (Chip „alle Boards“, bis zu 3 zusätzliche Balken).
  - *Liegezeit hervorheben* (`ambientProgressAgeHighlightLists`): ein Chip pro Label-Spalte des Boards. Nur in
    ausgewählten Spalten bekommen Tickets, die länger als der Spalten-Median dort liegen, einen roten Rahmen. Wird
    sofort pro Projektschlüssel gespeichert. Benötigt „Uhr im Karten-Footer“.
  - *Ticket-Aktionen im Merge Request*: Textfeld plus Vorschau der entstehenden Buttons („Ergibt: …“). Format und
    Beispiele: [Wesentliche Features](FEATURES.md#ticket-aktionen-im-mr).
- **Tab Erweitert**: *Allgemein* (Sprache Deutsch/English – teilweise übersetzt, wirkt nach Reload; Debug-Logs),
  *Schätzungs-Muster* (siehe [Features](FEATURES.md#schätzung-als-badge-am-titel), mit Gültigkeitsanzeige und
  „Auf Standard zurücksetzen“), *Diagnose & Daten* (Selektor-Selbsttest, Portal-Fehler, Debug-Info ohne Portal-URL,
  Konfiguration exportieren/importieren) und die rot abgesetzte *Gefahrenzone* „Alle lokalen Daten löschen“.
- **Tab Experimente**: noch nicht übernommene Ideen mit Beta-Chip, standardmäßig aus; der Tab zeigt, wie viele an sind.
- **Spalten-Button (Auge)**: Aktivierte Listen werden im Cache gespeichert; sobald du eine Spalte per Augen-Button erlaubst oder
  deaktivierst, wechselt das Script in den expliziten Modus und speichert die Auswahl unter dem Projektschlüssel.
- **Cache leeren**: Entfernt alle gespeicherten Progress-Daten, hebt eventuell gesetzte Request-Blocks und triggert
  neue Scans sowie einen grünen Toast („Cache geleert").
- **Fehlerzustände & Portal-Hinweise**: Hilfreiche Toasts warnen bei fehlender Portal-Base, 403/404-Block(-Wiederholung) oder
  dem erfolgreichen Speichern von Einstellungen; die Warnung zu fehlender Base meldet sich maximal alle zwei Minuten.
- **Autosave** (Tab Dieses Board): Gültige Änderungen werden 0,7 s nach der letzten Eingabe gespeichert, das geänderte Feld leuchtet
  kurz grün. Bei Projekt-ID, Portal-URL oder zweiter ID leert das Script den Cache und lädt das Board ohne
  Seiten-Reload neu. Ungültige oder unvollständige Eingaben werden nicht gespeichert, der Hinweis steht am Feld.
- **Daten geladen**: Der Fuß des Panels zeigt den Zeitpunkt der letzten erfolgreichen Portal-Anfrage; der
  Button „↻ Daten neu laden“ leert den lokalen Cache, setzt den Zeitstempel zurück und scannt das Board neu (ohne Seiten-Reload),
  damit alle Tickets nochmals vom Portal abgefragt werden.
