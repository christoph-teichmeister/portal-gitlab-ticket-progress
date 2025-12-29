// ==UserScript==
// @name         Portal GitLab Ticket Progress
// @namespace    https://ambient-innovation.com/
// @version      4.0.4
// @description  Zeigt gebuchte Stunden aus dem Portal (konfigurierbare Base-URL) in GitLab-Issue-Boards an (nur bestimmte Spalten, z. B. WIP) als Progressbar, inkl. Debug-/Anzeigen-Toggles, Cache-Tools und Konfigurations-Toast.
// @author       christoph-teichmeister
// @match        https://gitlab.ambient-innovation.com/*
// @grant        GM_xmlhttpRequest
// @updateURL    https://raw.githubusercontent.com/christoph-teichmeister/portal-gitlab-ticket-progress/refs/heads/main/portal-gitlab-ticket-progress.js
// @downloadURL  https://raw.githubusercontent.com/christoph-teichmeister/portal-gitlab-ticket-progress/refs/heads/main/portal-gitlab-ticket-progress.js
// ==/UserScript==

(function () {
  'use strict';

  /******************************************************************
   * Globale Settings / State
   ******************************************************************/

  // Host- / Projekt-Konfiguration
  const SCRIPT_VERSION = '4.0.4';
  const TOOLBAR_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" role="img" aria-label="GitLab ticket icon"><g fill="none" stroke="currentColor" stroke-width="1.0" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h10v2a1 1 0 0 1 0 4v2h-10v-2a1 1 0 0 1 0 -4z"/><path d="M6 7h4"/><path d="M6 9h3"/></g></svg>';
  const HOST_CONFIG = {};

  const TOAST_DEFAULT_DURATION_MS = 5000;
  const PORTAL_WARNING_COOLDOWN_MS = 2 * 60 * 1000;
  const TOAST_VARIANTS = {
    warning: {
      background: '#fbbf24',
      color: '#1f2937'
    },
    success: {
      background: '#10b981',
      color: '#0f172a'
    },
    info: {
      background: '#0f172a',
      color: '#d1d5db'
    }
  };

  let toastElement = null;
  let toastHideTimer = null;
  let lastPortalWarningAt = 0;
  const blockedProjectRequests = {};
  let projectIdInputElement = null;
  let portalUrlInputElement = null;
  let projectStatusElement = null;
  let portalStatusElement = null;
  let lastRefreshLabelElement = null;
  let manualRefreshButtonElement = null;
  let forceRefreshMode = false;
  const DETAIL_RETRY_INTERVAL_MS = 700;
  const DETAIL_RETRY_MAX_ATTEMPTS = 3;
  const detailRetryState = {
    timer: null,
    attempts: 0
  };

  // Debug / Anzeige – gesteuert über Toolbar, persistiert in localStorage
  const LS_KEY_DEBUG = 'portalProgressDebug';
  const LS_KEY_SHOW = 'portalProgressShow';
  const LS_KEY_LIST_SELECTIONS = 'ambientProgressListSelections';
  const LS_KEY_PROJECT_CONFIG = 'ambientProgressProjectConfigs';
  const LS_KEY_LAST_REFRESH = 'ambientProgressLastRefresh';
  const LS_KEY_PROGRESS_CACHE = 'ambientProgressCache';
  const LS_KEY_LAST_BOARD_ID = 'ambientProgressLastBoardId';
  const LS_KEY_RELEASE_INFO = 'ambientProgressReleaseInfo';

  let debugEnabled = readBoolFromLocalStorage(LS_KEY_DEBUG, false);  // Default: Debug aus
  let showEnabled = readBoolFromLocalStorage(LS_KEY_SHOW, true);    // Default: Anzeigen an

  const RELEASE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
  const RAW_SCRIPT_URL =
    'https://raw.githubusercontent.com/christoph-teichmeister/portal-gitlab-ticket-progress/refs/heads/main/portal-gitlab-ticket-progress.js';
  const REPO_URL = 'https://github.com/christoph-teichmeister/portal-gitlab-ticket-progress';

  let latestReleaseInfo = null;
  let releaseNotificationElements = {
    badge: null,
    messageRow: null,
    messageText: null,
    actionLink: null
  };

  const LOG_PREFIX = '[GitLab Progress]';
  const PROGRESS_CACHE_TTL_MS = 60 * 60 * 1000;
  const REFRESH_INTERVAL_MS = 60 * 60 * 1000;
  const PROJECT_BLOCK_COOLDOWN_MS = 5 * 60 * 1000;
  const progressCache = {}; // key: projectId + ':' + issueIid → {data, timestamp}
  hydrateProgressCacheFromStorage();

  function ensureToastElement() {
    if (toastElement) return toastElement;
    const el = document.createElement('div');
    el.id = 'ambient-progress-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    applyStyles(el, {
      position: 'fixed',
      top: '1rem',
      right: '1rem',
      maxWidth: '320px',
      padding: '0.75rem 1.25rem',
      borderRadius: '10px',
      boxShadow: '0 15px 40px rgba(15, 23, 42, 0.35)',
      zIndex: '1050',
      fontSize: '0.85rem',
      fontWeight: '600',
      lineHeight: '1.4',
      overflow: 'hidden',
      pointerEvents: 'none',
      transform: 'translateX(110%)',
      opacity: '0',
      transition: 'transform 0.35s ease, opacity 0.35s ease'
    });
    document.body.appendChild(el);
    toastElement = el;
    return el;
  }

  function hideToast() {
    if (!toastElement) return;
    toastElement.style.transform = 'translateX(110%)';
    toastElement.style.opacity = '0';
  }

  function showToast(options) {
    if (!options || !options.text) return;
    const {text, variant = 'info', duration = TOAST_DEFAULT_DURATION_MS} = options;
    const el = ensureToastElement();
    const variantStyles = TOAST_VARIANTS[variant] || TOAST_VARIANTS.info;
    applyStyles(el, {
      background: variantStyles.background,
      color: variantStyles.color
    });
    el.textContent = text;
    void el.offsetWidth;
    el.style.transform = 'translateX(0)';
    el.style.opacity = '1';
    if (toastHideTimer) {
      clearTimeout(toastHideTimer);
    }
    toastHideTimer = setTimeout(function () {
      hideToast();
    }, duration);
  }

  function showPortalWarningToast() {
    const now = Date.now();
    if (now - lastPortalWarningAt < PORTAL_WARNING_COOLDOWN_MS) {
      return;
    }
    lastPortalWarningAt = now;
    showToast({
      text: 'Portal-Base URL fehlt – ⚙ → Projekt-Konfiguration öffnen und eintragen.',
      variant: 'warning'
    });
  }

  function resetDetailRetryState() {
    detailRetryState.attempts = 0;
    if (detailRetryState.timer) {
      clearTimeout(detailRetryState.timer);
      detailRetryState.timer = null;
    }
  }

  function scheduleDetailRetry(hostConfig, projectSettings) {
    if (!hostConfig || !projectSettings) return;
    if (detailRetryState.attempts >= DETAIL_RETRY_MAX_ATTEMPTS) {
      return;
    }
    if (detailRetryState.timer) {
      return;
    }
    detailRetryState.attempts += 1;
    detailRetryState.timer = setTimeout(function () {
      detailRetryState.timer = null;
      log('Detail-Teilnehmerbereich noch nicht vorhanden – erneuter Versuch #' + detailRetryState.attempts);
      scanIssueDetail(hostConfig, projectSettings);
    }, DETAIL_RETRY_INTERVAL_MS);
  }

  function isProjectRequestBlocked(projectKey) {
    if (!projectKey) return false;
    const entry = blockedProjectRequests[projectKey];
    if (!entry) return false;
    if (entry.blockedAt && Date.now() - entry.blockedAt > PROJECT_BLOCK_COOLDOWN_MS) {
      delete blockedProjectRequests[projectKey];
      return false;
    }
    return true;
  }

  function blockProjectRequests(projectKey, status) {
    if (!projectKey || blockedProjectRequests[projectKey]) return;
    blockedProjectRequests[projectKey] = {
      status: status || null,
      blockedAt: Date.now()
    };
    showToast({
      text: 'Portal-Requests blockiert (Status ' + status + ') – bitte Portal-Base URL prüfen.',
      variant: 'warning'
    });
  }

  function clearProjectRequestBlock(projectKey) {
    if (!projectKey) return;
    if (blockedProjectRequests[projectKey]) {
      delete blockedProjectRequests[projectKey];
    }
  }

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

  function readReleaseInfoFromStorage() {
    try {
      const raw = window.localStorage.getItem(LS_KEY_RELEASE_INFO);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }
      const timestamp = Number(parsed.checkedAt);
      if (isNaN(timestamp)) {
        return null;
      }
      return {
        version: normalizeVersionValue(parsed.version),
        htmlUrl: parsed.htmlUrl || RAW_SCRIPT_URL,
        checkedAt: timestamp
      };
    } catch (e) {
      return null;
    }
  }

  function writeReleaseInfoToStorage(info) {
    try {
      if (!info || !info.version) {
        window.localStorage.removeItem(LS_KEY_RELEASE_INFO);
        return;
      }
      window.localStorage.setItem(LS_KEY_RELEASE_INFO, JSON.stringify(info));
    } catch (e) {
      // ignore
    }
  }

  function getCachedReleaseInfo() {
    if (latestReleaseInfo !== null) {
      return latestReleaseInfo;
    }
    latestReleaseInfo = readReleaseInfoFromStorage();
    return latestReleaseInfo;
  }

  function parseVersionSegments(value) {
    if (!value) {
      return [];
    }
    const normalized = String(value).trim().replace(/^v/i, '');
    if (!normalized) {
      return [];
    }
    return normalized.split('.').map(function (segment) {
      const numeric = parseInt(segment, 10);
      return isNaN(numeric) ? 0 : numeric;
    });
  }

  function normalizeVersionValue(value) {
    if (!value) {
      return '';
    }
    let text = String(value);
    const commentIndex = text.indexOf('//');
    if (commentIndex >= 0) {
      text = text.slice(0, commentIndex);
    }
    text = text.trim();
    const firstToken = text.split(/\s+/)[0];
    return firstToken ? firstToken.trim() : '';
  }

  function formatVersionLabel(value) {
    const normalized = normalizeVersionValue(value);
    if (!normalized) {
      return '';
    }
    return normalized.replace(/^v/i, '');
  }

  function isRemoteVersionGreater(remoteVersion, currentVersion) {
    log('Comparing versions: remote=', remoteVersion, 'current=', currentVersion);
    if (!remoteVersion) {
      return false;
    }
    const remoteParts = parseVersionSegments(remoteVersion);
    const currentParts = parseVersionSegments(currentVersion);
    const length = Math.max(remoteParts.length, currentParts.length);
    for (let i = 0; i < length; i += 1) {
      const remoteValue = remoteParts[i] || 0;
      const currentValue = currentParts[i] || 0;
      if (remoteValue > currentValue) {
        return true;
      }
      if (remoteValue < currentValue) {
        return false;
      }
    }
    return false;
  }

  function updateReleaseNotificationUI(info) {
    const elements = releaseNotificationElements;
    if (!elements.badge || !elements.messageRow || !elements.messageText || !elements.actionLink) {
      return;
    }
    const hasRemoteUpdate =
      info &&
      typeof info.version === 'string' &&
      isRemoteVersionGreater(info.version, SCRIPT_VERSION);
    log('Release UI update: cachedVersion=', info && info.version ? info.version : '(none)', 'remoteNewer=', hasRemoteUpdate);
    if (hasRemoteUpdate) {
      elements.badge.style.display = 'block';
      elements.messageRow.style.display = 'flex';
      if (elements.divider) {
        elements.divider.style.display = 'block';
      }
      const displayVersion =
        (info && info.version ? formatVersionLabel(info.version) : formatVersionLabel(SCRIPT_VERSION)) ||
        formatVersionLabel(SCRIPT_VERSION);
      elements.messageText.textContent =
        '⚠️ Neue Version ' +
        displayVersion +
        ' verfügbar - öffne das Tampermonkey-Dashboard, um das Script zu aktualisieren.';
      elements.actionLink.href = REPO_URL;
      elements.actionLink.style.display = 'inline-flex';
    } else {
      elements.badge.style.display = 'none';
      elements.messageRow.style.display = 'none';
      elements.actionLink.style.display = 'none';
      if (elements.divider) {
        elements.divider.style.display = 'none';
      }
    }
  }

  function fetchLatestReleaseInfo() {
    try {
      GM_xmlhttpRequest({
        method: 'GET',
        url: RAW_SCRIPT_URL,
        timeout: 30 * 1000,
        onload: function (response) {
          if (response.status !== 200) {
            warn('Release-Check meldet HTTP ' + response.status);
            return;
          }
          const versionMatch = response.responseText.match(/\/\/\s*@version\s+([^\\s]+)/);
          if (!versionMatch || versionMatch.length < 2) {
            warn('Release-Check konnte Version nicht finden');
            return;
          }
          const parsedVersion = normalizeVersionValue(versionMatch[1]);
          if (!parsedVersion) {
            warn('Release-Check konnte die Versionsnummer nicht bereinigen');
            return;
          }
          latestReleaseInfo = {
            version: String(parsedVersion),
            htmlUrl: RAW_SCRIPT_URL,
            checkedAt: Date.now()
          };
          log('Release-Check: remote version', latestReleaseInfo.version);
          writeReleaseInfoToStorage(latestReleaseInfo);
          updateReleaseNotificationUI(latestReleaseInfo);
        },
        onerror: function () {
          warn('Release-Check konnte nicht ausgeführt werden (Netzwerkfehler).');
        }
      });
    } catch (e) {
      warn('Release-Check konnte nicht gestartet werden', e);
    }
  }

  function scheduleReleaseCheck() {
    const cached = getCachedReleaseInfo();
    if (cached) {
      updateReleaseNotificationUI(cached);
      log('Release check: using cached version', cached.version, 'lastChecked=', cached.checkedAt);
    }
    if (cached && Date.now() - cached.checkedAt < RELEASE_CHECK_INTERVAL_MS) {
      return;
    }
    fetchLatestReleaseInfo();
  }

  function readLastRefreshTimestamp() {
    try {
      const val = window.localStorage.getItem(LS_KEY_LAST_REFRESH);
      if (!val) {
        return null;
      }
      const parsed = parseInt(val, 10);
      if (isNaN(parsed)) {
        return null;
      }
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function writeLastRefreshTimestamp(value) {
    try {
      if (value === null || value === undefined) {
        window.localStorage.removeItem(LS_KEY_LAST_REFRESH);
      } else {
        window.localStorage.setItem(LS_KEY_LAST_REFRESH, String(value));
      }
    } catch (e) {
      // ignore
    }
    updateLastRefreshLabel();
  }

  function updateLastRefreshLabel() {
    if (!lastRefreshLabelElement) {
      return;
    }
    const timestamp = readLastRefreshTimestamp();
    lastRefreshLabelElement.textContent = timestamp
      ? 'Letzte Aktualisierung: ' + formatRefreshTimestamp(timestamp)
      : 'Letzte Aktualisierung: -';
  }

  function formatRefreshTimestamp(value) {
    if (!value) {
      return '–';
    }
    try {
      const date = new Date(value);
      return date.toLocaleString('de-DE', {
        hour12: false
      });
    } catch (e) {
      return '–';
    }
  }

  function markPortalRefreshTimestamp() {
    writeLastRefreshTimestamp(Date.now());
  }

  function shouldPerformPortalRequest(hasCache = true) {
    if (forceRefreshMode) {
      return true;
    }
    if (!hasCache) {
      return true;
    }
    const last = readLastRefreshTimestamp();
    if (!last) {
      return true;
    }
    return Date.now() - last >= REFRESH_INTERVAL_MS;

  }

  function getProgressCacheAgeMs() {
    const lastRefresh = readLastRefreshTimestamp();
    if (lastRefresh) {
      return Date.now() - lastRefresh;
    }
    let latestTimestamp = 0;
    for (const key in progressCache) {
      if (!Object.prototype.hasOwnProperty.call(progressCache, key)) {
        continue;
      }
      const entry = progressCache[key];
      if (!entry) {
        continue;
      }
      const entryTimestamp = Number(entry.timestamp);
      if (!entryTimestamp) {
        continue;
      }
      if (entryTimestamp > latestTimestamp) {
        latestTimestamp = entryTimestamp;
      }
    }
    if (latestTimestamp) {
      return Date.now() - latestTimestamp;
    }
    return null;
  }

  function isProgressCacheStale() {
    const age = getProgressCacheAgeMs();
    return age !== null && age > PROGRESS_CACHE_TTL_MS;
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

  function readProgressCacheState() {
    try {
      const raw = window.localStorage.getItem(LS_KEY_PROGRESS_CACHE);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function writeProgressCacheState(state) {
    try {
      const snapshot = {};
      for (const key in state) {
        if (!Object.prototype.hasOwnProperty.call(state, key)) continue;
        const entry = state[key];
        if (!entry || typeof entry !== 'object') continue;
        const timestamp = Number(entry.timestamp);
        if (!timestamp || !entry.data) continue;
        snapshot[key] = {
          timestamp,
          data: entry.data
        };
      }
      window.localStorage.setItem(LS_KEY_PROGRESS_CACHE, JSON.stringify(snapshot));
    } catch (e) {
      // ignore
    }
  }

  function readLastBoardIdentifierFromStorage() {
    try {
      return window.localStorage.getItem(LS_KEY_LAST_BOARD_ID);
    } catch (e) {
      return null;
    }
  }

  function writeLastBoardIdentifierToStorage(value) {
    try {
      if (value) {
        window.localStorage.setItem(LS_KEY_LAST_BOARD_ID, value);
      } else {
        window.localStorage.removeItem(LS_KEY_LAST_BOARD_ID);
      }
    } catch (e) {
      // ignore
    }
  }

  function getBoardIdentifierFromPath() {
    const match = window.location.pathname.match(/\/-\/boards\/([^\/?]+)/);
    if (match && match[1]) {
      return match[1];
    }
    return null;
  }

  function isBoardView() {
    return window.location.pathname.indexOf('/-/boards') !== -1;
  }

  function isIssueDetailView() {
    return window.location.pathname.indexOf('/-/issues') !== -1;
  }

  function getCurrentBoardIdentifier() {
    const fromPath = getBoardIdentifierFromPath();
    if (fromPath) {
      writeLastBoardIdentifierToStorage(fromPath);
      return fromPath;
    }
    const stored = readLastBoardIdentifierFromStorage();
    return stored || 'default';
  }

  function buildProgressCacheKey(projectSettings, issueIid) {
    if (!projectSettings || !issueIid) {
      return null;
    }
    const projectIdentifier = projectSettings.projectKey || projectSettings.projectPath;
    if (!projectIdentifier) {
      return null;
    }
    const boardId = getCurrentBoardIdentifier();
    const normalizedBoardId = boardId ? boardId : 'default';
    return 'board:' + normalizedBoardId + '|' + projectIdentifier + ':' + String(issueIid);
  }

  function hydrateProgressCacheFromStorage() {
    const stored = readProgressCacheState();
    if (!stored) return;
    const now = Date.now();
    for (const key in stored) {
      if (!Object.prototype.hasOwnProperty.call(stored, key)) continue;
      const entry = stored[key];
      if (!entry || typeof entry !== 'object') continue;
      const timestamp = Number(entry.timestamp);
      if (!timestamp || now - timestamp > PROGRESS_CACHE_TTL_MS) {
        continue;
      }
      progressCache[key] = {
        data: entry.data,
        timestamp: timestamp
      };
    }
    writeProgressCacheState(progressCache);
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
      bookedFallback: '#2563eb',
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
        background: colors.bookedFallback || colors.neutral
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
      let centerText = 'Over: ' + progressData.over;
      if (progressData.booked) {
        centerText += ' (' + progressData.booked + ')';
      }
      appendCenterText(centerText);
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
      writeProgressCacheState(progressCache);
      return null;
    }
    return entry.data;
  }

  function findProgressCacheEntryForIssue(projectSettings, issueIid) {
    if (!projectSettings || !issueIid) return null;
    const projectIdentifier = projectSettings.projectKey || projectSettings.projectPath;
    if (!projectIdentifier) return null;

    const primaryKey = buildProgressCacheKey(projectSettings, issueIid);
    if (primaryKey) {
      const primaryCached = getProgressCacheEntry(primaryKey);
      if (primaryCached) {
        return primaryCached;
      }
    }

    const suffix = '|' + projectIdentifier + ':' + String(issueIid);
    for (const key in progressCache) {
      if (!Object.prototype.hasOwnProperty.call(progressCache, key)) continue;
      if (!key.endsWith(suffix)) continue;
      const candidate = getProgressCacheEntry(key);
      if (candidate) {
        log('Detail-Cache-Fallback nutzt Board-Cache', key, 'für Issue', issueIid);
        return candidate;
      }
    }

    return null;
  }

  function setProgressCacheEntry(cacheKey, data) {
    progressCache[cacheKey] = {
      data,
      timestamp: Date.now()
    };
    writeProgressCacheState(progressCache);
  }

  function clearProgressCache() {
    Object.keys(progressCache).forEach(function (key) {
      delete progressCache[key];
    });
    try {
      window.localStorage.removeItem(LS_KEY_PROGRESS_CACHE);
    } catch (e) {
      // ignore
    }
    writeLastRefreshTimestamp(null);
  }

  function getCurrentHostConfig() {
    const host = window.location.hostname;
    const cfg = HOST_CONFIG[host];
    if (!cfg && debugEnabled) {
      log('Keine HOST_CONFIG für Host gefunden – benutze leeres Projekt-Setup:', host);
    }
    return cfg || {projects: {}};
  }

  // /company/some-project/-/boards → "company/some-project"
  function getGitLabProjectPathFromLocation() {
    const path = window.location.pathname;
    const parts = path.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const cutoff = parts.indexOf('-');
    const relevantSegments = cutoff === -1 ? parts : parts.slice(0, cutoff);
    if (relevantSegments.length < 2) {
      return null;
    }
    return relevantSegments.join('/');
  }

  function isMergeRequestPage() {
    return /\/merge_requests\//.test(window.location.pathname);
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

  const GITLAB_LIGHT_BG_VARS = [
    '--body-bg',
    '--gl-body-bg',
    '--gl-app-background',
    '--gl-page-bg',
    '--gl-warm-background',
    '--gl-surface-0',
    '--gl-surface-100'
  ];
  const GITLAB_DARK_BG_VARS = [
    '--gl-dark-mode-body-bg',
    '--gl-dark-surface',
    '--gl-dark-mode-surface',
    '--gl-navbar-background',
    '--gl-top-bar-background',
    '--gl-page-background'
  ];
  const GITLAB_BG_SELECTORS = [
    '.top-bar-container',
    '.top-bar-fixed',
    '.gl-app-header',
    '.gl-top-bar',
    'body'
  ];
  const gitlabWindowBackgroundCache = {
    light: null,
    default: null
  };
  const GITLAB_THEME_BG_VAR = '--theme-background-color';

  function readCssVariableValue(name) {
    if (!name) return null;
    try {
      const computed = window.getComputedStyle(document.documentElement).getPropertyValue(name);
      if (!computed) return null;
      const value = computed.trim();
      if (!value) return null;
      if (value === 'transparent' || value === 'rgba(0, 0, 0, 0)' || value === 'rgba(0,0,0,0)') {
        return null;
      }
      return value;
    } catch (e) {
      return null;
    }
  }

  function getFirstCssVariableValue(names) {
    if (!names || !names.length) return null;
    for (let i = 0; i < names.length; i++) {
      const value = readCssVariableValue(names[i]);
      if (value) {
        return value;
      }
    }
    return null;
  }

  function getComputedBackgroundFromSelectors(selectors) {
    if (!selectors || !selectors.length) return null;
    for (let i = 0; i < selectors.length; i++) {
      try {
        const element = document.querySelector(selectors[i]);
        if (!element) continue;
        const bg = window.getComputedStyle(element).backgroundColor;
        if (!bg) continue;
        if (bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)' || bg === 'rgba(0,0,0,0)') {
          continue;
        }
        return bg;
      } catch (e) {
        // ignore invalid selector
      }
    }
    return null;
  }

  function isGitLabDarkModeActive() {
    const html = document.documentElement;
    if (html) {
      const dataTheme = html.getAttribute('data-theme');
      if (dataTheme) {
        const lower = dataTheme.toLowerCase();
        if (lower.includes('dark')) {
          log('isGitLabDarkModeActive', {source: 'data-theme', value: dataTheme, result: true});
          return true;
        }
        if (lower.includes('light')) {
          log('isGitLabDarkModeActive', {source: 'data-theme', value: dataTheme, result: false});
          return false;
        }
      }
      if (html.classList) {
        if (
          html.classList.contains('gl-theme-dark') ||
          html.classList.contains('gl-dark') ||
          html.classList.contains('theme-dark')
        ) {
          log('isGitLabDarkModeActive', {source: 'html-class', class: 'dark', result: true});
          return true;
        }
        if (
          html.classList.contains('gl-theme-light') ||
          html.classList.contains('gl-light') ||
          html.classList.contains('theme-light')
        ) {
          log('isGitLabDarkModeActive', {source: 'html-class', class: 'light', result: false});
          return false;
        }
      }
    }

    const body = document.body;
    if (body && body.classList) {
      if (body.classList.contains('gl-theme-dark') || body.classList.contains('gl-dark')) {
        return true;
      }
      if (body.classList.contains('gl-theme-light') || body.classList.contains('gl-light')) {
        return false;
      }
    }

    const themeBg = readCssVariableValue(GITLAB_THEME_BG_VAR);
    if (themeBg) {
      const rgb = parseCssColorToRgb(themeBg);
      if (rgb) {
        const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
        const isDark = luminance <= 0.55;
        log('isGitLabDarkModeActive', {source: 'theme-var', themeBg, luminance: luminance.toFixed(3), isDark});
        return isDark;
      }
    }

    const computedBg = getComputedBackgroundFromSelectors(GITLAB_BG_SELECTORS);
    if (computedBg) {
      const rgb = parseCssColorToRgb(computedBg);
      if (rgb) {
        const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
        const isDark = luminance <= 0.55;
        log('isGitLabDarkModeActive', {computedBg, luminance: luminance.toFixed(3), isDark});
        return isDark;
      }
    }

    log('isGitLabDarkModeActive', {source: 'default', result: false});
    return false;
  }

  function getToolbarForegroundColor() {
    return isGitLabDarkModeActive() ? '#ececef' : '#28272d';
  }

  function getGitLabWindowBackgroundColor(preferLightInDarkMode) {
    const cacheKey = preferLightInDarkMode ? 'light' : 'default';

    if (gitlabWindowBackgroundCache[cacheKey]) {
      return gitlabWindowBackgroundCache[cacheKey];
    }

    const isDarkMode = isGitLabDarkModeActive();
    const preferLight = isDarkMode ? Boolean(preferLightInDarkMode) : true;

    const variableOrder = preferLight
      ? GITLAB_LIGHT_BG_VARS.concat(GITLAB_DARK_BG_VARS)
      : GITLAB_DARK_BG_VARS.concat(GITLAB_LIGHT_BG_VARS);

    let value = readCssVariableValue(GITLAB_THEME_BG_VAR);
    if (!value) {
      value = getFirstCssVariableValue(variableOrder);
    }
    if (!value) {
      value = getComputedBackgroundFromSelectors(GITLAB_BG_SELECTORS);
    }

    if (!value) {
      value = '#111827';
    }

    gitlabWindowBackgroundCache[cacheKey] = value;
    return value;
  }

  function parseCssColorToRgb(value) {
    if (!value || typeof value !== 'string') {
      log('parseCssColorToRgb', {input: value, result: null});
      return null;
    }
    const trimmed = value.trim().toLowerCase();
    if (trimmed.startsWith('rgba') || trimmed.startsWith('rgb')) {
      const match = trimmed.match(/rgba?\(([^)]+)\)/);
      if (!match) {
        log('parseCssColorToRgb', {input: value, result: null});
        return null;
      }
      const parts = match[1].split(',').map(function (part) {
        return parseFloat(part.trim());
      });
      if (parts.length < 3 || Number.isNaN(parts[0]) || Number.isNaN(parts[1]) || Number.isNaN(parts[2])) {
        log('parseCssColorToRgb', {input: value, result: null});
        return null;
      }
      const rgbResult = {
        r: parts[0],
        g: parts[1],
        b: parts[2]
      };
      log('parseCssColorToRgb', {input: value, result: rgbResult});
      return rgbResult;
    }
    if (trimmed.startsWith('#')) {
      const hex = trimmed.slice(1);
      if (hex.length === 3) {
        const rgbResult = {
          r: parseInt(hex[0] + hex[0], 16),
          g: parseInt(hex[1] + hex[1], 16),
          b: parseInt(hex[2] + hex[2], 16)
        };
        log('parseCssColorToRgb', {input: value, result: rgbResult});
        return rgbResult;
      }
      if (hex.length === 6 || hex.length === 8) {
        const rgbResult = {
          r: parseInt(hex.slice(0, 2), 16),
          g: parseInt(hex.slice(2, 4), 16),
          b: parseInt(hex.slice(4, 6), 16)
        };
        log('parseCssColorToRgb', {input: value, result: rgbResult});
        return rgbResult;
      }
    }
    log('parseCssColorToRgb', {input: value, result: null});
    return null;
  }

  function getContrastTextColor(bgColor, darkColor, lightColor) {
    const rgb = parseCssColorToRgb(bgColor);

    const fallbackDark = darkColor || '#0f172a';
    const fallbackLight = lightColor || '#f8fafc';

    if (!rgb) {
      log('getContrastTextColor', {bgColor, choice: 'fallback', result: fallbackLight});
      return fallbackLight;
    }

    const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
    const chosen = luminance > 0.55 ? fallbackDark : fallbackLight;

    log('getContrastTextColor', {bgColor, luminance: luminance.toFixed(3), choice: chosen === fallbackDark ? 'dark' : 'light', result: chosen});

    return chosen;
  }

  function getBoardListHeaderElement(boardListElem) {
    if (!boardListElem) return null;
    return boardListElem.querySelector('header[data-testid="board-list-header"]');
  }

  function getListNameFromBoardListElem(boardListElem, headerOverride) {
    const header = headerOverride || getBoardListHeaderElement(boardListElem);
    if (!header) return null;
    try {
      const labelSpan = header.querySelector('.board-title-text .gl-label-text');
      if (labelSpan && labelSpan.textContent) {
        return labelSpan.textContent.replace(/\s+/g, ' ').trim();
      }

      const h2 = header.querySelector('.board-title-text');
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

    const iid = cardElem.getAttribute('data-item-iid');
    if (iid) return iid;

    try {
      const numberSpan = cardElem.querySelector('.board-card-number span');
      if (numberSpan && numberSpan.textContent) {
        const m = numberSpan.textContent.match(/#(\d+)/);
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
    const norm = String(text).replace(',', '.');
    const m = norm.match(/-?[\d.]+/);
    if (!m) return null;
    const v = parseFloat(m[0]);
    if (isNaN(v)) return null;
    return v;
  }

  function formatBookedHoursDisplay(value) {
    if (value === null || value === undefined) return null;
    let hours;
    if (typeof value === 'number' && !isNaN(value)) {
      hours = value;
    } else {
      hours = extractHourNumber(value);
    }
    if (hours === null) return null;
    const normalized = Number(hours);
    let normalizedStr = normalized.toString();
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
    const matches = text.match(/\b\d+(?:[.,]\d+)?(?![\d.,])/g);
    if (!matches || matches.length === 0) return null;
    let sum = 0;
    let found = false;
    for (let i = 0; i < matches.length; i++) {
      const candidate = matches[i].replace(',', '.');
      const num = parseFloat(candidate);
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
    let sum = 0;
    let found = false;
    for (let i = 0; i < el.childNodes.length; i++) {
      const node = el.childNodes[i];
      if (node.nodeType !== Node.TEXT_NODE) continue;
      const value = sumHourNumbersFromText(node.textContent);
      if (value !== null) {
        sum += value;
        found = true;
      }
    }
    return found ? sum : null;
  }

  function extractHourValueFromElement(el) {
    if (!el) return null;
    const directSum = sumHourNumbersFromDirectTextNodes(el);
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
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, 'text/html');

      function attachBookedInfo(result, cached) {
        const booked = cached || parseBookedHours(doc);
        if (booked) {
          result.booked = booked.value;
          result.bookedLabel = booked.label || 'Booked Hours';
        }
        return result;
      }

      function fallbackBooked() {
        const booked = parseBookedHours(doc);
        if (!booked) return null;
        return attachBookedInfo(
          {
            spent: null,
            remaining: null,
            over: null
          },
          booked
        );
      }

      const progressDiv = doc.querySelector('div.progress') || doc.querySelector('div.Progress');
      if (!progressDiv) {
        if (debugEnabled) log('parseProgressHtml: Kein div.progress/Progress gefunden → Fallback Booked Hours.');
        return fallbackBooked();
      }

      let innerDivs = progressDiv.querySelectorAll('div.progress-bar');
      if (!innerDivs || innerDivs.length === 0) {
        innerDivs = progressDiv.querySelectorAll('div');
      }
      if (!innerDivs || innerDivs.length === 0) {
        if (debugEnabled) log('parseProgressHtml: Keine inneren divs → Fallback Booked Hours.');
        return fallbackBooked();
      }

      const texts = [];
      for (let i = 0; i < innerDivs.length; i++) {
        let content = innerDivs[i].textContent;
        if (!content) continue;
        content = content.replace(/\s+/g, ' ').trim();
        if (!content) continue;
        texts.push(content);
      }
      if (texts.length === 0) {
        if (debugEnabled) log('parseProgressHtml: Keine nichtleeren Textinhalte → Fallback Booked Hours.');
        return fallbackBooked();
      }

      // Over-Fall: ein Wert, z. B. "-72.25h"
      if (texts.length === 1) {
        const single = texts[0];
        if (/^-/.test(single)) {
          const overText = single.replace(/^-+/, '');
          return attachBookedInfo({spent: null, remaining: null, over: overText});
        }
        // sonst: Einzelwert = spent
        return attachBookedInfo({spent: single, remaining: null, over: null});
      }

      // Normalfall: mind. zwei Werte → erster = spent, zweiter = remaining
      return attachBookedInfo({spent: texts[0], remaining: texts[1], over: null});
    } catch (e) {
      error('Fehler beim Parsen des Progress-HTML:', e);
      return null;
    }
  }

  // Fallback: "Booked Hours" auslesen, wenn es keine Progress-Bar gibt
  function parseBookedHours(doc) {
    try {
      const inlineMatch = parseInlineBookedHours(doc);
      if (inlineMatch) return inlineMatch;

      const rowMatch = parseBookedHoursFromTableRows(doc);
      if (rowMatch) return rowMatch;

      return parseBookedHoursFromCandidates(doc);
    } catch (e) {
      error('Fehler beim Fallback-Parsing Booked Hours:', e);
    }
    return null;
  }

  function parseInlineBookedHours(doc) {
    const candidates = doc.querySelectorAll('th, td, div, span, p, label');
    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      const text = normalizeWhitespace(el.textContent);
      if (!text) continue;

      const mInline = text.match(/(Gebuchte\s+Stunden|Booked\s+Hours)\s*:\s*(.+)$/i);
      if (mInline && mInline[2]) {
        const inlineVal = mInline[2].trim();
        const inlineLabel = mInline[1] ? mInline[1].trim() : null;
        const label = detectBookedLabel(inlineLabel);
        if (inlineVal) {
          const formattedInline = formatBookedHoursDisplay(inlineVal);
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
    const rows = doc.querySelectorAll('tr');
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const cells = Array.prototype.slice.call(row.querySelectorAll('th, td'));
      if (!cells || cells.length === 0) continue;

      for (let j = 0; j < cells.length; j++) {
        const cell = cells[j];
        const cellText = normalizeWhitespace(cell.textContent);
        if (!cellText) continue;
        const label = detectBookedLabel(cellText);
        if (!label) continue;

        for (let k = j + 1; k < cells.length; k++) {
          const candidateCell = cells[k];
          const value = extractHourValueFromElement(candidateCell);
          if (value !== null) {
            const formatted = formatBookedHoursDisplay(value);
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
    const candidates = doc.querySelectorAll('th, td, div, span, p, label');
    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      const text = normalizeWhitespace(el.textContent);
      if (!text) continue;

      const label = detectBookedLabel(text);
      if (!label) continue;

      let candidateEl = null;
      let candidateVal = null;

      // direktes nextElementSibling
      const next = el.nextElementSibling;
      if (next && next.textContent) {
        candidateEl = next;
      }

      // TH → passendes TD
      if (!candidateEl && el.tagName === 'TH' && el.parentElement) {
        const td = el.parentElement.querySelector('td');
        if (td && td.textContent) {
          candidateEl = td;
        }
      }

      // generischer: nächstes Geschwister-Element im selben Parent
      if (!candidateEl && el.parentElement) {
        const siblings = el.parentElement.children;
        for (let j = 0; j < siblings.length - 1; j++) {
          if (siblings[j] === el) {
            const sib = siblings[j + 1];
            if (sib && sib.textContent) {
              candidateEl = sib;
            }
            break;
          }
        }
      }

      if (candidateEl) {
        const summed = sumHourNumbersFromElement(candidateEl);
        if (summed !== null) {
          const formattedSum = formatBookedHoursDisplay(summed);
          if (formattedSum) {
            if (debugEnabled) log('parseBookedHours: Summe der Werte neben "' + label + '" gefunden:', formattedSum);
            return {value: formattedSum, label: label};
          }
        }
        candidateVal = normalizeWhitespace(candidateEl.textContent);
        const formattedAdjacent = formatBookedHoursDisplay(candidateVal);
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
        window.open(url, '_blank', 'noopener,noreferrer');
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
          reject({status: response.status});
          return;
        }
        markPortalRefreshTimestamp();
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

    const projectKey = projectSettings && projectSettings.projectKey;
    if (isProjectRequestBlocked(projectKey)) {
      log('Requests pausiert für Projekt', projectSettings ? projectSettings.projectPath : '<unbekannt>');
      return;
    }

    const projectId = projectSettings.projectId;
    if (!projectId) {
      warn('Kein projectId für', projectSettings.projectPath, '; progress wird nicht geladen.');
      return;
    }
    const cacheKey = buildProgressCacheKey(projectSettings, issueIid);
    if (!cacheKey) {
      warn('Konnte Cache-Schlüssel nicht bestimmen für Issue', issueIid);
      return;
    }

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

    if (!shouldPerformPortalRequest(false)) {
      log('Portal-Request ausgelassen (letzte Aktualisierung < 1h) für Issue', issueIid);
      return;
    }

    log('Hole Progress-Daten für Issue', issueIid, '→', url);

    loadProgressData(url, issueIid)
      .then(function (progressData) {
        clearProjectRequestBlock(projectKey);
        if (!progressData) return;
        setProgressCacheEntry(cacheKey, progressData);
        injectProgressIntoCard(cardElem, progressData);
      })
      .catch(function (err) {
        error('Request-Fehler für Issue ' + issueIid + ':', err);
        if (err && err.status) {
          blockProjectRequests(projectSettings.projectKey, err.status);
        }
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

  function shouldAttemptIssueDetailInjection() {
    const path = window.location.pathname;
    if (/\/issues\/\d+/.test(path)) {
      return true;
    }
    const search = window.location.search || '';
    return search.includes('show=');
  }

  function scanIssueDetail(hostConfig, projectSettings) {
    if (!hostConfig || !projectSettings) {
      log('scanIssueDetail übersprungen (Host/Project fehlt).');
      return;
    }
    if (!showEnabled) {
      log('scanIssueDetail übersprungen (Anzeigen-Toggle aus).');
      return;
    }
    if (!shouldAttemptIssueDetailInjection()) {
      return;
    }

    const wrapperList = document.querySelectorAll('.work-item-attributes-wrapper');
    if (!wrapperList || !wrapperList.length) {
      log('scanIssueDetail: Attribute-Wrapper nicht gefunden.');
      scheduleDetailRetry(hostConfig, projectSettings);
      return;
    }
    resetDetailRetryState();

    for (let i = 0; i < wrapperList.length; i++) {
      const wrapper = wrapperList[i];
      const issueIid = getIssueIidFromDetailView(wrapper);
      if (!issueIid) {
        log('scanIssueDetail: IssueIID nicht bestimmbar für Attribute-Wrapper', wrapper);
        continue;
      }

      const alreadyInjected = wrapper.dataset.ambientProgressIssueIid;
      if (alreadyInjected === issueIid) {
        continue;
      }

      fetchAndDisplayProgressForIssueDetail(hostConfig, projectSettings, issueIid, wrapper);
    }
  }

  function getIssueIidFromDetailView(detailElem) {
    const fromShow = parseIssueIidFromShowParam();
    if (fromShow) return fromShow;

    const pathMatch = window.location.pathname.match(/\/issues\/(\d+)/);
    if (pathMatch) {
      return pathMatch[1];
    }

    if (detailElem) {
      const ancestor =
        detailElem.closest('[work-item-iid]') ||
        detailElem.closest('[data-work-item-iid]');
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

  function fetchAndDisplayProgressForIssueDetail(hostConfig, projectSettings, issueIid, detailWrapperElem) {
    if (!issueIid || !detailWrapperElem) return;

    const projectId = projectSettings.projectId;
    if (!projectId) {
      warn('Kein projectId für', projectSettings.projectPath, '; Detail-Progress wird nicht geladen.');
      return;
    }

    const cacheKey = buildProgressCacheKey(projectSettings, issueIid);
    if (!cacheKey) {
      log('Detail-Cache: Kein Cache-Key möglich für Issue', issueIid);
      return;
    }
    const cached = findProgressCacheEntryForIssue(projectSettings, issueIid);
    if (!cached) {
      log(
        'Kein Cache-Eintrag für Issue-Detail gefunden (Projekt',
        projectSettings.projectPath + ',',
        'Issue',
        issueIid + ').'
      );
      const url = buildPortalUrl(projectSettings, issueIid);
      if (!url) {
        warn(
          'Keine Portal-Basis konfiguriert für',
          projectSettings.projectPath,
          '; Detail-Fortschritt wird nicht geladen.'
        );
        return;
      }
      if (!shouldPerformPortalRequest(false)) {
        log('Detail-Request ausgelassen (letzte Aktualisierung < 1h) für Issue', issueIid);
        return;
      }
      log('Ticket-Detail lädt Progress-Daten (Projekt', projectSettings.projectPath + ',', 'Issue', issueIid + ') →', url);
      loadProgressData(url, issueIid)
        .then(function (progressData) {
          clearProjectRequestBlock(projectSettings.projectKey);
          if (!progressData) return;
          setProgressCacheEntry(cacheKey, progressData);
          injectProgressIntoIssueDetail(detailWrapperElem, progressData);
          detailWrapperElem.dataset.ambientProgressIssueIid = issueIid;
        })
        .catch(function (err) {
          error('Request-Fehler für Issue ' + issueIid + ' (Detailansicht):', err);
          if (err && err.status) {
            blockProjectRequests(projectSettings.projectKey, err.status);
          }
        });
      return;
    }

    log(
      'Ticket-Detail liest Cache (Projekt',
      projectSettings.projectPath + ',',
      'Issue',
      issueIid + ').'
    );

    injectProgressIntoIssueDetail(detailWrapperElem, cached);
    detailWrapperElem.dataset.ambientProgressIssueIid = issueIid;
  }

  function injectProgressIntoIssueDetail(detailWrapperElem, progressData) {
    if (!detailWrapperElem || !progressData) return;

    const windowBackground = getGitLabWindowBackgroundColor(true);
    const textColor = getContrastTextColor(windowBackground);
    let container = detailWrapperElem.querySelector('.ambient-progress-detail-badge');
    if (!container) {
      container = document.createElement('div');
      container.className = 'ambient-progress-detail-badge';
      applyStyles(container, {
        marginBottom: '0.6rem',
        padding: '0.45rem 0',
        borderRadius: '10px',
        background: windowBackground
      });
      const assigneesSection = detailWrapperElem.querySelector('[data-testid="work-item-assignees"]');
      if (assigneesSection) {
        detailWrapperElem.insertBefore(container, assigneesSection);
      } else if (detailWrapperElem.firstChild) {
        detailWrapperElem.insertBefore(container, detailWrapperElem.firstChild);
      } else {
        detailWrapperElem.appendChild(container);
      }
    }

    container.style.display = showEnabled ? '' : 'none';
    container.style.color = textColor;
    container.innerHTML = '';

    const row = document.createElement('div');
    applyStyles(row, {
      display: 'flex',
      flexDirection: 'column',
      gap: '0.35rem',
      fontSize: '12px'
    });

    const barOuter = createProgressBarElements(progressData, {
      textLayer: {color: textColor},
      spentLabel: {color: textColor},
      remainingLabel: {color: textColor},
      centerLabel: {color: textColor}
    });
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

  function refreshPortalBaseWarning(projectSettings) {
    if (!isBoardView() && !isIssueDetailView()) {
      return;
    }
    const baseUrl = getPortalBaseUrl(projectSettings);
    if (!baseUrl) {
      showPortalWarningToast();
    }
  }

  function clearCacheAndReload(hostConfig, projectSettings) {
    clearProgressCache();
    if (projectSettings) {
      clearProjectRequestBlock(projectSettings.projectKey);
    }
    latestReleaseInfo = null;
    writeReleaseInfoToStorage(null);
    showToast({text: 'Cache geleert, lade neu…', variant: 'info'});
    setTimeout(function () {
      window.location.reload();
    }, 50);
  }

  function createToolbar(hostConfig, projectSettings) {
    const existing = document.getElementById('ambient-progress-toolbar');
    if (existing) return existing;

    const windowBackground = getGitLabWindowBackgroundColor(true);

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

    const toolbarTextColor = getToolbarForegroundColor();
    const bar = document.createElement('div');
    bar.id = 'ambient-progress-toolbar';
    applyStyles(bar, {
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
      padding: '0',
      height: '42px',
      marginLeft: 'auto',
      fontSize: '13px',
      color: toolbarTextColor
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

    const debugToggle = makeSwitch('Debug', debugEnabled, function (val) {
      debugEnabled = val;
      writeBoolToLocalStorage(LS_KEY_DEBUG, debugEnabled);
      console.log(LOG_PREFIX, 'Debug geändert auf:', debugEnabled);
    });

    togglesContainer.appendChild(showToggle);
    togglesContainer.appendChild(debugToggle);

    const gearWrapper = document.createElement('div');
    gearWrapper.classList.add('gl-disclosure-dropdown', 'super-sidebar-new-menu-dropdown', 'gl-new-dropdown');
    applyStyles(gearWrapper, {
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center'
    });

    const gearButton = document.createElement('button');
    gearButton.type = 'button';
    gearButton.setAttribute('aria-label', 'Progress-Einstellungen');
    gearButton.setAttribute('data-testid', 'base-dropdown-toggle');
    const gearIcon = document.createElement('span');
    gearIcon.innerHTML = TOOLBAR_ICON_SVG;
    gearIcon.setAttribute('aria-hidden', 'true');
    gearIcon.classList.add('gl-button-icon', 'gl-icon', 's16', 'gl-fill-current');
    applyStyles(gearIcon, {
      width: '20px',
      height: '20px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: toolbarTextColor
    });
    const gearIconSvg = gearIcon.querySelector('svg');
    if (gearIconSvg) {
      gearIconSvg.setAttribute('width', '20');
      gearIconSvg.setAttribute('height', '20');
      gearIconSvg.setAttribute('focusable', 'false');
      applyStyles(gearIconSvg, {
        width: '20px',
        height: '20px',
        display: 'block'
      });
    }
    gearButton.classList.add(
      'btn',
      'gl-button',
      'btn-default',
      'btn-md',
      'btn-default-tertiary',
      'gl-new-dropdown-toggle',
      'gl-new-dropdown-icon-only',
      'btn-icon',
      'gl-new-dropdown-toggle-no-caret'
    );
    applyStyles(gearButton, {
      padding: '0.35rem',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: '38px',
      minHeight: '38px',
      cursor: 'pointer',
      position: 'relative',
      overflow: 'visible'
    });
    gearButton.appendChild(gearIcon);
    const releaseBadge = document.createElement('span');
    releaseBadge.setAttribute('aria-hidden', 'true');
    applyStyles(releaseBadge, {
      position: 'absolute',
      top: '4px',
      right: '4px',
      width: '10px',
      height: '10px',
      borderRadius: '50%',
      background: '#ef4444',
      boxShadow: '0 0 0 2px ' + windowBackground,
      display: 'none',
      pointerEvents: 'none'
    });
    gearButton.appendChild(releaseBadge);
    releaseNotificationElements.badge = releaseBadge;

    const dropdown = document.createElement('div');
    applyStyles(dropdown, {
      position: 'absolute',
      top: 'calc(100% + 6px)',
      right: '0',
      background: windowBackground,
      color: toolbarTextColor,
      border: '1px solid #2f374c',
      borderRadius: '8px',
      boxShadow: '0 10px 25px rgba(15, 23, 42, 0.35)',
      display: 'none',
      flexDirection: 'column',
      zIndex: '150',
      gap: '0',
      padding: '0.75rem'
    });

    const versionLabel = document.createElement('div');
    versionLabel.textContent = 'Version: ' + SCRIPT_VERSION;
    applyStyles(versionLabel, {
      fontSize: '0.75rem',
      letterSpacing: '0.04em',
      opacity: '0.8',
      paddingBottom: '0.2rem'
    });
    dropdown.appendChild(versionLabel);

    const timestampRow = document.createElement('div');
    applyStyles(timestampRow, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '0.5rem',
      paddingBottom: '0.35rem'
    });

    const timestampLabel = document.createElement('div');
    applyStyles(timestampLabel, {
      fontSize: '0.75rem',
      letterSpacing: '0.02em',
      opacity: '0.75'
    });
    lastRefreshLabelElement = timestampLabel;
    updateLastRefreshLabel();
    timestampRow.appendChild(timestampLabel);

    if (projectSettings) {
      const refreshButton = document.createElement('button');
      refreshButton.type = 'button';
      refreshButton.textContent = '↻';
      refreshButton.title = 'Jetzt aktualisieren';
      applyStyles(refreshButton, {
        background: '#2563eb',
        border: 'none',
        borderRadius: '6px',
        padding: '0.25rem 0.7rem',
        fontSize: '0.7rem',
        color: '#fff',
        cursor: 'pointer'
      });
      refreshButton.addEventListener('click', function () {
        clearCacheAndReload(hostConfig, projectSettings);
      });
      manualRefreshButtonElement = refreshButton;
      timestampRow.appendChild(refreshButton);
    }

    dropdown.appendChild(timestampRow);

    const releaseNotificationRow = document.createElement('div');
    applyStyles(releaseNotificationRow, {
      display: 'none',
      flexDirection: 'column',
      gap: '0.25rem',
      padding: '0.35rem 0',
      borderTop: '1px solid #2f374c',
      width: '100%'
    });

    const releaseNotificationText = document.createElement('div');
    applyStyles(releaseNotificationText, {
      fontSize: '0.78rem',
      lineHeight: '1.35',
      opacity: '0.9',
      color: toolbarTextColor
    });

    const releaseNotificationLink = document.createElement('a');
    releaseNotificationLink.textContent = 'Release ansehen';
    releaseNotificationLink.setAttribute('target', '_blank');
    releaseNotificationLink.setAttribute('rel', 'noreferrer noopener');
    applyStyles(releaseNotificationLink, {
      fontSize: '0.76rem',
      fontWeight: '600',
      color: '#60a5fa',
      textDecoration: 'underline',
      width: 'fit-content'
    });
    releaseNotificationLink.style.display = 'none';

    releaseNotificationRow.appendChild(releaseNotificationText);
    releaseNotificationRow.appendChild(releaseNotificationLink);
    const releaseDivider = document.createElement('div');
    applyStyles(releaseDivider, {
      width: '100%',
      height: '1px',
      background: 'rgba(255, 255, 255, 0.1)',
      borderRadius: '2px',
      margin: '0.35rem 0'
    });
    releaseDivider.style.display = 'none';
    releaseNotificationRow.appendChild(releaseDivider);
    releaseNotificationElements.messageRow = releaseNotificationRow;
    releaseNotificationElements.messageText = releaseNotificationText;
    releaseNotificationElements.actionLink = releaseNotificationLink;
    releaseNotificationElements.divider = releaseDivider;
    dropdown.appendChild(releaseNotificationRow);

    dropdown.appendChild(togglesContainer);
    if (projectSettings) {
      const projectConfigSection = createProjectConfigSection(hostConfig, projectSettings);
      dropdown.appendChild(projectConfigSection);
    }

    const saveRow = document.createElement('div');
    applyStyles(saveRow, {
      display: 'flex',
      justifyContent: 'center',
      padding: '0.35rem 0 0 0',
      width: '100%'
    });
    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.textContent = 'Einstellungen speichern';
    applyStyles(saveButton, {
      background: '#2563eb',
      border: 'none',
      borderRadius: '6px',
      padding: '0.45rem 1rem',
      color: '#fff',
      fontSize: '12px',
      cursor: 'pointer',
      width: '100%'
    });
    saveButton.addEventListener('click', function () {
      if (!projectSettings || !projectIdInputElement || !portalUrlInputElement) {
        return;
      }
      const projectAttempt = projectIdInputElement.value.trim();
      const portalAttempt = portalUrlInputElement.value.trim();
      if (!projectAttempt) {
        if (projectStatusElement) {
          projectStatusElement.textContent = 'Bitte gib eine Projekt-ID ein.';
        }
        return;
      }
      if (!/^\d+$/.test(projectAttempt)) {
        if (projectStatusElement) {
          projectStatusElement.textContent = 'Projekt-ID darf nur Zahlen enthalten.';
        }
        return;
      }
      if (!portalAttempt) {
        if (portalStatusElement) {
          portalStatusElement.textContent = 'Bitte gib eine Portal-Base URL ein.';
        }
        return;
      }
      const entry = {};
      let changed = false;
      if (projectAttempt !== projectSettings.projectId) {
        entry.projectId = projectAttempt;
        changed = true;
      }
      if (portalAttempt !== projectSettings.portalBaseUrl) {
        entry.portalBaseUrl = portalAttempt;
        changed = true;
      }
      if (!changed) {
        showToast({text: 'Keine Änderungen vorhanden.', variant: 'info'});
        return;
      }
      writeProjectConfigEntry(projectSettings.projectKey, entry);
      if (entry.projectId) {
        projectSettings.projectId = entry.projectId;
      }
      if (entry.portalBaseUrl) {
        projectSettings.portalBaseUrl = entry.portalBaseUrl;
      }
      clearProgressCache();
      clearProjectRequestBlock(projectSettings.projectKey);
      showToast({text: 'Einstellungen gespeichert', variant: 'success'});
      setTimeout(function () {
        window.location.reload();
      }, 100);
    });
    saveRow.appendChild(saveButton);
    dropdown.appendChild(saveRow);
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

    updateReleaseNotificationUI(getCachedReleaseInfo());
    insertParent.appendChild(bar);
    refreshPortalBaseWarning(projectSettings);
    return bar;
  }

  function createProjectConfigSection(hostConfig, projectSettings) {
    const section = document.createElement('div');
    const panelBackground = getGitLabWindowBackgroundColor(true);
    const panelTextColor = getToolbarForegroundColor();
    applyStyles(section, {
      padding: '0.5rem 0',
      width: '100%',
      borderTop: '1px solid #2f374c',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.4rem',
      color: panelTextColor
    });
    const heading = document.createElement('div');
    heading.textContent = 'Projekt-Konfiguration';
    applyStyles(heading, {
      fontSize: '0.8rem',
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      opacity: '0.75',
      fontWeight: '600',
      color: panelTextColor
    });

    const pathInfo = document.createElement('div');
    pathInfo.textContent = 'Board: ' + (projectSettings.projectPath || 'unbekannt');
    applyStyles(pathInfo, {
      fontSize: '0.85rem',
      opacity: '0.9',
      color: panelTextColor
    });

    const currentId = document.createElement('div');
    const updateCurrentLabel = function (value) {
      const display = value ? value : 'nicht gesetzt';
      currentId.textContent = 'Aktuell: ' + display;
    };
    updateCurrentLabel(projectSettings.projectId);

    applyStyles(currentId, {
      fontSize: '0.8rem',
      color: panelTextColor
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
      background: panelBackground,
      color: panelTextColor,
      fontSize: '0.85rem'
    });
    projectIdInputElement = input;

    const status = document.createElement('div');
    applyStyles(status, {
      fontSize: '0.75rem',
      color: '#a5b4fc',
      minHeight: '1em'
    });

    projectStatusElement = status;

    input.addEventListener('input', function () {
      status.textContent = '';
    });

    formRow.appendChild(input);
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
      fontWeight: '600',
      color: panelTextColor
    });

    const portalCurrent = document.createElement('div');
    const updatePortalLabel = function (value) {
      const display = value ? value : 'nicht gesetzt';
      portalCurrent.textContent = 'Portal-Basis: ' + display;
    };
    updatePortalLabel(projectSettings.portalBaseUrl);
    applyStyles(portalCurrent, {
      fontSize: '0.8rem',
      color: panelTextColor
    });

    const portalRow = document.createElement('div');
    applyStyles(portalRow, {
      display: 'flex',
      gap: '0.35rem',
      alignItems: 'center'
    });

    const portalInput = document.createElement('input');
    portalInput.type = 'text';
    portalInput.placeholder = 'https://user-portal.arbeitgeber.com';
    portalInput.value = projectSettings.portalBaseUrl || '';
    applyStyles(portalInput, {
      flex: '1 1 auto',
      padding: '0.35rem 0.5rem',
      borderRadius: '6px',
      border: '1px solid #374151',
      background: panelBackground,
      color: panelTextColor,
      fontSize: '0.85rem'
    });
    portalUrlInputElement = portalInput;

    const portalStatus = document.createElement('div');
    applyStyles(portalStatus, {
      fontSize: '0.75rem',
      color: '#a5b4fc',
      minHeight: '1em'
    });
    portalStatusElement = portalStatus;

    portalInput.addEventListener('input', function () {
      portalStatus.textContent = '';
    });

    portalRow.appendChild(portalInput);
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

    if (isMergeRequestPage()) {
      log('Merge-Request-Seite erkannt; kein Progress-Overlay.');
      return;
    }
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

    if (isProgressCacheStale()) {
      log('Progress-Cache ist älter als ' + PROGRESS_CACHE_TTL_MS + 'ms – Cache wird geleert und Daten werden neu geladen.');
      clearProgressCache();
    }

    createToolbar(hostConfig, projectSettings);
    scheduleReleaseCheck();
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

    let observerTarget = document.querySelector('.boards-app');
    if (!observerTarget) {
      log('Keine .boards-app gefunden; MutationObserver wird auf document.body gestartet.');
      observerTarget = document.body;
      if (!observerTarget) {
        log('document.body nicht verfügbar; MutationObserver wird nicht gestartet.');
        return;
      }
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
        scanBoard(hostConfig, projectSettings);
        scanIssueDetail(hostConfig, projectSettings);
      }
    });

    observer.observe(observerTarget, {
      childList: true,
      subtree: true
    });
  }

  init();
})
();
