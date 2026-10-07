# <img src="icon.svg" alt="" width="40" align="center"> Portal GitLab Ticket Progress

Dieses Tampermonkey-Skript ergänzt die GitLab-Issue-Boards auf `gitlab.beyonder.de` mit einer eingebetteten
Fortschrittsanzeige aus dem Portal. Es liest die dort gebuchten Stunden und zeigt sie als Progressbar in
ausgewählten Spalten an, inklusive eines Buttons, der direkt ins Portal führt.

## Installation (Tampermonkey lädt direkt von GitHub)

Die Datei `portal-gitlab-ticket-progress.js` in diesem Repository ist das volle Tampermonkey-Skript; Tampermonkey lädt
sie direkt von GitHub, wenn du die RAW-URL verwendest, damit alle Nutzer automatisch die neueste Version bekommen.

### Pre-Installation

1. Tampermonkey Script
   installieren: [Chrome Web Store](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo?hl=en&pli=1)
   oder [Firefox](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/)
2. [User Scripts erlauben](https://www.tampermonkey.net/faq.php?q=Q209)

### Installationsschritte

1. Öffne das Tampermonkey-Dashboard (Icon in der Erweiterungsleiste → "Dashboard" (englisch) / "Übersicht" (deutsch)).
2. Klicke auf "Utilities" / "Hilfsmittel" im Dashboard (NICHT im Dropdown Menü des Icons der Erweiterungsleiste!) und
   wähle "Import from URL" / "Von URL importieren", statt ein neues Skript anzulegen.
3. Gib die RAW-URL ein:

   ```text
   https://raw.githubusercontent.com/christoph-teichmeister/portal-gitlab-ticket-progress/refs/heads/main/portal-gitlab-ticket-progress.js
   ```

   Die URL verweist auf dieselbe `portal-gitlab-ticket-progress.js`, die in diesem Repo liegt.
4. Tampermonkey zeigt Name/Version/Berechtigungen und du bestätigst mit "Installieren". Das Script wird auf
   `https://gitlab.beyonder.de/*/-/*` aktiv (boards, work_items, merge_requests, etc.). Tampermonkey fragt beim
   ersten Portal-Request einmalig nach der Freigabe der Portal-Domain (`@connect`) – dort „Domain immer erlauben“
   wählen, aber **nicht** „alle Domains“.
5. Die `@updateURL`/`@downloadURL` im Skriptkopf halten alles automatisch aktuell – nach der einmaligen Installation
   liefert Tampermonkey neue Versionen direkt aus diesem Repo.
6. Über die Debug/Anzeige-Toggles in der GitLab-Topbar kannst du das Verhalten bei Bedarf ein- oder ausschalten. Die
   Toggles hängen direkt rechts vom oberen Menü und bleiben beim Scrollen sichtbar; Debug ist standardmäßig aus, die
   Anzeige (Badges) standardmäßig an. Jede Projekt-Ansicht merkt sich ihre eigene Konfiguration (die Werte werden pro
   Projekt lokal gespeichert).
7. Klicke in der GitLab-Topbar auf das Zahnrad, um die „Projekt-Konfiguration“ zu öffnen, und trage dort die
   Portal-Base-URL ein (z. B. `https://user-portal.arbeitgeber.com`). Erlaubt ist nur `https://` ohne
   Benutzername/Passwort; Query und Fragment werden verworfen. Die Einstellung wird ausschließlich lokal im Browser
   gespeichert (per Projekt). Du musst sie nur einmal hinterlegen.
8. Wenn die Portal-Base-URL fehlt, blendet das Script einen kleinen Toast von oben rechts ein („Portal-Base URL fehlt –
   ⚙ → Projekt-Konfiguration öffnen und eintragen.”). Nach fünf Sekunden verschwindet der Hinweis wieder; du kannst
   ihn bei Bedarf erneut triggern, indem du das Zahnrad öffnest.

## Ticket-Aktionen im MR

Im Zahnrad-Menü unter „Ticket-Aktionen im MR“ kannst du pro Projekt eigene Buttons definieren. Sie erscheinen in der
Box mit den gebuchten Stunden oben rechts im MR. Ein Klick postet die hinterlegten
[Quick Actions](https://docs.gitlab.com/user/project/quick_actions/) als Kommentar auf das verknüpfte Ticket (die
`#<IID>` aus dem MR-Titel). Eine Zeile `[Label]` beginnt einen neuen Button, alle folgenden Zeilen sind dessen
Quick Actions:

```
[Ticket abschließen]
/unassign me
/label ~"workflow::Closed this iteration"
/unlabel ~"workflow::PO-Review"

[Zurück in WIP]
/label ~"workflow::WIP"
```

- Ist das Feld leer, werden keine Buttons angezeigt.
- `/unassign` ohne Argument entfernt **alle** Assignees, `/unassign me` nur dich selbst.
- Der Request läuft über deine bestehende GitLab-Session. Es wird kein Token und kein Passwort gespeichert. Lokal
  im Browser liegt nur der Aktionstext.
- Weitere Beispiele (Ticket schließen, zurück an den Entwickler, …) und eine Übersicht nützlicher Quick Actions:
  [Wesentliche Features](docs/FEATURES.md#ticket-aktionen-im-mr).

## Dokumentation

Weitere Details zur Nutzung und Konfiguration:

- [Sicherheitsaspekte](docs/SECURITY.md) – Warum dieses Script sicher ist
- [Wesentliche Features](docs/FEATURES.md) – Alle Funktionen im Überblick, inkl. [Experimente](docs/FEATURES.md#experimente-zum-testen)
- [Konfiguration & Erweiterung](docs/CONFIGURATION.md) – Technische Konfigurationsdetails
- [Lokale Controls](docs/CONTROLS.md) – Bedienung der Toggles und Einstellungen
- [Hinweise](docs/NOTES.md) – Wichtige Besonderheiten und Limitationen
- [Automatische Update-Benachrichtigung](docs/AUTO-UPDATE.md) – Wie das Script aktualisiert wird

## Datenschutz & lokale Daten

- Portal-Zugangsdaten werden nie gespeichert. Das Script nutzt die bestehende Portal-Session deines Browsers
  (Cookies, `withCredentials`); trage deshalb nur eine Portal-Base-URL ein, der du vertraust.
- Lokal im Browser (`localStorage` der GitLab-Seite) liegen: Portal-Base-URL und Projekt-IDs, Ticket-Aktionen,
  Spaltenauswahl, Feature-Schalter sowie ein Cache der gebuchten Stunden pro Ticket (1 Stunde, „keine Buchungen“
  10 Minuten). Andere Scripts/Erweiterungen auf derselben GitLab-Seite könnten diese Daten lesen.
- Unter Zahnrad → Globale Einstellungen → Erweitert lassen sich alle lokalen Daten löschen sowie Konfiguration
  exportieren/importieren, der Selektor-Selbsttest ausführen und Debug-Infos (ohne Portal-URL) kopieren.
- Updates kommen vom `main`-Branch auf GitHub. Wer mehr Kontrolle möchte, kann die `@updateURL`/`@downloadURL` auf
  einen Release-Tag (`refs/tags/<version>`) pinnen; siehe [Sicherheitsaspekte](docs/SECURITY.md).

## Bedienung, Barrierefreiheit & Sprache

- Das Einstellungs-Menü ist per Tastatur bedienbar (Tab, Escape schließt und setzt den Fokus aufs Zahnrad); Schalter
  haben einen sichtbaren Fokusring, Fortschrittsbalken eine Textalternative. Animationen respektieren
  `prefers-reduced-motion`.
- Die Oberfläche ist auf Deutsch; Datumsangaben folgen der Sprache der GitLab-Seite. GitLab-Begriffe wie
  „Assignee“, „Reviewer“ und „MR“ bleiben bewusst englisch.
- Kleine Stylesheet-Ausnahme: Für Fokus- und Reduced-Motion-Styles injiziert das Script einmalig ein `<style>`-Element
  (Inline-Styles können kein `:focus-visible`).

## Versionierung

Versionen folgen CalVer `YYYY.MM.V` (z. B. `2026.10.2`); `@version` und `SCRIPT_VERSION` im Skript werden gemeinsam
erhöht. Im Debug-Modus warnt das Script, falls beide auseinanderlaufen.
