# Lokale Controls

- **Debug** (`portalProgressDebug`): aktiviert `console.log` und zeigt zusätzliche Informationen im Browser-Console-Log; die
  Einstellung wird pro Projekt in `ambientProgressProjectConfigs` gespeichert (ältere Werte unter `portalProgressDebug`
  dienen nur noch als Upgrade-Fallback).
- **Anzeigen** (`portalProgressShow`): blendet die Badges und Detail-Widgets ein/aus; beim Aktivieren wird das Board
  erneut gescannt, beim Deaktivieren werden die Badges lediglich ausgeblendet; die Sichtbarkeit bleibt pro Projekt erhalten.
- **Listen-Checkboxes**: Aktivierte Listen werden im Cache gespeichert; sobald du eine Spalte per Checkbox erlaubst oder
  deaktivierst, wechselt das Script in den expliziten Modus und speichert die Auswahl unter dem Projektschlüssel.
- **Cache leeren**: Entfernt alle gespeicherten Progress-Daten, hebt eventuell gesetzte Request-Blocks und triggert
  neue Scans sowie einen grünen Toast („Cache geleert").
- **Fehlerzustände & Portal-Hinweise**: Hilfreiche Toasts warnen bei fehlender Portal-Base, 403/404-Block(-Wiederholung) oder
  dem erfolgreichen Speichern von Einstellungen; die Warnung zu fehlender Base meldet sich maximal alle zwei Minuten.
- **Einstellungen speichern**: Nach erfolgreichem Speichern der Projekt-ID bzw. Portal-Base-URL siehst du ein Erfolgstoast
  und die Seite lädt sich neu, damit die neuen Werte sofort greifen.
- **Letzte Aktualisierung**: Die Dropdown-Zeile zeigt den Zeitpunkt der letzten erfolgreichen Portal-Anfrage; der
  Button `Jetzt aktualisieren` leert den lokalen Cache, setzt den Zeitstempel zurück und lädt die Seite neu, damit
  wirklich alle Tickets nochmals vom Portal abgefragt werden.
