# Portal GitLab Ticket Progress

Dieses Tampermonkey-Skript ergänzt die GitLab-Issue-Boards auf `gitlab.beyonder.de` mit einer eingebetteten
Fortschrittsanzeige aus dem Portal. Es liest die dort gebuchten Stunden und zeigt sie als Progressbar in
ausgewählten Spalten an, inklusive eines Buttons, der direkt ins Portal führt.

## Installation (Tampermonkey lädt direkt von GitHub)

Die Datei `portal-gitlab-ticket-progress.js` in diesem Repository ist das volle Tampermonkey-Skript; Tampermonkey lädt
sie direkt von GitHub, wenn du die RAW-URL verwendest, damit alle Nutzer automatisch die neueste Version bekommen.

### Pre-Installation:

1. Tampermonkey Script
   installieren: [Chrome Web Store](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo?hl=en&pli=1)
   oder [Firefox](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/)
2. [User Scripts erlauben](https://www.tampermonkey.net/faq.php?q=Q209)

### Installationsschritte:

1. Öffne das Tampermonkey-Dashboard (Icon in der Erweiterungsleiste → "Dashboard").
2. Klicke auf "Utilities" / "Hilfsmittel" im Dashboard (NICHT im Dropdown Menü des Icons der Erweiterungsleiste!) und
   wähle "Import from URL" / "Von URL importieren", statt ein neues Skript anzulegen.
3. Gib die RAW-URL ein:

   ```text
   https://raw.githubusercontent.com/christoph-teichmeister/portal-gitlab-ticket-progress/refs/heads/main/portal-gitlab-ticket-progress.js
   ```

   Die URL verweist auf dieselbe `portal-gitlab-ticket-progress.js`, die in diesem Repo liegt.
4. Tampermonkey zeigt Name/Version/Berechtigungen und du bestätigst mit "Installieren".Das Script wird auf
   `https://gitlab.*/*` aktiv.
5. Die `@updateURL`/`@downloadURL` im Skriptkopf halten alles automatisch aktuell – nach der einmaligen Installation
   liefert Tampermonkey neue Versionen direkt aus diesem Repo.
6. Über die Debug/Anzeige-Toggles in der GitLab-Topbar kannst du das Verhalten bei Bedarf ein- oder ausschalten. Die
   Toggles hängen direkt rechts vom oberen Menü und bleiben beim Scrollen sichtbar; Debug ist standardmäßig aus, die
   Anzeige (Badges) standardmäßig an. Jede Projekt-Ansicht merkt sich ihre eigene Konfiguration (die Werte werden pro
   Projekt lokal gespeichert).
7. Klicke in der GitLab-Topbar auf das Zahnrad, um die „Projekt-Konfiguration“ zu öffnen, und trage dort die
   Portal-Base-URL ein (z. B. `https://user-portal.arbeitgeber.com`). Die Einstellung wird ausschließlich lokal im
   Browser gespeichert (per Projekt). Du musst sie nur einmal hinterlegen.
8. Wenn die Portal-Base-URL fehlt, blendet das Script einen kleinen Toast von oben rechts ein („Portal-Base URL fehlt –
   ⚙ → Projekt-Konfiguration öffnen und eintragen.”). Nach fünf Sekunden verschwindet der Hinweis wieder; du kannst
   ihn bei Bedarf erneut triggern, indem du das Zahnrad öffnest.

## Dokumentation

Weitere Details zur Nutzung und Konfiguration:

- [Sicherheitsaspekte](docs/SECURITY.md) – Warum dieses Script sicher ist
- [Wesentliche Features](docs/FEATURES.md) – Alle Funktionen im Überblick
- [Konfiguration & Erweiterung](docs/CONFIGURATION.md) – Technische Konfigurationsdetails
- [Lokale Controls](docs/CONTROLS.md) – Bedienung der Toggles und Einstellungen
- [Hinweise](docs/NOTES.md) – Wichtige Besonderheiten und Limitationen
- [Automatische Update-Benachrichtigung](docs/AUTO-UPDATE.md) – Wie das Script aktualisiert wird
