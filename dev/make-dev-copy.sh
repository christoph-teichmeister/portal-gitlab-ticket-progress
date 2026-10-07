#!/bin/bash
# Erzeugt dev/L-portal-gitlab-ticket-progress.js: Name mit "L "-Präfix, ohne @updateURL/@downloadURL.
# Zum Einfügen in den Tampermonkey-Editor, damit das lokale Testscript neben dem Original läuft.
cd "$(dirname "$0")/.." || exit 1
sed -e 's|^// @name         Portal GitLab Ticket Progress|// @name         L Portal GitLab Ticket Progress|' \
    -e '/^\/\/ @updateURL/d' -e '/^\/\/ @downloadURL/d' \
    portal-gitlab-ticket-progress.js > dev/L-portal-gitlab-ticket-progress.js
echo "dev/L-portal-gitlab-ticket-progress.js erzeugt"
