// ==UserScript==
// @name         GitLab Issue Board – Ambient Progress Anzeige (Progressbar, Dark-Toolbar, Link-Button)
// @namespace    https://ambient-innovation.com/
// @version      3.1.0
// @description  Zeigt gebuchte Stunden aus dem Ambient-Portal in GitLab-Issue-Boards an (nur bestimmte Spalten, z.B. WIP) als Progressbar, inkl. Debug-/Anzeigen-Toggles im Dark Mode und Link-Button zum Portal.
// @author       you
// @match        https://gitlab.ambient-innovation.com/*
// @grant        GM_xmlhttpRequest
// @connect      portal.ambient.digital
// @updateURL    https://raw.githubusercontent.com/christoph-teichmeister/tampermonkey-ambient-gitlab-ticket-progress/main/ambient-gitlab-ticket-progress.js
// @downloadURL  https://raw.githubusercontent.com/christoph-teichmeister/tampermonkey-ambient-gitlab-ticket-progress/main/ambient-gitlab-ticket-progress.js
// ==/UserScript==

(function () {
  'use strict';

  /******************************************************************
   * Globale Settings / State
   ******************************************************************/

  // Host- / Projekt-Konfiguration
  const HOST_CONFIG = {};

  // Debug / Anzeige – gesteuert über Toolbar, persistiert in localStorage
  const LS_KEY_DEBUG = 'portalProgressDebug';
  const LS_KEY_SHOW = 'portalProgressShow';
  const LS_KEY_LIST_SELECTIONS = 'ambientProgressListSelections';
  const LS_KEY_PROJECT_CONFIG = 'ambientProgressProjectConfigs';

  let debugEnabled = readBoolFromLocalStorage(LS_KEY_DEBUG, true);  // default: Debug an
  let showEnabled = readBoolFromLocalStorage(LS_KEY_SHOW, true);    // default: Anzeigen an

  const LOG_PREFIX = '[GitLab Progress]';
  const PROGRESS_CACHE_TTL_MS = 5 * 60 * 1000;
  const progressCache = {}; // key: projectId + ':' + issueIid → {data, timestamp}

  /******************************************************************
   * Utils
   ******************************************************************/

  function readBoolFromLocalStorage(key, defaultValue) {
    try {
      const val = window.localStorage.getItem(key);
      if (val === null || val === undefined) return defaultValue;
      return val === '1';
    } catch (e) {
      return defaultValue;
    }
  }

  function writeBoolToLocalStorage(key, value) {
    try {
      window.localStorage.setItem(key, value ? '1' : '0');
    } catch (e) {
      // ignore
    }
  }

  function readListSelectionsState() {
    try {
      const raw = window.localStorage.getItem(LS_KEY_LIST_SELECTIONS);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return {};
      return parsed;
    } catch (e) {
      return {};
    }
  }

  function writeListSelectionsState(state) {
    try {
      window.localStorage.setItem(LS_KEY_LIST_SELECTIONS, JSON.stringify(state));
    } catch (e) {
      // ignore
    }
  }

  function readListSelectionEntry(projectKey) {
    if (!projectKey) return null;
    const state = readListSelectionsState();
    const entry = state[projectKey];
    if (!entry || typeof entry !== 'object') {
      return null;
    }
    const include =
      entry.include && typeof entry.include === 'object'
        ? Object.assign({}, entry.include)
        : {};
    return {
      include,
      explicit: Boolean(entry.explicit)
    };
  }

  function writeListSelectionEntry(projectKey, includeLookup, explicit) {
    if (!projectKey) return;
    const state = readListSelectionsState();
    state[projectKey] = {
      include: includeLookup && typeof includeLookup === 'object' ? includeLookup : {},
      explicit: Boolean(explicit)
    };
    writeListSelectionsState(state);
  }

  function readProjectConfigsState() {
    try {
      const raw = window.localStorage.getItem(LS_KEY_PROJECT_CONFIG);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return {};
      return parsed;
    } catch (e) {
      return {};
    }
  }

  function writeProjectConfigsState(state) {
    try {
      window.localStorage.setItem(LS_KEY_PROJECT_CONFIG, JSON.stringify(state));
    } catch (e) {
      // ignore
    }
  }

  function readProjectConfigEntry(projectKey) {
    if (!projectKey) return null;
    const state = readProjectConfigsState();
    const entry = state[projectKey];
    if (!entry || typeof entry !== 'object') {
      return null;
    }
    return Object.assign({}, entry);
  }

  function writeProjectConfigEntry(projectKey, data) {
    if (!projectKey) return;
    const state = readProjectConfigsState();
    state[projectKey] = Object.assign({}, state[projectKey] || {}, data || {});
    writeProjectConfigsState(state);
  }

  let checkboxStylesInjected = false;

  function ensureCheckboxStyles() {
    if (checkboxStylesInjected) return;
    checkboxStylesInjected = true;
    const style = document.createElement('style');
    style.id = 'ambient-progress-list-checkbox-styles';
    style.textContent = `
      .ambient-progress-list-checkbox-wrapper {
        transition: opacity 0.2s ease, margin 0.2s ease;
        vertical-align: middle;
        position: relative;
      }
      .ambient-progress-list-checkbox-wrapper.ambient-progress-list-checkbox-collapsed {
        opacity: 0.9;
        margin-left: 0;
        position: absolute;
        top: 50%;
        right: 0.35rem;
        transform: translateY(-50%);
        pointer-events: auto;
      }
      .ambient-progress-list-checkbox-wrapper .ambient-progress-list-checkbox {
        transition: transform 0.2s ease;
      }
      .ambient-progress-list-checkbox-wrapper.ambient-progress-list-checkbox-collapsed .ambient-progress-list-checkbox {
        transform: scale(0.9);
      }
    `;
    document.head.appendChild(style);
  }

  function log(...args) {
    if (!debugEnabled) return;
    console.log(LOG_PREFIX, ...args);
  }

  function warn(...args) {
    if (!debugEnabled) return;
    console.warn(LOG_PREFIX, ...args);
  }

  function error(...args) {
    console.error(LOG_PREFIX, ...args);
  }

  function applyStyles(element, styles) {
    if (!element || !styles) return;
    for (const key in styles) {
      if (Object.prototype.hasOwnProperty.call(styles, key)) {
        element.style[key] = styles[key];
      }
    }
  }

  function createTextSpan(text, styles) {
    const span = document.createElement('span');
    span.textContent = text;
    applyStyles(span, styles);
    return span;
  }

  function mergeStyles(base, override) {
    const merged = {};
    if (base) {
      Object.assign(merged, base);
    }
    if (override) {
      Object.assign(merged, override);
    }
    return merged;
  }

  const PROGRESS_BAR_DEFAULTS = {
    bar: {
      position: 'relative',
      height: '16px',
      borderRadius: '999px',
      overflow: 'hidden',
      background: '#1f2937'
    },
    textLayer: {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 8px',
      pointerEvents: 'none',
      color: '#000000'
    },
    label: {
      fontWeight: '500'
    },
    centerLabel: {
      fontWeight: '600'
    },
    colors: {
      spent: '#6FBF73',
      spentHover: '#57A55D',
      neutral: '#D9D4C7',
      over: '#dc3545'
    }
  };

  function createProgressBarElements(progressData, customStyles) {
    if (!progressData) return null;
    const styles = customStyles || {};
    const colors = mergeStyles(PROGRESS_BAR_DEFAULTS.colors, styles.colors);

    const barOuter = document.createElement('div');
    applyStyles(barOuter, mergeStyles(PROGRESS_BAR_DEFAULTS.bar, styles.bar));

    const textLayer = document.createElement('div');
    applyStyles(textLayer, mergeStyles(PROGRESS_BAR_DEFAULTS.textLayer, styles.textLayer));

    const spentLabelStyle = mergeStyles(PROGRESS_BAR_DEFAULTS.label, styles.spentLabel);
    const remainingLabelStyle = mergeStyles(PROGRESS_BAR_DEFAULTS.label, styles.remainingLabel);
    const centerLabelStyle = mergeStyles(PROGRESS_BAR_DEFAULTS.centerLabel, styles.centerLabel);

    const appendCenterText = function (text) {
      textLayer.style.justifyContent = 'center';
      textLayer.appendChild(createTextSpan(text, centerLabelStyle));
    };

    if (progressData.booked && !progressData.spent && !progressData.remaining && !progressData.over) {
      const bookedText = (progressData.bookedLabel || 'Booked Hours') + ': ' + progressData.booked;
      const bookedBar = document.createElement('div');
      applyStyles(bookedBar, {
        height: '100%',
        width: '100%',
        background: colors.neutral
      });
      barOuter.appendChild(bookedBar);
      appendCenterText(bookedText);
    } else if (progressData.over) {
      const overBar = document.createElement('div');
      applyStyles(overBar, {
        height: '100%',
        width: '100%',
        background: colors.over
      });
      barOuter.appendChild(overBar);
      appendCenterText('Over: ' + progressData.over);
    } else {
      const spentNum = extractHourNumber(progressData.spent);
      const remainingNum = extractHourNumber(progressData.remaining);
      let total = null;
      if (spentNum !== null && remainingNum !== null) {
        total = spentNum + remainingNum;
      }

      const showSpentBar = spentNum !== null && spentNum > 0;
      let spentWidth = 0;
      let remainingWidth = 100;
      if (showSpentBar && total && total > 0 && remainingNum !== null) {
        spentWidth = Math.max(5, Math.min(95, (spentNum / total) * 100));
        remainingWidth = Math.max(5, 100 - spentWidth);
      }

      let spentBar = null;
      if (showSpentBar) {
        spentBar = document.createElement('div');
        applyStyles(spentBar, {
          height: '100%',
          width: spentWidth + '%',
          background: colors.spent,
          float: 'left'
        });
        spentBar.addEventListener('mouseenter', function () {
          spentBar.style.background = colors.spentHover;
        });
        spentBar.addEventListener('mouseleave', function () {
          spentBar.style.background = colors.spent;
        });
      }

      const remainingBar = document.createElement('div');
      applyStyles(remainingBar, {
        height: '100%',
        width: remainingWidth + '%',
        background: remainingWidth ? colors.neutral : 'transparent',
        float: 'left'
      });

      barOuter.appendChild(remainingBar);
      if (spentBar) {
        barOuter.insertBefore(spentBar, remainingBar);
      }

      textLayer.appendChild(
        createTextSpan(progressData.spent || '—', spentLabelStyle)
      );
      textLayer.appendChild(
        createTextSpan(progressData.remaining || '—', remainingLabelStyle)
      );
    }

    barOuter.appendChild(textLayer);
    return barOuter;
  }

  function createAllowedListLookup(listNames) {
    const lookup = {};
    if (!listNames || !listNames.length) {
      return lookup;
    }
    for (let i = 0; i < listNames.length; i++) {
      const normalized = String(listNames[i]).toLowerCase().trim();
      if (normalized) {
        lookup[normalized] = true;
      }
    }
    return lookup;
  }

  function getProgressCacheEntry(cacheKey) {
    const entry = progressCache[cacheKey];
    if (!entry) return null;
    if (Date.now() - entry.timestamp > PROGRESS_CACHE_TTL_MS) {
      delete progressCache[cacheKey];
      return null;
    }
    return entry.data;
  }

  function setProgressCacheEntry(cacheKey, data) {
    progressCache[cacheKey] = {
      data,
      timestamp: Date.now()
    };
  }

  function clearProgressCache() {
    Object.keys(progressCache).forEach(function (key) {
      delete progressCache[key];
    });
  }

  function getCurrentHostConfig() {
    const host = window.location.hostname;
    const cfg = HOST_CONFIG[host];
    if (!cfg && debugEnabled) {
      log('Keine HOST_CONFIG für Host gefunden – benutze leeres Projekt-Setup:', host);
    }
    return cfg || {projects: {}};
  }

  // /ai/ai-portal/-/boards → "ai/ai-portal"
  function getGitLabProjectPathFromLocation() {
    const path = window.location.pathname;
    const parts = path.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    return parts[0] + '/' + parts[1];
  }

  function getProjectSettings(hostConfig) {
    const projectPath = getGitLabProjectPathFromLocation();
    log('Ermittelter projectPath aus URL:', projectPath);
    if (!projectPath) {
      warn('Konnte GitLab-Projektpfad nicht bestimmen.');
      return null;
    }
    const settings = hostConfig.projects[projectPath] || null;
    const projectKey = window.location.hostname + '|' + projectPath;
    const storedSelection = readListSelectionEntry(projectKey);
    const storedProjectConfig = readProjectConfigEntry(projectKey);

    if (!settings && !storedProjectConfig) {
      warn('Keine projectSettings in HOST_CONFIG und keine gespeicherte Konfiguration für Projektpfad:', projectPath);
    }

    const base = settings ? Object.assign({}, settings) : {
      projectId: null,
      listNamesToInclude: [],
      portalBaseUrl: null
    };
    const configLookup = createAllowedListLookup(base.listNamesToInclude || []);
    const initialLookup = storedSelection ? storedSelection.include : configLookup;
    const listFilterMode = storedSelection && storedSelection.explicit ? 'explicit' : 'auto';
    const projectId =
      (storedProjectConfig && storedProjectConfig.projectId) || base.projectId || null;
    const portalBaseUrl =
      (storedProjectConfig && storedProjectConfig.portalBaseUrl) || base.portalBaseUrl || null;

    return Object.assign({}, base, {
      projectPath,
      projectKey,
      projectId,
      allowedListLookup: initialLookup,
      listFilterMode,
      portalBaseUrl
    });
  }

  function getBoardListHeaderElement(boardListElem) {
    if (!boardListElem) return null;
    return boardListElem.querySelector('header[data-testid="board-list-header"]');
  }

  function getListNameFromBoardListElem(boardListElem, headerOverride) {
    const header = headerOverride || getBoardListHeaderElement(boardListElem);
    if (!header) return null;
    try {
      var labelSpan = header.querySelector('.board-title-text .gl-label-text');
      if (labelSpan && labelSpan.textContent) {
        return labelSpan.textContent.replace(/\s+/g, ' ').trim();
      }

      var h2 = header.querySelector('.board-title-text');
      if (h2 && h2.textContent) {
        return h2.textContent.replace(/\s+/g, ' ').trim();
      }
    } catch (e) {
      error('Fehler beim Ermitteln des Listennamens:', e);
    }
    return null;
  }

  function getIssueIidFromCard(cardElem) {
    if (!cardElem) return null;

    var iid = cardElem.getAttribute('data-item-iid');
    if (iid) return iid;

    try {
      var numberSpan = cardElem.querySelector('.board-card-number span');
      if (numberSpan && numberSpan.textContent) {
        var m = numberSpan.textContent.match(/#(\d+)/);
        if (m) return m[1];
      }
    } catch (e) {
      error('Fehler beim Parsen der Issue-IID aus Footer:', e);
    }
    return null;
  }

  function normalizePortalBaseUrl(value) {
    if (!value) {
      return null;
    }
    let normalized = String(value).trim();
    if (!normalized) {
      return null;
    }
    normalized = normalized.replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = 'https://' + normalized;
    }
    return normalized;
  }

  function getPortalBaseUrl(projectSettings) {
    if (!projectSettings) {
      return null;
    }
    return normalizePortalBaseUrl(projectSettings.portalBaseUrl);
  }

  function buildPortalUrl(projectSettings, issueIid) {
    if (!projectSettings || !issueIid) {
      return null;
    }
    const projectId = projectSettings.projectId;
    const base = getPortalBaseUrl(projectSettings);
    if (!projectId || !base) {
      return null;
    }
    return (
      base +
      '/management/project/' +
      encodeURIComponent(String(projectId)) +
      '/booking-label/%23' +
      encodeURIComponent(String(issueIid)) +
      '/'
    );
  }

  // Zahl aus "16.25h" / "72,25h" extrahieren
  function extractHourNumber(text) {
    if (!text) return null;
    var norm = String(text).replace(',', '.');
    var m = norm.match(/-?[\d.]+/);
    if (!m) return null;
    var v = parseFloat(m[0]);
    if (isNaN(v)) return null;
    return v;
  }

  function formatBookedHoursDisplay(value) {
    if (value === null || value === undefined) return null;
    var hours;
    if (typeof value === 'number' && !isNaN(value)) {
      hours = value;
    } else {
      hours = extractHourNumber(value);
    }
    if (hours === null) return null;
    var normalized = Number(hours);
    var normalizedStr = normalized.toString();
    if (normalizedStr.indexOf('.') !== -1) {
      normalizedStr = normalizedStr.replace(/\.?0+$/, '');
    }
    if (normalizedStr === '-0') {
      normalizedStr = '0';
    }
    return normalizedStr + 'h';
  }

  function normalizeWhitespace(text) {
    if (!text) return '';
    return String(text).replace(/\s+/g, ' ').trim();
  }

  function sumHourNumbersFromText(text) {
    if (!text) return null;
    var matches = text.match(/\b\d{1,2}(?:[.,]\d{1,2})?(?![\d.,])/g);
    if (!matches || matches.length === 0) return null;
    var sum = 0;
    var found = false;
    for (var i = 0; i < matches.length; i++) {
      var candidate = matches[i].replace(',', '.');
      var num = parseFloat(candidate);
      if (isNaN(num)) continue;
      sum += num;
      found = true;
    }
    if (!found) return null;
    return sum;
  }

  function sumHourNumbersFromElement(el) {
    if (!el) return null;
    return sumHourNumbersFromText(el.textContent);
  }

  function sumHourNumbersFromDirectTextNodes(el) {
    if (!el) return null;
    var sum = 0;
    var found = false;
    for (var i = 0; i < el.childNodes.length; i++) {
      var node = el.childNodes[i];
      if (node.nodeType !== Node.TEXT_NODE) continue;
      var value = sumHourNumbersFromText(node.textContent);
      if (value !== null) {
        sum += value;
        found = true;
      }
    }
    return found ? sum : null;
  }

  function extractHourValueFromElement(el) {
    if (!el) return null;
    var directSum = sumHourNumbersFromDirectTextNodes(el);
    if (directSum !== null) return directSum;
    return sumHourNumbersFromElement(el);
  }

  /******************************************************************
   * HTML-Parsing der Progress-Daten (mit Booked-Hours-Fallback)
   ******************************************************************/

  function detectBookedLabel(text) {
    if (!text) return null;
    if (/Gebuchte\s+Stunden/i.test(text)) return 'Gebuchte Stunden';
    if (/Booked\s+Hours/i.test(text)) return 'Booked Hours';
    return null;
  }

  function parseProgressHtml(htmlText) {
    try {
      var parser = new DOMParser();
      var doc = parser.parseFromString(htmlText, 'text/html');

      function fallbackBooked() {
        var booked = parseBookedHours(doc);
        if (!booked) return null;
        return {
          spent: null,
          remaining: null,
          over: null,
          booked: booked.value,
          bookedLabel: booked.label || 'Booked Hours'
        };
      }

      var progressDiv = doc.querySelector('div.progress') || doc.querySelector('div.Progress');
      if (!progressDiv) {
        if (debugEnabled) log('parseProgressHtml: Kein div.progress/Progress gefunden → Fallback Booked Hours.');
        return fallbackBooked();
      }

      var innerDivs = progressDiv.querySelectorAll('div.progress-bar');
      if (!innerDivs || innerDivs.length === 0) {
        innerDivs = progressDiv.querySelectorAll('div');
      }
      if (!innerDivs || innerDivs.length === 0) {
        if (debugEnabled) log('parseProgressHtml: Keine inneren divs → Fallback Booked Hours.');
        return fallbackBooked();
      }

      var texts = [];
      for (var i = 0; i < innerDivs.length; i++) {
        var t = innerDivs[i].textContent;
        if (!t) continue;
        t = t.replace(/\s+/g, ' ').trim();
        if (!t) continue;
        texts.push(t);
      }
      if (texts.length === 0) {
        if (debugEnabled) log('parseProgressHtml: Keine nichtleeren Textinhalte → Fallback Booked Hours.');
        return fallbackBooked();
      }

      // Over-Fall: ein Wert, z.B. "-72.25h"
      if (texts.length === 1) {
        var single = texts[0];
        if (/^-/.test(single)) {
          var overText = single.replace(/^-+/, '');
          return {spent: null, remaining: null, over: overText};
        }
        // sonst: Einzelwert = spent
        return {spent: single, remaining: null, over: null};
      }

      // Normalfall: mind. zwei Werte → erster = spent, zweiter = remaining
      return {
        spent: texts[0],
        remaining: texts[1],
        over: null
      };
    } catch (e) {
      error('Fehler beim Parsen des Progress-HTML:', e);
      return null;
    }
  }

  // Fallback: "Booked Hours" auslesen, wenn es keine Progress-Bar gibt
  function parseBookedHours(doc) {
    try {
      var inlineMatch = parseInlineBookedHours(doc);
      if (inlineMatch) return inlineMatch;

      var rowMatch = parseBookedHoursFromTableRows(doc);
      if (rowMatch) return rowMatch;

      return parseBookedHoursFromCandidates(doc);
    } catch (e) {
      error('Fehler beim Fallback-Parsing Booked Hours:', e);
    }
    return null;
  }

  function parseInlineBookedHours(doc) {
    var candidates = doc.querySelectorAll('th, td, div, span, p, label');
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      var text = normalizeWhitespace(el.textContent);
      if (!text) continue;

      var mInline = text.match(/(Gebuchte\s+Stunden|Booked\s+Hours)\s*:\s*(.+)$/i);
      if (mInline && mInline[2]) {
        var inlineVal = mInline[2].trim();
        var inlineLabel = mInline[1] ? mInline[1].trim() : null;
        var label = detectBookedLabel(inlineLabel);
        if (inlineVal) {
          var formattedInline = formatBookedHoursDisplay(inlineVal);
          if (formattedInline) {
            if (debugEnabled) log('parseBookedHours: Wert inline gefunden für "' + (label || 'Booked Hours') + '":', formattedInline);
            return {value: formattedInline, label: label || 'Booked Hours'};
          }
          if (debugEnabled) log('parseBookedHours: inline Wert enthält keine Stundenangabe, überspringe:', inlineVal);
        }
      }
    }
    return null;
  }

  function parseBookedHoursFromTableRows(doc) {
    var rows = doc.querySelectorAll('tr');
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var cells = Array.prototype.slice.call(row.querySelectorAll('th, td'));
      if (!cells || cells.length === 0) continue;

      for (var j = 0; j < cells.length; j++) {
        var cell = cells[j];
        var cellText = normalizeWhitespace(cell.textContent);
        if (!cellText) continue;
        var label = detectBookedLabel(cellText);
        if (!label) continue;

        for (var k = j + 1; k < cells.length; k++) {
          var candidateCell = cells[k];
          var value = extractHourValueFromElement(candidateCell);
          if (value !== null) {
            var formatted = formatBookedHoursDisplay(value);
            if (formatted) {
              if (debugEnabled) log('parseBookedHours: Wert aus Tabellenzeile gefunden für "' + label + '":', formatted);
              return {value: formatted, label: label};
            }
          }
        }
      }
    }
    return null;
  }

  function parseBookedHoursFromCandidates(doc) {
    var candidates = doc.querySelectorAll('th, td, div, span, p, label');
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      var text = normalizeWhitespace(el.textContent);
      if (!text) continue;

      var label = detectBookedLabel(text);
      if (!label) continue;

      var candidateEl = null;
      var candidateVal = null;

      // direktes nextElementSibling
      var next = el.nextElementSibling;
      if (next && next.textContent) {
        candidateEl = next;
      }

      // TH → passendes TD
      if (!candidateEl && el.tagName === 'TH' && el.parentElement) {
        var td = el.parentElement.querySelector('td');
        if (td && td.textContent) {
          candidateEl = td;
        }
      }

      // generischer: nächstes Geschwister-Element im selben Parent
      if (!candidateEl && el.parentElement) {
        var siblings = el.parentElement.children;
        for (var j = 0; j < siblings.length - 1; j++) {
          if (siblings[j] === el) {
            var sib = siblings[j + 1];
            if (sib && sib.textContent) {
              candidateEl = sib;
            }
            break;
          }
        }
      }

      if (candidateEl) {
        var summed = sumHourNumbersFromElement(candidateEl);
        if (summed !== null) {
          var formattedSum = formatBookedHoursDisplay(summed);
          if (formattedSum) {
            if (debugEnabled) log('parseBookedHours: Summe der Werte neben "' + label + '" gefunden:', formattedSum);
            return {value: formattedSum, label: label};
          }
        }
        candidateVal = normalizeWhitespace(candidateEl.textContent);
        var formattedAdjacent = formatBookedHoursDisplay(candidateVal);
        if (formattedAdjacent) {
          if (debugEnabled) log('parseBookedHours: Wert neben "' + label + '" gefunden:', formattedAdjacent);
          return {value: formattedAdjacent, label: label};
        }
        if (debugEnabled) log('parseBookedHours: Nebenwert enthält keine Stundenangabe, überspringe:', candidateVal);
      }
    }
    return null;
  }

  /******************************************************************
   * Rendering: Progressbar in der Kartenmitte + Link-Button
   ******************************************************************/

  function injectProgressIntoCard(cardElem, progressData) {
    if (!cardElem || !progressData) return;

    let container = cardElem.querySelector('.ambient-progress-badge');

    if (!container) {
      container = document.createElement('div');
      container.className = 'ambient-progress-badge';
      applyStyles(container, {
        marginTop: '6px',
        marginBottom: '6px',
        fontSize: '12px',
        lineHeight: '1.2',
        color: '#2E3440',
        position: 'relative',
        zIndex: '20'
      });

      const wrappingDiv = cardElem.querySelector('.gl-p-4');
      const footer = cardElem.querySelector('.board-card-footer');

      if (footer && wrappingDiv) {
        wrappingDiv.insertBefore(container, footer);
      } else if (wrappingDiv) {
        wrappingDiv.appendChild(container);
      } else {
        cardElem.appendChild(container);
      }
    }

    container.style.display = showEnabled ? '' : 'none';
    container.innerHTML = '';

    const row = document.createElement('div');
    applyStyles(row, {
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    });

    const barOuter = createProgressBarElements(progressData, {
      bar: {
        height: '18px',
        borderRadius: '999px',
        overflow: 'hidden',
        background: '#E5EAF0',
        flex: '1 1 auto'
      },
      textLayer: {
        padding: '0 6px',
        color: '#2E3440'
      },
      spentLabel: {
        color: '#2E3440',
        fontWeight: '500',
        fontSize: '11px'
      },
      remainingLabel: {
        color: '#2E3440',
        fontWeight: '500',
        fontSize: '11px'
      },
      centerLabel: {
        margin: '0 auto',
        color: '#2E3440',
        fontWeight: '600',
        fontSize: '11px'
      }
    });

    const url = cardElem.getAttribute('data-ambient-progress-url');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '↗';
    btn.title = 'Im Portal öffnen';
    applyStyles(btn, {
      border: '1px solid #4b5563',
      background: '#111827',
      color: '#e5e7eb',
      borderRadius: '999px',
      padding: '2px 8px',
      fontSize: '11px',
      cursor: 'pointer',
      flex: '0 0 auto',
      position: 'relative',
      zIndex: '25'
    });

    btn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      ev.preventDefault();
      if (url) {
        window.open(url, '_blank', 'noopener');
      }
    }, true);
    row.appendChild(barOuter);
    row.appendChild(btn);
    container.appendChild(row);
  }

  function applyShowFlagToAllBadges() {
    const badges = document.querySelectorAll('.ambient-progress-badge');
    for (let i = 0; i < badges.length; i++) {
      badges[i].style.display = showEnabled ? '' : 'none';
    }
  }

  /******************************************************************
   * Requests
   ******************************************************************/

  function loadProgressData(url, issueIid) {
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: 'GET',
        url: url,
        headers: {},
        withCredentials: true,
        onload: function (response) {
          if (debugEnabled) {
            log('Response-Status für Issue', issueIid, ':', response.status);
          }
          if (response.status !== 200) {
            warn('Antwort != 200 für Issue', issueIid, 'Status:', response.status);
            resolve(null);
            return;
          }
          const progressData = parseProgressHtml(response.responseText);
          if (!progressData) {
            log(
              'Konnte progress-Daten nicht aus HTML extrahieren (evtl. Login-Page oder keine Buchungen). Issue',
              issueIid
            );
            resolve(null);
            return;
          }
          log('Progress-Daten erhalten für Issue', issueIid, progressData);
          resolve(progressData);
        },
        onerror: function (err) {
          reject(err);
        }
      });
    });
  }

  function fetchAndDisplayProgress(hostConfig, projectSettings, issueIid, cardElem) {
    if (!issueIid || !cardElem) return;

    const projectId = projectSettings.projectId;
    if (!projectId) {
      warn('Kein projectId für', projectSettings.projectPath, '; progress wird nicht geladen.');
      return;
    }
    const cacheKey = String(projectId) + ':' + String(issueIid);

    const url = buildPortalUrl(projectSettings, issueIid);
    if (!url) {
      warn(
        'Keine Portal-Basis konfiguriert für',
        projectSettings.projectPath,
        '; Fortschritt wird nicht geladen.'
      );
      return;
    }
    cardElem.setAttribute('data-ambient-progress-url', url);

    const cached = getProgressCacheEntry(cacheKey);
    if (cached) {
      log('Cache-Hit für Issue', issueIid, '→', cached);
      injectProgressIntoCard(cardElem, cached);
      return;
    }

    if (!showEnabled) {
      return;
    }

    log('Hole Progress-Daten für Issue', issueIid, '→', url);

    loadProgressData(url, issueIid)
      .then(function (progressData) {
        if (!progressData) return;
        setProgressCacheEntry(cacheKey, progressData);
        injectProgressIntoCard(cardElem, progressData);
      })
      .catch(function (err) {
        error('Request-Fehler für Issue ' + issueIid + ':', err);
      });
  }

  /******************************************************************
   * Board-Scan
   ******************************************************************/

  let scanRunCounter = 0;

  function scanBoard(hostConfig, projectSettings) {
    scanRunCounter += 1;

    const rootBoardsApp = document.querySelector('.boards-app');
    if (!rootBoardsApp) {
      log(
        'scanBoard run #' +
        scanRunCounter +
        ', keine .boards-app gefunden – Board noch nicht initialisiert?'
      );
      return;
    }

    const boardLists = rootBoardsApp.querySelectorAll('div[data-testid="board-list"]');
    log('scanBoard run #' + scanRunCounter + ', Listen gefunden:', boardLists.length);
    if (!boardLists.length) return;

    const allowedLookup = projectSettings.allowedListLookup || {};
    const listFilterMode = projectSettings.listFilterMode || 'auto';
    const hasAllowedFilters = Object.keys(allowedLookup).length > 0;

    for (let li = 0; li < boardLists.length; li++) {
      const boardListElem = boardLists[li];
      const header = getBoardListHeaderElement(boardListElem);
      const listName = getListNameFromBoardListElem(boardListElem, header);
      const displayListName = listName || '<unbekannt>';
      const listNameLower = listName ? listName.toLowerCase().trim() : '';

      if (listName && header) {
        ensureListSelectionCheckbox(
          header,
          listName,
          listNameLower,
          projectSettings,
          hostConfig,
          boardListElem
        );
      }

      let isAllowed = false;
      if (!listNameLower) {
        isAllowed = false;
      } else if (listFilterMode === 'explicit') {
        isAllowed = Boolean(allowedLookup[listNameLower]);
      } else {
        isAllowed = hasAllowedFilters ? Boolean(allowedLookup[listNameLower]) : true;
      }

      log('Liste #' + li + ' Name:', '"' + displayListName + '"', '→ allowed:', isAllowed);
      if (!isAllowed) continue;

      const cards = boardListElem.querySelectorAll('li[data-testid="board-card"].board-card');
      log('  → Karten in erlaubter Liste "' + displayListName + '":', cards.length);

      for (let k = 0; k < cards.length; k++) {
        const cardElem = cards[k];

        if (!showEnabled) {
          const badge = cardElem.querySelector('.ambient-progress-badge');
          if (badge) {
            badge.style.display = 'none';
          }
          continue;
        }

        if (cardElem.getAttribute('data-ambient-progress-processed') === '1') {
          continue;
        }

        const issueIid = getIssueIidFromCard(cardElem);
        log('    Karte #' + k + ', IssueIID:', issueIid);

        if (!issueIid) {
          warn('    Konnte Issue-IID für Karte nicht bestimmen, Karte wird übersprungen.');
          cardElem.setAttribute('data-ambient-progress-processed', '1');
          continue;
        }
        cardElem.setAttribute('data-ambient-progress-processed', '1');
        fetchAndDisplayProgress(hostConfig, projectSettings, issueIid, cardElem);
      }
    }
  }

  function scanIssueDetail(hostConfig, projectSettings) {
    if (!hostConfig || !projectSettings) return;
    if (!showEnabled) return;

    const participants = document.querySelector('[data-testid="work-item-participants"]');
    if (!participants) return;

    const issueIid = getIssueIidFromDetailView(participants);
    if (!issueIid) {
      return;
    }

    const alreadyInjected = participants.dataset.ambientProgressIssueIid;
    if (alreadyInjected === issueIid) return;

    fetchAndDisplayProgressForIssueDetail(hostConfig, projectSettings, issueIid, participants);
  }

  function getIssueIidFromDetailView(participantsElem) {
    const fromShow = parseIssueIidFromShowParam();
    if (fromShow) return fromShow;

    const pathMatch = window.location.pathname.match(/\/issues\/(\d+)/);
    if (pathMatch) {
      return pathMatch[1];
    }

    if (participantsElem) {
      const ancestor =
        participantsElem.closest('[work-item-iid]') ||
        participantsElem.closest('[data-work-item-iid]');
      if (ancestor) {
        return (
          ancestor.getAttribute('work-item-iid') ||
          ancestor.getAttribute('data-work-item-iid') ||
          null
        );
      }
    }

    return null;
  }

  function parseIssueIidFromShowParam() {
    try {
      const params = new URLSearchParams(window.location.search);
      const encoded = params.get('show');
      if (!encoded) return null;
      const decoded = atob(decodeURIComponent(encoded));
      const parsed = JSON.parse(decoded);
      if (parsed && parsed.iid) {
        return String(parsed.iid);
      }
    } catch (e) {
      if (debugEnabled) {
        log('Konnte show-Parameter nicht parsen:', e);
      }
    }
    return null;
  }

  function fetchAndDisplayProgressForIssueDetail(hostConfig, projectSettings, issueIid, participantsElem) {
    if (!issueIid || !participantsElem) return;

    const projectId = projectSettings.projectId;
    if (!projectId) {
      warn('Kein projectId für', projectSettings.projectPath, '; Detail-Progress wird nicht geladen.');
      return;
    }

    const cacheKey = String(projectId) + ':' + String(issueIid);
    const cached = getProgressCacheEntry(cacheKey);
    if (cached) {
      injectProgressIntoIssueDetail(participantsElem, cached);
      participantsElem.dataset.ambientProgressIssueIid = issueIid;
      return;
    }

    const url = buildPortalUrl(projectSettings, issueIid);
    if (!url) {
      warn(
        'Keine Portal-Basis konfiguriert für',
        projectSettings.projectPath,
        '; Detail-Progress wird nicht geladen.'
      );
      return;
    }
    log('Hole Detail-Progress für Issue', issueIid, '→', url);
    loadProgressData(url, issueIid)
      .then(function (progressData) {
        if (!progressData) return;
        setProgressCacheEntry(cacheKey, progressData);
        injectProgressIntoIssueDetail(participantsElem, progressData);
        participantsElem.dataset.ambientProgressIssueIid = issueIid;
      })
      .catch(function (err) {
        error('Request-Fehler für Issue ' + issueIid + ':', err);
      });
  }

  function injectProgressIntoIssueDetail(participantsElem, progressData) {
    if (!participantsElem || !progressData) return;

    let container = participantsElem.nextElementSibling;
    if (!container || !container.classList.contains('ambient-progress-detail-badge')) {
      container = document.createElement('div');
      container.className = 'ambient-progress-detail-badge';
      applyStyles(container, {
        marginTop: '0.65rem',
        padding: '0.45rem 0.75rem',
        borderRadius: '10px',
        border: '1px solid #1f2937',
        background: '#0f172a'
      });
      participantsElem.insertAdjacentElement('afterend', container);
    }

    container.style.display = showEnabled ? '' : 'none';
    container.innerHTML = '';

    const row = document.createElement('div');
    applyStyles(row, {
      display: 'flex',
      flexDirection: 'column',
      gap: '0.35rem',
      fontSize: '12px'
    });

    const barOuter = createProgressBarElements(progressData);
    if (barOuter) {
      row.appendChild(barOuter);
      container.appendChild(row);
    }
  }

  function applyShowFlagToDetailBadges() {
    const badges = document.querySelectorAll('.ambient-progress-detail-badge');
    for (let i = 0; i < badges.length; i++) {
      badges[i].style.display = showEnabled ? '' : 'none';
    }
  }

  function ensureListSelectionCheckbox(
    header,
    listName,
    listNameLower,
    projectSettings,
    hostConfig,
    boardListElem
  ) {
    if (!header || !listName || !listNameLower) return;

    const listLabel = header.querySelector('.board-title-text') || header.querySelector('h2');
    const wrapperAnchor = (listLabel && listLabel.parentElement) || header;
    if (!wrapperAnchor) return;

    let wrapper = header.querySelector('.ambient-progress-list-checkbox-wrapper');
    if (!wrapper) {
      wrapper = document.createElement('span');
      wrapper.className = 'ambient-progress-list-checkbox-wrapper';
      applyStyles(wrapper, {
        display: 'inline-flex',
        alignItems: 'center',
        marginRight: '0.35rem',
        fontSize: '0',
        lineHeight: '1'
      });
      if (listLabel && listLabel.parentElement) {
        listLabel.insertAdjacentElement('afterend', wrapper);
      } else {
        wrapperAnchor.appendChild(wrapper);
      }
    }

    let checkbox = wrapper.querySelector('input.ambient-progress-list-checkbox');
    if (!checkbox) {
      checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'ambient-progress-list-checkbox';
      checkbox.title = 'Progress für "' + listName + '" anzeigen';
      applyStyles(checkbox, {
        width: '14px',
        height: '14px',
        marginRight: '0.25rem',
        cursor: 'pointer'
      });
      wrapper.appendChild(checkbox);
    }

    checkbox.dataset.ambientProgressList = listNameLower;
    checkbox.dataset.ambientProgressListName = listName;
    checkbox.checked = Boolean(
      projectSettings.allowedListLookup && projectSettings.allowedListLookup[listNameLower]
    );

    if (!checkbox.dataset.ambientProgressListener) {
      checkbox.addEventListener('change', function (ev) {
        ev.stopPropagation();
        ev.preventDefault();
        const key = checkbox.dataset.ambientProgressList;
        const currentLookup = projectSettings.allowedListLookup || {};
        const updatedLookup = Object.assign({}, currentLookup);
        if (checkbox.checked) {
          updatedLookup[key] = true;
        } else {
          delete updatedLookup[key];
        }
        projectSettings.allowedListLookup = updatedLookup;
        projectSettings.listFilterMode = 'explicit';
        writeListSelectionEntry(projectSettings.projectKey, updatedLookup, true);
        clearProgressCache();
        scanBoard(hostConfig, projectSettings);
      });
      checkbox.dataset.ambientProgressListener = '1';
    }

    ensureCheckboxStyles();
    watchCheckboxCollapseState(header, wrapper, listLabel, boardListElem);
  }

  function watchCheckboxCollapseState(header, wrapper, listLabel, boardListElem) {
    if (!header || !wrapper) return;

    const collapseButton =
      header.querySelector('button[data-testid="board-list-collapse-button"]') ||
      header.querySelector('button[aria-expanded]');
    const applyState = function () {
      let collapsed = false;
      if (collapseButton) {
        const aria = collapseButton.getAttribute('aria-expanded');
        if (aria !== null) {
          collapsed = aria === 'false';
        } else {
          collapsed = collapseButton.getAttribute('aria-pressed') === 'true';
        }
      }
      if (
        !collapsed &&
        boardListElem &&
        (boardListElem.classList.contains('is-collapsed') ||
          boardListElem.classList.contains('board-list-collapsed') ||
          boardListElem.classList.contains('board-list--collapsed') ||
          boardListElem.classList.contains('gl-board-list--collapsed'))
      ) {
        collapsed = true;
      }
      wrapper.classList.toggle('ambient-progress-list-checkbox-collapsed', collapsed);
      repositionCheckbox(wrapper, header, listLabel, collapsed);
    };

    applyState();

    if (!collapseButton || collapseButton.dataset.ambientProgressCollapseListener) {
      return;
    }

    collapseButton.addEventListener('click', function () {
      setTimeout(applyState, 35);
    });
    collapseButton.dataset.ambientProgressCollapseListener = '1';
  }

  function repositionCheckbox(wrapper, header, listLabel, collapsed) {
    if (!wrapper || !header) return;
    if (collapsed) {
      if (wrapper.parentNode !== header) {
        header.appendChild(wrapper);
      }
      return;
    }
    if (listLabel && listLabel.parentElement) {
      const sameParent = wrapper.parentNode === listLabel.parentElement;
      const alreadyNext = wrapper.previousElementSibling === listLabel;
      if (!sameParent || !alreadyNext) {
        listLabel.insertAdjacentElement('afterend', wrapper);
      }
      return;
    }
    if (wrapper.parentNode !== header) {
      header.appendChild(wrapper);
    }
  }

  /******************************************************************
   * Toolbar (Debug/Anzeigen – Dark Mode)
   ******************************************************************/

  function createToolbar(hostConfig, projectSettings) {
    const existing = document.getElementById('ambient-progress-toolbar');
    if (existing) return existing;

    const targetSelectors = ['.top-bar-container', '.top-bar-fixed'];
    let insertParent = null;
    for (let si = 0; si < targetSelectors.length; si++) {
      const candidate = document.querySelector(targetSelectors[si]);
      if (candidate) {
        insertParent = candidate;
        break;
      }
    }
    if (!insertParent) {
      insertParent = document.body;
    }

    const bar = document.createElement('div');
    bar.id = 'ambient-progress-toolbar';
    applyStyles(bar, {
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
      padding: '0 0.75rem',
      height: '42px',
      marginLeft: 'auto',
      fontSize: '13px',
      color: '#e9ecef'
    });

    function makeSwitch(labelText, checked, onChange) {
      const wrapper = document.createElement('div');
      applyStyles(wrapper, {
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
        cursor: 'pointer'
      });

      const labelSpan = document.createElement('span');
      labelSpan.textContent = labelText;
      applyStyles(labelSpan, {
        opacity: '0.85',
        fontWeight: '500'
      });

      const switchWrapper = document.createElement('div');
      applyStyles(switchWrapper, {
        position: 'relative',
        width: '38px',
        height: '20px'
      });

      const slider = document.createElement('span');
      applyStyles(slider, {
        position: 'absolute',
        top: '0',
        left: '0',
        right: '0',
        bottom: '0',
        borderRadius: '999px',
        background: checked ? '#4ade80' : '#4b5563',
        transition: 'background 0.2s ease'
      });

      const knob = document.createElement('span');
      applyStyles(knob, {
        position: 'absolute',
        top: '2px',
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        background: '#ffffff',
        boxShadow: '0 1px 2px rgba(0,0,0,0.35)',
        transition: 'left 0.2s ease',
        left: checked ? 'calc(100% - 18px)' : '2px'
      });

      slider.appendChild(knob);

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = checked;
      applyStyles(checkbox, {
        position: 'absolute',
        opacity: '0',
        width: '100%',
        height: '100%',
        margin: '0',
        cursor: 'pointer',
        zIndex: '2'
      });

      function updateAppearance(val) {
        applyStyles(slider, {
          background: val ? '#4ade80' : '#4b5563'
        });
        knob.style.left = val ? 'calc(100% - 18px)' : '2px';
      }

      checkbox.addEventListener('change', function () {
        updateAppearance(checkbox.checked);
        onChange(checkbox.checked);
      });

      switchWrapper.appendChild(slider);
      switchWrapper.appendChild(checkbox);

      wrapper.appendChild(labelSpan);
      wrapper.appendChild(switchWrapper);
      return wrapper;
    }

    const togglesContainer = document.createElement('div');
    applyStyles(togglesContainer, {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      gap: '1rem',
      padding: '1em 0',
      minWidth: '220px'
    });

    const debugToggle = makeSwitch('Debug', debugEnabled, function (val) {
      debugEnabled = val;
      writeBoolToLocalStorage(LS_KEY_DEBUG, debugEnabled);
      console.log(LOG_PREFIX, 'Debug geändert auf:', debugEnabled);
    });

    const showToggle = makeSwitch('Anzeigen', showEnabled, function (val) {
      showEnabled = val;
      writeBoolToLocalStorage(LS_KEY_SHOW, showEnabled);
      log('Anzeigen geändert auf:', showEnabled);
      applyShowFlagToAllBadges();
      applyShowFlagToDetailBadges();
      if (showEnabled) {
        clearProgressCache();
        const hostConfig = getCurrentHostConfig();
        const projectSettings = hostConfig && getProjectSettings(hostConfig);
        if (hostConfig && projectSettings) {
          scanBoard(hostConfig, projectSettings);
          scanIssueDetail(hostConfig, projectSettings);
        }
      }
    });

    togglesContainer.appendChild(debugToggle);
    togglesContainer.appendChild(showToggle);

    const gearWrapper = document.createElement('div');
    applyStyles(gearWrapper, {
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center'
    });

    const gearButton = document.createElement('button');
    gearButton.type = 'button';
    gearButton.setAttribute('aria-label', 'Progress-Einstellungen');
    gearButton.textContent = '⚙';
    applyStyles(gearButton, {
      border: '1px solid #4b5563',
      background: '#111827',
      color: '#e5e7eb',
      borderRadius: '999px',
      padding: '4px 10px',
      fontSize: '14px',
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    });

    const dropdown = document.createElement('div');
    applyStyles(dropdown, {
      position: 'absolute',
      top: 'calc(100% + 6px)',
      right: '0',
      background: '#111827',
      border: '1px solid #2f374c',
      borderRadius: '8px',
      boxShadow: '0 10px 25px rgba(15, 23, 42, 0.35)',
      display: 'none',
      flexDirection: 'column',
      zIndex: '150',
      gap: '0',
      padding: '0.35rem 0.75rem'
    });

    dropdown.appendChild(togglesContainer);
    if (projectSettings) {
      const projectConfigSection = createProjectConfigSection(hostConfig, projectSettings);
      dropdown.appendChild(projectConfigSection);
    }
    gearWrapper.appendChild(gearButton);
    gearWrapper.appendChild(dropdown);
    bar.appendChild(gearWrapper);
    let dropdownLocked = false;
    let hoverOpen = false;
    let closeTimer = null;

    function updateDropdownVisibility() {
      const shouldBeVisible = dropdownLocked || hoverOpen;
      dropdown.style.display = shouldBeVisible ? 'flex' : 'none';
    }

    function scheduleClose() {
      if (closeTimer) {
        clearTimeout(closeTimer);
      }
      closeTimer = setTimeout(function () {
        hoverOpen = false;
        updateDropdownVisibility();
      }, 250);
    }

    gearWrapper.addEventListener('mouseenter', function () {
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
      hoverOpen = true;
      updateDropdownVisibility();
    });
    gearWrapper.addEventListener('mouseleave', function () {
      scheduleClose();
    });

    dropdown.addEventListener('mouseenter', function () {
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
      hoverOpen = true;
      updateDropdownVisibility();
    });
    dropdown.addEventListener('mouseleave', function () {
      scheduleClose();
    });

    gearButton.addEventListener('click', function () {
      dropdownLocked = !dropdownLocked;
      if (!dropdownLocked) {
        hoverOpen = false;
      }
      updateDropdownVisibility();
    });

    insertParent.appendChild(bar);
    return bar;
  }

  function createProjectConfigSection(hostConfig, projectSettings) {
    const section = document.createElement('div');
    applyStyles(section, {
      padding: '0.5rem 0',
      width: '100%',
      borderTop: '1px solid #2f374c',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.4rem'
    });

    const heading = document.createElement('div');
    heading.textContent = 'Projekt-Konfiguration';
    applyStyles(heading, {
      fontSize: '0.8rem',
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      opacity: '0.75',
      fontWeight: '600'
    });

    const pathInfo = document.createElement('div');
    pathInfo.textContent = 'Board: ' + (projectSettings.projectPath || 'unbekannt');
    applyStyles(pathInfo, {
      fontSize: '0.85rem',
      opacity: '0.9'
    });

    const currentId = document.createElement('div');
    const updateCurrentLabel = function (value) {
      const display = value ? value : 'nicht gesetzt';
      currentId.textContent = 'Aktuell: ' + display;
    };
    updateCurrentLabel(projectSettings.projectId);

    applyStyles(currentId, {
      fontSize: '0.8rem',
      color: '#d1d5db'
    });

    const formRow = document.createElement('div');
    applyStyles(formRow, {
      display: 'flex',
      gap: '0.35rem',
      alignItems: 'center'
    });

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Projekt ID eingeben';
    input.value = projectSettings.projectId || '';
    applyStyles(input, {
      flex: '1 1 auto',
      padding: '0.35rem 0.5rem',
      borderRadius: '6px',
      border: '1px solid #374151',
      background: '#0f172a',
      color: '#f8fafc',
      fontSize: '0.85rem'
    });

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Speichern';
    applyStyles(button, {
      background: '#2563eb',
      border: 'none',
      borderRadius: '6px',
      padding: '0.35rem 0.85rem',
      color: '#fff',
      fontSize: '0.85rem',
      cursor: 'pointer'
    });

    const status = document.createElement('div');
    applyStyles(status, {
      fontSize: '0.75rem',
      color: '#a5b4fc',
      minHeight: '1em'
    });

      button.addEventListener('click', function () {
        const attempt = input.value.trim();
        if (!attempt) {
          status.textContent = 'Bitte gib eine Projekt-ID ein.';
          return;
        }
        if (!/^\d+$/.test(attempt)) {
          status.textContent = 'Projekt-ID darf nur Zahlen enthalten.';
          return;
        }
        writeProjectConfigEntry(projectSettings.projectKey, {projectId: attempt});
        projectSettings.projectId = attempt;
        updateCurrentLabel(attempt);
        status.textContent = 'Projekt-ID gespeichert.';
        clearProgressCache();
        if (hostConfig && projectSettings) {
          scanBoard(hostConfig, projectSettings);
          scanIssueDetail(hostConfig, projectSettings);
        }
        window.location.reload();
      });

    formRow.appendChild(input);
    formRow.appendChild(button);
    section.appendChild(heading);
    section.appendChild(pathInfo);
    section.appendChild(currentId);
    section.appendChild(formRow);
    section.appendChild(status);

    const portalHeading = document.createElement('div');
    portalHeading.textContent = 'Portal-Base URL';
    applyStyles(portalHeading, {
      fontSize: '0.8rem',
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      opacity: '0.75',
      fontWeight: '600'
    });

    const portalCurrent = document.createElement('div');
    const updatePortalLabel = function (value) {
      const display = value ? value : 'nicht gesetzt';
      portalCurrent.textContent = 'Portal-Basis: ' + display;
    };
    updatePortalLabel(projectSettings.portalBaseUrl);
    applyStyles(portalCurrent, {
      fontSize: '0.8rem',
      color: '#d1d5db'
    });

    const portalRow = document.createElement('div');
    applyStyles(portalRow, {
      display: 'flex',
      gap: '0.35rem',
      alignItems: 'center'
    });

    const portalInput = document.createElement('input');
    portalInput.type = 'text';
    portalInput.placeholder = 'https://portal.ambient.digital';
    portalInput.value = projectSettings.portalBaseUrl || '';
    applyStyles(portalInput, {
      flex: '1 1 auto',
      padding: '0.35rem 0.5rem',
      borderRadius: '6px',
      border: '1px solid #374151',
      background: '#0f172a',
      color: '#f8fafc',
      fontSize: '0.85rem'
    });

    const portalButton = document.createElement('button');
    portalButton.type = 'button';
    portalButton.textContent = 'Speichern';
    applyStyles(portalButton, {
      background: '#2563eb',
      border: 'none',
      borderRadius: '6px',
      padding: '0.35rem 0.85rem',
      color: '#fff',
      fontSize: '0.85rem',
      cursor: 'pointer'
    });

    const portalStatus = document.createElement('div');
    applyStyles(portalStatus, {
      fontSize: '0.75rem',
      color: '#a5b4fc',
      minHeight: '1em'
    });

    portalButton.addEventListener('click', function () {
      const attempt = portalInput.value.trim();
      if (!attempt) {
        portalStatus.textContent = 'Bitte gib eine Portal-Base URL ein.';
        return;
      }
      writeProjectConfigEntry(projectSettings.projectKey, {portalBaseUrl: attempt});
      projectSettings.portalBaseUrl = attempt;
      updatePortalLabel(attempt);
      portalStatus.textContent = 'Portal-Base URL gespeichert.';
      clearProgressCache();
      if (hostConfig && projectSettings) {
        scanBoard(hostConfig, projectSettings);
        scanIssueDetail(hostConfig, projectSettings);
      }
    });

    portalRow.appendChild(portalInput);
    portalRow.appendChild(portalButton);
    section.appendChild(portalHeading);
    section.appendChild(portalCurrent);
    section.appendChild(portalRow);
    section.appendChild(portalStatus);
    return section;
  }

  /******************************************************************
   * Init
   ******************************************************************/

  function init() {
    log('Userscript gestartet, URL:', window.location.href);

    const hostConfig = getCurrentHostConfig();
    if (!hostConfig) {
      warn('Kein hostConfig – Script beendet sich.');
      return;
    }

    const projectSettings = getProjectSettings(hostConfig);
    if (!projectSettings) {
      warn('Keine projectSettings – Script beendet sich.');
      return;
    }

    log('hostConfig:', hostConfig);
    log('projectSettings:', projectSettings);

    createToolbar(hostConfig, projectSettings);
    applyShowFlagToAllBadges();
    applyShowFlagToDetailBadges();

    let initialScanDone = false;

    function tryInitialScan() {
      if (initialScanDone) return;
      initialScanDone = true;
      log('Initialer scanBoard()-Aufruf');
      scanBoard(hostConfig, projectSettings);
      scanIssueDetail(hostConfig, projectSettings);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryInitialScan);
    } else {
      tryInitialScan();
    }

    const root = document.querySelector('.boards-app') || document.body;
    if (!root) {
      warn('Kein Root-Element für MutationObserver gefunden.');
      return;
    }

    const observer = new MutationObserver(function (mutations) {
      let relevantChange = false;
      for (let i = 0; i < mutations.length; i++) {
        if (mutations[i].addedNodes && mutations[i].addedNodes.length) {
          relevantChange = true;
          break;
        }
      }
      if (relevantChange) {
        log('MutationObserver → scanBoard()/scanIssueDetail()');
        clearProgressCache();
        scanBoard(hostConfig, projectSettings);
        scanIssueDetail(hostConfig, projectSettings);
      }
    });

    observer.observe(root, {
      childList: true,
      subtree: true
    });
  }

  init();
})
();
