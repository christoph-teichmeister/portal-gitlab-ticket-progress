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
