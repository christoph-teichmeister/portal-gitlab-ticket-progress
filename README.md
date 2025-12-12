# Portal GitLab Ticket Progress

Dieses Tampermonkey-Skript ergänzt die GitLab-Issue-Boards auf `gitlab.ambient-innovation.com` mit einer eingebetteten
Fortschrittsanzeige aus dem Portal. Es liest die dort gebuchten Stunden und zeigt sie als Progressbar in
ausgewählten Spalten an, inklusive eines Buttons, der direkt ins Portal führt.

## Installation (Tampermonkey lädt direkt von GitHub)

Die Datei `portal-gitlab-ticket-progress.js` in diesem Repository ist das volle Tampermonkey-Skript; Tampermonkey lädt
sie direkt von GitHub, wenn du die RAW-URL verwendest, damit alle Nutzer automatisch die neueste Version bekommen.

1. Öffne das Tampermonkey-Dashboard (Icon in der Erweiterungsleiste → "Dashboard").
2. Klicke auf "Utilities" / "Hilfsmittel" und wähle "Import from URL" / "Von URL importieren", statt ein neues Skript
   anzulegen.
3. Gib die RAW-URL ein:

   ```text
   https://raw.githubusercontent.com/christoph-teichmeister/portal-gitlab-ticket-progress/refs/heads/main/portal-gitlab-ticket-progress.js
   ```

   Die URL verweist auf dieselbe `portal-gitlab-ticket-progress.js`, die in diesem Repo liegt.
4. Tampermonkey zeigt Name/Version/Berechtigungen und du bestätigst mit "Installieren". Das Script wird auf
   `https://gitlab.ambient-innovation.com/*/*/-/boards*` aktiv.
5. Die `@updateURL`/`@downloadURL` im Skriptkopf halten alles automatisch aktuell – nach der einmaligen Installation
   liefert Tampermonkey neue Versionen direkt aus diesem Repo.
6. Über die Debug/Anzeige-Toggles in der GitLab-Topbar kannst du das Verhalten bei Bedarf ein- oder ausschalten. Die
   Toggles hängen direkt rechts vom oberen Menü und bleiben beim Scrollen sichtbar; Debug ist standardmäßig aus, die
   Anzeige (Badges) standardmäßig an.
7. Klicke in der GitLab-Topbar auf das Zahnrad, um die „Projekt-Konfiguration“ zu öffnen, und trage dort die
   Portal-Base-URL ein (z. B. `https://user-portal.arbeitgeber.com`). Die Einstellung wird ausschließlich lokal im
   Browser gespeichert (per Projekt). Du musst sie nur einmal hinterlegen.
8. Wenn die Portal-Base-URL fehlt, blendet das Script einen kleinen Toast von oben rechts ein („Portal-Base URL fehlt –
   ⚙ → Projekt-Konfiguration öffnen und eintragen.“). Nach fünf Sekunden verschwindet der Hinweis wieder; du kannst
   ihn bei Bedarf erneut triggern, indem du das Zahnrad öffnest.

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

## Wesentliche Features

- Platziert eine Toolbar rechts in der GitLab-Topbar, zeigt dort Versionslabel, `Anzeigen`- und `Debug`-Toggles,
  einen Gear-Button sowie die „Cache leeren“- und „Einstellungen speichern“-Actions.
- Fügt pro Board-Spalte eine Checkbox direkt neben dem Spalten-Titel ein, damit du die Listen zur Progress-Anzeige
  ein- oder ausschaltest. Die Auswahl wird lokal gespeichert (haftet an den Projekt-Keys) und aktiviert den
  expliziten Modus, wenn du manuell eingreifst.
- Fügt pro Board-Karte ein Overlay-Badge ein, das eine farbige Progressbar, `spent`/`remaining`-Labels (oder
  Over-/Booked-Hours-Fallback) sowie einen `↗`-Button zum entsprechenden Portal-Ticket enthält.
- Zeigt die gleichen Progressdaten direkt im Issue-Detail unterhalb der Teilnehmer-Liste an, sofern die Ansicht
  geladen ist.
- Lädt die Daten über `GM_xmlhttpRequest` aus dem Portal, cached sie lokal (5-min TTL) und blockiert weitere
  Requests nach Fehlern (403/404), bis du den Cache leerst oder die Portal-URL neu speicherst.
- Beobachtet das Board via `MutationObserver`, reagiert auf neue Karten/Listen und führt bei Bedarf neue Scans aus.

## Konfiguration & Erweiterung

- Die Projekte (Projektpfad, Projekt-ID, voreingestellte Listen) können initial im `HOST_CONFIG` stehen. Das
  Script liest diesen Sockel und überschreibt ihn mit den lokal gespeicherten Einträgen aus `ambientProgressProjectConfigs`
  bzw. `ambientProgressListSelections`, sobald du die Projekt-ID/Portal-Base-URL oder die Listenauswahl änderst.
- Der Gear-Dropdown bietet ein Formular für Projekt-ID und Portal-Base-URL; Werte werden normalisiert (`https://`-Prefix,
  Trailing-Slash entfernt), in LocalStorage gespeichert und mit einem Reload sofort aktiv („Einstellungen speichern“).
- Die Portal-URL besteht aus der Base + `/management/project/{projectId}/booking-label/#` + IID; ohne gültige Projekt-ID
  oder Base wird kein Request abgesendet und es erscheint ein gelber Toast.
- Das Parsing der Portal-Seite schaut zuerst nach `div.progress`-Elementen mit `progress-bar`, dann nach Inline- oder
  Tabellenwerten zu „Booked Hours“, um `spent`/`remaining`/`over` sinnvoll abzuleiten.

## Lokale Controls

- **Debug** (`portalProgressDebug`): aktiviert `console.log` und zeigt zusätzliche Informationen im Browser-Console-Log.
- **Anzeigen** (`portalProgressShow`): blendet die Badges und Detail-Widgets ein/aus; beim Aktivieren wird das Board
  erneut gescannt, beim Deaktivieren werden die Badges lediglich ausgeblendet.
- **Listen-Checkboxes**: Aktivierte Listen werden im Cache gespeichert; sobald du eine Spalte per Checkbox erlaubst oder
  deaktivierst, wechselt das Script in den expliziten Modus und speichert die Auswahl unter dem Projektschlüssel.
- **Cache leeren**: Entfernt alle gespeicherten Progress-Daten, hebt eventuell gesetzte Request-Blocks und triggert
  neue Scans sowie einen grünen Toast („Cache geleert“).
- **Fehlerzustände & Portal-Hinweise**: Hilfreiche Toasts warnen bei fehlender Portal-Base, 403/404-Block(-Wiederholung) oder
  dem erfolgreichen Speichern von Einstellungen; die Warnung zu fehlender Base meldet sich maximal alle zwei Minuten.
- **Einstellungen speichern**: Nach erfolgreichem Speichern der Projekt-ID bzw. Portal-Base-URL siehst du ein Erfolgstoast
  und die Seite lädt sich neu, damit die neuen Werte sofort greifen.

## Hinweise

- Das Skript geht davon aus, dass eine Session beim Portal existiert (`withCredentials: true`). Werden nicht alle Daten
  geladen, liegt es meist an einem fehlenden Login, einer falschen Base-URL oder einem blockierten Request nach einem
  403/404.
- Die Render-Logik nutzt ausschließlich DOM-Manipulation; Badges werden mit `z-index: 20` platziert, weil sie sonst
  von GitLab-Elementen überdeckt wären.
- MutationObserver beobachten das Board und triggern bei frisch geladenen Listen oder Karten neue Scans; Ähnliche
  Mechanismen sorgen dafür, dass Issue-Detailansichten (Teilnehmer-Sektion) synchron mit den Board-Badges bleiben.
