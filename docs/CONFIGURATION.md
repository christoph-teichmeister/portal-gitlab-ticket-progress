# Konfiguration & Erweiterung

- Die Projekte (Projektpfad, Projekt-ID, voreingestellte Listen) können initial im `HOST_CONFIG` stehen. Das
  Script liest diesen Sockel und überschreibt ihn mit den lokal gespeicherten Einträgen aus `ambientProgressProjectConfigs`
  bzw. `ambientProgressListSelections`, sobald du die Projekt-ID/Portal-Base-URL oder die Listenauswahl änderst.
- Der Gear-Dropdown bietet ein Formular für Projekt-ID und Portal-Base-URL; Werte werden normalisiert (`https://`-Prefix,
  Trailing-Slash entfernt), in LocalStorage gespeichert und mit einem Reload sofort aktiv („Einstellungen speichern").
- Die Portal-URL besteht aus der Base + `/management/project/{projectId}/booking-label/#` + IID; ohne gültige Projekt-ID
  oder Base wird kein Request abgesendet und es erscheint ein gelber Toast.
- Das Parsing der Portal-Seite schaut zuerst nach `div.progress`-Elementen mit `progress-bar`, dann nach Inline- oder
  Tabellenwerten zu „Booked Hours", um `spent`/`remaining`/`over` sinnvoll abzuleiten.
