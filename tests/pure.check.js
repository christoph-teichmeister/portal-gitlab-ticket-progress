// Läuft ohne npm: node tests/pure.check.js
// Zieht reine Funktionen per Klammer-Zählung aus dem Userscript und prüft sie mit assert.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const source = fs.readFileSync(path.join(__dirname, '..', 'portal-gitlab-ticket-progress.js'), 'utf8');

function extract(name) {
  const start = source.indexOf('  function ' + name + '(');
  assert(start >= 0, 'Funktion fehlt: ' + name);
  const open = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error('Klammern unausgewogen: ' + name);
}

const names = ['parseVersionSegments', 'isRemoteVersionGreater', 'formatDuration', 'median',
  'normalizeListNameForMatching', 'normalizeLabelNameForMatching', 'parseTicketActions', 'assigneeSortKey', 'planReorder',
  'extractHourNumber', 'computeEnteredAt', 'parseEstimatePatterns', 'parseEstimate', 'relativeLuminance',
  'parseCssColorToRgb', 'getContrastTextColor', 'formatBookedHoursDisplay', 'isNumericId',
  'parseExtraProjectIds', 'extraProjectIdsFromConfig', 'buildColumnIssueQuery', 'clampClosedDays'];
const isExp = function () { return false; };
const patternsStart = source.indexOf('  const DEFAULT_ESTIMATE_PATTERNS');
const defaultPatterns = source.slice(patternsStart, source.indexOf(';\n', patternsStart) + 1);
const filterStart = source.indexOf('  const BOARD_FILTER_TO_API');
const boardFilterMap = source.slice(filterStart, source.indexOf('};\n', filterStart) + 2);
const code = 'const CLOSED_DAYS_DEFAULT = 28; const CLOSED_DAYS_MAX = 40; const MAX_HOURS_VALUE = 100000; const COLUMN_BLIP_MS = 15 * 60 * 1000;\n' + defaultPatterns + '\n' + boardFilterMap + '\n' + names.map(extract).join('\n') + '\nreturn {DEFAULT_ESTIMATE_PATTERNS,' + names.join(',') + '};';
const fn = new Function('isExp', 'expSetting', 'log', 'warn', 'error', code);
const noop = function () {};
const f = fn(isExp, function (key, fallback) { return fallback; }, noop, noop, noop);

assert.strictEqual(f.isRemoteVersionGreater('2026.10.5', '2026.10.4'), true);
assert.strictEqual(f.isRemoteVersionGreater('2026.10.4', '2026.10.4'), false);
assert.strictEqual(f.isRemoteVersionGreater('2026.9.9', '2026.10.1'), false);

assert.strictEqual(f.clampClosedDays(undefined), 28);
assert.strictEqual(f.clampClosedDays('14'), 14);
assert.strictEqual(f.clampClosedDays(99), 40);
assert.strictEqual(f.clampClosedDays(0), 28);
assert.strictEqual(f.clampClosedDays('abc'), 28);

assert.strictEqual(f.formatDuration(30 * 60000), '30min');
assert.strictEqual(f.formatDuration(5 * 3600000), '5h');
assert.strictEqual(f.formatDuration(10 * 86400000), '10d');

assert.strictEqual(f.median([3, 1, 2]), 2);
assert.strictEqual(f.median([1, 2, 3, 10]), 2.5);

const actions = f.parseTicketActions('[Ticket schließen]\n/close\n\n[Zurück]\n/label ~"workflow::WIP"');
assert.strictEqual(actions.length, 2);
assert.strictEqual(actions[0].label, 'Ticket schließen');
assert.strictEqual(actions[1].body, '/label ~"workflow::WIP"');

const U = function (id) { return {iid: id, id: id * 10, assignees: []}; };
const A = function (id) { return {iid: id, id: id * 10, assignees: [{}]}; };
assert.deepStrictEqual(f.planReorder([U(1), A(2), U(3), A(4), U(5)], 'unassigned'),
  [{iid: 3, move_after_id: 10}, {iid: 5, move_after_id: 30}]);
assert.deepStrictEqual(f.planReorder([A(1), U(2), U(3)], 'unassigned'),
  [{iid: 2, move_before_id: 10}, {iid: 3, move_after_id: 20}]);
assert.deepStrictEqual(f.planReorder([U(1), U(2)], 'unassigned'), []);
assert.deepStrictEqual(f.planReorder([A(1), A(2)], 'unassigned'), []);

assert.strictEqual(f.extractHourNumber('16.25h'), 16.25);
assert.strictEqual(f.extractHourNumber('1.234,5h'), 1234.5);

const N = function (id, name) { return {iid: id, id: id * 10, assignees: name ? [{name: name}] : []}; };
// Zielreihenfolge: Unassigned, dann Anna (2, 4), dann Bob (1, 3)
const grouped = f.planReorder([N(1, 'Bob'), N(2, 'Anna'), N(3, 'Bob'), N(4, 'Anna'), N(5)], 'assignee');
assert.deepStrictEqual(grouped, [{iid: 5, move_before_id: 10}, {iid: 2, move_after_id: 50}, {iid: 4, move_after_id: 20}]);

console.log('pure.check.js: alle Checks bestanden');

// computeEnteredAt: Ausrutscher (kurz in B, zurück in A) zählen nicht; Label nicht mehr am Ticket → null
{
  const ev = function (action, name, iso) { return {action: action, label: {name: name}, created_at: iso}; };
  const a = 'workflow::A';
  const b = 'workflow::B';
  const events = [
    ev('add', a, '2026-10-01T08:00:00Z'), ev('remove', a, '2026-10-03T09:00:00Z'), ev('add', b, '2026-10-03T09:00:00Z'),
    ev('remove', b, '2026-10-03T09:05:00Z'), ev('add', a, '2026-10-03T09:05:00Z')
  ];
  const target = f.normalizeLabelNameForMatching(a);
  // A: kurz weg (5 min) → Aufenthalt zählt ab erstem Eintritt
  assert.strictEqual(f.computeEnteredAt(events, target).toISOString(), '2026-10-01T08:00:00.000Z');
  // B: nicht mehr am Ticket → null (kein veralteter alter Eintritt)
  assert.strictEqual(f.computeEnteredAt(events, f.normalizeLabelNameForMatching(b)), null);
  // lange Abwesenheit (1 Tag) → neuer Aufenthalt
  const longGap = [ev('add', a, '2026-10-01T08:00:00Z'), ev('remove', a, '2026-10-01T10:00:00Z'), ev('add', a, '2026-10-02T10:00:00Z')];
  assert.strictEqual(f.computeEnteredAt(longGap, target).toISOString(), '2026-10-02T10:00:00.000Z');
}
console.log('computeEnteredAt ok');

// parseEstimate: Standard-Muster wie der Portal-Syncer, eigene Muster zeilenweise, kaputte Zeilen werden gemeldet
{
  const defaults = f.parseEstimatePatterns(f.DEFAULT_ESTIMATE_PATTERNS);
  assert.deepStrictEqual(defaults.errors, []);
  const est = function (title) { return f.parseEstimate(title, defaults.patterns); };
  assert.deepStrictEqual(est('Login bauen (3 SP)'), {kind: 'sp', label: '3 SP', cleanTitle: 'Login bauen'});
  assert.deepStrictEqual(est('[0,5 sp] Typo fixen'), {kind: 'sp', label: '0,5 SP', cleanTitle: 'Typo fixen'});
  assert.deepStrictEqual(est('Recherche (Timebox: 4h)'), {kind: 'timebox', label: 'Timebox 4h', cleanTitle: 'Recherche'});
  assert.deepStrictEqual(est('Recherche [Spike 1.5h] Teil 2'), {kind: 'timebox', label: 'Timebox 1.5h', cleanTitle: 'Recherche Teil 2'});
  assert.deepStrictEqual(est('Timebox (Spike: 2,5h)'), {kind: 'timebox', label: 'Timebox 2,5h', cleanTitle: 'Timebox'});
  assert.deepStrictEqual(est('Ohne Schätzung (v2)'), {kind: 'none', label: '? SP', cleanTitle: 'Ohne Schätzung (v2)'});

  const custom = f.parseEstimatePatterns('SP: \\{(\\d+)\\}\n\nfoo: x\nsp: (unclosed');
  assert.deepStrictEqual(custom.errors, ['foo: x', 'sp: (unclosed']);
  assert.deepStrictEqual(f.parseEstimate('Ticket {5}', custom.patterns), {kind: 'sp', label: '5 SP', cleanTitle: 'Ticket'});
}
console.log('parseEstimate ok');

// SP-Summe: Spalten-Label + Board-Filter aus der URL → Issues-API; Closed ohne Label, unbekannte Filter fallen weg
{
  assert.strictEqual(f.buildColumnIssueQuery('', 'workflow::Review'), 'labels=workflow%3A%3AReview&state=opened');
  assert.strictEqual(
    f.buildColumnIssueQuery('?label_name[]=RAG-Suche%20-%20MVP&assignee_username=chris&foo=1', 'Doing'),
    'assignee_username=chris&labels=Doing%2CRAG-Suche%20-%20MVP&state=opened');
  assert.strictEqual(f.buildColumnIssueQuery('?not[label_name][]=Bug', null), 'not%5Blabels%5D=Bug&state=closed');
}
console.log('buildColumnIssueQuery ok');

// Farben: rgb()/rgba() (auch Leerzeichen-Syntax) und #rgb/#rrggbb(aa); Unbekanntes → null
{
  assert.deepStrictEqual(f.parseCssColorToRgb('#abc'), {r: 170, g: 187, b: 204});
  assert.deepStrictEqual(f.parseCssColorToRgb('#1F75CBff'), {r: 31, g: 117, b: 203});
  assert.deepStrictEqual(f.parseCssColorToRgb('rgba(10, 20, 30, 0.5)'), {r: 10, g: 20, b: 30});
  assert.deepStrictEqual(f.parseCssColorToRgb('rgb(10 20 30 / 50%)'), {r: 10, g: 20, b: 30});
  assert.strictEqual(f.parseCssColorToRgb('red'), null);
  assert.strictEqual(f.getContrastTextColor('#ffffff', '#1f2937', '#fff'), '#1f2937');
  assert.strictEqual(f.getContrastTextColor('#000'), '#f8fafc');
}
console.log('colors ok');

// Stunden-Anzeige: Zahl oder Text, gerundet auf zwei Stellen, nie „-0h"
{
  assert.strictEqual(f.formatBookedHoursDisplay(6.5), '6.5h');
  assert.strictEqual(f.formatBookedHoursDisplay(6.4999999), '6.5h');
  assert.strictEqual(f.formatBookedHoursDisplay('11,75h'), '11.75h');
  assert.strictEqual(f.formatBookedHoursDisplay(-0), '0h');
  assert.strictEqual(f.formatBookedHoursDisplay(null), null);
  assert.strictEqual(f.formatBookedHoursDisplay('—'), null);
}
console.log('formatBookedHoursDisplay ok');

// Spaltennamen: angehängte Klammer-Zusätze weg, klein geschrieben
{
  assert.strictEqual(f.normalizeListNameForMatching('Review (3)'), 'review');
  assert.strictEqual(f.normalizeListNameForMatching('In Arbeit (WIP) (2) '), 'in arbeit');
  assert.strictEqual(f.normalizeListNameForMatching('(Backlog) Ideen'), '(backlog) ideen');
  assert.strictEqual(f.normalizeListNameForMatching(null), '');
}
console.log('normalizeListNameForMatching ok');

// Weitere Projekt-IDs pro Board: gespeicherter Wert gewinnt, sonst Migration aus dem alten „zweiten Portal-Projekt"
{
  assert.strictEqual(f.extraProjectIdsFromConfig({extraProjectIds: '1, 2'}), '1, 2');
  assert.strictEqual(f.extraProjectIdsFromConfig({extraProjectIds: ''}), '');
  assert.strictEqual(f.extraProjectIdsFromConfig({portalProjectId2: '4712', useSecondPortalProjectId: true}), '4712');
  assert.strictEqual(f.extraProjectIdsFromConfig({portalProjectId2: '4712', useSecondPortalProjectId: false}), '');
  assert.strictEqual(f.extraProjectIdsFromConfig(null), '');
  assert.deepStrictEqual(f.parseExtraProjectIds(' 1,2;3  4 '), ['1', '2', '3', '4']);
}
console.log('extraProjectIdsFromConfig ok');
