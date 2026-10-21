# Konfiguration & Erweiterung

- Die Konfiguration pro Board (Projekt-ID, Portal-Base-URL, weitere Projekt-IDs, Ticket-Aktionen) liegt lokal in
  `ambientProgressProjectConfigs`, die Spaltenauswahl in `ambientProgressListSelections`, jeweils unter dem
  Projektschlüssel (Host + Projektpfad).
- Das Einstellungs-Panel (Zahnrad) bietet ein Formular für Projekt-ID und Portal-Base-URL; Werte werden normalisiert
  (`https://`-Prefix, Trailing-Slash entfernt) und entprellt automatisch in LocalStorage gespeichert (Autosave); das
  Board lädt danach ohne Seiten-Reload neu.
- **Weitere Projekt-IDs** (pro Board, höchstens 3): je ein zusätzlicher Balken auf der Karte, gleiche Portal-Base-URL.
  Das frühere „zweite Portal-Projekt“ und die frühere globale ID-Liste werden beim ersten Laden übernommen.
- Die Portal-URLs bestehen aus der Base + `/management/project/{projectId}/booking-label/#` + IID; ohne gültige
  Projekt-ID
  oder Base wird kein Request abgesendet und es erscheint ein gelber Toast.
- Für weitere Projekt-IDs fragt das Script das Portal pro ID separat an; die Cache-Einträge tragen das Präfix
  `pidx:<ID>`. Ein Balken erscheint nur, wenn das Ticket in diesem Projekt gefunden wurde.
- Das Parsing der Portal-Seite schaut zuerst nach `div.progress`-Elementen mit `progress-bar`, dann nach Inline- oder
  Tabellenwerten zu „Booked Hours", um `spent`/`remaining`/`over` sinnvoll abzuleiten.
- Die MR-Badge- und Ticket-Assignee-Features benötigen **keine zusätzliche Konfiguration**: sie nutzen die bereits
  vorhandene GitLab-Projekt-Konfiguration (`projectPath`) und sprechen die GitLab-REST-API (`/api/v4/...`) direkt
  über `fetch` mit der bestehenden Browser-Session an (kein `GM_xmlhttpRequest`, kein Personal Access Token nötig).
  Das CSRF-Token für schreibende Requests (Reviewer zuweisen, Issue-Assignee ändern) wird automatisch aus dem
  `<meta name="csrf-token">`-Tag der GitLab-Seite gelesen.
- Die **Ticket-Aktionen im MR** werden als Rohtext unter `ticketActions` im Projekt-Eintrag von
  `ambientProgressProjectConfigs` gespeichert. Sie nutzen denselben `fetch`-Weg (Session + CSRF) und posten per
  `POST /api/v4/projects/:id/issues/:iid/notes`. Details: [Wesentliche Features](FEATURES.md#ticket-aktionen-im-mr).
- Voraussetzung: dein GitLab-Account braucht die üblichen Berechtigungen, um MRs als Reviewer zu bearbeiten bzw.
  Issues umzuzuweisen (mind. Developer-Rolle im Projekt) – sonst antwortet die API mit 403 und das Script loggt
  einen Fehler in die Konsole, statt die Aktion stillschweigend zu wiederholen.
