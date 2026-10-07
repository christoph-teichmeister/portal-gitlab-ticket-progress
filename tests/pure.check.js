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

const names = ['parseVersionSegments', 'normalizeVersionValue', 'isRemoteVersionGreater', 'formatDuration', 'median',
  'normalizeListNameForMatching', 'normalizeLabelNameForMatching', 'parseTicketActions', 'assigneeSortKey', 'planReorder',
  'extractHourNumber'];
const isExp = function () { return false; };
const code = 'const MAX_HOURS_VALUE = 100000;\n' + names.map(extract).join('\n') + '\nreturn {' + names.join(',') + '};';
const fn = new Function('isExp', 'expSetting', 'log', 'warn', 'error', code);
const noop = function () {};
const f = fn(isExp, function (key, fallback) { return fallback; }, noop, noop, noop);

assert.strictEqual(f.isRemoteVersionGreater('2026.10.5', '2026.10.4'), true);
assert.strictEqual(f.isRemoteVersionGreater('2026.10.4', '2026.10.4'), false);
assert.strictEqual(f.isRemoteVersionGreater('2026.9.9', '2026.10.1'), false);

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
