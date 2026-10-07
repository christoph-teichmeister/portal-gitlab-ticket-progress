# Lokale Controls

Das Einstellungs-Menü (Zahnrad) öffnet als **Seitenpanel** rechts unter der Top-Bar (wie GitLabs Ticket-Vorschau,
etwa halbe Fensterbreite). Es schließt mit dem X, Escape oder einem Klick daneben und überdeckt das Board, ohne es zu
verschieben. Oben steht eine Status-Karte (Version, Anzeigen-Schalter, letzte Aktualisierung), darunter die Abschnitte
als aufklappbare Karten: **Globale Einstellungen** (gelten für alle Boards) und **Board-Einstellungen** (gelten nur
für das aktuelle Board). Es gibt keinen „Speichern“-Button: Schalter und Felder wirken sofort bzw. entprellt, das
geänderte Feld leuchtet kurz grün. Das Menü ist per Tastatur erreichbar.

- **Anzeigen** (neben der Versionszeile, global): Hauptschalter – blendet alles aus, was das Script einfügt
  (Karten-Badges, Spalten-Buttons und Median, roter Rahmen, MR-Buttons, Issue-/MR-Detail), z. B. fürs Screensharing.
  Sichtbar bleibt nur das Zahnrad, um es wieder einzuschalten. Beim Aktivieren wird das Board erneut gescannt.
- **Globale Einstellungen** (`ambientProgressFeatures`): ein Schalter pro Feature, gruppiert nach Ort:
  - *Karten*: Progress-Bar (Portal) mit Unterpunkt Portal- & Timesheet-Buttons, MR-Badge mit Unterpunkt
    Assignee-/Reviewer-Avatare, Verweildauer (Uhr im Footer), `workflow::`-Labels als Split-Label.
  - *Spalten*: Median-Verweildauer im Header (benötigt Verweildauer).
  - *Andere Ansichten*: MR-Buttons in der Topbar, Progress im Issue-Detail, Progress im MR,
    Ticket-Assignee-Buttons im MR.
  - *Erweitert* (zugeklappt): Debug – aktiviert `console.log` mit zusätzlichen Informationen. Außerdem:
    Selektor-Selbsttest, Debug-Info kopieren (ohne Portal-URL), Konfiguration exportieren/importieren und
    „Alle lokalen Daten löschen“.

  Unterpunkte sind ausgegraut, solange das übergeordnete Feature aus ist. Ausgeschaltete Features laden auch keine
  Daten mehr (z. B. keine MR-Liste ohne MR-Badge, keine Label-Historie ohne Verweildauer). Standard: alles an.
  Anzeigen, Debug und MR-Buttons waren früher pro Projekt gespeichert; der bisherige Wert wird beim ersten Start als
  Ausgangswert übernommen.
- **Spalten-Button (Auge)**: Aktivierte Listen werden im Cache gespeichert; sobald du eine Spalte per Augen-Button erlaubst oder
  deaktivierst, wechselt das Script in den expliziten Modus und speichert die Auswahl unter dem Projektschlüssel.
- **Board-Einstellungen → Roter Rahmen bei Median-Überschreitung** (`ambientProgressAgeHighlightLists`): Auswahlliste mit allen Label-Spalten des
  aktuellen Boards. Nur in ausgewählten Spalten bekommen Tickets, die länger als der Spalten-Ø dort liegen, einen
  roten Rahmen. Wird sofort pro Projektschlüssel gespeichert. Benötigt die globale Einstellung „Verweildauer".
- **Board-Einstellungen → Projekt-Konfiguration**: Projekt-ID, Portal-Base-URL, zweite Projekt-ID und
  „Ticket-Aktionen im MR“. Zugeklappt, sobald Projekt-ID und Portal-Base-URL gesetzt sind. Änderungen werden
  0,7 s nach der letzten Eingabe automatisch gespeichert (Autosave, siehe unten). Format und Beispiele für die Ticket-Aktionen: [Wesentliche Features](FEATURES.md#ticket-aktionen-im-mr).
- **Cache leeren**: Entfernt alle gespeicherten Progress-Daten, hebt eventuell gesetzte Request-Blocks und triggert
  neue Scans sowie einen grünen Toast („Cache geleert").
- **Fehlerzustände & Portal-Hinweise**: Hilfreiche Toasts warnen bei fehlender Portal-Base, 403/404-Block(-Wiederholung) oder
  dem erfolgreichen Speichern von Einstellungen; die Warnung zu fehlender Base meldet sich maximal alle zwei Minuten.
- **Autosave** (Projekt-Konfiguration): Gültige Änderungen werden entprellt gespeichert, das geänderte Feld leuchtet
  kurz grün. Bei Projekt-ID, Portal-URL oder zweiter ID leert das Script den Cache und lädt das Board ohne
  Seiten-Reload neu. Ungültige oder unvollständige Eingaben werden nicht gespeichert, der Hinweis steht am Feld.
- **Letzte Aktualisierung**: Die Status-Karte zeigt den Zeitpunkt der letzten erfolgreichen Portal-Anfrage; der
  Button `↻` leert den lokalen Cache, setzt den Zeitstempel zurück und scannt das Board neu (ohne Seiten-Reload),
  damit alle Tickets nochmals vom Portal abgefragt werden.
