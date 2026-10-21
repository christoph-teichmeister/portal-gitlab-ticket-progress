# Automatische Update-Benachrichtigung

- Das Skript fragt maximal einmal pro Stunde die aktuelle `portal-gitlab-ticket-progress.js` per Raw-URL ab, liest dort
  die Zeile mit `// @version` aus und speichert die Versionsnummer zusammen mit der Raw-URL unter
  `ambientProgressReleaseInfo`, sodass die Badge dann erscheint, wenn eine neue Version erkannt wurde.
- Sobald eine neue Version verfügbar ist, bekommt das Zahnrad einen roten Punkt, und oben im
  Einstellungs-Panel erscheint über der Status-Karte ein gelber Kasten `⚠️ Update verfügbar: ...` mit der Anleitung
  (Tampermonkey-Dashboard → Script aktualisieren → Seite neu laden) und den Release-Notes. Der ↻-Knopf daneben lädt nur
  die Portal-Daten neu, er aktualisiert nicht das Script.
- Die Badge verschwindet wieder, sobald keine neuere Version vorliegt oder die aktuell installierte Version mindestens so
  hoch ist wie die zuletzt gelesene Version.
