# Konfiguration & Erweiterung

- Die Projekte (Projektpfad, Projekt-ID, voreingestellte Listen) können initial im `HOST_CONFIG` stehen. Das
  Script liest diesen Sockel und überschreibt ihn mit den lokal gespeicherten Einträgen aus `ambientProgressProjectConfigs`
  bzw. `ambientProgressListSelections`, sobald du die Projekt-ID/Portal-Base-URL oder die Listenauswahl änderst.
- Der Gear-Dropdown bietet ein Formular für Projekt-ID und Portal-Base-URL; Werte werden normalisiert (`https://`-Prefix,
  Trailing-Slash entfernt), in LocalStorage gespeichert und mit einem Reload sofort aktiv („Einstellungen speichern").
- Ein optionales Kontrollkästchen **„Zweite Projekt-ID verwenden"** aktiviert die Multi-Board-Abfrage. Ist es aktiv, wird
  zusätzlich ein Eingabefeld für `projectId2` angezeigt. Beide Projekt-IDs nutzen die gleiche Portal-Base-URL.
- Die Portal-URLs bestehen aus der Base + `/management/project/{projectId}/booking-label/#` + IID; ohne gültige Projekt-ID
  oder Base wird kein Request abgesendet und es erscheint ein gelber Toast.
- Werden beide Projekt-IDs konfiguriert, versendet das Script zwei parallel laufende Portal-Requests und aggregiert die Ergebnisse:
  - Verbrachte Stunden (`spent`) und verbleibende Stunden (`remaining`) werden addiert
  - Die kombinierte Summe wird in der Progressbar angezeigt
  - Cache-Einträge werden separat mit Präfix `pid2:` gespeichert
- Das Parsing der Portal-Seite schaut zuerst nach `div.progress`-Elementen mit `progress-bar`, dann nach Inline- oder
  Tabellenwerten zu „Booked Hours", um `spent`/`remaining`/`over` sinnvoll abzuleiten.
