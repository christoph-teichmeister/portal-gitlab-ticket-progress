# Lokale Controls

Das Einstellungs-Menü (Zahnrad) öffnet als **Seitenpanel** rechts unter der Top-Bar (wie GitLabs Ticket-Vorschau,
höchstens 720 px breit; das Finanz-Dashboard ist breiter). Es schließt mit dem X, Escape oder einem Klick daneben und überdeckt das Board, ohne es zu
verschieben. Im festen Kopf stehen Titel, Version, der Hauptschalter **Aktiv/Pausiert** und vier **Tabs**; im festen Fuß
der Datenstand und **↻ Daten neu laden**. Es gibt keinen „Speichern“-Button: Schalter und Felder wirken sofort bzw.
entprellt, das geänderte Feld leuchtet kurz grün. Das Panel ist per Tastatur bedienbar (Tab, Pfeiltasten wechseln den
Tab, Escape schließt); jede Schalter-Zeile ist als Ganzes klickbar.

- **Aktiv/Pausiert** (im Kopf, global): Hauptschalter – blendet alles aus, was das Script einfügt
  (Karten-Badges, Spalten-Buttons und Median, roter Rahmen, MR-Buttons, Issue-/MR-Detail), z. B. fürs Screensharing.
  Sichtbar bleibt nur das Zahnrad, um es wieder einzuschalten. Beim Aktivieren wird das Board erneut gescannt. Im Tab
  Anzeige steht dann ein Hinweis mit „Fortsetzen“.
- **Tab Anzeige** (`ambientProgressFeatures`, gilt für alle Boards): fünf Unterreiter (*Board-Karte*, *Spalten-Header*,
  *Ticket*, *Merge Request*, *Topbar*) mit je eigener, angepinnter **Vorschau** in voller Breite. Die Vorschau ist simuliert,
  aber mit denselben Funktionen gezeichnet wie die echten Seiten, mit Beispieldaten (Balken, MR, Verweildauer, Kosten,
  Ticket-Aktionen): unter *Board-Karte* und *Spalten-Header* dient eine Karte dieses Boards samt Spalten-Header nur als
  GitLab-Gerüst, unter *Ticket*, *Merge Request* und *Topbar* ein Ausschnitt der jeweiligen Seite. Die Vorschau ist immer
  das Maximalset: jedes eingeschaltete Element ist zu sehen, und beim Überfahren (Hover/Fokus) eines Schalters erscheint
  sein Element samt Umrandung auch dann, wenn das Feature aus ist (oder noch Voraussetzungen fehlen). Die Schalter sind
  nach Thema in **einklappbare Gruppen** sortiert (gleiche Karten wie in „Dieses Board“, mit Zähler „x von y an“); sie
  starten zu und klappen beim Schließen des Menüs wieder zu.
  - *Board-Karte*: Fortschrittsbalken (Unterpunkt Portal- & Timesheet-Buttons), Schätzung (Badge, Titel-Bereinigung),
    Merge Requests (MR-Badge, Avatare), Labels & Aktionen (Geteilte Scoped Labels, On-Hold-Ausgrauen, Ticket-Aktionen ⋮),
    Zeit & Aktivität (Uhr, Aktivitäts-Chip) und **Kosten & Marge** (Kosten-Pille, Break-even-Marker, Tooltip).
  - *Spalten-Header*: SP-Summe, Kosten hinter der SP-Summe, Median der Liegezeit.
  - *Ticket*: Fortschrittsbalken mit Unterpunkten Portal- & Timesheet-Buttons und Ticket-Aktionen (Dropdown).
  - *Merge Request*: Fortschrittsbalken mit Unterpunkten Portal- & Timesheet-Buttons und Ticket-Aktionen (Buttons),
    dazu Ticket-Assignee-Buttons.
  - *Topbar*: MR-Schnellzugriff, SP im Board vs. verkauft (Meilenstein-Chip), Kosten im Meilenstein-Chip und
    Finanz-Dashboard-Button.

  Alle Geld-Anzeigen (Kosten-Pille, Break-even, Tooltip, Spalten-Kosten, Meilenstein-Kosten, Finanz-Button) sind hier
  global abschaltbar; sie wirken zusätzlich nur, wenn „Kosten anzeigen“ im Tab „Dieses Board“ an ist.
  Die Portal-Buttons und Ticket-Aktionen sind pro Ort (Karte, Ticket, MR) getrennt schaltbar; Schätzung als Badge und
  Geteilte Scoped Labels gelten überall.

  Unterpunkte sind eingerückt und ausgegraut, solange das übergeordnete Feature aus ist. Ausgeschaltete Features laden
  auch keine Daten mehr (z. B. keine MR-Liste ohne MR-Badge, keine Label-Historie ohne Verweildauer). Standard: alles an.
- **Tab Dieses Board** (gilt nur für das aktuelle Board, Pfad steht oben). Karten nach Thema, einklappbar (Klick irgendwo
  auf die eingeklappte Karte öffnet sie; Standard zu, Zustand wird gemerkt); Textfelder wachsen mit dem Inhalt:
  - *Portal-Verbindung*: Portal-URL und Portal-Projekt-ID mit Status („Verbunden · Projekt …“ / „Nicht eingerichtet“).
    Ist das Board noch nicht eingerichtet, öffnet das Panel direkt hier, der Tab trägt ein „!“, die beiden Felder sind
    nummeriert und die übrigen Karten gesperrt. Nach der Einrichtung: Feld **Weitere Projekt-IDs**
    (kommagetrennt, bis zu 3 zusätzliche Balken für Tickets, die auch in anderen Portal-Projekten gebucht werden).
  - *Schätzung & Verkauf*: Schalter **Schätzung als Badge auf diesem Board** (Standard an; aus für Boards ohne
    SP/Timeboxen, sonst trägt jede Karte ein rotes `? SP`) und **Verkaufte SP** je Meilenstein (Dropdown mit den noch
    nicht eingetragenen Meilensteinen aus GitLab).
  - *Kostensätze*: Rollen, interne/externe Sätze, Kosten anzeigen, SP-Abrechnung, Verkaufspreis, Zeitlimit, Ergebnis-Darstellung
    (Details: [Kostensätze](FEATURES.md#kostensätze-kosten-je-ticket)). Interne Portal-Projekte werden erkannt; die
    Verkaufs-Optionen sind dann ausgegraut und erklärt.
  - *Board-Darstellung*: **Liegezeit hervorheben** (Mehrfachauswahl-Dropdown der Label-Spalten; nur dort bekommen Tickets
    über dem Spalten-Median einen roten Rahmen, braucht „Uhr im Karten-Footer“), **On-Hold-Labels** (Mehrfachauswahl) und
    **Closed-Spalte: Zeitraum** (Tage, Standard 28, höchstens 40; wirkt, wenn das Auge der Closed-Spalte an ist, ohne Verweildauer-Uhr).
  - *Ticket-Aktionen im Merge Request*: Textfeld plus Vorschau der entstehenden Buttons („Ergibt: …“). Format und
    Beispiele: [Wesentliche Features](FEATURES.md#ticket-aktionen-im-mr).
- **Tab Global** (gilt für alle Boards): *Allgemein* (Sprache Deutsch/English – teilweise übersetzt, wirkt nach Reload; Debug-Logs),
  *Schätzungs-Muster* (siehe [Features](FEATURES.md#schätzung-als-badge-am-titel), mit Gültigkeitsanzeige und
  „Auf Standard zurücksetzen“), *Was ist neu* (Changelog je Version aus dem Repository, die neueste aufgeklappt), *Diagnose & Daten* (Selektor-Selbsttest, **Toast-Test**, Portal-Fehler, Debug-Info ohne
  Portal-URL, Konfiguration exportieren/importieren) und die rot abgesetzte *Gefahrenzone* „Alle lokalen Daten löschen“.
  Die Gruppen sind einklappbar und starten zu.
- **Tab Experimente**: noch nicht übernommene Ideen mit Beta-Chip, standardmäßig aus; einklappbare Gruppen, der Tab zeigt, wie viele an sind.
- **Spalten-Button (Auge)**: Aktivierte Listen werden im Cache gespeichert; sobald du eine Spalte per Augen-Button erlaubst oder
  deaktivierst, wechselt das Script in den expliziten Modus und speichert die Auswahl unter dem Projektschlüssel.
- **Cache leeren**: Entfernt alle gespeicherten Progress-Daten, hebt eventuell gesetzte Request-Blocks und triggert
  neue Scans sowie einen grünen Toast („Cache geleert").
- **Toasts**: Meldungen erscheinen im GitLab-Look (dunkle Fläche, Status-Icon für Info/Erfolg/Warnung, Schließen-Button)
  unten rechts, damit sie die Toolbar-Icons nicht verdecken. Zum Ansehen: Global → Diagnose & Daten → **Toast-Test**
  (jeder Klick zeigt die nächste Variante).
- **Fehlerzustände & Portal-Hinweise**: Hilfreiche Toasts warnen bei fehlender Portal-Base, 403/404-Block(-Wiederholung) oder
  dem erfolgreichen Speichern von Einstellungen; die Warnung zu fehlender Base meldet sich maximal alle zwei Minuten.
- **Autosave** (Tab Dieses Board): Gültige Änderungen werden 0,7 s nach der letzten Eingabe gespeichert, das geänderte Feld leuchtet
  kurz grün. Bei Projekt-ID, Portal-URL oder weiteren Projekt-IDs leert das Script den Cache und lädt das Board ohne
  Seiten-Reload neu. Ungültige oder unvollständige Eingaben werden nicht gespeichert, der Hinweis steht am Feld.
- **Daten geladen**: Der Fuß des Panels zeigt den Zeitpunkt der letzten erfolgreichen Portal-Anfrage; der
  Button „↻ Daten neu laden“ leert den lokalen Cache, setzt den Zeitstempel zurück und scannt das Board neu (ohne Seiten-Reload),
  damit alle Tickets nochmals vom Portal abgefragt werden.
