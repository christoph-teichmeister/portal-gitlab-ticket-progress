# Portal GitLab Ticket Progress

Dieses Tampermonkey-Skript ergänzt die GitLab-Issue-Boards auf `gitlab.ambient-innovation.com` mit einer eingebetteten
Fortschrittsanzeige aus dem Portal. Es liest die dort gebuchten Stunden und zeigt sie als Progressbar in
ausgewählten Spalten an, inklusive eines Buttons, der direkt ins Portal führt.

## Wesentliche Features

- Setzt eine Toolbar oberhalb der Board-Ansicht mit Dark-Mode-Stil, Debug- und Anzeige-Toggles.
- Liest über `GM_xmlhttpRequest` das Portal aus und parsed dort bestehende
  Progress-/Booked-Hours-Daten.
- Fügt pro Karte ein Badge mit Progressbar und Text hinzu (Spenden: `spent`, `remaining`, `over` oder Fallback
  `Booked Hours`).
- Fügt einen Button (`↗`) hinzu, der die entsprechende Issue-Detailseite im Portal öffnet.
- Nutzt lokale Einstellungen (`localStorage`) für die Toolbar-Toggles (`portalProgressDebug`/`portalProgressShow`).
- Beschränkt sich auf vorher konfigurierte Projekte/Boards (z. B. `ai/ai-portal` oder `havg-rz/aka-portal`).
- Beobachtet das Board per `MutationObserver`, um neu geladene Karten automatisch zu erkennen.

## Konfiguration & Erweiterung

- Die Projekte und erlaubten Spalten sind im Objekt `HOST_CONFIG` definiert. Neue Projekte lassen sich über einen
  zusätzlichen Eintrag unter dem Host hinzufügen, z. B. mit `projectId` und `listNamesToInclude`.
- Die URL zum Portal wird über `buildPortalUrl(projectId, issueIid)` generiert; `projectId` muss mit dem Portal
  übereinstimmen, damit der Link funktioniert.
- Die Progress-Daten werden entweder aus einer `div.progress` (mit `div.progress-bar`-Unterelementen) oder als Fallback
  über den Text `Booked Hours` extrahiert.

## Lokale Controls

- **Debug** (`portalProgressDebug`): schaltet Logging (`console.log`) für den Entwicklungsworkflow ein/aus.
- **Anzeigen** (`portalProgressShow`): blendet alle Badges ein/aus. Bei eingeschaltetem Zustand löst das Skript ggf.
  einen neuen Board-Scan aus.

Die beiden Schalter befinden sich direkt in der GitLab-Topbar (rechts außen) als stilisierte Switch-Toggles. Es
gibt keine zusätzliche Toolbar mehr oberhalb des Boards; die Steuerelemente folgen optisch der oberen Navigation
und bleiben beim Board-Scrollen sichtbar.

## Installation (Tampermonkey lädt direkt von GitHub)

Die Datei `portal-gitlab-ticket-progress.js` in diesem Repository ist das volle Tampermonkey-Skript; Tampermonkey lädt
sie direkt von GitHub, wenn du die RAW-URL verwendest, damit alle Nutzer automatisch die neueste Version bekommen.

1. Öffne das Tampermonkey-Dashboard (Icon in der Erweiterungsleiste → „Dashboard“).
2. Klicke auf „+“ und wähle „Install from URL“ / „Bei URL installieren“, statt ein neues Skript anzulegen.
3. Gib die RAW-URL ein:

   ```text
   https://raw.githubusercontent.com/christoph-teichmeister/tampermonkey-portal-gitlab-ticket-progress/main/portal-gitlab-ticket-progress.js
   ```

   Die URL verweist auf dieselbe `portal-gitlab-ticket-progress.js`, die in diesem Repo liegt.
4. Tampermonkey zeigt Name/Version/Berechtigungen und du bestätigst mit „Installieren“. Das Script wird auf
   `https://gitlab.ambient-innovation.com/*/*/-/boards*` aktiv.
5. Die `@updateURL`/`@downloadURL` im Skriptkopf halten alles automatisch aktuell – nach der einmaligen Installation
   liefert Tampermonkey neue Versionen direkt aus diesem Repo.
6. Über die Debug/Anzeige-Toggles in der GitLab-Topbar kannst du das Verhalten bei Bedarf ein- oder ausschalten.
7. Klicke in der GitLab-Topbar auf das Zahnrad, um die „Projekt-Konfiguration“ zu öffnen, und trage dort die
   Portal-Base-URL ein (z. B. `https://user-portal.arbeitgeber.com`). Die Einstellung wird lokal gespeichert, damit dieser
   Workspace weiß, welche URL er abfragen darf, und du musst sie nur einmal eintragen.

## Hinweise

- Das Skript geht davon aus, dass eine Session beim Portal existiert (`withCredentials: true`). Bei fehlender
  Authentifizierung lädt das Parsing die Login-Seite und es werden ggf. keine Daten angezeigt.
- Die Render-Logik ist komplett über DOM-Manipulation realisiert; damit Stile funktionieren, ist das Badge auf
  `z-index: 20` gestellt und nutzt `flex`/`position` für Text-Overlay und Button.
- Bei Problemen sollte der Browser-Console-Log (mit aktivem Debug) Hinweise liefern, vor allem wenn `progressCache` oder
  `GM_xmlhttpRequest` scheitern.

## Sicherheitsaspekte

Dieses Repository ist so aufgebaut, dass das hier gehostete Userscript sicher als automatisch aktualisierbares
Tampermonkey-Skript verwendet werden kann. Die Aktualisierung ist aus folgenden Gründen als sicher einzustufen:

### Kontrollierte Quelle

Das Script wird ausschließlich über dieses GitHub-Repository bereitgestellt und über `raw.githubusercontent.com`
ausgeliefert. Nur berechtigte Maintainer mit Schreibrechten können Änderungen vornehmen. Es werden keine externen oder
dynamischen Codes zur Laufzeit nachgeladen.

### Strenge Zugriffskontrollen

Das Repository nutzt die integrierten Sicherheitsmechanismen von GitHub:

* Verpflichtende Zwei-Faktor-Authentifizierung für Maintainer
* Eingeschränkte Schreibrechte
* Branch-Protection-Regeln, die ungeprüfte oder versehentliche Direkt-Commits verhindern

Damit ist sichergestellt, dass nur authentisierte und autorisierte Änderungen veröffentlicht werden.

### Transparente, nachvollziehbare Updates

Jede Änderung am Userscript erfordert:

* Einen expliziten Commit
* Sichtbare Diffs
* Eine Versionsanhebung im Skript-Header

Dadurch entsteht ein klarer Audit-Trail, und jede Änderung ist vor Auslieferung überprüfbar.

### HTTPS-Auslieferung

Installation und Updates erfolgen ausschließlich über HTTPS auf dem GitHub-Raw-Host. Das verhindert Manipulationen
während der Übertragung und stellt die Integrität des ausgelieferten Codes sicher.

### Keine Drittanbieter-Abhängigkeiten

Das Script nutzt keine externen CDNs, keine Remote-Imports und keine dynamisch geladenen Abhängigkeiten. Die gesamte
Ausführungsoberfläche beschränkt sich auf den Code in diesem Repository.
