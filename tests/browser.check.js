// Browser-Smoketest: node tests/browser.check.js (braucht `playwright` mit installiertem Chromium; in CI per npm i --no-save).
// Lädt das Script in eine nachgebaute GitLab-Board-Seite (ohne Tampermonkey: GM_* über localStorage-Shim, Netz abgefangen).
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const {chromium} = require('playwright');

const script = fs.readFileSync(path.join(__dirname, '..', 'portal-gitlab-ticket-progress.js'), 'utf8');
const URL_BOARD = 'https://gitlab.beyonder.de/group/proj/-/boards/1';
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Board</title></head><body>
<div id="js-vue-page-breadcrumbs-wrapper" style="display:flex"><nav>Group / Project / Boards</nav></div>
<div class="boards-app"><div class="boards-list" style="display:flex">
  <div data-testid="board-list" style="width:320px">
    <header data-testid="board-list-header"><div class="board-title-text"><span class="gl-label"><span class="gl-label-text">workflow::WIP</span></span></div>
      <span data-testid="issue-count-badge">1</span><div class="board-list-button-group"></div></header>
    <ul><li data-testid="board-card" class="board-card" data-item-id="11">
      <div class="gl-p-4"><a data-testid="board-card-title-link" href="/group/proj/-/issues/11">Beispiel (3 SP)</a>
      <div class="board-card-footer"><span class="board-card-number">#11</span></div></div></li></ul>
  </div></div></div></body></html>`;

// Tampermonkey-Ersatz: Speicher in localStorage, Netz liefert immer 404 (nichts verlässt den Test)
const SHIM = `
  window.GM_info = {script: {version: ${JSON.stringify(/@version\s+(\S+)/.exec(script)[1])}}};
  window.GM_getValue = (k, d) => { const v = localStorage.getItem('gm:' + k); return v === null ? d : v; };
  window.GM_setValue = (k, v) => localStorage.setItem('gm:' + k, String(v));
  window.GM_deleteValue = (k) => localStorage.removeItem('gm:' + k);
  window.GM_xmlhttpRequest = (o) => setTimeout(() => o.onload && o.onload({status: 404, responseText: '', responseHeaders: ''}), 0);
`;

(async function () {
  const browser = await chromium.launch();
  const context = await browser.newContext({viewport: {width: 1400, height: 900}});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', function (e) { errors.push(String(e)); });
  await page.route('**/*', function (route) {
    const url = route.request().url();
    if (url === URL_BOARD) return route.fulfill({status: 200, contentType: 'text/html', body: PAGE});
    return route.fulfill({status: 404, body: ''});
  });
  await page.goto(URL_BOARD);
  await page.evaluate(function (shim) { (0, eval)(shim); }, SHIM);
  await page.addScriptTag({content: script});

  // Toolbar mit Zahnrad erscheint
  await page.waitForSelector('#ambient-progress-toolbar', {timeout: 5000});
  assert(await page.locator('[aria-controls="ambient-progress-settings"]').count(), 'Zahnrad fehlt');

  // Panel öffnet, hat die vier Tabs
  await page.locator('[aria-controls="ambient-progress-settings"]').click();
  await page.waitForSelector('#ambient-progress-settings.ambient-open', {timeout: 5000});
  const tabs = await page.locator('#ambient-progress-settings [role="tab"]').allInnerTexts();
  ['Anzeige', 'Dieses Board', 'Global', 'Experimente'].forEach(function (name) {
    assert(tabs.some(function (t) { return t.indexOf(name) >= 0; }), 'Tab fehlt: ' + name + ' in ' + tabs.join('|'));
  });

  await page.locator('#ambient-progress-settings [role="tab"]', {hasText: 'Anzeige'}).click(); // unkonfiguriertes Board öffnet auf „Dieses Board“
  // Anzeige: fünf Unterreiter, Vorschau zeichnet, Geld-Schalter vorhanden
  const subtabs = await page.locator('#ambient-progress-settings button[aria-pressed]').allInnerTexts();
  ['Board-Karte', 'Spalten-Header', 'Ticket', 'Merge Request', 'Topbar'].forEach(function (name) {
    assert(subtabs.some(function (t) { return t.indexOf(name) >= 0; }), 'Unterreiter fehlt: ' + name);
  });
  assert(await page.locator('#ambient-progress-settings .ambient-preview-content').count() >= 1, 'Vorschau fehlt');
  // Unterreiter wechseln: Topbar zeigt Finanz-Button-Schalter, Vorschau bleibt gezeichnet
  await page.locator('#ambient-progress-settings button[aria-pressed]', {hasText: 'Topbar'}).click();
  assert.strictEqual(await page.locator('#ambient-progress-settings button[aria-pressed]', {hasText: 'Topbar'}).getAttribute('aria-pressed'), 'true');

  // Global: Toast-Test zeigt der Reihe nach Info, Erfolg, Warnung, unten rechts
  await page.locator('#ambient-progress-settings [role="tab"]', {hasText: 'Global'}).click();
  // Changelog-Gruppe existiert und meldet den Fehlschlag sauber (Netz im Test gesperrt)
  await page.locator('.ambient-panel-toggle', {hasText: 'Was ist neu'}).click();
  await page.waitForSelector('text=Changelog konnte nicht geladen werden');

  await page.locator('.ambient-panel-toggle', {hasText: 'Diagnose & Daten'}).click(); // wartet, bis der Tab eingeblendet ist
  const demo = page.locator('.ambient-setting-row', {hasText: 'Toast-Test'}).locator('button');
  const seen = [];
  for (let i = 0; i < 3; i++) {
    await demo.click();
    await page.waitForSelector('#ambient-progress-toast.ambient-toast-visible');
    seen.push(await page.getAttribute('#ambient-progress-toast', 'data-variant'));
  }
  assert.deepStrictEqual(seen, ['info', 'success', 'warning']);
  const box = await page.locator('#ambient-progress-toast').boundingBox();
  assert(box.x > 700 && box.y > 450, 'Toast gehört nach unten rechts: ' + JSON.stringify(box));
  await page.locator('#ambient-progress-toast .ambient-toast-close').click();
  await page.waitForSelector('#ambient-progress-toast:not(.ambient-toast-visible)');

  // Escape schließt das Panel
  await page.keyboard.press('Escape');
  await page.waitForSelector('#ambient-progress-settings:not(.ambient-open)');

  assert.deepStrictEqual(errors, [], 'Seitenfehler: ' + errors.join('\n'));
  await browser.close();
  console.log('browser.check.js: alle Checks bestanden');
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
