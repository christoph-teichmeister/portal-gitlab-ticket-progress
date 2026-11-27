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
  'parseLooseNumber', 'extractHourNumber', 'computeEnteredAt', 'parseEstimatePatterns', 'parseEstimate', 'relativeLuminance',
  'parseCssColorToRgb', 'getContrastTextColor', 'formatBookedHoursDisplay', 'isNumericId',
  'parseExtraProjectIds', 'activityTone', 'newestTimestamp', 'parseBookingDate', 'extraProjectIdsFromConfig', 'buildColumnIssueQuery', 'clampClosedDays', 'mapApiProgress', 'normalizeMilestoneSp', 'milestoneSpToShow', 'milestoneSpQuery', 'sumHoursByEmployee', 'personHourlyRate', 'computeTicketCost', 'buildCostInfo', 'formatEuro', 'formatSignedEuro', 'formatEuroShort', 'costTooltipSuffix', 'marginLabel', 'buildRoleShares', 'parseProjectFinanceFromHtml', 'buildFinanceRows', 'effectiveSpPrice', 'parseHoursHM', 'monthKeyOf', 'addMonthsKey', 'monthLabel', 'monthRangeParams', 'roleAtDate', 'buildMonthReport', 'adminRatesFromRows', 'escalationLimitsFromFields', 'limitForSp', 'parseQuotaText', 'monthSpanLength', 'resolvePeriodSpan', 'sumMonthSpan', 'effectiveCostMode', 'formatStand', 'isInternalCategory', 'formatHours', 'parseChangelog', 'summarizeChangelogNotes'];
const isExp = function () { return false; };
const patternsStart = source.indexOf('  const DEFAULT_ESTIMATE_PATTERNS');
const defaultPatterns = source.slice(patternsStart, source.indexOf(';\n', patternsStart) + 1);
const filterStart = source.indexOf('  const BOARD_FILTER_TO_API');
const boardFilterMap = source.slice(filterStart, source.indexOf('};\n', filterStart) + 2);
const code = 'const ACTIVITY_FRESH_MS = 3 * 86400000; const ACTIVITY_STALE_MS = 7 * 86400000; const CLOSED_DAYS_DEFAULT = 28; const CLOSED_DAYS_MAX = 40; const MAX_HOURS_VALUE = 100000; const COLUMN_BLIP_MS = 15 * 60 * 1000; const MONTH_NAMES = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"]; const ACTIVITY_BOOKINGS_MAX = 8; const HOURS_PER_DAY = 8; const WARN_PCT = 80; const DEFAULT_HOURS_PER_SP = 8;\n' + defaultPatterns + '\n' + boardFilterMap + '\n' + names.map(extract).join('\n') + '\nreturn {DEFAULT_ESTIMATE_PATTERNS,' + names.join(',') + '};';
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

// Aktivitäts-Chip: Farbstufe nach Alter, jüngster Zeitpunkt aus gemischten Quellen
{
  assert.strictEqual(f.activityTone(5 * 3600000), 'fresh');
  assert.strictEqual(f.activityTone(3 * 86400000), 'aging');
  assert.strictEqual(f.activityTone(6.9 * 86400000), 'aging');
  assert.strictEqual(f.activityTone(7 * 86400000), 'stale');
  assert.strictEqual(f.newestTimestamp([undefined, null, '2026-10-20T10:00:00Z', 5, NaN, '2026-10-21T08:00:00Z']), Date.parse('2026-10-21T08:00:00Z'));
  assert.strictEqual(f.newestTimestamp([undefined, null, 'kaputt']), null);
  assert.strictEqual(f.newestTimestamp([]), null);
}
console.log('activity helpers ok');

// Buchungsdatum aus der Portal-Tabelle: deutsch oder ISO, ungültige Tage und Fremdtext → null
{
  assert.strictEqual(f.parseBookingDate('14.10.2026'), new Date(2026, 9, 14).getTime());
  assert.strictEqual(f.parseBookingDate('2026-10-14'), new Date(2026, 9, 14).getTime());
  assert.strictEqual(f.parseBookingDate('31.02.2026'), null);
  assert.strictEqual(f.parseBookingDate('gestern'), null);
  assert.strictEqual(f.parseBookingDate(null), null);
}
console.log('parseBookingDate ok');

// API-Eintrag → Fortschritt: ohne Buchungen null, remaining/over nur wenn > 0
{
  assert.strictEqual(f.mapApiProgress({found: false}), null);
  assert.strictEqual(f.mapApiProgress(undefined), null);
  assert.deepStrictEqual(f.mapApiProgress({found: true, booked: 4.5, remaining: 2, over: 0}),
    {spent: '4.5h', remaining: '2h', over: null, booked: '4.5h', bookedLabel: 'Booked Hours', bookings: [], hoursByEmployee: {}});
  const withBookings = f.mapApiProgress({found: true, booked: 3, remaining: 0, over: 0, bookings: [
    {date: '2026-10-27', title: 'Ältere', employee: 'A', hours: 1},
    {date: '2026-10-28', title: '[censored]', employee: 'B', hours: 2},
    {date: 'kaputt', title: 'x', employee: 'C', hours: 1}]});
  assert.deepStrictEqual(withBookings.bookings.map(function (b) { return b.title; }), ['[censored]', 'Ältere']);
  assert.strictEqual(withBookings.bookings[0].hours, '2h');
  assert.strictEqual(f.mapApiProgress({found: true, booked: 12, remaining: 0, over: 1.5}).over, '1.5h');
}
console.log('mapApiProgress ok');

// Meilenstein-SP: kaputte Einträge fallen raus, „nur Board-Filter“ zeigt nur den gefilterten Meilenstein
{
  const entries = f.normalizeMilestoneSp([{name: ' M1 ', sold: '10'}, {name: 'M2', sold: 5, show: false}, {name: '', sold: 20}, {name: 'M3', sold: 'x'}, {name: 'M4', sold: ''}, null]);
  assert.deepStrictEqual(entries, [{name: 'M1', sold: 10, show: true}, {name: 'M2', sold: 5, show: false}, {name: '', sold: 20, show: true}]);
  assert.deepStrictEqual(f.normalizeMilestoneSp('kaputt'), []);
  assert.deepStrictEqual(f.milestoneSpToShow(entries, '', false).map(function (e) { return e.name; }), ['M1', '']);
  assert.deepStrictEqual(f.milestoneSpToShow(entries, '?milestone_title=M1', true).map(function (e) { return e.name; }), ['M1', '']);
  assert.deepStrictEqual(f.milestoneSpToShow(entries, '?milestone_title=M9', true).map(function (e) { return e.name; }), ['']);
  assert.strictEqual(f.milestoneSpQuery('Sprint 1'), 'milestone=Sprint%201&state=all');
  assert.strictEqual(f.milestoneSpQuery(''), 'state=all');
}
console.log('milestoneSp ok');

// Kostenrechnung
{
  const hours = f.sumHoursByEmployee([{employee: 'A', hours: '1.5h'}, {employee: 'A', hours: '2'}, {employee: 'B', hours: '1,5'}, {employee: '', hours: '3'}]);
  assert.deepStrictEqual(hours, {A: 3.5, B: 1.5});
  const people = [{name: 'A', role: 'Web (Level 3)', daily: 800}, {name: 'B', role: 'SM (Level 2)', daily: 600}];
  const rates = {'Web (Level 3)': 60};
  assert.deepStrictEqual(f.computeTicketCost(hours, people, rates, 'internal'), {cost: 210, missing: ['B']});
  assert.deepStrictEqual(f.computeTicketCost(hours, people, rates, 'external'), {cost: 350 + 112.5, missing: []});
  assert.deepStrictEqual(f.computeTicketCost({'X Y': 1}, people, rates, 'internal'), {cost: 0, missing: ['X Y']});
  console.log('computeTicketCost ok');
}

{
  const people = [{name: 'A', role: 'Web', daily: 800}];
  const hrs = {A: 10, B: 2};
  const info = f.buildCostInfo(hrs, people, {Web: 100}, 'internal', 3, 500);
  assert.deepStrictEqual(info, {mode: 'internal', cost: 1000, hours: 10, missing: ['B'], revenue: 1500, margin: 500, breakEvenHours: 15});
  assert.strictEqual(f.buildCostInfo(hrs, people, {Web: 100}, 'internal', null, 500).margin, null);
  const ext = f.buildCostInfo(hrs, people, {Web: 100}, 'external', 3, 500);
  assert.deepStrictEqual([ext.cost, ext.revenue, ext.margin], [800 * 10 / 8, 1500, 1500 - 1000]);
  assert(/Abstand zum SP-Preis \+500/.test(f.costTooltipSuffix(ext, 3)));
  assert.strictEqual(f.marginLabel('internal'), 'Marge');
  assert.strictEqual(f.buildCostInfo(hrs, [], {}, 'internal', 3, 500), null);
  assert(/Marge \+500/.test(f.costTooltipSuffix(info, 3)));
  const shares = f.buildRoleShares([{role: 'Dev', hours: 30, cost: 3000}, {role: 'PO', hours: 10, cost: 1500}, {role: null, hours: 0, cost: null}]);
  assert.deepStrictEqual(shares.map(function (e) { return [e.role, Math.round(e.hoursShare), Math.round(e.costShare)]; }), [['Dev', 75, 67], ['PO', 25, 33], ['Ohne Rolle', 0, 0]]);
  console.log('buildCostInfo ok');
}

{
  assert.strictEqual(f.parseLooseNumber('97,200.00€'), 97200);
  assert.strictEqual(f.parseLooseNumber('97.200,00 €'), 97200);
  assert.strictEqual(f.parseLooseNumber('Total: 43.50 hrs.'), 43.5);
  assert.strictEqual(f.extractHourNumber('150000'), null);
  const people = [{name: 'A', role: 'Web', daily: 800}];
  const model = f.buildFinanceRows([{name: 'A', hours: 10}, {name: 'X', hours: 5}, {name: 'Y', hours: 2}], people, {X: 'Web'}, {Web: 100}, 'internal');
  assert.strictEqual(model.total, 1500);
  assert.strictEqual(model.missing, 1);
  assert.deepStrictEqual(model.rows.map(function (r) { return r.name; }), ['A', 'X', 'Y']);
  assert.strictEqual(f.buildFinanceRows([{name: 'X', hours: 8}], people, {X: 'Web'}, {}, 'external').total, 800);
  console.log('finance ok');
}

{
  assert.strictEqual(f.parseHoursHM('1:30'), 1.5);
  assert.strictEqual(f.parseHoursHM('0:15'), 0.25);
  assert.strictEqual(f.parseHoursHM('2.5'), 2.5);
  assert.strictEqual(f.addMonthsKey('2026-01', -1), '2025-12');
  assert.strictEqual(f.addMonthsKey('2026-11', 3), '2027-02');
  assert.strictEqual(f.monthLabel('2026-03'), 'März 2026');
  assert.deepStrictEqual(f.monthRangeParams('2026-09', '2026-11'), {start: '01/09/2026', end: '30/11/2026'});
  assert.deepStrictEqual(f.monthRangeParams('2024-01', '2024-02'), {start: '01/01/2024', end: '29/02/2024'});
  const day = function (y, m, d) { return new Date(y, m - 1, d).getTime(); };
  const history = [{from: day(2026, 10, 21), role: 'Web (Level 3)'}, {from: day(2024, 2, 1), role: 'Web (Level 2+)'}];
  assert.strictEqual(f.roleAtDate(history, day(2026, 11, 5), 'X'), 'Web (Level 3)');
  assert.strictEqual(f.roleAtDate(history, day(2026, 9, 5), 'X'), 'Web (Level 2+)');
  assert.strictEqual(f.roleAtDate(history, day(2020, 1, 1), 'X'), 'Web (Level 2+)');
  assert.strictEqual(f.roleAtDate([], day(2026, 9, 5), 'X'), 'X');
  assert.strictEqual(f.effectiveSpPrice({spPricing: false, spPrice: 900}), null);
  assert.strictEqual(f.effectiveSpPrice({spPricing: true, spPrice: 900}), 900);
  assert.strictEqual(f.effectiveSpPrice({spPricing: true, spPrice: null}), null);
  // Level-Wechsel am 21.10.: Oktober-Stunden vorher Level 2+ (55), danach Level 3 (60)
  const rows = [
    {name: 'A', path: '/a', ts: day(2026, 10, 10), hours: 10},
    {name: 'A', path: '/a', ts: day(2026, 10, 25), hours: 10},
    {name: 'A', path: '/a', ts: day(2026, 11, 3), hours: 5},
    {name: 'B', path: '', ts: day(2026, 11, 3), hours: 2}
  ];
  const rep = f.buildMonthReport(rows, {'/a': history}, [], {}, {'Web (Level 2+)': 55, 'Web (Level 3)': 60}, 'internal');
  assert.strictEqual(rep.months['2026-10'].cost, 10 * 55 + 10 * 60);
  assert.strictEqual(rep.months['2026-11'].cost, 5 * 60);
  assert.strictEqual(rep.months['2026-11'].persons.B.missing, true);
  assert.strictEqual(rep.months['2026-11'].persons.B.cost, 0);
  assert.deepStrictEqual(rep.roles.sort(), ['Web (Level 2+)', 'Web (Level 3)']);
  assert.deepStrictEqual(f.resolvePeriodSpan('last:3', '2026-11'), {first: '2026-09', last: '2026-11', len: 3});
  assert.deepStrictEqual(f.resolvePeriodSpan('year', '2026-11'), {first: '2026-01', last: '2026-11', len: 11});
  assert.deepStrictEqual(f.resolvePeriodSpan('custom', '2026-11', '2026-10', '2026-08'), {first: '2026-08', last: '2026-10', len: 3});
  assert.deepStrictEqual(f.resolvePeriodSpan('2026-10', '2026-11'), {first: '2026-10', last: '2026-10', len: 1});
  assert.strictEqual(f.resolvePeriodSpan('all', '2026-11'), null);
  const sum = f.sumMonthSpan(rep.months, '2026-10', '2026-11');
  assert.strictEqual(sum.cost, 10 * 55 + 10 * 60 + 5 * 60);
  assert.strictEqual(sum.persons.A.hours, 25);
  assert.strictEqual(sum.persons.B.missing, true);
  assert.strictEqual(f.sumMonthSpan(rep.months, '2026-01', '2026-02'), undefined);
  assert.strictEqual(f.formatEuroShort(10800), '10,8k €');
  assert.strictEqual(f.formatEuroShort(4500), f.formatEuro(4500));
  assert.strictEqual(f.formatEuroShort(1250000), '1,3M €');
  const adminRates = f.adminRatesFromRows([{level: '3', role: 'Developer', internal: '60.00000'}, {level: '1+', role: 'Operations', internal: '40,5'}, {level: '1', role: 'X', internal: '0.00000'}]);
  assert.deepStrictEqual(adminRates, {'Developer (Level 3)': 60, 'Operations (Level 1+)': 40.5});
  const lim = f.escalationLimitsFromFields([
    {name: 'story_point_configuration-1-story_points', value: '1'}, {name: 'story_point_configuration-1-hours_warning', value: '6'}, {name: 'story_point_configuration-1-hours_escalation', value: '8'},
    {name: 'story_point_configuration-0-story_points', value: '0'}, {name: 'story_point_configuration-0-hours_warning', value: '0'}, {name: 'story_point_configuration-0-hours_escalation', value: '0'},
    {name: 'story_point_configuration-2-story_points', value: '2'}, {name: 'story_point_configuration-2-hours_warning', value: '12'}, {name: 'story_point_configuration-2-hours_escalation', value: '16'}
  ]);
  assert.deepStrictEqual(lim.map(function (e) { return e.sp + ':' + e.limit; }), ['0:0', '1:8', '2:16']);
  assert.deepStrictEqual(f.limitForSp(lim, 2, 8), {limit: 16, warn: 12, fromPortal: true});
  assert.strictEqual(f.limitForSp(lim, 1.5, 8).limit, 12);
  assert.strictEqual(f.limitForSp(lim, 0.5, 8).limit, 4);
  assert.strictEqual(f.limitForSp(lim, 4, 8).limit, 32); // über der größten Stufe: Steigung 8 h/SP
  assert.deepStrictEqual(f.limitForSp([], 3, 8), {limit: 24, warn: 19.2, fromPortal: false});
  assert.deepStrictEqual(f.limitForSp([], 2, 6), {limit: 12, warn: 9.6, fromPortal: false});
  assert.strictEqual(f.limitForSp(lim, 0, 8), null);
  const q = f.parseQuotaText('Remaining: 8.50 h Quota 32 h · booked 23.50 h 01.10.2026 – 31.12.2026 16 h per month · expires every 3 months');
  assert.deepStrictEqual(q, {quota: 32, booked: 23.5, remaining: 8.5, perMonth: 16, from: '01.10.2026', to: '31.12.2026', expires: '3'});
  assert.strictEqual(f.parseQuotaText('Total: 18,476.25€ (73.90%)'), null);
  console.log('month report ok');
}

// Interne Projekte: Kategorie-Erkennung, Modus und Verkaufspreis
{
  ['Internal', 'internal', ' Intern ', 'INTERNAL'].forEach(function (v) { assert.strictEqual(f.isInternalCategory(v), true, v); });
  ['International', 'Customer', 'Maintenance', '', null, undefined, 'Internal Tools GmbH'].forEach(function (v) {
    assert.strictEqual(f.isInternalCategory(v), false, String(v));
  });
  assert.strictEqual(f.effectiveCostMode({projectInternal: true, costMode: 'external'}), 'internal');
  assert.strictEqual(f.effectiveCostMode({projectInternal: false, costMode: 'external'}), 'external');
  assert.strictEqual(f.effectiveCostMode({costMode: 'internal'}), 'internal');
  assert.strictEqual(f.effectiveSpPrice({projectInternal: true, spPricing: true, spPrice: 500}), null);
  assert.strictEqual(f.effectiveSpPrice({spPricing: true, spPrice: 500}), 500);
  assert.strictEqual(f.effectiveSpPrice({spPricing: false, spPrice: 500}), null);
  assert.strictEqual(f.effectiveSpPrice({spPricing: true, spPrice: 0}), null);
  assert.strictEqual(f.effectiveSpPrice({spPricing: true}), null);
  // Interne Projekte: kein Erlös, auch wenn ein Preis hinterlegt ist
  const people = [{name: 'A', role: 'Web', daily: 800}];
  const ps = {projectInternal: true, costMode: 'external', spPricing: true, spPrice: 500};
  const info = f.buildCostInfo({A: 2}, people, {Web: 100}, f.effectiveCostMode(ps), 3, f.effectiveSpPrice(ps));
  assert.strictEqual(info.mode, 'internal');
  assert.strictEqual(info.cost, 200);
  assert.strictEqual(info.revenue, null);
  assert.strictEqual(info.margin, null);
  console.log('internal projects ok');
}

// Wartung / Budget: Kosten ohne SP, Erlös nur mit SP und Preis, Ampel-Grenzen
{
  const people = [{name: 'A', role: 'Web', daily: 800}];
  const none = f.buildCostInfo({A: 0.5}, people, {Web: 100}, 'internal', null, null);
  assert.strictEqual(none.cost, 50);
  assert.strictEqual(none.revenue, null);
  assert.strictEqual(none.breakEvenHours, null);
  const ext = f.buildCostInfo({A: 0.5}, people, {}, 'external', null, null);
  assert.strictEqual(ext.cost, 50);
  const zero = f.buildCostInfo({A: 0}, people, {Web: 100}, 'internal', 2, 100);
  assert.strictEqual(zero.cost, 0);
  assert.strictEqual(zero.margin, 200);
  assert.strictEqual(zero.breakEvenHours, null);
  const loss = f.buildCostInfo({A: 5}, people, {Web: 100}, 'internal', 1, 100);
  assert.strictEqual(loss.margin, -400);
  assert.strictEqual(loss.breakEvenHours, 1);
  assert(/-/.test(f.formatSignedEuro(-400)) || /−/.test(f.formatSignedEuro(-400)));
  assert(f.formatSignedEuro(340).indexOf('+') === 0);
  console.log('maintenance/margin edge cases ok');
}

// Datenstand mit Datum
{
  const out = f.formatStand(new Date(2026, 10, 27, 0, 14).getTime());
  assert(/27\.11\.2026/.test(out), out);
  assert(/00:14/.test(out), out);
  assert.strictEqual(f.formatHours(1.25), '1,3');
  assert.strictEqual(f.formatHours(8), '8');
  console.log('formatStand ok');
}

// Feature-Schalter: Eltern, Voraussetzungen, Vorschau-Zwang, Hauptschalter (isFeatureOn mit Zustand nachgebaut)
function sliceConst(name, endMarker) {
  const start = source.indexOf('  const ' + name + ' = ');
  assert(start >= 0, 'Konstante fehlt: ' + name);
  const end = source.indexOf(endMarker, start);
  assert(end > start, 'Ende fehlt: ' + name);
  return source.slice(start, end + endMarker.length);
}
function evalConst(name, endMarker) {
  return new Function('portalButtonSelector', sliceConst(name, endMarker) + '\nreturn ' + name + ';')(function (root) { return root + ' .portal-btn'; });
}
const FEATURE_PARENTS = evalConst('FEATURE_PARENTS', '};');
const FEATURE_NEEDS = evalConst('FEATURE_NEEDS', '};');
const FEATURE_MENU = evalConst('FEATURE_MENU', '\n  ];');
const PREVIEW_SELECTORS = evalConst('PREVIEW_FEATURE_SELECTORS', '\n  };');
const DISPLAY_SUBTABS = evalConst('DISPLAY_SUBTABS', '];');

function makeFeatureState() {
  const state = {features: {}, showEnabled: true, previewForceKey: null, ctx: null};
  const body = extract('inPreviewForce') + '\n' + extract('isFeatureOn') + '\nreturn isFeatureOn;';
  const factory = new Function('state', 'FEATURE_PARENTS', 'FEATURE_NEEDS',
    'const features = new Proxy({}, {get: function (_, k) { return state.features[k]; }});' +
    'const proxy = state; Object.defineProperty(this, "x", {});' +
    body.replace(/previewForceKey/g, 'proxy.previewForceKey').replace(/showEnabled/g, 'proxy.showEnabled')
      .replace(/currentScanContext/g, 'proxy.ctx'));
  state.isOn = factory.call({}, state, FEATURE_PARENTS, FEATURE_NEEDS);
  return state;
}

{
  const s = makeFeatureState();
  assert.strictEqual(s.isOn('progress'), true, 'Standard: an');
  assert.strictEqual(s.isOn('portalButtons'), true);
  s.features.progress = false;
  assert.strictEqual(s.isOn('progress'), false);
  assert.strictEqual(s.isOn('portalButtons'), false, 'Unterpunkt folgt Eltern');
  s.features.portalButtons = false;
  s.features.progress = true;
  assert.strictEqual(s.isOn('portalButtons'), false, 'eigener Schalter aus');
  s.features.portalButtons = true;
  s.showEnabled = false;
  assert.strictEqual(s.isOn('progress'), false, 'Hauptschalter aus');
  s.showEnabled = true;
  s.ctx = {projectSettings: {estimateEnabled: false}};
  assert.strictEqual(s.isOn('estimateBadge'), false, 'Board ohne Schätzung');
  assert.strictEqual(s.isOn('columnSp'), false, 'SP-Summe hängt am Badge');
  s.ctx = null;
  // Vorschau-Zwang: gehoverte Geld-Anzeige zeigt sich samt Element, in dem sie steht, trotz „aus“
  s.features.progress = false;
  s.features.costPill = false;
  s.previewForceKey = 'costPill';
  assert.strictEqual(s.isOn('costPill'), true);
  assert.strictEqual(s.isOn('progress'), true, 'Voraussetzung wird mitgezeichnet');
  assert.strictEqual(s.isOn('mrBadge'), true, 'unbeteiligte Features bleiben unberührt (Standard an)');
  s.features.mrBadge = false;
  assert.strictEqual(s.isOn('mrBadge'), false);
  s.previewForceKey = 'portalButtons';
  assert.strictEqual(s.isOn('progress'), true, 'Eltern wird mitgezwungen');
  s.showEnabled = false;
  assert.strictEqual(s.isOn('portalButtons'), true, 'Vorschau zeigt auch bei pausiertem Script');
  s.previewForceKey = null;
  assert.strictEqual(s.isOn('portalButtons'), false);
  console.log('isFeatureOn ok');
}

// Statische Konsistenz: Menü, Eltern, Voraussetzungen, Vorschau-Selektoren, Reiter
{
  const keys = [];
  FEATURE_MENU.forEach(function (group) {
    assert(group.title && group.items.length, 'Gruppe ohne Titel/Einträge');
    assert(DISPLAY_SUBTABS.some(function (t) { return t[0] === group.view; }), 'Unbekannte Ansicht: ' + group.view);
    group.items.forEach(function (item) {
      assert.strictEqual(item.length, 3, 'Eintrag braucht Schlüssel, Label, Beschreibung: ' + item[0]);
      assert(item[1] && item[2], 'Label/Beschreibung leer: ' + item[0]);
      keys.push(item[0]);
    });
  });
  assert.strictEqual(new Set(keys).size, keys.length, 'doppelte Schlüssel im Menü');
  DISPLAY_SUBTABS.forEach(function (t) {
    assert(FEATURE_MENU.some(function (g) { return g.view === t[0]; }), 'Reiter ohne Gruppen: ' + t[0]);
  });
  Object.keys(FEATURE_PARENTS).forEach(function (k) {
    assert(keys.indexOf(k) >= 0, 'Kind fehlt im Menü: ' + k);
    assert(keys.indexOf(FEATURE_PARENTS[k]) >= 0, 'Eltern fehlt im Menü: ' + FEATURE_PARENTS[k]);
    assert.notStrictEqual(k, FEATURE_PARENTS[k]);
  });
  Object.keys(FEATURE_NEEDS).forEach(function (k) {
    assert(keys.indexOf(k) >= 0 && keys.indexOf(FEATURE_NEEDS[k]) >= 0, 'Voraussetzung unbekannt: ' + k);
  });
  // Zyklenfrei (sonst hängt isFeatureOn)
  Object.keys(FEATURE_PARENTS).concat(Object.keys(FEATURE_NEEDS)).forEach(function (k) {
    const seen = new Set();
    for (let c = k; c; c = FEATURE_PARENTS[c] || FEATURE_NEEDS[c]) {
      assert(!seen.has(c), 'Zyklus bei ' + k);
      seen.add(c);
    }
  });
  // Jedes Feature hat ein Vorschau-Element zum Umranden
  keys.forEach(function (k) { assert(PREVIEW_SELECTORS[k], 'Vorschau-Selektor fehlt: ' + k); });
  Object.keys(PREVIEW_SELECTORS).forEach(function (k) { assert(keys.indexOf(k) >= 0, 'Selektor ohne Menüeintrag: ' + k); });
  // Alle Geld-Schalter liegen im Menü (Anzeige-Tab), Standard an
  ['costPill', 'costMarker', 'costTooltip', 'columnCost', 'milestoneCost', 'financeButton'].forEach(function (k) {
    assert(keys.indexOf(k) >= 0, 'Geld-Schalter fehlt: ' + k);
  });
  // Meilenstein-Features gehören in die Topbar, Spalten-Header-Features in den eigenen Reiter
  const viewOf = function (k) { return FEATURE_MENU.filter(function (g) { return g.items.some(function (i) { return i[0] === k; }); })[0].view; };
  ['milestoneSp', 'milestoneCost', 'financeButton', 'mrLinks'].forEach(function (k) { assert.strictEqual(viewOf(k), 'topbar', k); });
  ['columnSp', 'columnCost', 'columnAvg'].forEach(function (k) { assert.strictEqual(viewOf(k), 'column', k); });
  console.log('feature menu consistency ok');
}

// Toast: Varianten haben Icon-Stil, Demo-Auslöser und Schließen-Button existieren, Position verdeckt die Toolbar nicht
{
  ['success', 'warning'].forEach(function (v) {
    assert(source.indexOf('#ambient-progress-toast[data-variant=' + v + '] .ambient-toast-icon') >= 0, 'Toast-Stil fehlt: ' + v);
  });
  assert(/#ambient-progress-toast\{position:fixed;bottom:[^;]+;right:/.test(source), 'Toast gehört unten rechts hin');
  assert(!/#ambient-progress-toast\{[^}]*top:/.test(source), 'Toast darf nicht oben sitzen (Toolbar-Icons)');
  assert(source.indexOf("ambient-toast-close") >= 0 && source.indexOf("'Toast-Test'") >= 0);
  assert(/function showToastDemo\(/.test(source));
  // Demo zeigt alle drei Varianten reihum
  const demo = extract('showToastDemo');
  ['info', 'success', 'warning'].forEach(function (v) { assert(demo.indexOf("'" + v + "'") >= 0, v); });
  console.log('toast ok');
}

// Changelog-Parser („Was ist neu“)
{
  const md = '# Changelog\n\n## 2026.11.15\n\n- Neu: A\n  zweite Zeile\n- Neu: B\n\n## 2026.11.13\n\n* Fix: C\n\n## 2026.11.12\n\nnur Text\n';
  const r = f.parseChangelog(md);
  assert.deepStrictEqual(r.map(function (x) { return x.version; }), ['2026.11.15', '2026.11.13']);
  assert.deepStrictEqual(r[0].items, ['Neu: A zweite Zeile', 'Neu: B']);
  assert.deepStrictEqual(r[1].items, ['Fix: C']);
  assert.deepStrictEqual(f.parseChangelog(''), []);
  assert.deepStrictEqual(f.parseChangelog(null), []);
  assert.deepStrictEqual(f.parseChangelog('- ohne Überschrift'), []);
  // echtes Repo-Changelog: jede Version hat Einträge, die aktuelle Version steht oben
  const real = f.parseChangelog(fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8'));
  assert(real.length > 3);
  const ver = /@version\s+(\S+)/.exec(source)[1];
  assert.strictEqual(real[0].version, ver, 'oberster Changelog-Abschnitt = @version');
  assert(real.every(function (x) { return /^\d{4}\.\d+\.\d+/.test(x.version); }));
  assert(source.indexOf("'Was ist neu'") >= 0 && /function createChangelogGroup\(/.test(source));
  console.log('changelog ok');
}

// Update-Hinweis: Kürzung an Wortgrenzen, Obergrenze, kein „verbrauc“
{
  const long = 'Neu: Finanz-Button (Reihenfolge: MR-Links, Finanzen, Einstellungen) öffnet ein Finanz-Dashboard (Seitenpanel). Es liest Financial data der Portal-Projektseite und zeigt, wer wie viel vom Budget verbraucht hat.';
  const out = f.summarizeChangelogNotes([long, 'Kurz `A`', 'B', 'C', 'D', 'E'], 4, 60).split('\n');
  assert.strictEqual(out.length, 5);
  assert(out[0].endsWith('…') && out[0].length <= 64, out[0]);
  assert(long.indexOf(out[0].slice(2, -1)) === 0, 'Kürzung ist ein Präfix an einer Wortgrenze');
  assert.strictEqual(out[1], '• Kurz A');
  assert(/^\+ 2 weitere/.test(out[4]), out[4]);
  assert.strictEqual(f.summarizeChangelogNotes([], 4, 60), '');
  assert.strictEqual(f.summarizeChangelogNotes(['x'], 4, 60), '• x');
  console.log('update notes ok');
}

console.log('pure.check.js: alle Checks bestanden');
