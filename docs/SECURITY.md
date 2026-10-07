# Sicherheitsaspekte

Dieses Repository ist so aufgebaut, dass das hier gehostete Userscript sicher als automatisch aktualisierbares
Tampermonkey-Skript verwendet werden kann. Die Aktualisierung ist aus folgenden Gründen als sicher einzustufen:

## Kontrollierte Quelle

Das Script wird ausschließlich über dieses GitHub-Repository bereitgestellt und über `raw.githubusercontent.com`
ausgeliefert. Nur berechtigte Maintainer mit Schreibrechten können Änderungen vornehmen. Es werden keine externen oder
dynamischen Codes zur Laufzeit nachgeladen.

## Strenge Zugriffskontrollen

Das Repository nutzt die integrierten Sicherheitsmechanismen von GitHub:

* Verpflichtende Zwei-Faktor-Authentifizierung für Maintainer
* Eingeschränkte Schreibrechte
* Branch-Protection-Regeln, die ungeprüfte oder versehentliche Direkt-Commits verhindern

Damit ist sichergestellt, dass nur authentisierte und autorisierte Änderungen veröffentlicht werden.

## Transparente, nachvollziehbare Updates

Jede Änderung am Userscript erfordert:

* Einen expliziten Commit
* Sichtbare Diffs
* Eine Versionsanhebung im Skript-Header

Dadurch entsteht ein klarer Audit-Trail, und jede Änderung ist vor Auslieferung überprüfbar.

## HTTPS-Auslieferung

Installation und Updates erfolgen ausschließlich über HTTPS auf dem GitHub-Raw-Host. Das verhindert Manipulationen
während der Übertragung und stellt die Integrität des ausgelieferten Codes sicher.

## Keine Drittanbieter-Abhängigkeiten

Das Script nutzt keine externen CDNs, keine Remote-Imports und keine dynamisch geladenen Abhängigkeiten. Die gesamte
Ausführungsoberfläche beschränkt sich auf den Code in diesem Repository.

## Schutzmaßnahmen im Script

* `@match` beschränkt das Script auf `gitlab.beyonder.de`; `@connect` gibt nur `raw.githubusercontent.com` (Update-Check)
  vorab frei, die Portal-Domain bestätigst du einmalig in Tampermonkey.
* Die Portal-Base-URL wird beim Speichern und Lesen validiert: nur `https:`, keine Zugangsdaten in der URL.
* Portal-Antworten werden als Text geparst und nie als HTML in die Seite eingefügt; Stundenwerte werden auf einen
  plausiblen Bereich begrenzt, die Antwortgröße ist gedeckelt. Login-Seiten werden erkannt und als „nicht angemeldet“
  gemeldet.
* GitLab-API-Aufrufe laufen über einen einzigen Helfer: nur same-origin-Pfade, CSRF-Token nur bei schreibenden
  Requests (fehlt es, wird nicht gesendet), IIDs werden als Zahlen validiert. Quick Actions wie `/close`, `/merge`,
  `/reopen`, `/delete`, `/move` müssen vor dem Absenden bestätigt werden.
* Externe Links werden nur über `https:` (Portal) bzw. same-origin (GitLab) mit `noopener,noreferrer` geöffnet.
* Debug-Logs enthalten keine Portal-URLs oder Antwortinhalte.

## Vertrauensmodell der Updates

Das Script wird aus dem `main`-Branch ausgeliefert und läuft mit der GitLab-Session des Nutzers. Wer Schreibzugriff auf
das Repository hat, könnte also Code ausliefern, der in dieser Session handelt. Deshalb: 2FA und Branch-Protection
(siehe oben) und – für höhere Anforderungen – ein auf einen Release-Tag gepinnter Update-Link.
