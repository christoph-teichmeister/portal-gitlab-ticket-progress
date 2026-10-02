# Lokale Controls

Das Einstellungs-Menü (Zahnrad) ist in **Globale Einstellungen** (gelten für alle Boards) und
**Board-Einstellungen** (gelten nur für das aktuelle Board) aufgeteilt. Alle Schalter wirken sofort, ohne
„Einstellungen speichern".

- **Anzeigen** (neben der Versionszeile, global): Hauptschalter – blendet alles aus, was das Script einfügt
  (Karten-Badges, Spalten-Buttons und Ø, roter Rahmen, MR-Buttons, Issue-/MR-Detail), z. B. fürs Screensharing.
  Sichtbar bleibt nur das Zahnrad, um es wieder einzuschalten. Beim Aktivieren wird das Board erneut gescannt.
- **Globale Einstellungen** (`ambientProgressFeatures`): ein Schalter pro Feature, gruppiert nach Ort:
  - *Karten*: Progress-Bar (Portal) mit Unterpunkt Portal- & Timesheet-Buttons, MR-Badge mit Unterpunkt
    Assignee-/Reviewer-Avatare, Verweildauer (Uhr im Footer).
  - *Spalten*: Ø Verweildauer im Header (benötigt Verweildauer).
  - *Andere Ansichten*: MR-Buttons in der Topbar, Progress im Issue-Detail, Progress im MR,
    Ticket-Assignee-Buttons im MR.
  - *Erweitert* (zugeklappt): Debug – aktiviert `console.log` mit zusätzlichen Informationen.

  Unterpunkte sind ausgegraut, solange das übergeordnete Feature aus ist. Ausgeschaltete Features laden auch keine
  Daten mehr (z. B. keine MR-Liste ohne MR-Badge, keine Label-Historie ohne Verweildauer). Standard: alles an.
  Anzeigen, Debug und MR-Buttons waren früher pro Projekt gespeichert; der bisherige Wert wird beim ersten Start als
  Ausgangswert übernommen.
- **Spalten-Button (Auge)**: Aktivierte Listen werden im Cache gespeichert; sobald du eine Spalte per Augen-Button erlaubst oder
  deaktivierst, wechselt das Script in den expliziten Modus und speichert die Auswahl unter dem Projektschlüssel.
- **Board-Einstellungen → Roter Rahmen bei Ø-Überschreitung** (`ambientProgressAgeHighlightLists`): Auswahlliste mit allen Label-Spalten des
  aktuellen Boards. Nur in ausgewählten Spalten bekommen Tickets, die länger als der Spalten-Ø dort liegen, einen
  roten Rahmen. Wird sofort pro Projektschlüssel gespeichert. Benötigt die globale Einstellung „Verweildauer".
- **Board-Einstellungen → Projekt-Konfiguration**: Projekt-ID, Portal-Base-URL und zweite Projekt-ID samt
  „Einstellungen speichern". Zugeklappt, sobald Projekt-ID und Portal-Base-URL gesetzt sind.
- **Cache leeren**: Entfernt alle gespeicherten Progress-Daten, hebt eventuell gesetzte Request-Blocks und triggert
  neue Scans sowie einen grünen Toast („Cache geleert").
- **Fehlerzustände & Portal-Hinweise**: Hilfreiche Toasts warnen bei fehlender Portal-Base, 403/404-Block(-Wiederholung) oder
  dem erfolgreichen Speichern von Einstellungen; die Warnung zu fehlender Base meldet sich maximal alle zwei Minuten.
- **Einstellungen speichern** (in der Projekt-Konfiguration): Nach erfolgreichem Speichern der Projekt-ID bzw. Portal-Base-URL siehst du ein Erfolgstoast
  und die Seite lädt sich neu, damit die neuen Werte sofort greifen.
- **Letzte Aktualisierung**: Die Dropdown-Zeile zeigt den Zeitpunkt der letzten erfolgreichen Portal-Anfrage; der
  Button `Jetzt aktualisieren` leert den lokalen Cache, setzt den Zeitstempel zurück und lädt die Seite neu, damit
  wirklich alle Tickets nochmals vom Portal abgefragt werden.
