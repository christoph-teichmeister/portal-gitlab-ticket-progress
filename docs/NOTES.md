# Hinweise

- Auf `merge_requests`-Seiten laufen nur die MR-Funktionen (Progress im MR, Ticket-Assignee- und Ticket-Aktions-Buttons); die Board-Scans sind dort aus.
- Das Skript geht davon aus, dass eine Session beim Portal existiert (`withCredentials: true`). Werden nicht alle Daten
  geladen, liegt es meist an einem fehlenden Login, einer falschen Base-URL oder einem blockierten Request nach einem
  403/404.
- Die Render-Logik nutzt ausschließlich DOM-Manipulation; Badges werden mit `z-index: 20` platziert, weil sie sonst
  von GitLab-Elementen überdeckt wären.
- Ein einziger MutationObserver auf `body` triggert (entprellt, ~150 ms) neue Scans, ignoriert dabei aber die eigenen
  Einfügungen des Scripts. Ähnliche Mechanismen sorgen dafür, dass Issue-Detailansichten (Teilnehmer-Sektion)
  synchron mit den Board-Badges bleiben.
- Portal-Requests laufen mit höchstens 5, GitLab-API-Requests mit höchstens 6 parallelen Anfragen; gleiche Requests
  (MR-Liste, Portal-URL) werden zusammengeführt. Bei Netzwerkfehlern oder Timeouts (15 s) wird nach 30 s bis zu
  dreimal erneut versucht; „keine Buchungen“ wird 10 Minuten gecacht.
- Mehrere Tabs teilen sich den Progress-Cache im `localStorage`; Schreibzugriffe werden gebündelt und mit dem
  gespeicherten Stand zusammengeführt.
- GitLab-Selektoren stehen zentral in der `SEL`-Tabelle im Skript. Findet GitLab nach einem Update Elemente nicht
  mehr, zeigt der „Selektor-Selbsttest“ (Erweitert) welche.
- Solange das Portal antwortet, zeigt jede Karte einen pulsierenden Platzhalter („Skeleton“) an der Stelle der Bar. Er
  verschwindet bei Fehlern oder „keine Buchungen“ wieder; bei `prefers-reduced-motion` pulsiert er nicht.
