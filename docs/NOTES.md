# Hinweise

- Das Skript ist auf `merge_requests`-Seiten komplett deaktiviert, damit die Detailansichten dort nicht durch die Board-Scans geblockt werden.
- Das Skript geht davon aus, dass eine Session beim Portal existiert (`withCredentials: true`). Werden nicht alle Daten
  geladen, liegt es meist an einem fehlenden Login, einer falschen Base-URL oder einem blockierten Request nach einem
  403/404.
- Die Render-Logik nutzt ausschließlich DOM-Manipulation; Badges werden mit `z-index: 20` platziert, weil sie sonst
  von GitLab-Elementen überdeckt wären.
- MutationObserver beobachten das Board und triggern bei frisch geladenen Listen oder Karten neue Scans; Ähnliche
  Mechanismen sorgen dafür, dass Issue-Detailansichten (Teilnehmer-Sektion) synchron mit den Board-Badges bleiben.
