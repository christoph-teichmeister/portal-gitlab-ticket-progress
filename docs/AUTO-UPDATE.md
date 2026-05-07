# Automatische Update-Benachrichtigung

- Das Skript fragt maximal einmal pro Stunde die aktuelle `portal-gitlab-ticket-progress.js` per Raw-URL ab, liest dort
  die Zeile mit `// @version` aus und speichert die Versionsnummer zusammen mit der Raw-URL unter
  `ambientProgressReleaseInfo`, sodass die Badge dann erscheint, wenn eine neue Version erkannt wurde.
- Sobald eine neue Version verfügbar ist, bekommt das Zahnrad einen roten Punkt, und im Dropdown taucht eine Zeile mit
  `⚠️ Neue Version ... verfügbar` auf, die dich daran erinnert, das Tampermonkey-Dashboard zu öffnen, damit du das Script
  dort aktualisieren kannst.
- Die Badge verschwindet wieder, sobald keine neuere Version vorliegt oder die aktuell installierte Version mindestens so
  hoch ist wie die zuletzt gelesene Version.
