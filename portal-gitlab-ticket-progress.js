// ==UserScript==
// @name         Portal GitLab Ticket Progress
// @namespace    https://beyonder.de/
// @version      5.6.0
// @description  Zeigt gebuchte Stunden aus dem Portal (konfigurierbare Base-URL) in GitLab-Issue-Boards an (nur bestimmte Spalten, z. B. WIP) als Progressbar, inkl. Debug-/Anzeigen-Toggles, Cache-Tools und Konfigurations-Toast.
// @author       christoph-teichmeister
// @include      https://gitlab*/*/-/*
// @include      https://gitlab*/*/*/-/*
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
  const SCRIPT_VERSION = '5.6.0';
  const TOOLBAR_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" role="img" aria-label="GitLab ticket icon"><g fill="none" stroke="currentColor" stroke-width="1.0" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h10v2a1 1 0 0 1 0 4v2h-10v-2a1 1 0 0 1 0 -4z"/><path d="M6 7h4"/><path d="M6 9h3"/></g></svg>';
  const TIMESHEET_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="white" viewBox="0 0 256 256"><path d="M165.66,90.34a8,8,0,0,1,0,11.32l-64,64a8,8,0,0,1-11.32-11.32l64-64A8,8,0,0,1,165.66,90.34ZM215.6,40.4a56,56,0,0,0-79.2,0L106.34,70.45a8,8,0,0,0,11.32,11.32l30.06-30a40,40,0,0,1,56.57,56.56l-30.07,30.06a8,8,0,0,0,11.31,11.32L215.6,119.6a56,56,0,0,0,0-79.2ZM138.34,174.22l-30.06,30.06a40,40,0,1,1-56.56-56.57l30.05-30.05a8,8,0,0,0-11.32-11.32L40.4,136.4a56,56,0,0,0,79.2,79.2l30.06-30.07a8,8,0,0,0-11.32-11.31Z"></path></svg>';
  const MERGE_REQUEST_ICON_SVG = '<svg data-testid="merge-request-icon" role="img" aria-hidden="true" class="gl-button-icon gl-icon s16 gl-fill-current"><use href="/assets/icons-5a3f88503a318f1eaf3b49d9d82c93cdde31fd5224ab8aeeb08534974b21f10c.svg#merge-request"></use></svg>';
  const GITLAB_ICON_SPRITE = MERGE_REQUEST_ICON_SVG.match(/href="([^"#]+)#/)[1];

  function gitlabIconSvg(name, classes) {
    return '<svg role="img" aria-hidden="true" class="' + classes + '"><use href="' +
      GITLAB_ICON_SPRITE + '#' + name + '"></use></svg>';
  }

  const CLOCK_ICON_SVG = MERGE_REQUEST_ICON_SVG.replace('merge-request-icon', 'clock-icon').replace('#merge-request', '#clock');
  const HOST_CONFIG = {};
  const NOT_FOUND_SENTINEL = { notFound: true };

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
  let projectId2InputElement = null;
  let projectId2StatusElement = null;
  let toolbarInitialProjectId2Value = '';
  let toolbarInitialUseSecondProjectIdValue = false;
  let useSecondProjectIdToggleCheckbox = null;
  let lastRefreshLabelElement = null;
  let manualRefreshButtonElement = null;
  let forceRefreshMode = false;
  let toolbarInitialProjectIdValue = '';
  let toolbarInitialPortalUrlValue = '';
  const DETAIL_RETRY_INTERVAL_MS = 700;
  const DETAIL_RETRY_MAX_ATTEMPTS = 3;
  const detailRetryState = {
    timer: null,
    attempts: 0
  };

  const MR_RETRY_INTERVAL_MS = 700;
  const MR_RETRY_MAX_ATTEMPTS = 3;
  const mrRetryState = {
    timer: null,
    attempts: 0
  };

  // Debug / Anzeige – gesteuert über Toolbar, persistiert in localStorage
  const LS_KEY_DEBUG = 'portalProgressDebug';
  const LS_KEY_SHOW = 'portalProgressShow';
  const LS_KEY_MR_LINKS = 'portalProgressMrLinks';
  const LS_KEY_LIST_SELECTIONS = 'ambientProgressListSelections';
  const LS_KEY_PROJECT_CONFIG = 'ambientProgressProjectConfigs';
  const LS_KEY_LAST_REFRESH = 'ambientProgressLastRefresh';
  const LS_KEY_PROGRESS_CACHE = 'ambientProgressCache';
  const LS_KEY_LAST_BOARD_ID = 'ambientProgressLastBoardId';
  const LS_KEY_RELEASE_INFO = 'ambientProgressReleaseInfo';
  const LS_KEY_RATE_LIMIT_WARNING = 'ambientProgressRateLimitWarning';
  const LS_KEY_AGE_HIGHLIGHT_LISTS = 'ambientProgressAgeHighlightLists';

  let debugEnabled = readBoolFromLocalStorage(LS_KEY_DEBUG, false);  // Default: Debug aus
  let showEnabled = readBoolFromLocalStorage(LS_KEY_SHOW, true);    // Default: Anzeigen an
  let mrLinksEnabled = readBoolFromLocalStorage(LS_KEY_MR_LINKS, true); // Default: MR-Buttons an

  // Globale Feature-Schalter (gelten für alle Boards). show/debug/mrLinks liegen ebenfalls hier,
  // fehlen sie, gilt der alte projektbezogene Wert (Migration in init).
  const LS_KEY_FEATURES = 'ambientProgressFeatures';
  const FEATURE_PARENTS = {portalButtons: 'progress', mrAvatars: 'mrBadge', columnAvg: 'columnAge'};
  let features = readFeatures();

  function readFeatures() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(LS_KEY_FEATURES) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function saveFeature(key, value) {
    features[key] = value;
    try {
      window.localStorage.setItem(LS_KEY_FEATURES, JSON.stringify(features));
    } catch (e) {
      // ignore
    }
  }

  // Default an; Unter-Features nur aktiv, wenn das Eltern-Feature aktiv ist
  function isFeatureOn(key) {
    if (!showEnabled) return false; // „Anzeigen" ist Hauptschalter für alles
    const parent = FEATURE_PARENTS[key];
    return features[key] !== false && (!parent || isFeatureOn(parent));
  }

  const RELEASE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
  const RAW_SCRIPT_URL =
    'https://raw.githubusercontent.com/christoph-teichmeister/portal-gitlab-ticket-progress/refs/heads/main/portal-gitlab-ticket-progress.js';

  let latestReleaseInfo = null;
  let releaseNotificationElements = {
    badge: null,
    messageRow: null,
    messageText: null,
    divider: null
  };

  let rateLimitWarningActive = null; // null = noch nicht aus localStorage geladen
  let rateLimitNotificationElements = {
    badge: null,
    messageRow: null,
    messageText: null,
    divider: null
  };
  let lastRateLimitToastAt = 0;

  const LOG_PREFIX = '[GitLab Progress]';
  const PROGRESS_CACHE_TTL_MS = 60 * 60 * 1000;
  const REFRESH_INTERVAL_MS = 60 * 60 * 1000;
  const PROJECT_BLOCK_COOLDOWN_MS = 5 * 60 * 1000;
  const MAX_NEW_FETCHES_PER_SCAN = 80;
  const RATE_LIMIT_TOAST_COOLDOWN_MS = 2 * 60 * 1000;
  const RATE_LIMIT_WARNING_MIN_VISIBLE_MS = 60 * 1000;
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
    const {
      text,
      variant = 'info',
      duration = TOAST_DEFAULT_DURATION_MS
    } = options;
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
    if (!showEnabled) {
      return;
    }
    const now = Date.now();
    if (now - lastPortalWarningAt < PORTAL_WARNING_COOLDOWN_MS) {
      return;
    }
    lastPortalWarningAt = now;
    showToast({
      text: 'Portal-Base URL fehlt -> Projekt-Konfiguration öffnen und' +
        ' eintragen.',
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
    const rawInclude =
      entry.include && typeof entry.include === 'object' ? entry.include : {};
    const include = {};
    Object.keys(rawInclude).forEach(function (key) {
      const normalizedKey = normalizeListNameForMatching(key);
      if (normalizedKey && rawInclude[key]) {
        include[normalizedKey] = true;
      }
    });
    return {
      include,
      explicit: Boolean(entry.explicit)
    };
  }

  // Spalten mit rotem Rahmen bei überdurchschnittlicher Verweildauer: {projectKey: {labelKey: true}}
  let ageHighlightProjectKey = null;
  let ageHighlightLookup = {};

  function loadAgeHighlightLookup(projectKey) {
    if (projectKey === ageHighlightProjectKey) return;
    ageHighlightProjectKey = projectKey;
    try {
      const state = JSON.parse(window.localStorage.getItem(LS_KEY_AGE_HIGHLIGHT_LISTS) || '{}');
      ageHighlightLookup = (state && state[projectKey]) || {};
    } catch (e) {
      ageHighlightLookup = {};
    }
  }

  function saveAgeHighlightLookup() {
    if (!ageHighlightProjectKey) return;
    try {
      const state = JSON.parse(window.localStorage.getItem(LS_KEY_AGE_HIGHLIGHT_LISTS) || '{}') || {};
      state[ageHighlightProjectKey] = ageHighlightLookup;
      window.localStorage.setItem(LS_KEY_AGE_HIGHLIGHT_LISTS, JSON.stringify(state));
    } catch (e) {
      // ignore
    }
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
    if (!elements.badge || !elements.messageRow || !elements.messageText || !elements.divider) {
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
      const displayVersion =
        (info && info.version ? formatVersionLabel(info.version) : formatVersionLabel(SCRIPT_VERSION)) ||
        formatVersionLabel(SCRIPT_VERSION);
      elements.messageText.textContent =
        '⚠️ Neue Version ' +
        displayVersion +
        ' verfügbar - öffne das Tampermonkey-Dashboard, um das Script zu aktualisieren.';
      elements.divider.style.display = 'block';
    } else {
      elements.badge.style.display = 'none';
      elements.messageRow.style.display = 'none';
      elements.divider.style.display = 'none';
    }
  }

  function readRateLimitWarningFromStorage() {
    try {
      const raw = window.localStorage.getItem(LS_KEY_RATE_LIMIT_WARNING);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.active) {
        return null;
      }
      return {
        active: true,
        triggeredAt: Number(parsed.triggeredAt) || null,
        listCount: Number(parsed.listCount) || null
      };
    } catch (e) {
      return null;
    }
  }

  function writeRateLimitWarningToStorage(state) {
    try {
      if (!state || !state.active) {
        window.localStorage.removeItem(LS_KEY_RATE_LIMIT_WARNING);
        return;
      }
      window.localStorage.setItem(LS_KEY_RATE_LIMIT_WARNING, JSON.stringify(state));
    } catch (e) {
      // ignore
    }
  }

  function getCachedRateLimitWarning() {
    if (rateLimitWarningActive !== null) {
      return rateLimitWarningActive;
    }
    rateLimitWarningActive = readRateLimitWarningFromStorage();
    return rateLimitWarningActive;
  }

  function setRateLimitWarning(active, listCount) {
    const state = active ? { active: true, triggeredAt: Date.now(), listCount: listCount || null } : null;
    rateLimitWarningActive = state;
    writeRateLimitWarningToStorage(state);
    updateRateLimitWarningUI(state);
  }

  function updateRateLimitWarningUI(state) {
    const elements = rateLimitNotificationElements;
    if (!elements.badge || !elements.messageRow || !elements.messageText || !elements.divider) {
      return;
    }
    const isActive = Boolean(state && state.active);
    if (isActive) {
      elements.badge.style.display = 'block';
      elements.messageRow.style.display = 'flex';
      elements.messageText.textContent =
        '⚠️ Rate-Limit erreicht (mehr als ' +
        MAX_NEW_FETCHES_PER_SCAN +
        ' Tickets gleichzeitig) – bitte Anzahl ausgewählter Board-Spalten reduzieren, damit alle Tickets zuverlässig geladen werden.';
      elements.divider.style.display = 'block';
    } else {
      elements.badge.style.display = 'none';
      elements.messageRow.style.display = 'none';
      elements.divider.style.display = 'none';
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

  function buildProgressCacheKey(projectSettings, issueIid, cacheKeySuffix) {
    if (!projectSettings || !issueIid) {
      return null;
    }
    const projectIdentifier = projectSettings.projectKey || projectSettings.projectPath;
    if (!projectIdentifier) {
      return null;
    }
    const boardId = getCurrentBoardIdentifier();
    const normalizedBoardId = boardId ? boardId : 'default';
    const suffix = cacheKeySuffix ? '|' + cacheKeySuffix : '';
    return 'board:' + normalizedBoardId + '|' + projectIdentifier + suffix + ':' + String(issueIid);
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

  function attachHoverEffect(element, hoverStyles) {
    if (!element || !hoverStyles) return;
    const baseStyles = {};
    for (const key in hoverStyles) {
      if (Object.prototype.hasOwnProperty.call(hoverStyles, key)) {
        baseStyles[key] = element.style[key] || '';
      }
    }
    element.addEventListener('mouseenter', function () {
      applyStyles(element, hoverStyles);
    });
    element.addEventListener('mouseleave', function () {
      applyStyles(element, baseStyles);
    });
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
      background: 'var(--gl-background-color-default, #18171d)'
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

    if (progressData.notFound) {
      const neutralBar = document.createElement('div');
      applyStyles(neutralBar, {
        height: '100%',
        width: '100%',
        background: colors.neutral
      });
      barOuter.appendChild(neutralBar);
      appendCenterText('Nicht gefunden');
      barOuter.appendChild(textLayer);
      return barOuter;
    }

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
        const bookedHours = extractHourNumber(progressData.booked);
        const overHours = extractHourNumber(progressData.over);
        let diffText = null;
        if (bookedHours !== null && overHours !== null) {
          diffText = formatBookedHoursDisplay(bookedHours - overHours);
        }
        centerText += ' (' + progressData.booked;
        if (diffText) {
          centerText += '/' + diffText;
        }
        centerText += ')';
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

  function getThemeAwareBarStyles(options) {
    var opts = options || {};
    var isDark = isGitLabDarkModeActive();
    var barBackground = isDark ? 'var(--gl-background-color-default, #18171d)' : 'var(--gl-background-color-subtle, #E5EAF0)';
    var textColor = getContrastTextColor(PROGRESS_BAR_DEFAULTS.colors.neutral);

    var barStyle = {background: barBackground};
    if (opts.barOverrides) {
      Object.assign(barStyle, opts.barOverrides);
    }

    var labelBase = {color: textColor, fontWeight: '500'};
    var centerBase = {color: textColor, fontWeight: '600', margin: '0 auto'};

    if (opts.fontSize) {
      labelBase.fontSize = opts.fontSize;
      centerBase.fontSize = opts.fontSize;
    }

    return {
      barBackground: barBackground,
      textColor: textColor,
      styles: {
        bar: barStyle,
        textLayer: {color: textColor},
        spentLabel: Object.assign({}, labelBase),
        remainingLabel: Object.assign({}, labelBase),
        centerLabel: Object.assign({}, centerBase)
      }
    };
  }

  const PORTAL_LINK_BUTTON_DEFAULT_STYLES = {
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
  };

  function createPortalLinkButton(url, overrides) {
    if (!url || !isFeatureOn('portalButtons')) return null;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '↗';
    button.title = 'Im Portal öffnen';
    button.setAttribute('aria-label', 'Ticket im Portal öffnen');
    applyStyles(button, mergeStyles(PORTAL_LINK_BUTTON_DEFAULT_STYLES, overrides));
    button.addEventListener(
      'click',
      function (ev) {
        ev.stopPropagation();
        ev.preventDefault();
        window.open(url, '_blank', 'noopener,noreferrer');
      },
      true
    );
    return button;
  }

  function createTimesheetButton(url, overrides) {
    if (!url || !isFeatureOn('portalButtons')) return null;
    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = TIMESHEET_ICON_SVG;
    button.title = 'Timesheet erstellen';
    button.setAttribute('aria-label', 'Timesheet im Portal erstellen');
    applyStyles(button, mergeStyles(PORTAL_LINK_BUTTON_DEFAULT_STYLES, overrides));
    button.style.display = 'inline-flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.addEventListener(
      'click',
      function (ev) {
        ev.stopPropagation();
        ev.preventDefault();
        window.open(url, '_blank', 'noopener,noreferrer');
      },
      true
    );
    return button;
  }

  function createAllowedListLookup(listNames) {
    const lookup = {};
    if (!listNames || !listNames.length) {
      return lookup;
    }
    for (let i = 0; i < listNames.length; i++) {
      const normalized = normalizeListNameForMatching(listNames[i]);
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
    const fallbackShow = readBoolFromLocalStorage(LS_KEY_SHOW, true);
    const fallbackDebug = readBoolFromLocalStorage(LS_KEY_DEBUG, false);
    const fallbackMrLinks = readBoolFromLocalStorage(LS_KEY_MR_LINKS, true);
    const showEnabled =
      storedProjectConfig && typeof storedProjectConfig.showEnabled === 'boolean'
        ? storedProjectConfig.showEnabled
        : fallbackShow;
    const debugEnabled =
      storedProjectConfig && typeof storedProjectConfig.debugEnabled === 'boolean'
        ? storedProjectConfig.debugEnabled
        : fallbackDebug;
    const mrLinksEnabled =
      storedProjectConfig && typeof storedProjectConfig.mrLinksEnabled === 'boolean'
        ? storedProjectConfig.mrLinksEnabled
        : fallbackMrLinks;
    const projectId2 =
      (storedProjectConfig && storedProjectConfig.portalProjectId2) || null;
    const useSecondPortalProjectId =
      storedProjectConfig && typeof storedProjectConfig.useSecondPortalProjectId === 'boolean'
        ? storedProjectConfig.useSecondPortalProjectId
        : false;

    return Object.assign({}, base, {
      projectPath,
      projectKey,
      projectId,
      projectId2,
      useSecondPortalProjectId,
      allowedListLookup: initialLookup,
      listFilterMode,
      portalBaseUrl,
      showEnabled: showEnabled,
      debugEnabled: debugEnabled,
      mrLinksEnabled: mrLinksEnabled
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
    '--gl-background-color-default',
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
  const GITLAB_THEME_BG_VARS = [GITLAB_THEME_BG_VAR, '--gl-background-color-default'];

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
          log('isGitLabDarkModeActive', {
            source: 'data-theme',
            value: dataTheme,
            result: true
          });
          return true;
        }
        if (lower.includes('light')) {
          log('isGitLabDarkModeActive', {
            source: 'data-theme',
            value: dataTheme,
            result: false
          });
          return false;
        }
      }
      if (html.classList) {
        if (
          html.classList.contains('gl-theme-dark') ||
          html.classList.contains('gl-dark') ||
          html.classList.contains('theme-dark')
        ) {
          log('isGitLabDarkModeActive', {
            source: 'html-class',
            class: 'dark',
            result: true
          });
          return true;
        }
        if (
          html.classList.contains('gl-theme-light') ||
          html.classList.contains('gl-light') ||
          html.classList.contains('theme-light')
        ) {
          log('isGitLabDarkModeActive', {
            source: 'html-class',
            class: 'light',
            result: false
          });
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

    for (const bgVar of GITLAB_THEME_BG_VARS) {
      const themeBg = readCssVariableValue(bgVar);
      if (themeBg) {
        const rgb = parseCssColorToRgb(themeBg);
        if (rgb) {
          const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
          const isDark = luminance <= 0.55;
          log('isGitLabDarkModeActive', {
            source: 'theme-var',
            bgVar,
            themeBg,
            luminance: luminance.toFixed(3),
            isDark
          });
          return isDark;
        }
      }
    }

    const computedBg = getComputedBackgroundFromSelectors(GITLAB_BG_SELECTORS);
    if (computedBg) {
      const rgb = parseCssColorToRgb(computedBg);
      if (rgb) {
        const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
        const isDark = luminance <= 0.55;
        log('isGitLabDarkModeActive', {
          computedBg,
          luminance: luminance.toFixed(3),
          isDark
        });
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

    let value = null;
    for (const bgVar of GITLAB_THEME_BG_VARS) {
      value = readCssVariableValue(bgVar);
      if (value) break;
    }
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
      log('getContrastTextColor', {
        bgColor,
        choice: 'fallback',
        result: fallbackLight
      });
      return fallbackLight;
    }

    const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
    const chosen = luminance > 0.55 ? fallbackDark : fallbackLight;

    log('getContrastTextColor', {
      bgColor,
      luminance: luminance.toFixed(3),
      choice: chosen === fallbackDark ? 'dark' : 'light',
      result: chosen
    });

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

  // Ganzer Label-Text inkl. Scope (z. B. "workflow::Design Review"), Fallback Listenname
  function getColumnLabelText(boardListElem, headerOverride) {
    const header = headerOverride || getBoardListHeaderElement(boardListElem);
    const labelElem = header && header.querySelector('.board-title-text .gl-label');
    return labelElem ? labelElem.textContent.replace(/\s+/g, ' ').trim() : getListNameFromBoardListElem(boardListElem, header);
  }

  function normalizeListNameForMatching(name) {
    if (!name) return '';
    let normalized = String(name);
    let previous;
    do {
      previous = normalized;
      normalized = normalized.replace(/\s*\([^()]*\)\s*$/, '');
    } while (normalized !== previous);
    return normalized.toLowerCase().trim();
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

  function findMatchingMrs(mrs, issueIid) {
    const re = new RegExp('(^|[^0-9])#' + issueIid + '(?!\\d)');
    return mrs.filter(function (mr) { return re.test(mr.title); });
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

  function buildPortalUrl(projectSettings, issueIid, projectIdOverride) {
    if (!projectSettings || !issueIid) {
      return null;
    }
    const projectId = projectIdOverride || projectSettings.projectId;
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

  function buildTimesheetUrl(projectSettings, issueIid, overrideProjectId) {
    if (!projectSettings || !issueIid) {
      return null;
    }
    const projectId = overrideProjectId || projectSettings.projectId;
    const base = getPortalBaseUrl(projectSettings);
    if (!projectId || !base) {
      return null;
    }
    return (
      base +
      '/management/timesheet/create/?project_id=' +
      encodeURIComponent(String(projectId)) +
      '&booking_tag=%23' +
      encodeURIComponent(String(issueIid))
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

  // Parses the title attribute text of the Tailwind progress container,
  // e.g. "Booked hours: 6.50h | Remaining: 5.50h" or "... | Over: 8.25h".
  // More robust than reading the bar segments, since it doesn't depend
  // on classes/order/number of segment divs.
  function parseProgressFromTitleAttr(titleText) {
    if (!titleText) return null;
    const parts = titleText.split('|');
    const result = {spent: null, remaining: null, over: null};
    let foundAny = false;

    for (let i = 0; i < parts.length; i++) {
      const m = parts[i].match(/([A-Za-zÄÖÜäöüß ]+):\s*(-?[\d.,]+)\s*h?/i);
      if (!m) continue;
      const label = m[1].trim();
      const hours = extractHourNumber(m[2]);
      if (hours === null) continue;

      if (/Booked\s+Hours|Gebuchte\s+Stunden/i.test(label)) {
        result.spent = formatBookedHoursDisplay(hours);
        foundAny = true;
      } else if (/Remaining|Verbleibend/i.test(label)) {
        // Negative remaining = overbooked/escalation, not a normal remaining value
        if (hours < 0) {
          result.over = formatBookedHoursDisplay(Math.abs(hours));
        } else {
          result.remaining = formatBookedHoursDisplay(hours);
        }
        foundAny = true;
      } else if (/Over|Über/i.test(label)) {
        result.over = formatBookedHoursDisplay(Math.abs(hours));
        foundAny = true;
      }
    }

    return foundAny ? result : null;
  }

  function parseProgressHtml(htmlText) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, 'text/html');

      if (doc.querySelector('.alert.alert-danger')) {
        return null;
      }

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

      const progressDiv = doc.querySelector('[title*="Booked hours" i]')
        || doc.querySelector('[title*="Gebuchte Stunden" i]');
      if (!progressDiv) {
        if (debugEnabled) log('parseProgressHtml: Kein Progress-Container gefunden → Fallback Booked Hours.');
        return fallbackBooked();
      }

      // Tailwind markup: the title attribute carries the values as plain text,
      // independent of segment divs/classes/order → prefer this over anything else.
      const titleAttr = progressDiv.getAttribute('title');
      const fromTitle = parseProgressFromTitleAttr(titleAttr);
      if (fromTitle) {
        if (debugEnabled) log('parseProgressHtml: Werte aus title-Attribut geparst:', fromTitle);
        return attachBookedInfo(fromTitle);
      }

      if (debugEnabled) log('parseProgressHtml: title-Attribut nicht auswertbar → Fallback Booked Hours.');
      return fallbackBooked();
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

  function injectProgressIntoCard(cardElem, progressData, progressData2) {
    if (!cardElem || (!progressData && !progressData2)) return;
    if (!isCardInActiveColumn(cardElem)) return;

    let container = cardElem.querySelector('.ambient-progress-badge');

    if (!container) {
      container = document.createElement('div');
      container.className = 'ambient-progress-badge';
      applyStyles(container, {
        marginTop: '6px',
        marginBottom: '6px',
        fontSize: '12px',
        lineHeight: '1.2',
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

    const theme = getThemeAwareBarStyles({
      fontSize: '11px',
      barOverrides: {
        height: '18px',
        borderRadius: '999px',
        overflow: 'hidden',
        flex: '1 1 auto'
      }
    });
    container.style.color = theme.textColor;

    if (progressData && progressData2) {
      const warningBanner = document.createElement('div');
      applyStyles(warningBanner, {
        backgroundColor: '#f97316',
        color: '#fff',
        padding: '4px 8px',
        borderRadius: '4px',
        marginBottom: '6px',
        fontSize: '11px',
        fontWeight: '600',
        display: 'flex',
        alignItems: 'center',
        gap: '4px'
      });
      warningBanner.textContent = '⚠ In beiden Portal-Projekten gefunden';
      container.appendChild(warningBanner);
    }

    if (progressData) {
      const row = document.createElement('div');
      applyStyles(row, {
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      });

      const barOuter = createProgressBarElements(progressData, theme.styles);

      const url = cardElem.getAttribute('data-ambient-progress-url');
      const timesheetUrl = cardElem.getAttribute('data-ambient-timesheet-url');
      const timesheetButton = createTimesheetButton(timesheetUrl);
      if (timesheetButton) {
        row.appendChild(timesheetButton);
      }
      row.appendChild(barOuter);
      const portalButton = createPortalLinkButton(url);
      if (portalButton) {
        row.appendChild(portalButton);
      }
      container.appendChild(row);
    }

    if (progressData2) {
      const row2 = document.createElement('div');
      applyStyles(row2, {
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      });

      const theme2Styles = Object.assign({}, theme.styles, {
        colors: {
          spent: '#f97316',
          spentHover: '#ea580c',
          neutral: '#D9D4C7',
          bookedFallback: '#2563eb',
          over: '#dc3545'
        }
      });

      const barOuter2 = createProgressBarElements(progressData2, theme2Styles);

      const timesheetUrl2 = cardElem.getAttribute('data-ambient-timesheet-url-2');
      const timesheetButton2 = createTimesheetButton(timesheetUrl2);
      if (timesheetButton2) {
        row2.appendChild(timesheetButton2);
      }
      row2.appendChild(barOuter2);

      const url2 = cardElem.getAttribute('data-ambient-progress-url-2');
      const portalButton2 = createPortalLinkButton(url2);
      if (portalButton2) {
        row2.appendChild(portalButton2);
      }
      container.appendChild(row2);
    }
  }

  function applyShowFlagToAllBadges() {
    const badges = document.querySelectorAll('.ambient-progress-badge');
    for (let i = 0; i < badges.length; i++) {
      badges[i].style.display = showEnabled ? '' : 'none';
    }
  }

  /******************************************************************
   * MR-Badge auf Karten
   ******************************************************************/

  const MR_LIST_CACHE_TTL_MS = 5 * 60 * 1000; // ponytail: in-memory only, kein localStorage nötig
  const mrListCache = {}; // key: projectPath → {mrs: [{iid, title, web_url}], timestamp}

  let currentUserPromise = null;

  function getCurrentUser() {
    if (!currentUserPromise) {
      currentUserPromise = fetch('/api/v4/user', {credentials: 'include'})
        .then(function (res) {
          if (!res.ok) throw new Error('Aktueller User Status ' + res.status);
          return res.json();
        });
    }
    return currentUserPromise;
  }

  function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.content : null;
  }

  function assignCurrentUserAsReviewer(projectPath, mrIid) {
    return getCurrentUser().then(function (user) {
      const url = '/api/v4/projects/' + encodeURIComponent(projectPath) +
        '/merge_requests/' + mrIid;
      return fetch(url, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken()
        },
        body: JSON.stringify({reviewer_ids: [user.id]})
      }).then(function (res) {
        if (!res.ok) throw new Error('Reviewer zuweisen Status ' + res.status);
        return user;
      });
    });
  }

  function loadMergeRequestsForProject(projectPath) {
    const cached = mrListCache[projectPath];
    if (cached && Date.now() - cached.timestamp <= MR_LIST_CACHE_TTL_MS) {
      return Promise.resolve(cached.mrs);
    }
    const url = '/api/v4/projects/' + encodeURIComponent(projectPath) +
      '/merge_requests?per_page=100&order_by=updated_at';
    return fetch(url, {credentials: 'include'})
      .then(function (res) {
        if (!res.ok) throw new Error('MR-Liste Status ' + res.status);
        return res.json();
      })
      .then(function (list) {
        // ponytail: per_page=100, keine Paginierung – bei >100 offenen MRs fehlen ältere
        const mrs = list.map(function (mr) {
          return {
            iid: mr.iid,
            title: mr.title,
            web_url: mr.web_url,
            state: mr.state,
            assignee: (mr.assignees && mr.assignees[0]) || mr.assignee || null,
            reviewers: mr.reviewers || []
          };
        });
        mrListCache[projectPath] = {mrs: mrs, timestamp: Date.now()};
        return mrs;
      });
  }

  /******************************************************************
   * Verweildauer in Spalte
   ******************************************************************/

  const columnEnteredAtCache = {}; // key: projectPath#iid#list → Promise<Date|null>

  function normalizeLabelNameForMatching(name) {
    return normalizeListNameForMatching(String(name || '').replace(/::/g, ' ').replace(/\s+/g, ' '));
  }

  function loadColumnEnteredAt(projectPath, issueIid, listName) {
    const key = projectPath + '#' + issueIid + '#' + listName;
    if (!columnEnteredAtCache[key]) {
      const target = normalizeLabelNameForMatching(listName);
      const url = '/api/v4/projects/' + encodeURIComponent(projectPath) +
        '/issues/' + issueIid + '/resource_label_events?per_page=100';
      // ponytail: per_page=100, keine Paginierung – bei >100 Label-Events fehlen neuere
      columnEnteredAtCache[key] = fetch(url, {credentials: 'include'})
        .then(function (res) {
          if (!res.ok) throw new Error('Label-Events Status ' + res.status);
          return res.json();
        })
        .then(function (events) {
          let latest = null;
          events.forEach(function (ev) {
            if (ev.action !== 'add' || !ev.label) return;
            if (normalizeLabelNameForMatching(ev.label.name) !== target) return;
            const date = new Date(ev.created_at);
            if (!latest || date > latest) latest = date;
          });
          return latest;
        })
        .catch(function (err) {
          delete columnEnteredAtCache[key];
          throw err;
        });
    }
    return columnEnteredAtCache[key];
  }

  function formatDuration(ms) {
    const minutes = Math.max(0, Math.floor(ms / 60000));
    if (minutes < 60) return minutes + 'min';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + 'h';
    return Math.floor(hours / 24) + 'd';
  }

  // Schrift der Issue-ID (#1234) übernehmen, damit MR-ID und Verweildauer identisch aussehen
  function getIssueNumberFontStyles(footer) {
    const numberText = footer && footer.querySelector('.board-card-number span, .board-card-number');
    if (!numberText) return {fontSize: '12px', lineHeight: '1'};
    const c = getComputedStyle(numberText);
    return {fontFamily: c.fontFamily, fontSize: c.fontSize, fontWeight: c.fontWeight, lineHeight: '1'};
  }

  // Für asynchron zurückkommende Requests: Spalte inzwischen ausgeschaltet → nichts mehr einfügen
  function isCardInActiveColumn(cardElem) {
    if (!showEnabled || !cardElem.isConnected) return false;
    const boardListElem = cardElem.closest('div[data-testid="board-list"]');
    const header = boardListElem && getBoardListHeaderElement(boardListElem);
    const toggle = header && header.querySelector('.ambient-progress-list-toggle');
    return !toggle || toggle.dataset.ambientActive === 'true';
  }

  // Entfernt alles, was das Script in eine Karte eingefügt hat; nächster Scan baut es bei Bedarf neu auf
  function clearCardInjections(cardElem) {
    cardElem.querySelectorAll('.ambient-progress-badge, .ambient-mr-badge, .ambient-column-age')
      .forEach(function (el) { el.remove(); });
    cardElem.removeAttribute('data-ambient-progress-processed');
    cardElem.removeAttribute('data-ambient-entered-at');
    cardElem.removeAttribute('data-ambient-above-avg');
    cardElem.style.boxShadow = '';
  }

  function injectColumnAgeIntoCard(cardElem, enteredAt) {
    const boardListElem = cardElem.closest('div[data-testid="board-list"]');
    let el = cardElem.querySelector('.ambient-column-age');
    if (!enteredAt) {
      if (el) el.remove();
      cardElem.removeAttribute('data-ambient-entered-at');
      updateColumnAgeAverage(boardListElem);
      return;
    }
    if (!el) {
      const footer = cardElem.querySelector('.board-card-footer');
      if (!footer) return;
      const numberElem = footer.querySelector('.board-card-number');
      el = document.createElement('span');
      el.className = 'ambient-column-age';
      // gleiche Optik wie MR-Badge (Farbe der Ticketnummer, 12px bold)
      applyStyles(el, {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        height: '20px',
        marginLeft: '6px',
        whiteSpace: 'nowrap',
        color: numberElem ? getComputedStyle(numberElem).color : 'inherit',
        opacity: '1'
      });
      const icon = document.createElement('span');
      icon.innerHTML = CLOCK_ICON_SVG;
      applyStyles(icon, {width: '14px', height: '14px', display: 'inline-flex', alignItems: 'center'});
      const iconSvg = icon.querySelector('svg');
      if (iconSvg) applyStyles(iconSvg, {width: '14px', height: '14px', margin: '0'});
      el.appendChild(icon);
      const text = document.createElement('span');
      text.className = 'ambient-column-age-text';
      applyStyles(text, getIssueNumberFontStyles(footer));
      el.appendChild(text);
      // Ans Ende der Meta-Zeile (Nummer · MR · Sprint), links vom Assignee-Avatar
      (numberElem && numberElem.parentElement ? numberElem.parentElement : footer).appendChild(el);
    }
    el.style.display = showEnabled ? 'inline-flex' : 'none';
    cardElem.setAttribute('data-ambient-entered-at', String(enteredAt.getTime()));
    updateColumnAgeAverage(boardListElem);
  }

  // Ø über alle aktuell geladenen Karten der Spalte; läuft bei jeder neu geladenen Karte erneut
  function updateColumnAgeAverage(boardListElem) {
    if (!boardListElem) return;
    const now = Date.now();
    const cards = boardListElem.querySelectorAll('[data-ambient-entered-at]');
    let sum = 0;
    cards.forEach(function (card) {
      sum += now - Number(card.getAttribute('data-ambient-entered-at'));
    });
    const avg = cards.length ? sum / cards.length : null;
    updateColumnAgeHeader(boardListElem, avg, cards.length);
    const highlight = Boolean(ageHighlightLookup[normalizeLabelNameForMatching(getColumnLabelText(boardListElem))]);

    cards.forEach(function (card) {
      const el = card.querySelector('.ambient-column-age');
      if (!el) return;
      const enteredAt = new Date(Number(card.getAttribute('data-ambient-entered-at')));
      const age = now - enteredAt.getTime();
      const aboveAvg = avg !== null && age > avg;
      el.querySelector('.ambient-column-age-text').textContent = formatDuration(age);
      el.title = 'In dieser Spalte seit ' + enteredAt.toLocaleString('de-DE');
      card.toggleAttribute('data-ambient-above-avg', highlight && aboveAvg);
      setColumnAgeBorder(card, el.style.display !== 'none');
    });
  }

  function setColumnAgeBorder(cardElem, visible) {
    const marked = visible && cardElem.hasAttribute('data-ambient-above-avg');
    // box-shadow statt border: folgt dem Radius, kein Layout-Sprung
    cardElem.style.boxShadow = marked ? '0 0 0 2px #dc2626' : '';
  }

  function updateColumnAgeHeader(boardListElem, avg, count) {
    if (!isFeatureOn('columnAvg')) avg = null;
    const header = getBoardListHeaderElement(boardListElem);
    // Neben GitLabs Issue-Zähler, mit denselben Utility-Klassen wie der Zähler selbst
    const countBadge = header && header.querySelector('[data-testid="issue-count-badge"]');
    if (!countBadge) return;
    let el = countBadge.querySelector('.ambient-column-avg');
    if (avg === null) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement('span');
      el.className = 'ambient-column-avg gl-flex gl-items-center gl-whitespace-nowrap gl-text-subtle gl-text-sm gl-font-bold gl-mr-3';
      el.style.cursor = 'help';
      el.innerHTML = gitlabIconSvg('clock', 'gl-mr-2 gl-icon s14 gl-fill-current') + '<span></span>';
      countBadge.insertBefore(el, countBadge.firstChild);
    }
    el.lastChild.textContent = formatDuration(avg);
    el.title = 'Ø Verweildauer: So lange liegen die aktuell in dieser Spalte geladenen Tickets im Schnitt schon ' +
      'hier (' + count + ' Tickets, gezählt ab dem letzten Hinzufügen des Spalten-Labels). ' +
      (ageHighlightLookup[normalizeLabelNameForMatching(getColumnLabelText(boardListElem))]
        ? 'Tickets über dem Durchschnitt haben einen roten Rahmen.'
        : 'Roter Rahmen für Tickets über dem Durchschnitt lässt sich in den Einstellungen pro Spalte aktivieren.');
  }

  function fetchAndDisplayColumnAge(projectSettings, issueIid, cardElem, listName) {
    const projectPath = projectSettings && projectSettings.projectPath;
    if (!projectPath || !issueIid || !cardElem || !listName) return;
    loadColumnEnteredAt(projectPath, issueIid, listName)
      .then(function (enteredAt) {
        if (!isCardInActiveColumn(cardElem)) return;
        injectColumnAgeIntoCard(cardElem, enteredAt);
      })
      .catch(function (err) {
        error('Label-Events konnten nicht geladen werden für', projectPath, issueIid, err);
      });
  }

  function injectMrBadgeIntoCard(cardElem, matches, projectPath, issueIid) {
    const footer = cardElem.querySelector('.board-card-footer');
    if (!footer) return;
    const existing = footer.querySelector('.ambient-mr-badge');
    if (existing) existing.remove();
    if (!matches.length) return;

    const el = document.createElement('a');
    el.className = 'ambient-mr-badge';
    const targetUrl = matches.length === 1
      ? matches[0].web_url
      : '/' + projectPath + '/-/merge_requests/?scope=all&state=all&search=%23' + issueIid;
    el.href = targetUrl;
    el.target = '_blank';
    el.rel = 'noopener noreferrer';
    el.title = matches.length === 1
      ? matches[0].title
      : matches.map(function (m) { return m.title; }).join('\n');
    el.addEventListener(
      'click',
      function (ev) {
        if (ev.target.closest && ev.target.closest('.ambient-mr-reviewer-placeholder')) {
          return;
        }
        ev.stopPropagation();
        ev.preventDefault();
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
      },
      true
    );
    const numberElem = footer.querySelector('.board-card-number');
    const matchedColor = numberElem ? getComputedStyle(numberElem).color : 'inherit';
    const allMerged = matches.every(function (m) { return m.state === 'merged'; });
    const badgeColor = allMerged ? '#8e8e93' : matchedColor;

    applyStyles(el, {
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '2px',
      height: '20px',
      color: badgeColor,
      opacity: allMerged ? '0.6' : '1',
      textDecoration: 'none'
    });
    attachHoverEffect(el, {opacity: allMerged ? '0.8' : '1'});

    const icon = document.createElement('span');
    icon.innerHTML = MERGE_REQUEST_ICON_SVG;
    applyStyles(icon, {width: '16px', height: '16px', display: 'inline-flex'});
    el.appendChild(icon);

    if (matches.length === 1) {
      const numberText = document.createElement('span');
      numberText.textContent = '!' + matches[0].iid;
      applyStyles(numberText, getIssueNumberFontStyles(footer));
      el.appendChild(numberText);
    }

    if (matches.length > 1) {
      const badge = document.createElement('span');
      badge.textContent = String(matches.length);
      applyStyles(badge, {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: '14px',
        height: '14px',
        padding: '0 3px',
        borderRadius: '7px',
        background: allMerged ? '#8e8e93' : '#3b82f6',
        color: '#fff',
        fontSize: '9px',
        fontWeight: '700',
        lineHeight: '14px',
        textAlign: 'center'
      });
      el.appendChild(badge);
    }

    if (allMerged) {
      const checkmark = document.createElement('span');
      checkmark.textContent = '✓';
      checkmark.title = 'Gemerged';
      applyStyles(checkmark, {fontSize: '12px', fontWeight: '700', lineHeight: '1'});
      el.appendChild(checkmark);
    }

    if (!allMerged && matches.length === 1 && isFeatureOn('mrAvatars')) {
      const assignee = matches[0].assignee;
      const reviewers = matches[0].reviewers || [];

      const avatarRow = document.createElement('span');
      applyStyles(avatarRow, {display: 'inline-flex', alignItems: 'center', marginLeft: '2px', cursor: 'default'});

      function appendAvatar(user, label, overlap) {
        const avatar = document.createElement('img');
        avatar.src = user.avatar_url;
        avatar.alt = user.name || user.username || label;
        avatar.title = label + ': ' + (user.name || user.username);
        applyStyles(avatar, {
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          marginLeft: overlap ? '-4px' : '0',
          position: 'relative',
          zIndex: overlap ? '1' : '0',
          border: '1px solid ' + matchedColor,
          boxSizing: 'border-box',
          cursor: 'default'
        });
        avatarRow.appendChild(avatar);
      }

      function appendPlaceholder(label, overlap, onClick) {
        const placeholder = document.createElement('span');
        if (onClick) placeholder.className = 'ambient-mr-reviewer-placeholder';
        placeholder.title = onClick ? 'Mich als Reviewer zuweisen' : 'Kein ' + label + ' zugewiesen';
        applyStyles(placeholder, {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          marginLeft: overlap ? '-4px' : '0',
          position: 'relative',
          zIndex: overlap ? '1' : '0',
          background: '#8e8e93',
          color: '#fff',
          fontSize: '10px',
          fontWeight: '700',
          lineHeight: '1',
          border: '1px solid ' + matchedColor,
          boxSizing: 'border-box',
          cursor: onClick ? 'pointer' : 'default'
        });
        placeholder.textContent = '?';
        if (onClick) {
          placeholder.addEventListener(
            'click',
            function (ev) {
              ev.stopPropagation();
              ev.preventDefault();
              onClick();
            },
            true
          );
        }
        avatarRow.appendChild(placeholder);
      }

      if (assignee) {
        appendAvatar(assignee, 'Assignee', false);
      } else {
        appendPlaceholder('Assignee', false);
      }

      if (reviewers.length) {
        reviewers.forEach(function (reviewer) {
          appendAvatar(reviewer, 'Reviewer', true);
        });
      } else {
        const mrIid = matches[0].iid;
        appendPlaceholder('Reviewer', true, function () {
          assignCurrentUserAsReviewer(projectPath, mrIid)
            .then(function (user) {
              matches[0].reviewers = [user];
              const cachedEntry = mrListCache[projectPath];
              if (cachedEntry) {
                const cachedMr = cachedEntry.mrs.find(function (m) { return m.iid === mrIid; });
                if (cachedMr) cachedMr.reviewers = [user];
              }
              injectMrBadgeIntoCard(cardElem, matches, projectPath, issueIid);
            })
            .catch(function (err) {
              error('Konnte Reviewer nicht zuweisen für MR', mrIid, err);
            });
        });
      }

      el.appendChild(avatarRow);
    }

    if (numberElem) {
      numberElem.insertAdjacentElement('afterend', el);
    } else {
      footer.insertBefore(el, footer.firstChild);
    }
  }

  function fetchAndDisplayMrInfo(projectSettings, issueIid, cardElem) {
    const projectPath = projectSettings && projectSettings.projectPath;
    if (!projectPath || !issueIid || !cardElem) return;
    loadMergeRequestsForProject(projectPath)
      .then(function (mrs) {
        if (!isCardInActiveColumn(cardElem)) return;
        const matches = findMatchingMrs(mrs, issueIid);
        injectMrBadgeIntoCard(cardElem, matches, projectPath, issueIid);
      })
      .catch(function (err) {
        error('MR-Liste konnte nicht geladen werden für', projectPath, err);
      });
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
    const timesheetUrl = buildTimesheetUrl(projectSettings, issueIid);
    if (timesheetUrl) {
      cardElem.setAttribute('data-ambient-timesheet-url', timesheetUrl);
    }

    const cached = getProgressCacheEntry(cacheKey);
    let cachedSecondary = null;
    let url2 = null;
    const cacheKey2 = projectSettings.useSecondPortalProjectId && projectSettings.projectId2
      ? buildProgressCacheKey(projectSettings, issueIid, 'pid2:' + projectSettings.projectId2)
      : null;
    if (cacheKey2) {
      cachedSecondary = getProgressCacheEntry(cacheKey2);
      url2 = buildPortalUrl(projectSettings, issueIid, projectSettings.projectId2);
      if (url2) {
        cardElem.setAttribute('data-ambient-progress-url-2', url2);
      }
      const timesheetUrl2 = buildTimesheetUrl(projectSettings, issueIid, projectSettings.projectId2);
      if (timesheetUrl2) {
        cardElem.setAttribute('data-ambient-timesheet-url-2', timesheetUrl2);
      }
    }

    if (cached || cachedSecondary) {
      log('Cache-Hit für Issue', issueIid);
      const effectiveCached = (cached && cached.notFound && !projectSettings.useSecondPortalProjectId)
        ? null
        : cached;
      injectProgressIntoCard(cardElem, effectiveCached, cachedSecondary);
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

    const promises = [loadProgressData(url, issueIid)];
    if (projectSettings.useSecondPortalProjectId && projectSettings.projectId2) {
      if (!url2) {
        url2 = buildPortalUrl(projectSettings, issueIid, projectSettings.projectId2);
      }
      if (url2) {
        log('Hole auch Progress-Daten für zweites Portal-Projekt', issueIid, '→', url2);
        promises.push(loadProgressData(url2, issueIid));
      }
    }

    Promise.allSettled(promises)
      .then(function (results) {
        clearProjectRequestBlock(projectKey);
        const progressData = results[0].status === 'fulfilled' ? results[0].value : null;
        const progressData2 = results[1] && results[1].status === 'fulfilled' ? results[1].value : null;

        if (!progressData && !progressData2) {
          if (projectSettings.useSecondPortalProjectId) {
            setProgressCacheEntry(cacheKey, NOT_FOUND_SENTINEL);
            injectProgressIntoCard(cardElem, NOT_FOUND_SENTINEL, null);
            markPortalRefreshTimestamp();
          }
          return;
        }

        if (progressData) {
          setProgressCacheEntry(cacheKey, progressData);
        }
        if (progressData2 && cacheKey2) {
          setProgressCacheEntry(cacheKey2, progressData2);
        }

        injectProgressIntoCard(cardElem, progressData, progressData2);
        markPortalRefreshTimestamp();
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
  let totalFetchesSincePageLoad = 0;

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

    if (!showEnabled) {
      rootBoardsApp.querySelectorAll('.ambient-progress-list-toggle').forEach(function (button) {
        button.style.display = 'none';
      });
      return;
    }

    const allowedLookup = projectSettings.allowedListLookup || {};
    loadAgeHighlightLookup(projectSettings.projectKey);
    const hasAllowedFilters = Object.keys(allowedLookup).length > 0;

    let newFetchesThisScan = 0;
    let limitReached = false;

    for (let li = 0; li < boardLists.length; li++) {
      if (limitReached) break;
      const boardListElem = boardLists[li];
      const header = getBoardListHeaderElement(boardListElem);
      const listName = getListNameFromBoardListElem(boardListElem, header);
      const displayListName = listName || '<unbekannt>';
      const listNameLower = listName ? normalizeListNameForMatching(listName) : '';
      const columnLabelText = getColumnLabelText(boardListElem, header);

      if (listName && header) {
        ensureListSelectionCheckbox(
          header,
          listName,
          listNameLower,
          projectSettings,
          hostConfig
        );
      }

      let isAllowed = false;
      if (listNameLower && hasAllowedFilters) {
        isAllowed = Boolean(allowedLookup[listNameLower]);
      }
      const avgElem = header && header.querySelector('.ambient-column-avg');
      if (avgElem && !isAllowed) {
        avgElem.remove();
      }

      log('Liste #' + li + ' Name:', '"' + displayListName + '"', '→ allowed:', isAllowed);

      const cards = boardListElem.querySelectorAll('li[data-testid="board-card"].board-card');
      if (isAllowed) {
        log('  → Karten in erlaubter Liste "' + displayListName + '":', cards.length);
      }

      for (let k = 0; k < cards.length; k++) {
        const cardElem = cards[k];
        if (!isAllowed) {
          clearCardInjections(cardElem);
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

        if (isFeatureOn('mrBadge')) {
          fetchAndDisplayMrInfo(projectSettings, issueIid, cardElem);
        }
        if (isFeatureOn('columnAge')) {
          fetchAndDisplayColumnAge(projectSettings, issueIid, cardElem, columnLabelText);
        }

        if (!isFeatureOn('progress')) {
          cardElem.setAttribute('data-ambient-progress-processed', '1');
          continue;
        }

        if (newFetchesThisScan >= MAX_NEW_FETCHES_PER_SCAN) {
          limitReached = true;
          break;
        }

        cardElem.setAttribute('data-ambient-progress-processed', '1');
        fetchAndDisplayProgress(hostConfig, projectSettings, issueIid, cardElem);
        newFetchesThisScan++;
        totalFetchesSincePageLoad++;
      }
    }

    log(
      'scanBoard run #' + scanRunCounter + ': ' + newFetchesThisScan +
      '/' + MAX_NEW_FETCHES_PER_SCAN + ' neue Fetches ausgelöst' +
      (limitReached ? ' (Limit erreicht).' : '.') +
      ' Gesamt seit Seitenaufruf: ' + totalFetchesSincePageLoad + '.'
    );

    if (limitReached) {
      log(
        'Scan-Limit erreicht (' + MAX_NEW_FETCHES_PER_SCAN +
        '), weitere Karten werden erst im nächsten Scan verarbeitet.'
      );
      setRateLimitWarning(true, boardLists.length);
      const now = Date.now();
      if (now - lastRateLimitToastAt >= RATE_LIMIT_TOAST_COOLDOWN_MS) {
        lastRateLimitToastAt = now;
        showToast({
          text:
            'Viele Tickets gleichzeitig geladen (' + MAX_NEW_FETCHES_PER_SCAN +
            '+) – bitte weniger Spalten auswählen.',
          variant: 'warning'
        });
      }
    } else {
      const cachedWarning = getCachedRateLimitWarning();
      if (cachedWarning && Date.now() - cachedWarning.triggeredAt >= RATE_LIMIT_WARNING_MIN_VISIBLE_MS) {
        setRateLimitWarning(false);
      }
    }
  }

  function shouldAttemptIssueDetailInjection() {
    const path = window.location.pathname;
    if (/\/work_items\/\d+/.test(path)) {
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
    if (!isFeatureOn('issueDetail')) {
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

  function resetMRRetryState() {
    mrRetryState.attempts = 0;
    if (mrRetryState.timer) {
      clearTimeout(mrRetryState.timer);
      mrRetryState.timer = null;
    }
  }

  function scheduleMRRetry(hostConfig, projectSettings) {
    if (!hostConfig || !projectSettings) return;
    if (mrRetryState.attempts >= MR_RETRY_MAX_ATTEMPTS) {
      return;
    }
    if (mrRetryState.timer) {
      return;
    }
    mrRetryState.attempts += 1;
    mrRetryState.timer = setTimeout(function () {
      mrRetryState.timer = null;
      log('MR-Progress-Block noch nicht vorhanden – erneuter Versuch #' + mrRetryState.attempts);
      scanMergeRequestPage(hostConfig, projectSettings);
    }, MR_RETRY_INTERVAL_MS);
  }

  function getIssueIidFromMRTitle() {
    const titleEl = document.querySelector('h1[data-testid="title-content"]');
    if (!titleEl) return null;

    // Priorität 1: <a data-iid="..."> Link im Titel
    const issueLink = titleEl.querySelector('a[data-iid]');
    if (issueLink) {
      const iid = issueLink.getAttribute('data-iid');
      if (iid) return iid;
    }

    // Priorität 2: Text-Pattern "#<ID>" im Titel
    const text = titleEl.textContent || '';
    const match = text.match(/#(\d+)/);
    return match ? match[1] : null;
  }

  function injectProgressIntoMRDetail(assigneeBlock, progressData, portalUrl, timesheetUrl) {
    if (!assigneeBlock || !progressData) return;

    const windowBackground = getGitLabWindowBackgroundColor(true);
    const theme = getThemeAwareBarStyles({
      barOverrides: {flex: '1 1 auto', minWidth: '0'}
    });
    const textColor = theme.textColor;

    const parent = assigneeBlock.parentElement;
    if (!parent) return;

    let container = parent.querySelector('.ambient-progress-mr-badge');
    if (!container) {
      container = document.createElement('div');
      container.className = 'ambient-progress-mr-badge';
      applyStyles(container, {
        padding: '1rem 0',
        borderBottomStyle: "solid",
        borderBottomWidth: "1px",
        borderColor: "var(--gl-border-color-subtle)",
        background: windowBackground
      });
      parent.insertBefore(container, assigneeBlock);
    }

    container.style.display = showEnabled ? '' : 'none';
    container.style.color = textColor;
    container.innerHTML = '';

    const row = document.createElement('div');
    applyStyles(row, {
      display: 'flex',
      alignItems: 'center',
      gap: '0.35rem',
      fontSize: '12px',
      flexWrap: 'wrap',
      width: '100%'
    });

    const tsButton = createTimesheetButton(timesheetUrl);
    if (tsButton) {
      row.appendChild(tsButton);
    }

    const barOuter = createProgressBarElements(progressData, theme.styles);
    if (barOuter) {
      row.appendChild(barOuter);
    }

    const portalButton = createPortalLinkButton(portalUrl);
    if (portalButton) {
      row.appendChild(portalButton);
    }

    if (row.children.length) {
      container.appendChild(row);
    }
  }

  function fetchAndDisplayProgressForMRDetail(hostConfig, projectSettings, issueIid, assigneeBlock) {
    if (!issueIid || !assigneeBlock) return;

    const projectId = projectSettings.projectId;
    if (!projectId) {
      warn('Kein projectId für', projectSettings.projectPath, '; MR-Detail-Progress wird nicht geladen.');
      return;
    }

    const cacheKey = buildProgressCacheKey(projectSettings, issueIid);
    if (!cacheKey) {
      log('MR-Detail-Cache: Kein Cache-Key möglich für Issue', issueIid);
      return;
    }

    const cached = findProgressCacheEntryForIssue(projectSettings, issueIid);
    if (!cached) {
      log(
        'Kein Cache-Eintrag für MR-Detail gefunden (Projekt',
        projectSettings.projectPath + ',',
        'Issue',
        issueIid + ').'
      );
      const url = buildPortalUrl(projectSettings, issueIid);
      if (!url) {
        warn(
          'Keine Portal-Basis konfiguriert für',
          projectSettings.projectPath,
          '; MR-Detail-Fortschritt wird nicht geladen.'
        );
        return;
      }
      assigneeBlock.setAttribute('data-ambient-progress-url', url);
      if (!shouldPerformPortalRequest(false)) {
        log('MR-Detail-Request ausgelassen (letzte Aktualisierung < 1h) für Issue', issueIid);
        return;
      }
      log('MR-Detail lädt Progress-Daten (Projekt', projectSettings.projectPath + ',', 'Issue', issueIid + ') →', url);
      totalFetchesSincePageLoad++;
      loadProgressData(url, issueIid)
        .then(function (progressData) {
          clearProjectRequestBlock(projectSettings.projectKey);
          if (!progressData) return;
          setProgressCacheEntry(cacheKey, progressData);
          injectProgressIntoMRDetail(assigneeBlock, progressData, url, buildTimesheetUrl(projectSettings, issueIid));
          const parent = assigneeBlock.parentElement;
          if (parent) {
            parent.dataset.ambientProgressMrIssueIid = issueIid;
          }
        })
        .catch(function (err) {
          error('Request-Fehler für MR-Issue ' + issueIid + ':', err);
          if (err && err.status) {
            blockProjectRequests(projectSettings.projectKey, err.status);
          }
        });
      return;
    }

    log(
      'MR-Detail liest Cache (Projekt',
      projectSettings.projectPath + ',',
      'Issue',
      issueIid + ').'
    );

    const url = buildPortalUrl(projectSettings, issueIid);
    if (url) {
      assigneeBlock.setAttribute('data-ambient-progress-url', url);
    }

    injectProgressIntoMRDetail(assigneeBlock, cached, url, buildTimesheetUrl(projectSettings, issueIid));
    const parent = assigneeBlock.parentElement;
    if (parent) {
      parent.dataset.ambientProgressMrIssueIid = issueIid;
    }
  }

  /******************************************************************
   * Ticket-Assignee-Umzuweisen auf der MR-Detailseite
   ******************************************************************/

  function loadMergeRequestDetails(projectPath, mrIid) {
    const url = '/api/v4/projects/' + encodeURIComponent(projectPath) + '/merge_requests/' + mrIid;
    return fetch(url, {credentials: 'include'})
      .then(function (res) {
        if (!res.ok) throw new Error('MR-Status ' + res.status);
        return res.json();
      })
      .then(function (mr) {
        return {
          author: mr.author || null,
          assignee: (mr.assignees && mr.assignees[0]) || mr.assignee || null,
          reviewer: (mr.reviewers && mr.reviewers[0]) || null
        };
      });
  }

  function getMrIidFromLocation() {
    const match = window.location.pathname.match(/\/merge_requests\/(\d+)/);
    return match ? match[1] : null;
  }

  function loadIssueAssignees(projectPath, issueIid) {
    const url = '/api/v4/projects/' + encodeURIComponent(projectPath) + '/issues/' + issueIid;
    return fetch(url, {credentials: 'include'})
      .then(function (res) {
        if (!res.ok) throw new Error('Issue-Status ' + res.status);
        return res.json();
      })
      .then(function (issue) {
        return issue.assignees || [];
      });
  }

  function updateIssueAssignee(projectPath, issueIid, userId) {
    const url = '/api/v4/projects/' + encodeURIComponent(projectPath) + '/issues/' + issueIid;
    return fetch(url, {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': getCsrfToken()
      },
      body: JSON.stringify({assignee_ids: [userId]})
    }).then(function (res) {
      if (!res.ok) throw new Error('Assignee-Update-Status ' + res.status);
      return res.json();
    });
  }

  function injectIssueAssigneeBlock(assigneeBlock, projectPath, issueIid) {
    const parent = assigneeBlock.parentElement;
    if (!parent || !projectPath || !issueIid) return;

    let container = parent.querySelector('.ambient-ticket-assignee-badge');
    if (!container) {
      container = document.createElement('div');
      container.className = 'ambient-ticket-assignee-badge';
      const windowBackground = getGitLabWindowBackgroundColor(true);
      applyStyles(container, {
        padding: '0.5rem 0',
        borderBottomStyle: 'solid',
        borderBottomWidth: '1px',
        borderColor: 'var(--gl-border-color-subtle)',
        background: windowBackground,
        fontSize: '12px',
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.4rem'
      });
      parent.insertBefore(container, assigneeBlock);
    }
    container.innerHTML = '';

    const label = document.createElement('span');
    label.textContent = 'Ticket-Assignee:';
    applyStyles(label, {fontWeight: '600', opacity: '0.8'});
    container.appendChild(label);

    const currentWrap = document.createElement('span');
    currentWrap.textContent = 'Lädt…';
    applyStyles(currentWrap, {display: 'inline-flex', alignItems: 'center', gap: '0.25rem'});
    container.appendChild(currentWrap);

    const quickActionsWrap = document.createElement('span');
    applyStyles(quickActionsWrap, {display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem'});
    container.appendChild(quickActionsWrap);

    parent.dataset.ambientTicketAssigneeIid = issueIid;

    function renderQuickActionButton(user, label, currentId) {
      if (!user || user.id === currentId) return;
      const button = document.createElement('button');
      button.type = 'button';
      applyStyles(button, mergeStyles(PORTAL_LINK_BUTTON_DEFAULT_STYLES, {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        width: 'auto',
        height: 'auto',
        padding: '2px 6px',
        borderRadius: '10px'
      }));

      const avatar = document.createElement('img');
      avatar.src = user.avatar_url;
      avatar.alt = user.name;
      applyStyles(avatar, {width: '14px', height: '14px', borderRadius: '50%'});
      button.appendChild(avatar);

      const text = document.createElement('span');
      text.textContent = label + ': ' + user.name;
      applyStyles(text, {fontSize: '11px'});
      button.appendChild(text);

      button.addEventListener(
        'click',
        function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
          button.disabled = true;
          updateIssueAssignee(projectPath, issueIid, user.id)
            .then(function () {
              injectIssueAssigneeBlock(assigneeBlock, projectPath, issueIid);
            })
            .catch(function (err) {
              button.disabled = false;
              error('Konnte Ticket-Assignee nicht aktualisieren für Issue', issueIid, err);
            });
        },
        true
      );

      quickActionsWrap.appendChild(button);
    }

    const mrIid = getMrIidFromLocation();

    Promise.all([
      loadIssueAssignees(projectPath, issueIid),
      mrIid
        ? loadMergeRequestDetails(projectPath, mrIid)
        : Promise.resolve({author: null, assignee: null, reviewer: null}),
      getCurrentUser().catch(function () { return null; })
    ])
      .then(function (results) {
        const assignees = results[0];
        const mrInfo = results[1];
        const me = results[2];
        const currentId = assignees[0] ? assignees[0].id : null;

        currentWrap.innerHTML = '';
        if (assignees.length) {
          const avatar = document.createElement('img');
          avatar.src = assignees[0].avatar_url;
          avatar.alt = assignees[0].name;
          applyStyles(avatar, {width: '16px', height: '16px', borderRadius: '50%'});
          currentWrap.appendChild(avatar);
          const name = document.createElement('span');
          name.textContent = assignees[0].name;
          currentWrap.appendChild(name);
        } else {
          currentWrap.textContent = 'Niemand zugewiesen';
        }

        const viewerIsMrAssignee = Boolean(mrInfo.assignee && me && mrInfo.assignee.id === me.id);
        const secondary = viewerIsMrAssignee ? mrInfo.reviewer : mrInfo.author;
        const secondaryLabel = viewerIsMrAssignee ? 'MR-Reviewer zuweisen' : 'MR-Author zuweisen';
        const sameSame = mrInfo.assignee && secondary && mrInfo.assignee.id === secondary.id;

        renderQuickActionButton(mrInfo.assignee, 'MR-Assignee zuweisen', currentId);
        if (!sameSame) {
          renderQuickActionButton(secondary, secondaryLabel, currentId);
        }
      })
      .catch(function (err) {
        error('Konnte Ticket-Assignee-Infos nicht laden für Issue', issueIid, err);
        currentWrap.textContent = 'Fehler beim Laden';
      });
  }

  function scanMergeRequestPage(hostConfig, projectSettings) {
    if (!hostConfig || !projectSettings) {
      log('scanMergeRequestPage übersprungen (Host/Project fehlt).');
      return;
    }
    if (!showEnabled) {
      log('scanMergeRequestPage übersprungen (Anzeigen-Toggle aus).');
      return;
    }

    const issueIid = getIssueIidFromMRTitle();
    if (!issueIid) {
      log('scanMergeRequestPage: Keine Issue-IID im MR-Titel gefunden.');
      return;
    }

    const assigneeBlock = document.querySelector('[data-testid="assignee-block-container"]');
    if (!assigneeBlock) {
      log('scanMergeRequestPage: Assignee-Block nicht gefunden, retry...');
      scheduleMRRetry(hostConfig, projectSettings);
      return;
    }

    resetMRRetryState();

    const parent = assigneeBlock.parentElement;
    if (isFeatureOn('mrPageProgress') && (!parent || parent.dataset.ambientProgressMrIssueIid !== issueIid)) {
      fetchAndDisplayProgressForMRDetail(hostConfig, projectSettings, issueIid, assigneeBlock);
    }
    if (isFeatureOn('mrAssigneeButtons') && (!parent || parent.dataset.ambientTicketAssigneeIid !== issueIid)) {
      injectIssueAssigneeBlock(assigneeBlock, projectSettings.projectPath, issueIid);
    }
  }

  function getIssueIidFromDetailView(detailElem) {
    const fromShow = parseIssueIidFromShowParam();
    if (fromShow) return fromShow;

    const pathMatch = window.location.pathname.match(/\/work_items\/(\d+)/);
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
      detailWrapperElem.setAttribute('data-ambient-progress-url', url);
      if (!shouldPerformPortalRequest(false)) {
        log('Detail-Request ausgelassen (letzte Aktualisierung < 1h) für Issue', issueIid);
        return;
      }
      log('Ticket-Detail lädt Progress-Daten (Projekt', projectSettings.projectPath + ',', 'Issue', issueIid + ') →', url);
      totalFetchesSincePageLoad++;
      loadProgressData(url, issueIid)
        .then(function (progressData) {
          clearProjectRequestBlock(projectSettings.projectKey);
          if (!progressData) return;
          setProgressCacheEntry(cacheKey, progressData);
          injectProgressIntoIssueDetail(detailWrapperElem, progressData, url, buildTimesheetUrl(projectSettings, issueIid));
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

    const url = buildPortalUrl(projectSettings, issueIid);
    if (url) {
      detailWrapperElem.setAttribute('data-ambient-progress-url', url);
    }

    injectProgressIntoIssueDetail(detailWrapperElem, cached, url, buildTimesheetUrl(projectSettings, issueIid));
    detailWrapperElem.dataset.ambientProgressIssueIid = issueIid;
  }

  function injectProgressIntoIssueDetail(detailWrapperElem, progressData, portalUrl, timesheetUrl) {
    if (!detailWrapperElem || !progressData) return;

    const windowBackground = getGitLabWindowBackgroundColor(true);
    const theme = getThemeAwareBarStyles({
      barOverrides: {flex: '1 1 auto', minWidth: '0'}
    });
    const textColor = theme.textColor;
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
      alignItems: 'center',
      gap: '0.35rem',
      fontSize: '12px',
      flexWrap: 'wrap',
      width: '100%'
    });

    const tsButton = createTimesheetButton(timesheetUrl);
    if (tsButton) {
      row.appendChild(tsButton);
    }

    const barOuter = createProgressBarElements(progressData, theme.styles);
    if (barOuter) {
      row.appendChild(barOuter);
    }

    const portalButton = createPortalLinkButton(portalUrl);
    if (portalButton) {
      row.appendChild(portalButton);
    }

    if (row.children.length) {
      container.appendChild(row);
    }
  }

  function applyShowFlagToDetailBadges() {
    const badges = document.querySelectorAll('.ambient-progress-detail-badge, .ambient-progress-mr-badge');
    for (let i = 0; i < badges.length; i++) {
      badges[i].style.display = showEnabled ? '' : 'none';
    }
  }

  function ensureListSelectionCheckbox(
    header,
    listName,
    listNameLower,
    projectSettings,
    hostConfig
  ) {
    if (!header || !listName || !listNameLower) return;
    // Als Icon-Button in GitLabs Button-Gruppe (+ / ⚙); eingeklappte Spalten blenden die Gruppe selbst aus
    const buttonGroup = header.querySelector('.board-list-button-group');
    if (!buttonGroup) return;

    let button = buttonGroup.querySelector('button.ambient-progress-list-toggle');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'ambient-progress-list-toggle btn gl-button btn-default btn-sm btn-icon';
      buttonGroup.insertBefore(button, buttonGroup.firstChild);
      button.addEventListener('click', function (ev) {
        ev.stopPropagation();
        ev.preventDefault();
        const key = button.dataset.ambientProgressList;
        const updatedLookup = Object.assign({}, projectSettings.allowedListLookup || {});
        if (updatedLookup[key]) {
          delete updatedLookup[key];
        } else {
          updatedLookup[key] = true;
        }
        projectSettings.allowedListLookup = updatedLookup;
        projectSettings.listFilterMode = 'explicit';
        writeListSelectionEntry(projectSettings.projectKey, updatedLookup, true);
        clearProgressCache();
        scanBoard(hostConfig, projectSettings);
      });
    }

    const active = Boolean(projectSettings.allowedListLookup && projectSettings.allowedListLookup[listNameLower]);
    button.dataset.ambientProgressList = listNameLower;
    if (button.dataset.ambientActive !== String(active)) {
      button.dataset.ambientActive = String(active);
      button.innerHTML = gitlabIconSvg(active ? 'eye' : 'eye-slash', 'gl-button-icon gl-icon s16 gl-fill-current');
    }
    const label = active ? 'Script für diese Spalte ausschalten' : 'Script für diese Spalte einschalten';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(active));
    button.style.display = '';
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

  function createToolbar(hostConfig, projectSettings) {
    const existing = document.getElementById('ambient-progress-toolbar');
    if (existing) return existing;

    const windowBackground = getGitLabWindowBackgroundColor(true);

    const targetSelectors = ['#js-injected-page-breadcrumbs', '.panel-header-inner-actions', '.top-bar-container', '.top-bar-fixed'];
    let insertParent = null;
    for (let si = 0; si < targetSelectors.length; si++) {
      const candidate = document.querySelector(targetSelectors[si]);
      log('[createToolbar] Selector "' + targetSelectors[si] + '" → ' + (candidate ? 'GEFUNDEN (' + candidate.tagName + '#' + candidate.id + '.' + candidate.className + ')' : 'nicht gefunden'));
      if (candidate) {
        insertParent = candidate;
        break;
      }
    }
    if (!insertParent) {
      log('[createToolbar] Kein Selector gefunden → Fallback document.body');
      insertParent = document.body;
    } else {
      log('[createToolbar] Toolbar wird eingefügt in: ' + insertParent.tagName + '#' + insertParent.id + '.' + insertParent.className);
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

    let refreshAgeHighlightSection = null;

    const showToggle = makeSwitch('Anzeigen', showEnabled, function (val) {
      showEnabled = val;
      saveFeature('show', showEnabled);
      log('Anzeigen geändert auf:', showEnabled);
      if (showEnabled) {
        clearProgressCache();
        createMrLinksBar();
      } else {
        const existingMrLinks = document.getElementById('js-my-mr-links');
        if (existingMrLinks) existingMrLinks.remove();
      }
      // entfernt alle Injektionen; Scans fügen bei „aus" nichts mehr ein
      rerenderFeatures();
    });

    const debugToggle = makeSwitch('Debug', debugEnabled, function (val) {
      debugEnabled = val;
      saveFeature('debug', debugEnabled);
      console.log(LOG_PREFIX, 'Debug geändert auf:', debugEnabled);
    });

    const mrLinksToggle = makeSwitch('MR Buttons anzeigen', mrLinksEnabled, function (val) {
      mrLinksEnabled = val;
      saveFeature('mrLinks', mrLinksEnabled);
      log('MR-Buttons geändert auf:', mrLinksEnabled);
      if (mrLinksEnabled) {
        createMrLinksBar();
      } else {
        const existingMrLinks = document.getElementById('js-my-mr-links');
        if (existingMrLinks) existingMrLinks.remove();
      }
    });

    // Alle Injektionen entfernen und neu scannen – Daten kommen aus den Caches, kein Request-Burst
    function rerenderFeatures() {
      document.querySelectorAll(
        '.ambient-progress-badge, .ambient-mr-badge, .ambient-column-age, .ambient-column-avg,' +
        ' .ambient-progress-detail-badge, .ambient-progress-mr-badge, .ambient-ticket-assignee-badge'
      ).forEach(function (el) { el.remove(); });
      document.querySelectorAll('[data-ambient-progress-processed]').forEach(clearCardInjections);
      document.querySelectorAll(
        '[data-ambient-progress-issue-iid], [data-ambient-progress-mr-issue-iid], [data-ambient-ticket-assignee-iid]'
      ).forEach(function (el) {
        delete el.dataset.ambientProgressIssueIid;
        delete el.dataset.ambientProgressMrIssueIid;
        delete el.dataset.ambientTicketAssigneeIid;
      });
      if (!projectSettings) return;
      if (isMergeRequestPage()) {
        scanMergeRequestPage(hostConfig, projectSettings);
      } else {
        scanBoard(hostConfig, projectSettings);
        scanIssueDetail(hostConfig, projectSettings);
      }
    }

    const globalSection = createGlobalSettingsSection(mrLinksToggle, debugToggle, function () {
      rerenderFeatures();
      if (refreshAgeHighlightSection) refreshAgeHighlightSection();
    });

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
    gearButton.setAttribute('title', 'Einstellungen');
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

    const rateLimitBadge = document.createElement('span');
    rateLimitBadge.setAttribute('aria-hidden', 'true');
    applyStyles(rateLimitBadge, {
      position: 'absolute',
      top: '4px',
      left: '4px',
      width: '10px',
      height: '10px',
      borderRadius: '50%',
      background: '#ef4444',
      boxShadow: '0 0 0 2px ' + windowBackground,
      display: 'none',
      pointerEvents: 'none'
    });
    gearButton.appendChild(rateLimitBadge);
    rateLimitNotificationElements.badge = rateLimitBadge;

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
      display: 'flex',
      flexDirection: 'column',
      zIndex: '150',
      gap: '0',
      padding: '0.75rem',
      width: '320px',
      maxHeight: 'calc(100vh - 80px)',
      overflowY: 'auto',
      opacity: '0',
      transform: 'translateY(-8px) scale(0.97)',
      pointerEvents: 'none',
      transition: 'opacity 0.2s ease, transform 0.2s ease'
    });

    const versionRow = document.createElement('div');
    applyStyles(versionRow, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '0.5rem',
      paddingBottom: '0.35rem'
    });
    const versionLabel = document.createElement('div');
    versionLabel.textContent = 'Version: ' + SCRIPT_VERSION;
    applyStyles(versionLabel, {
      fontSize: '0.75rem',
      letterSpacing: '0.04em',
      opacity: '0.8'
    });
    showToggle.title = 'Blendet alle Anzeigen des Scripts auf einmal aus (gilt für alle Boards)';
    versionRow.appendChild(versionLabel);
    versionRow.appendChild(showToggle);
    dropdown.appendChild(versionRow);

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
        cursor: 'pointer',
        transition: 'background 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease',
        boxShadow: '0 4px 10px rgba(37, 99, 235, 0.25)'
      });
      refreshButton.addEventListener('click', function () {
        clearCacheAndReload(hostConfig, projectSettings);
      });
      manualRefreshButtonElement = refreshButton;
      attachHoverEffect(refreshButton, {
        background: '#1d4ed8',
        boxShadow: '0 6px 18px rgba(37, 99, 235, 0.35)',
        transform: 'translateY(-1px)'
      });
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

    releaseNotificationRow.appendChild(releaseNotificationText);
    const releaseNotificationDivider = document.createElement('div');
    applyStyles(releaseNotificationDivider, {
      width: '100%',
      height: '1px',
      background: 'rgba(255, 255, 255, 0.1)',
      borderRadius: '2px',
      margin: '0.35rem 0'
    });
    releaseNotificationDivider.style.display = 'none';
    releaseNotificationRow.appendChild(releaseNotificationDivider);
    releaseNotificationElements.messageRow = releaseNotificationRow;
    releaseNotificationElements.messageText = releaseNotificationText;
    releaseNotificationElements.divider = releaseNotificationDivider;
    dropdown.appendChild(releaseNotificationRow);

    const rateLimitNotificationRow = document.createElement('div');
    applyStyles(rateLimitNotificationRow, {
      display: 'none',
      flexDirection: 'column',
      gap: '0.25rem',
      padding: '0.35rem 0',
      borderTop: '1px solid #2f374c',
      width: '100%'
    });

    const rateLimitNotificationText = document.createElement('div');
    applyStyles(rateLimitNotificationText, {
      fontSize: '0.78rem',
      lineHeight: '1.35',
      opacity: '0.9',
      color: toolbarTextColor
    });

    rateLimitNotificationRow.appendChild(rateLimitNotificationText);
    const rateLimitNotificationDivider = document.createElement('div');
    applyStyles(rateLimitNotificationDivider, {
      width: '100%',
      height: '1px',
      background: 'rgba(255, 255, 255, 0.1)',
      borderRadius: '2px',
      margin: '0.35rem 0'
    });
    rateLimitNotificationDivider.style.display = 'none';
    rateLimitNotificationRow.appendChild(rateLimitNotificationDivider);
    rateLimitNotificationElements.messageRow = rateLimitNotificationRow;
    rateLimitNotificationElements.messageText = rateLimitNotificationText;
    rateLimitNotificationElements.divider = rateLimitNotificationDivider;
    dropdown.appendChild(rateLimitNotificationRow);
    updateRateLimitWarningUI(getCachedRateLimitWarning());

    dropdown.appendChild(globalSection);
    let projectConfigDetails = null;
    if (projectSettings) {
      const boardSection = document.createElement('div');
      boardSection.appendChild(createSettingsGroupHeader(
        'Board-Einstellungen',
        'Gelten nur für ' + (projectSettings.projectPath || 'dieses Board')
      ));
      const ageHighlightSection = createAgeHighlightSection(projectSettings);
      refreshAgeHighlightSection = ageHighlightSection.refresh;
      boardSection.appendChild(ageHighlightSection.element);

      const projectConfigSection = createProjectConfigSection(hostConfig, projectSettings, updateSaveButtonState);
      projectConfigSection.removeChild(projectConfigSection.firstChild); // Überschrift steckt im <summary>
      projectConfigSection.style.borderTop = 'none';
      // Eingerichtete Boards brauchen die Konfiguration selten → zugeklappt
      projectConfigDetails = createCollapsible(
        'Projekt-Konfiguration',
        !(projectSettings.projectId && projectSettings.portalBaseUrl)
      );
      projectConfigDetails.body.appendChild(projectConfigSection);
      boardSection.appendChild(projectConfigDetails.element);
      dropdown.appendChild(boardSection);
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
    const saveButtonBaseStyles = {
      background: '#2563eb',
      border: 'none',
      borderRadius: '6px',
      padding: '0.45rem 1rem',
      color: '#fff',
      fontSize: '12px',
      cursor: 'pointer',
      width: '100%',
      transition: 'background 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease',
      boxShadow: '0 6px 18px rgba(37, 99, 235, 0.25)',
      transform: 'translateY(0)'
    };
    const saveButtonDisabledStyles = {
      background: '#4b5563',
      boxShadow: 'none',
      cursor: 'not-allowed',
      color: '#e5e7eb',
      transform: 'translateY(0)'
    };
    const saveButtonHoverStyles = {
      background: '#1d4ed8',
      boxShadow: '0 10px 24px rgba(37, 99, 235, 0.35)',
      transform: 'translateY(-1px)'
    };
    applyStyles(saveButton, saveButtonBaseStyles);

    function updateSaveButtonState() {
      const projectValue = projectIdInputElement ? (projectIdInputElement.value || '').trim() : '';
      const portalValue = portalUrlInputElement ? (portalUrlInputElement.value || '').trim() : '';
      const id2Value = projectId2InputElement ? (projectId2InputElement.value || '').trim() : '';
      const useSecondValue = useSecondProjectIdToggleCheckbox ? useSecondProjectIdToggleCheckbox.checked : false;
      const hasChanges =
        projectValue !== toolbarInitialProjectIdValue ||
        portalValue !== toolbarInitialPortalUrlValue ||
        id2Value !== toolbarInitialProjectId2Value ||
        useSecondValue !== toolbarInitialUseSecondProjectIdValue;
      const enabled = hasChanges;
      saveButton.disabled = !enabled;
      const styleToApply = enabled
        ? saveButtonBaseStyles
        : mergeStyles(saveButtonBaseStyles, saveButtonDisabledStyles);
      applyStyles(saveButton, styleToApply);
    }

    saveButton.addEventListener('mouseenter', function () {
      if (saveButton.disabled) {
        return;
      }
      applyStyles(saveButton, mergeStyles(saveButtonBaseStyles, saveButtonHoverStyles));
    });
    saveButton.addEventListener('mouseleave', function () {
      updateSaveButtonState();
    });

    saveButton.addEventListener('click', function () {
      if (!projectSettings || !projectIdInputElement || !portalUrlInputElement || !projectId2InputElement || !useSecondProjectIdToggleCheckbox) {
        return;
      }
      const projectAttempt = projectIdInputElement.value.trim();
      const portalAttempt = portalUrlInputElement.value.trim();
      const projectAttempt2 = projectId2InputElement.value.trim();
      const useSecond = useSecondProjectIdToggleCheckbox.checked;

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

      if (useSecond && !projectAttempt2) {
        if (projectId2StatusElement) {
          projectId2StatusElement.textContent = 'Bitte gib eine zweite Projekt-ID ein (oder deaktiviere das Feature).';
        }
        return;
      }
      if (useSecond && !/^\d+$/.test(projectAttempt2)) {
        if (projectId2StatusElement) {
          projectId2StatusElement.textContent = 'Zweite Projekt-ID darf nur Zahlen enthalten.';
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
      if (projectAttempt2 !== (projectSettings.projectId2 || '')) {
        entry.portalProjectId2 = projectAttempt2;
        changed = true;
      }
      if (useSecond !== (projectSettings.useSecondPortalProjectId || false)) {
        entry.useSecondPortalProjectId = useSecond;
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
      if (entry.portalProjectId2 !== undefined) {
        projectSettings.projectId2 = entry.portalProjectId2;
      }
      if (entry.useSecondPortalProjectId !== undefined) {
        projectSettings.useSecondPortalProjectId = entry.useSecondPortalProjectId;
      }
      clearProgressCache();
      clearProjectRequestBlock(projectSettings.projectKey);
      showToast({text: 'Einstellungen gespeichert', variant: 'success'});
      setTimeout(function () {
        window.location.reload();
      }, 100);
    });
    saveRow.appendChild(saveButton);
    updateSaveButtonState();
    (projectConfigDetails ? projectConfigDetails.body : dropdown).appendChild(saveRow);
    gearWrapper.appendChild(gearButton);
    gearWrapper.appendChild(dropdown);
    bar.appendChild(gearWrapper);

    let dropdownLocked = false;

    function updateDropdownVisibility() {
      const isOpen = dropdownLocked;
      dropdown.style.opacity = isOpen ? '1' : '0';
      dropdown.style.transform = isOpen ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.97)';
      dropdown.style.pointerEvents = isOpen ? 'auto' : 'none';
    }

    gearButton.addEventListener('click', function () {
      dropdownLocked = !dropdownLocked;
      if (dropdownLocked && refreshAgeHighlightSection) refreshAgeHighlightSection();
      updateDropdownVisibility();
    });

    document.addEventListener('click', function (event) {
      if (!dropdownLocked) {
        return;
      }
      if (gearWrapper.contains(event.target)) {
        return;
      }
      dropdownLocked = false;
      updateDropdownVisibility();
    });

    updateReleaseNotificationUI(getCachedReleaseInfo());
    insertParent.appendChild(bar);
    refreshPortalBaseWarning(projectSettings);
    return bar;
  }

  function repositionToolbarIfNeeded() {
    const bar = document.getElementById('ambient-progress-toolbar');
    if (!bar) {
      log('[reposition] Toolbar-Element nicht im DOM gefunden – abbruch');
      return;
    }
    log('[reposition] Toolbar gefunden, aktueller Parent: ' + bar.parentNode.tagName + '#' + bar.parentNode.id + '.' + bar.parentNode.className);
    const targetSelectors = ['#js-injected-page-breadcrumbs', '.panel-header-inner-actions', '.top-bar-container', '.top-bar-fixed'];
    for (let si = 0; si < targetSelectors.length; si++) {
      const candidate = document.querySelector(targetSelectors[si]);
      log('[reposition] Selector "' + targetSelectors[si] + '" → ' + (candidate ? 'GEFUNDEN' : 'nicht gefunden'));
      if (candidate) {
        if (bar.parentNode !== candidate) {
          log('[reposition] Verschiebe Toolbar → ' + candidate.tagName + '#' + candidate.id + '.' + candidate.className);
          candidate.appendChild(bar);
        } else {
          log('[reposition] Toolbar bereits im richtigen Parent – keine Aktion');
        }
        return;
      }
    }
    log('[reposition] Kein Ziel-Selector gefunden – Toolbar bleibt wo sie ist');
  }

  const MY_MR_USERNAME = 'christoph-teichmeister';

  function getCurrentProjectPath() {
    const marker = '/-/';
    const idx = window.location.pathname.indexOf(marker);
    if (idx === -1) return null;
    const projectPath = window.location.pathname.slice(0, idx).replace(/^\/+|\/+$/g, '');
    if (!projectPath) return null;
    return projectPath;
  }

  function buildMrLinksBar(projectPath) {
    const toolbarTextColor = getToolbarForegroundColor();
    const windowBackground = getGitLabWindowBackgroundColor(true);
    const linksBar = document.createElement('div');
    linksBar.id = 'js-my-mr-links';
    applyStyles(linksBar, {
      display: 'flex',
      alignItems: 'center',
      gap: '0.25rem',
      padding: '0 0.25rem'
    });

    function makeMrIconLink(queryParam, badgeLabel, badgeColor, tooltip) {
      const link = document.createElement('a');
      link.href = '/' + projectPath + '/-/merge_requests/?sort=merged_at_desc&state=opened&' + queryParam + '=' + MY_MR_USERNAME;
      link.title = tooltip;
      link.setAttribute('aria-label', tooltip);
      link.classList.add(
        'btn',
        'gl-button',
        'btn-default',
        'btn-md',
        'btn-default-tertiary',
        'btn-icon'
      );
      applyStyles(link, {
        padding: '0.35rem',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: '38px',
        minHeight: '38px',
        position: 'relative',
        overflow: 'visible',
        color: toolbarTextColor,
        opacity: '0.85'
      });
      attachHoverEffect(link, {opacity: '1'});

      const icon = document.createElement('span');
      icon.innerHTML = MERGE_REQUEST_ICON_SVG;
      icon.setAttribute('aria-hidden', 'true');
      applyStyles(icon, {
        width: '20px',
        height: '20px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: toolbarTextColor
      });
      const iconSvg = icon.querySelector('svg');
      if (iconSvg) {
        iconSvg.setAttribute('width', '20');
        iconSvg.setAttribute('height', '20');
        applyStyles(iconSvg, {width: '20px', height: '20px', display: 'block'});
      }
      link.appendChild(icon);

      const badge = document.createElement('span');
      badge.textContent = badgeLabel;
      badge.setAttribute('aria-hidden', 'true');
      applyStyles(badge, {
        position: 'absolute',
        bottom: '2px',
        right: '2px',
        minWidth: '12px',
        height: '12px',
        padding: '0 2px',
        borderRadius: '6px',
        background: badgeColor,
        color: '#fff',
        fontSize: '9px',
        fontWeight: '700',
        lineHeight: '12px',
        textAlign: 'center',
        boxShadow: '0 0 0 2px ' + windowBackground,
        pointerEvents: 'none'
      });
      link.appendChild(badge);

      return link;
    }

    linksBar.appendChild(makeMrIconLink('reviewer_username', 'R', '#3b82f6', 'MRs, bei denen ich Reviewer bin'));
    linksBar.appendChild(makeMrIconLink('author_username', 'A', '#10b981', 'Meine MRs'));
    return linksBar;
  }

  function insertMrLinksBar(wrapper, linksBar) {
    const injectedBreadcrumbs = wrapper.querySelector('#js-injected-page-breadcrumbs');
    if (injectedBreadcrumbs && injectedBreadcrumbs.parentNode === wrapper) {
      wrapper.insertBefore(linksBar, injectedBreadcrumbs);
    } else {
      wrapper.appendChild(linksBar);
    }
  }

  function createMrLinksBar() {
    if (!mrLinksEnabled || !showEnabled) {
      log('[createMrLinksBar] MR-Buttons deaktiviert – abbruch');
      return;
    }

    const projectPath = getCurrentProjectPath();
    if (!projectPath) {
      log('[createMrLinksBar] Kein Projekt-Pfad in der URL – MR-Links werden nicht angezeigt');
      return;
    }

    const wrapper = document.getElementById('js-vue-page-breadcrumbs-wrapper');
    if (!wrapper) {
      log('[createMrLinksBar] #js-vue-page-breadcrumbs-wrapper nicht gefunden – abbruch');
      return;
    }

    const existing = document.getElementById('js-my-mr-links');
    if (existing) {
      insertMrLinksBar(wrapper, existing);
      return;
    }

    const linksBar = buildMrLinksBar(projectPath);
    insertMrLinksBar(wrapper, linksBar);
  }

  function repositionMrLinksIfNeeded() {
    const linksBar = document.getElementById('js-my-mr-links');
    if (!mrLinksEnabled || !showEnabled) {
      if (linksBar) linksBar.remove();
      return;
    }
    const wrapper = document.getElementById('js-vue-page-breadcrumbs-wrapper');
    if (!linksBar || !wrapper) {
      createMrLinksBar();
      return;
    }
    const injectedBreadcrumbs = wrapper.querySelector('#js-injected-page-breadcrumbs');
    const needsMove = linksBar.parentNode !== wrapper ||
      (injectedBreadcrumbs && linksBar.nextSibling !== injectedBreadcrumbs);
    if (needsMove) {
      insertMrLinksBar(wrapper, linksBar);
    }
  }

  const SETTINGS_SUBHEADING_STYLES = {
    fontSize: '0.8rem',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    opacity: '0.75',
    fontWeight: '600'
  };

  function createSettingsGroupHeader(title, subtitle) {
    const header = document.createElement('div');
    applyStyles(header, {
      borderTop: '1px solid #2f374c',
      padding: '0.6rem 0 0.2rem 0',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.1rem'
    });
    const titleElem = document.createElement('div');
    titleElem.textContent = title;
    applyStyles(titleElem, {fontSize: '0.95rem', fontWeight: '700'});
    const subtitleElem = document.createElement('div');
    subtitleElem.textContent = subtitle;
    applyStyles(subtitleElem, {fontSize: '0.75rem', opacity: '0.65'});
    header.appendChild(titleElem);
    header.appendChild(subtitleElem);
    return header;
  }

  function createCollapsible(title, open) {
    const details = document.createElement('details');
    details.open = Boolean(open);
    applyStyles(details, {padding: '0.4rem 0'});
    const summary = document.createElement('summary');
    summary.textContent = title;
    applyStyles(summary, Object.assign({cursor: 'pointer'}, SETTINGS_SUBHEADING_STYLES));
    const body = document.createElement('div');
    applyStyles(body, {paddingTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.4rem'});
    details.appendChild(summary);
    details.appendChild(body);
    return {element: details, body: body};
  }

  function setSettingDisabled(elem, disabled) {
    applyStyles(elem, {opacity: disabled ? '0.45' : '1', pointerEvents: disabled ? 'none' : ''});
    const input = elem.querySelector('input');
    if (input) input.disabled = disabled;
  }

  const FEATURE_MENU = [
    {title: 'Karten', items: [
      ['progress', 'Progress-Bar (Portal)'],
      ['portalButtons', 'Portal- & Timesheet-Buttons'],
      ['mrBadge', 'MR-Badge'],
      ['mrAvatars', 'Assignee-/Reviewer-Avatare'],
      ['columnAge', 'Verweildauer (Uhr im Footer)']
    ]},
    {title: 'Spalten', items: [
      ['columnAvg', 'Ø Verweildauer im Header']
    ]},
    {title: 'Andere Ansichten', items: [
      ['mrLinks'],
      ['issueDetail', 'Progress im Issue-Detail'],
      ['mrPageProgress', 'Progress im MR'],
      ['mrAssigneeButtons', 'Ticket-Assignee-Buttons im MR']
    ]}
  ];

  function createGlobalSettingsSection(mrLinksToggle, debugToggle, onFeatureChanged) {
    const section = document.createElement('div');
    section.appendChild(createSettingsGroupHeader('Globale Einstellungen', 'Gelten für alle Boards'));
    const subRows = [];

    function updateSubRows() {
      subRows.forEach(function (row) {
        setSettingDisabled(row.elem, !isFeatureOn(FEATURE_PARENTS[row.key]));
      });
    }

    FEATURE_MENU.forEach(function (group) {
      const groupElem = document.createElement('div');
      applyStyles(groupElem, {display: 'flex', flexDirection: 'column', gap: '0.35rem', padding: '0.4rem 0'});
      const heading = document.createElement('div');
      heading.textContent = group.title;
      applyStyles(heading, SETTINGS_SUBHEADING_STYLES);
      groupElem.appendChild(heading);
      group.items.forEach(function (item) {
        const key = item[0];
        const row = key === 'mrLinks'
          ? mrLinksToggle
          : makeSwitch(item[1], features[key] !== false, function (val) {
            saveFeature(key, val);
            updateSubRows();
            onFeatureChanged();
          });
        applyStyles(row, {justifyContent: 'space-between'});
        if (FEATURE_PARENTS[key]) {
          row.style.paddingLeft = '1rem';
          subRows.push({key: key, elem: row});
        }
        groupElem.appendChild(row);
      });
      section.appendChild(groupElem);
    });

    const advanced = createCollapsible('Erweitert', false);
    applyStyles(debugToggle, {justifyContent: 'space-between'});
    advanced.body.appendChild(debugToggle);
    section.appendChild(advanced.element);

    mrLinksToggle.querySelector('span').textContent = 'MR-Buttons in der Topbar';
    updateSubRows();
    return section;
  }

  function createAgeHighlightSection(projectSettings) {
    const panelBackground = getGitLabWindowBackgroundColor(true);
    const panelTextColor = getToolbarForegroundColor();
    const section = document.createElement('div');
    applyStyles(section, {
      padding: '0.4rem 0',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.4rem',
      color: panelTextColor
    });
    const heading = document.createElement('div');
    heading.textContent = 'Roter Rahmen bei Ø-Überschreitung';
    applyStyles(heading, {
      fontSize: '0.8rem',
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      opacity: '0.75',
      fontWeight: '600',
      color: panelTextColor
    });
    const hint = document.createElement('div');
    hint.textContent = 'Spalten, in denen Tickets über dem Spalten-Ø rot umrandet werden.';
    applyStyles(hint, {fontSize: '0.75rem', opacity: '0.7', lineHeight: '1.3'});

    // <details> als Combobox: Summary zeigt Auswahl, aufgeklappt Checkbox-Liste
    const combo = document.createElement('details');
    // contain: Auswahltext darf das Menü nicht verbreitern, Summary kürzt mit Ellipsis
    applyStyles(combo, {position: 'relative', width: '100%', contain: 'inline-size'});
    const summary = document.createElement('summary');
    applyStyles(summary, {
      padding: '0.35rem 0.5rem',
      borderRadius: '6px',
      border: '1px solid #374151',
      background: panelBackground,
      color: panelTextColor,
      fontSize: '0.85rem',
      cursor: 'pointer',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    });
    const options = document.createElement('div');
    applyStyles(options, {
      marginTop: '0.25rem',
      padding: '0.25rem 0',
      borderRadius: '6px',
      border: '1px solid #374151',
      background: panelBackground,
      maxHeight: '220px',
      overflowY: 'auto'
    });
    combo.appendChild(summary);
    combo.appendChild(options);
    section.appendChild(heading);
    section.appendChild(hint);
    section.appendChild(combo);

    function updateSummary(labels) {
      const selected = labels.filter(function (l) { return ageHighlightLookup[l.key]; });
      summary.textContent = selected.length
        ? selected.map(function (l) { return l.text; }).join(', ')
        : 'Keine Spalte ausgewählt';
      summary.title = summary.textContent;
    }

    // Spalten erst beim Öffnen lesen – Board ist beim Toolbar-Aufbau evtl. noch nicht gerendert
    function refresh() {
      loadAgeHighlightLookup(projectSettings.projectKey);
      // Rahmen braucht die Verweildauer-Daten
      setSettingDisabled(combo, !isFeatureOn('columnAge'));
      hint.textContent = isFeatureOn('columnAge')
        ? 'Spalten, in denen Tickets über dem Spalten-Ø rot umrandet werden.'
        : 'Benötigt die globale Einstellung „Verweildauer".';
      options.innerHTML = '';
      const labels = [];
      document.querySelectorAll('div[data-testid="board-list"]').forEach(function (boardListElem) {
        const header = getBoardListHeaderElement(boardListElem);
        if (!header || !header.querySelector('.board-title-text .gl-label')) return; // Open/Closed ohne Label
        const text = getColumnLabelText(boardListElem, header);
        const key = normalizeLabelNameForMatching(text);
        if (key && !labels.some(function (l) { return l.key === key; })) labels.push({key: key, text: text});
      });

      labels.forEach(function (l) {
        const row = document.createElement('label');
        applyStyles(row, {
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.2rem 0.5rem',
          fontSize: '0.85rem',
          cursor: 'pointer'
        });
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = Boolean(ageHighlightLookup[l.key]);
        checkbox.addEventListener('change', function () {
          if (checkbox.checked) {
            ageHighlightLookup[l.key] = true;
          } else {
            delete ageHighlightLookup[l.key];
          }
          saveAgeHighlightLookup();
          updateSummary(labels);
          document.querySelectorAll('div[data-testid="board-list"]').forEach(updateColumnAgeAverage);
        });
        row.appendChild(checkbox);
        row.appendChild(document.createTextNode(l.text));
        options.appendChild(row);
      });

      if (!labels.length) {
        options.textContent = 'Keine Label-Spalten gefunden.';
        applyStyles(options, {padding: '0.35rem 0.5rem', fontSize: '0.85rem'});
      }
      updateSummary(labels);
    }

    return {element: section, refresh: refresh};
  }

  function createProjectConfigSection(hostConfig, projectSettings, onValuesChanged) {
    const section = document.createElement('div');
    const panelBackground = getGitLabWindowBackgroundColor(true);
    const panelTextColor = getToolbarForegroundColor();
    toolbarInitialProjectIdValue = String(projectSettings.projectId || '').trim();
    toolbarInitialPortalUrlValue = String(projectSettings.portalBaseUrl || '').trim();
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
      if (typeof onValuesChanged === 'function') {
        onValuesChanged();
      }
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
      if (typeof onValuesChanged === 'function') {
        onValuesChanged();
      }
    });

    portalRow.appendChild(portalInput);
    section.appendChild(portalHeading);
    section.appendChild(portalCurrent);
    section.appendChild(portalRow);
    section.appendChild(portalStatus);

    toolbarInitialProjectId2Value = String(projectSettings.projectId2 || '').trim();
    toolbarInitialUseSecondProjectIdValue = projectSettings.useSecondPortalProjectId || false;

    const secondIdHeading = document.createElement('div');
    secondIdHeading.textContent = 'Zweite Portal-Projekt-ID';
    applyStyles(secondIdHeading, {
      fontSize: '0.8rem',
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      opacity: '0.75',
      fontWeight: '600',
      color: panelTextColor,
      marginTop: '0.4rem'
    });

    const toggleContainer = document.createElement('div');
    applyStyles(toggleContainer, {
      display: 'flex',
      gap: '0.5rem',
      alignItems: 'center',
      marginBottom: '0.4rem'
    });

    const toggleSwitch = makeSwitch(
      'Zweite ID aktivieren',
      projectSettings.useSecondPortalProjectId || false,
      function (value) {
        if (typeof onValuesChanged === 'function') {
          onValuesChanged();
        }
      }
    );
    useSecondProjectIdToggleCheckbox = toggleSwitch.querySelector('input[type="checkbox"]');

    toggleContainer.appendChild(toggleSwitch);

    const currentId2 = document.createElement('div');
    const updateCurrentLabel2 = function (value) {
      const display = value ? value : 'nicht gesetzt';
      currentId2.textContent = 'Aktuell: ' + display;
    };
    updateCurrentLabel2(projectSettings.projectId2);

    applyStyles(currentId2, {
      fontSize: '0.8rem',
      color: panelTextColor
    });

    const formRow2 = document.createElement('div');
    applyStyles(formRow2, {
      display: 'flex',
      gap: '0.35rem',
      alignItems: 'center'
    });

    const input2 = document.createElement('input');
    input2.type = 'text';
    input2.placeholder = 'Zweite Projekt ID eingeben';
    input2.value = projectSettings.projectId2 || '';
    input2.disabled = !projectSettings.useSecondPortalProjectId;
    applyStyles(input2, {
      flex: '1 1 auto',
      padding: '0.35rem 0.5rem',
      borderRadius: '6px',
      border: '1px solid #374151',
      background: panelBackground,
      color: panelTextColor,
      fontSize: '0.85rem',
      opacity: input2.disabled ? '0.4' : '1',
      cursor: input2.disabled ? 'not-allowed' : 'text'
    });
    projectId2InputElement = input2;

    useSecondProjectIdToggleCheckbox.addEventListener('change', function () {
      const isEnabled = this.checked;
      input2.disabled = !isEnabled;
      applyStyles(input2, {
        opacity: isEnabled ? '1' : '0.4',
        cursor: isEnabled ? 'text' : 'not-allowed'
      });
      if (typeof onValuesChanged === 'function') {
        onValuesChanged();
      }
    });

    const status2 = document.createElement('div');
    applyStyles(status2, {
      fontSize: '0.75rem',
      color: '#a5b4fc',
      minHeight: '1em'
    });

    projectId2StatusElement = status2;

    input2.addEventListener('input', function () {
      status2.textContent = '';
      if (typeof onValuesChanged === 'function') {
        onValuesChanged();
      }
    });

    formRow2.appendChild(input2);
    section.appendChild(secondIdHeading);
    section.appendChild(toggleContainer);
    section.appendChild(currentId2);
    section.appendChild(formRow2);
    section.appendChild(status2);
    return section;
  }

  /******************************************************************
   * Init
   ******************************************************************/

  function init() {
    log('Userscript gestartet, URL:', window.location.href);

    const isMR = isMergeRequestPage();

    if (isMR) {
      log('Merge-Request-Seite erkannt; starte MR-Progress-Injection.');
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

    showEnabled = typeof features.show === 'boolean' ? features.show : projectSettings.showEnabled;
    debugEnabled = typeof features.debug === 'boolean' ? features.debug : projectSettings.debugEnabled;
    mrLinksEnabled = typeof features.mrLinks === 'boolean' ? features.mrLinks : projectSettings.mrLinksEnabled;

    log('hostConfig:', hostConfig);
    log('projectSettings:', projectSettings);

    if (isProgressCacheStale()) {
      log('Progress-Cache ist älter als ' + PROGRESS_CACHE_TTL_MS + 'ms – Cache wird geleert und Daten werden neu geladen.');
      clearProgressCache();
    }

    createToolbar(hostConfig, projectSettings);
    createMrLinksBar();

    log('[init] toolbarPositionObserver wird auf document.body gestartet');
    const toolbarPositionObserver = new MutationObserver(function (mutations) {
      for (let i = 0; i < mutations.length; i++) {
        if (mutations[i].addedNodes && mutations[i].addedNodes.length) {
          log('[toolbarPositionObserver] DOM-Änderung erkannt → repositionToolbarIfNeeded()');
          repositionToolbarIfNeeded();
          repositionMrLinksIfNeeded();
          return;
        }
      }
    });
    toolbarPositionObserver.observe(document.body, {childList: true, subtree: true});
    log('[init] toolbarPositionObserver aktiv');

    scheduleReleaseCheck();
    applyShowFlagToAllBadges();
    applyShowFlagToDetailBadges();

    if (isMR) {
      let mrInitialScanDone = false;

      function tryMRInitialScan() {
        if (mrInitialScanDone) return;
        mrInitialScanDone = true;
        log('Initialer scanMergeRequestPage()-Aufruf');
        scanMergeRequestPage(hostConfig, projectSettings);
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryMRInitialScan);
      } else {
        tryMRInitialScan();
      }

      const mrObserver = new MutationObserver(function (mutations) {
        let relevantChange = false;
        for (let i = 0; i < mutations.length; i++) {
          if (mutations[i].addedNodes && mutations[i].addedNodes.length) {
            relevantChange = true;
            break;
          }
        }
        if (relevantChange) {
          log('MutationObserver (MR) → scanMergeRequestPage()');
          scanMergeRequestPage(hostConfig, projectSettings);
        }
      });

      mrObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    } else {
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
  }

  init();
})
();
