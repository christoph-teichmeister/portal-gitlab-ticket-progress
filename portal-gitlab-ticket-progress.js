// ==UserScript==
// @name         Portal GitLab Ticket Progress
// @namespace    https://beyonder.de/
// @version      2026.10.19
// @description  Zeigt gebuchte Stunden aus dem Portal (konfigurierbare Base-URL) in GitLab-Issue-Boards an (nur bestimmte Spalten, z. B. WIP) als Progressbar, inkl. Debug-/Anzeigen-Toggles, Cache-Tools und Konfigurations-Toast.
// @author       christoph-teichmeister
// @match        https://gitlab.beyonder.de/*/-/*
// @icon         https://raw.githubusercontent.com/christoph-teichmeister/portal-gitlab-ticket-progress/refs/heads/main/icon.svg
// @grant        GM_xmlhttpRequest
// @grant        GM_info
// @connect      raw.githubusercontent.com
// @updateURL    https://raw.githubusercontent.com/christoph-teichmeister/portal-gitlab-ticket-progress/refs/heads/main/portal-gitlab-ticket-progress.js
// @downloadURL  https://raw.githubusercontent.com/christoph-teichmeister/portal-gitlab-ticket-progress/refs/heads/main/portal-gitlab-ticket-progress.js
// ==/UserScript==

(function () {
  'use strict';

  /******************************************************************
   * Globale Settings / State
   ******************************************************************/

    // Host- / Projekt-Konfiguration
  const SCRIPT_VERSION = '2026.10.19';
  const TOOLBAR_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" role="img" aria-label="GitLab ticket icon"><g fill="none" stroke="currentColor" stroke-width="1.0" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h10v2a1 1 0 0 1 0 4v2h-10v-2a1 1 0 0 1 0 -4z"/><path d="M6 7h4"/><path d="M6 9h3"/></g></svg>';
  const TIMESHEET_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" class="gl-button-icon gl-icon s16" width="16" height="16" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true"><path d="M165.66,90.34a8,8,0,0,1,0,11.32l-64,64a8,8,0,0,1-11.32-11.32l64-64A8,8,0,0,1,165.66,90.34ZM215.6,40.4a56,56,0,0,0-79.2,0L106.34,70.45a8,8,0,0,0,11.32,11.32l30.06-30a40,40,0,0,1,56.57,56.56l-30.07,30.06a8,8,0,0,0,11.31,11.32L215.6,119.6a56,56,0,0,0,0-79.2ZM138.34,174.22l-30.06,30.06a40,40,0,1,1-56.56-56.57l30.05-30.05a8,8,0,0,0-11.32-11.32L40.4,136.4a56,56,0,0,0,79.2,79.2l30.06-30.07a8,8,0,0,0-11.32-11.31Z"></path></svg>';
  // Sprite-URL enthält einen Hash, der sich pro GitLab-Release ändert → zur Laufzeit von der Seite lesen
  const FALLBACK_ICON_SPRITE = '/assets/icons-5a3f88503a318f1eaf3b49d9d82c93cdde31fd5224ab8aeeb08534974b21f10c.svg';
  let gitlabIconSprite = null;

  function getGitLabIconSprite() {
    if (gitlabIconSprite) return gitlabIconSprite;
    const use = document.querySelector('svg use[href*="icons-"][href*=".svg#"]');
    const href = use && use.getAttribute('href');
    const match = href && href.match(/^([^#]+)#/);
    if (match) {
      gitlabIconSprite = match[1];
      return gitlabIconSprite;
    }
    return FALLBACK_ICON_SPRITE; // nicht cachen, falls die Seite noch nicht gerendert ist
  }

  function gitlabIconSvg(name, classes, testId) {
    return '<svg ' + (testId ? 'data-testid="' + testId + '" ' : '') + 'role="img" aria-hidden="true" class="' +
      classes + '"><use href="' + getGitLabIconSprite() + '#' + name + '"></use></svg>';
  }

  function mergeRequestIconSvg() {
    return gitlabIconSvg('merge-request', 'gl-button-icon gl-icon s16 gl-fill-current', 'merge-request-icon');
  }

  function clockIconSvg() {
    return gitlabIconSvg('clock', 'gl-button-icon gl-icon s16 gl-fill-current', 'clock-icon');
  }

  // Eigene Inline-Icons, damit nichts vom Hash/Inhalt des GitLab-Sprites abhängt
  const KEBAB_ICON_SVG = '<svg class="gl-button-icon gl-icon s16" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg>';
  const CHEVRON_DOWN_ICON_SVG = '<svg class="gl-button-icon gl-icon s16" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>';

  const EXTERNAL_LINK_ICON_SVG = '<svg class="gl-button-icon gl-icon s16" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 2.5h4v4"/><path d="M13.5 2.5L7 9"/><path d="M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3"/></svg>';

  const HOST_CONFIG = {};
  const NOT_FOUND_SENTINEL = { notFound: true };
  const NOT_FOUND_TTL_MS = 10 * 60 * 1000; // „keine Buchungen" nur kurz cachen, damit neue Buchungen bald auftauchen

  /******************************************************************
   * Inhalt (alles in einer Datei, Reihenfolge von oben nach unten)
   *  1. Globale Settings / State, Toast, Retry-Logik
   *  2. Utils: Storage, Versionen, Release-Check, Logging, Styles
   *  3. Theme-Erkennung, Parsing (Portal-HTML), Request-Helfer
   *  4. Rendering: Progress, MR-Badge, Verweildauer
   *  5. Requests & Board-/Detail-/MR-Scan
   *  6. Toolbar / Einstellungen, Init
   ******************************************************************/

  // Zentrale Selektoren: Komma-Listen sind Fallbacks, damit GitLab-UI-Änderungen an einer Stelle auffallen
  const SEL = {
    boardsApp: '.boards-app',
    boardList: 'div[data-testid="board-list"]',
    boardCard: 'li[data-testid="board-card"].board-card',
    boardListHeader: 'header[data-testid="board-list-header"]',
    boardListButtons: '.board-list-button-group',
    listTitleLabelText: '.board-title-text .gl-label-text',
    listTitle: '.board-title-text',
    listTitleLabel: '.board-title-text .gl-label',
    issueCountBadge: '[data-testid="issue-count-badge"]',
    cardNumber: '.board-card-number',
    cardNumberText: '.board-card-number span, .board-card-number',
    cardFooter: '.board-card-footer',
    cardBody: '.gl-p-4',
    cardLabel: '.gl-label',
    detailWrapper: '.work-item-attributes-wrapper',
    detailAssignees: '[data-testid="work-item-assignees"]',
    mrTitle: 'h1[data-testid="title-content"]',
    mrAssigneeBlock: '[data-testid="assignee-block-container"]',
    breadcrumbsWrapper: '#js-vue-page-breadcrumbs-wrapper',
    breadcrumbsInjected: '#js-injected-page-breadcrumbs'
  };
  const TOOLBAR_TARGET_SELECTORS = [SEL.breadcrumbsInjected, '.panel-header-inner-actions', '.top-bar-container', '.top-bar-fixed'];
  const warnedSelectors = {};

  function qs(root, key) {
    const el = (root || document).querySelector(SEL[key]);
    if (!el && debugEnabled && !warnedSelectors[key]) {
      warnedSelectors[key] = true;
      console.warn(LOG_PREFIX, 'Selektor ohne Treffer (GitLab-UI geändert?):', key, SEL[key]);
    }
    return el;
  }

  function qsa(root, key) {
    return (root || document).querySelectorAll(SEL[key]);
  }

  // Einmalig injiziertes Stylesheet für Dinge, die Inline-Styles nicht können (:focus-visible, Media Queries)
  function ensureStylesheet() {
    if (document.getElementById('ambient-progress-styles')) return;
    const style = document.createElement('style');
    style.id = 'ambient-progress-styles';
    style.textContent =
      '.ambient-btn{min-width:24px;min-height:24px;box-sizing:border-box}' +
      '#ambient-progress-toolbar button:focus-visible,#ambient-progress-toolbar summary:focus-visible,' +
      '#ambient-progress-toolbar input:focus-visible,#ambient-progress-toolbar textarea:focus-visible,' +
      '#ambient-progress-settings button:focus-visible,#ambient-progress-settings summary:focus-visible,' +
      '#ambient-progress-settings input:focus-visible,#ambient-progress-settings textarea:focus-visible,' +
      '.ambient-btn:focus-visible,.ambient-mr-badge:focus-visible,.ambient-progress-bar:focus-visible,' +
      '.ambient-progress-list-toggle:focus-visible{outline:2px solid #60a5fa;outline-offset:2px}' +
      '.ambient-switch-input:focus-visible+.ambient-switch-slider{outline:2px solid #60a5fa;outline-offset:2px}' +
      '.gl-label[data-ambient-split="1"]{display:none !important}' +
      '.ambient-dropdown-item:hover,.ambient-dropdown-item:focus-visible{background:var(--gl-background-color-strong,rgba(128,128,128,.18)) !important;outline:none}' +
      '.ambient-dropdown-toggle:hover{background:var(--gl-background-color-strong,rgba(128,128,128,.18)) !important}' +
      '.ambient-card-actions svg,.ambient-progress-sort-toggle svg{pointer-events:none}' +
      '.ambient-btn:not(.btn):not(.ambient-btn-primary):hover:not(:disabled){background:#374151 !important;border-color:#9ca3af !important;color:#fff !important}' +
      '.ambient-btn.btn:not(.btn-confirm):hover{background:var(--gl-background-color-strong,rgba(128,128,128,.18)) !important}' +
      '.ambient-split-label{min-width:0;max-width:100%;flex:0 1 auto}' +
      '.ambient-split-label>span:first-child{flex:0 0 auto}' +
      '.ambient-split-label>span:last-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      // GitLabs h2 hat hier Standard-Abstände (20px oben / 10px unten) und sitzt dadurch ~5px unter den Icons
      '[data-testid="board-list-header"] .board-title-text{min-width:0;margin-top:0 !important;margin-bottom:0 !important}' +
      // Hover für das MR-Badge: Fläche per box-shadow vergrößert, damit sich das Layout nicht verschiebt
      '.ambient-mr-badge:hover{background:var(--gl-background-color-strong,rgba(128,128,128,.22));box-shadow:0 0 0 3px var(--gl-background-color-strong,rgba(128,128,128,.22));border-radius:4px;text-decoration:underline !important}' +
      // Einstellungs-Panel: eigene Chevrons statt Browser-Dreieck, Zeilen-Hover, Karten-Optik
      '#ambient-progress-settings summary{list-style:none}' +
      '#ambient-progress-settings [role=alert]:empty{display:none}' +
      '#ambient-progress-settings summary::-webkit-details-marker{display:none}' +
      '#ambient-progress-settings .ambient-chevron-left::before{content:"▸";display:inline-block;width:1.1em;opacity:.7}' +
      '#ambient-progress-settings details[open]>.ambient-chevron-left::before{content:"▾"}' +
      '#ambient-progress-settings .ambient-chevron-right::after{content:"▸";opacity:.7;margin-left:auto;padding-left:.75rem}' +
      '#ambient-progress-settings details[open]>.ambient-chevron-right::after{content:"▾"}' +
      '#ambient-progress-settings .ambient-switch-row:hover{background:var(--gl-background-color-strong,rgba(128,128,128,.14))}' +
      '#ambient-progress-settings .ambient-card>summary:hover{background:var(--gl-background-color-strong,rgba(128,128,128,.1))}' +
      '.ambient-sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}' +
      '.ambient-skeleton{border-radius:999px;animation:ambient-pulse 1.2s ease-in-out infinite}' +
      '@keyframes ambient-pulse{50%{opacity:.35}}' +
      // Geladene Werte blenden ein, statt hart aufzutauchen
      '@keyframes ambient-fade-in{from{opacity:0}}' +
      '.ambient-fade-in{animation:ambient-fade-in .35s ease-out}' +
      '@media (prefers-reduced-motion: reduce){#ambient-progress-toolbar *,#ambient-progress-settings,#ambient-progress-settings *,#ambient-progress-toast{transition:none !important}.ambient-skeleton,.ambient-fade-in{animation:none}}';
    (document.head || document.documentElement).appendChild(style);
  }

  // Lokalisierung: Sprache der GitLab-Seite (Fallback de-DE)
  function uiLocale() {
    return (document.documentElement && document.documentElement.lang) || 'de-DE';
  }

  // Parallele Requests begrenzen (Portal und GitLab-API getrennt)
  function createLimiter(max) {
    let active = 0;
    const queue = [];

    function next() {
      while (active < max && queue.length) {
        const job = queue.shift();
        active += 1;
        Promise.resolve().then(job.fn).then(job.resolve, job.reject).then(function () {
          active -= 1;
          next();
        });
      }
    }

    return function (fn) {
      return new Promise(function (resolve, reject) {
        queue.push({fn: fn, resolve: resolve, reject: reject});
        next();
      });
    };
  }

  const MAX_PORTAL_CONCURRENCY = 5;
  const MAX_GITLAB_CONCURRENCY = 6;
  const portalLimiter = createLimiter(MAX_PORTAL_CONCURRENCY);
  const gitlabLimiter = createLimiter(MAX_GITLAB_CONCURRENCY);
  const inflightPortalRequests = {}; // url → Promise

  function isNumericId(value) {
    return /^\d+$/.test(String(value));
  }

  // Einziger Einstieg für GitLab-API-Calls: nur same-origin Pfade, CSRF-Token nur bei schreibenden Requests
  function glFetch(path, options) {
    if (typeof path !== 'string' || path.charAt(0) !== '/' || path.indexOf('//') === 0) {
      return Promise.reject(new Error('Ungültiger GitLab-Pfad'));
    }
    const opts = Object.assign({credentials: 'same-origin'}, options || {});
    const method = String(opts.method || 'GET').toUpperCase();
    if (method !== 'GET') {
      const token = getCsrfToken();
      if (!token) {
        return Promise.reject(new Error('CSRF-Token fehlt'));
      }
      opts.headers = Object.assign({'Content-Type': 'application/json', 'X-CSRF-Token': token}, opts.headers || {});
    }
    return fetch(path, opts);
  }

  // Externe Links nur über https (Portal) oder same-origin (GitLab) öffnen
  function openExternal(url) {
    try {
      const parsed = new URL(url, window.location.href);
      if (parsed.protocol !== 'https:' && parsed.origin !== window.location.origin) return;
      window.open(parsed.href, '_blank', 'noopener,noreferrer');
    } catch (e) {
      // ungültige URL ignorieren
    }
  }

  // JSON-Storage: ein Ort für try/catch, Fehler (z. B. Quota) werden geloggt statt verschluckt
  function storageRead(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null || raw === undefined) return fallback;
      const parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (e) {
      return fallback;
    }
  }

  function storageWrite(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      error('localStorage-Schreibfehler für', key, e);
      return false;
    }
  }

  function storageRemove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (e) {
      // ignore
    }
  }

  function relativeLuminance(rgb) {
    return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  }

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
  let useSecondProjectIdToggleCheckbox = null;
  let lastRefreshLabelElement = null;
  let manualRefreshButtonElement = null;
  let ticketActionsInputElement = null;
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
    const parsed = storageRead(LS_KEY_FEATURES, {});
    return typeof parsed === 'object' ? parsed : {};
  }

  function saveFeature(key, value) {
    features[key] = value;
    storageWrite(LS_KEY_FEATURES, features);
  }

  // Default an; Unter-Features nur aktiv, wenn das Eltern-Feature aktiv ist
  function isFeatureOn(key) {
    if (!showEnabled) return false; // „Anzeigen" ist Hauptschalter für alles
    const parent = FEATURE_PARENTS[key];
    return features[key] !== false && (!parent || isFeatureOn(parent));
  }

  // Experimente (noch nicht übernommene Ideen, standardmäßig aus) unter Zahnrad → Globale Einstellungen → Erweitert →
  // Experimente. Im selben Objekt liegen auch dauerhafte Einstellungen (Sprache, weitere Portal-Projekt-IDs).
  const LS_KEY_EXPERIMENTS = 'ambientProgressExperiments';
  const LS_KEY_ENTERED_AT = 'ambientProgressEnteredAt';
  const LS_KEY_SELFTEST_VERSION = 'ambientProgressSelftestVersion';
  const EXPERIMENT_MENU = [
    {title: 'Merge Requests', items: [
      ['expMrPipeline', 'Pipeline-Status am MR-Badge']
    ]},
    {title: 'Betrieb', items: [
      ['expConfigLink', 'Konfiguration als Link teilen / aus Link übernehmen']
    ]}
  ];
  let experiments = readExperiments();

  function readExperiments() {
    const parsed = storageRead(LS_KEY_EXPERIMENTS, {});
    const result = parsed && typeof parsed === 'object' ? parsed : {};
    if (result.expEnglish !== undefined && result.english === undefined) result.english = result.expEnglish === true; // Migration
    return result;
  }

  function saveExperiment(key, value) {
    experiments[key] = value;
    storageWrite(LS_KEY_EXPERIMENTS, experiments);
  }

  function isExp(key) {
    return experiments[key] === true;
  }

  function expSetting(key, fallback) {
    return experiments[key] !== undefined && experiments[key] !== '' ? experiments[key] : fallback;
  }

  // Teil-Übersetzung (expEnglish): nur Texte, die hier stehen; alles andere bleibt Deutsch
  const EN_TEXTS = {
    'Karten': 'Cards',
    'Spalten': 'Columns',
    'Andere Ansichten': 'Other views',
    'Progress-Bar (Portal)': 'Progress bar (portal)',
    'Portal- & Timesheet-Buttons': 'Portal & timesheet buttons',
    'MR-Badge': 'MR badge',
    'Assignee-/Reviewer-Avatare': 'Assignee/reviewer avatars',
    'Verweildauer (Uhr im Footer)': 'Time in column (clock in footer)',
    'workflow::-Labels als Split-Label': 'workflow:: labels as split label',
    'Median-Verweildauer im Header': 'Median time in column in header',
    'Progress im Issue-Detail': 'Progress in issue detail',
    'Progress im MR': 'Progress in MR',
    'Ticket-Assignee-Buttons im MR': 'Ticket assignee buttons in MR',
    'MR-Buttons in der Topbar': 'MR buttons in top bar',
    'Globale Einstellungen': 'Global settings',
    'Gelten für alle Boards': 'Apply to all boards',
    'Erweitert': 'Advanced',
    'Nicht gefunden': 'Not found',
    'Portal: nicht gefunden': 'Portal: not found',
    'Im Portal öffnen': 'Open in portal',
    'Timesheet erstellen': 'Create timesheet',
    'Jetzt aktualisieren': 'Refresh now',
    'Cache geleert, aktualisiere…': 'Cache cleared, refreshing…',
    'In dieser Spalte seit ': 'In this column since ',
    ' (länger als der Spalten-Median)': ' (longer than the column median)',
    'Mich als Reviewer zuweisen': 'Assign me as reviewer',
    'Gemerged': 'Merged',
    'Ticket-Aktionen': 'Ticket actions',
    'Progress-Einstellungen': 'Progress settings',
    'Schließen': 'Close',
    'Unassigned nach oben': 'Unassigned first',
    'Nach Assignee gruppieren': 'Group by assignee',
    'Spalte sortieren': 'Sort column'
  };

  function t(de) {
    return experiments.english === true && EN_TEXTS[de] ? EN_TEXTS[de] : de;
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
  const MR_LIST_CACHE_TTL_MS = 5 * 60 * 1000; // in-memory, kein localStorage nötig
  const COLUMN_AGE_CACHE_TTL_MS = 5 * 60 * 1000;
  const SCAN_DEBOUNCE_MS = 150;
  const NEGATIVE_CACHE_MS = 30 * 1000; // nach Fehlern nicht sofort neu anfragen
  const MAX_FETCH_RETRIES = 3;
  const PORTAL_REQUEST_TIMEOUT_MS = 15 * 1000;
  const MAX_PORTAL_RESPONSE_CHARS = 2 * 1000 * 1000;
  const MAX_HOURS_VALUE = 100000;
  const REFRESH_MARK_THROTTLE_MS = 5 * 1000;
  const PROJECT_BLOCK_COOLDOWN_MS = 5 * 60 * 1000;
  const MAX_NEW_FETCHES_PER_SCAN = 80;
  const RATE_LIMIT_TOAST_COOLDOWN_MS = 2 * 60 * 1000;
  const RATE_LIMIT_WARNING_MIN_VISIBLE_MS = 60 * 1000;
  const progressCache = {}; // key: projectId + ':' + issueIid → {data, timestamp, ttl?}
  let progressCacheFlushTimer = null;
  hydrateProgressCacheFromStorage();

  function ensureToastElement() {
    if (toastElement) return toastElement;
    const el = document.createElement('div');
    el.id = 'ambient-progress-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'true');
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
    const isAlert = variant === 'warning';
    el.setAttribute('role', isAlert ? 'alert' : 'status');
    el.setAttribute('aria-live', isAlert ? 'assertive' : 'polite');
    el.textContent = text;
    void el.offsetWidth;
    el.style.transform = 'translateX(0)';
    el.style.opacity = '1';
    if (toastHideTimer) {
      clearTimeout(toastHideTimer);
    }
    toastHideTimer = setTimeout(function () {
      hideToast();
    }, Math.max(duration, text.length * 60));
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
      text: 'Portal-Base URL fehlt oder ist ungültig (nur https) -> Projekt-Konfiguration öffnen und' +
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
      text: Number(status) === 401
        ? 'Portal: nicht angemeldet – bitte im Portal einloggen und danach neu laden.'
        : 'Portal-Requests blockiert (Status ' + status + ') – bitte Portal-Base URL prüfen.',
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
    const parsed = storageRead(LS_KEY_LIST_SELECTIONS, {});
    return typeof parsed === 'object' ? parsed : {};
  }

  function writeListSelectionsState(state) {
    storageWrite(LS_KEY_LIST_SELECTIONS, state);
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
    const state = storageRead(LS_KEY_AGE_HIGHLIGHT_LISTS, {});
    ageHighlightLookup = (state && state[projectKey]) || {};
  }

  function saveAgeHighlightLookup() {
    if (!ageHighlightProjectKey) return;
    const state = storageRead(LS_KEY_AGE_HIGHLIGHT_LISTS, {});
    state[ageHighlightProjectKey] = ageHighlightLookup;
    storageWrite(LS_KEY_AGE_HIGHLIGHT_LISTS, state);
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
    const parsed = storageRead(LS_KEY_RELEASE_INFO, null);
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
      checkedAt: timestamp,
      notes: typeof parsed.notes === 'string' ? parsed.notes : undefined
    };
  }

  function writeReleaseInfoToStorage(info) {
    if (!info || !info.version) {
      storageRemove(LS_KEY_RELEASE_INFO);
      return;
    }
    storageWrite(LS_KEY_RELEASE_INFO, info);
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

  let gearButtonElement = null;

  // Die roten Punkte am Zahnrad sind aria-hidden → Zustand zusätzlich im Label ansagen
  function updateGearLabel() {
    if (!gearButtonElement) return;
    const parts = ['Progress-Einstellungen'];
    if (releaseNotificationElements.badge && releaseNotificationElements.badge.style.display !== 'none') {
      parts.push('Update verfügbar');
    }
    if (rateLimitNotificationElements.badge && rateLimitNotificationElements.badge.style.display !== 'none') {
      parts.push('Rate-Limit-Warnung');
    }
    gearButtonElement.setAttribute('aria-label', parts[0] + (parts.length > 1 ? ' (' + parts.slice(1).join(', ') + ')' : ''));
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
      if (info.notes) {
        elements.messageText.style.whiteSpace = 'pre-line';
        elements.messageText.textContent += '\n' + info.notes;
      }
      elements.divider.style.display = 'block';
    } else {
      elements.badge.style.display = 'none';
      elements.messageRow.style.display = 'none';
      elements.divider.style.display = 'none';
    }
    updateGearLabel();
  }

  function readRateLimitWarningFromStorage() {
    const parsed = storageRead(LS_KEY_RATE_LIMIT_WARNING, null);
    if (!parsed || typeof parsed !== 'object' || !parsed.active) {
      return null;
    }
    return {
      active: true,
      triggeredAt: Number(parsed.triggeredAt) || null,
      listCount: Number(parsed.listCount) || null
    };
  }

  function writeRateLimitWarningToStorage(state) {
    if (!state || !state.active) {
      storageRemove(LS_KEY_RATE_LIMIT_WARNING);
      return;
    }
    storageWrite(LS_KEY_RATE_LIMIT_WARNING, state);
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
    updateGearLabel();
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
          const versionMatch = response.responseText.match(/\/\/\s*@version\s+(\S+)/);
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
          if (isRemoteVersionGreater(latestReleaseInfo.version, SCRIPT_VERSION)) {
            fetchChangelogNotes(latestReleaseInfo);
          }
        },
        onerror: function () {
          warn('Release-Check konnte nicht ausgeführt werden (Netzwerkfehler).');
        }
      });
    } catch (e) {
      warn('Release-Check konnte nicht gestartet werden', e);
    }
  }

  // Experiment expChangelog: oberster Abschnitt aus CHANGELOG.md (gleiche Raw-Domain wie das Script)
  function fetchChangelogNotes(info) {
    GM_xmlhttpRequest({
      method: 'GET',
      url: RAW_SCRIPT_URL.replace(/[^/]+$/, 'CHANGELOG.md'),
      timeout: 30 * 1000,
      onload: function (response) {
        if (response.status !== 200) return;
        const section = String(response.responseText || '').split(/^## /m)[1];
        if (!section) return;
        info.notes = section.split('\n').slice(1).join('\n').trim().slice(0, 600);
        writeReleaseInfoToStorage(info);
        updateReleaseNotificationUI(info);
      },
      onerror: function () {
        warn('Changelog konnte nicht geladen werden.');
      }
    });
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

  function getLastRefreshStorageKey() {
    return LS_KEY_LAST_REFRESH + ':' + getCurrentBoardIdentifier();
  }

  function readLastRefreshTimestamp() {
    try {
      const val = window.localStorage.getItem(getLastRefreshStorageKey());
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
        window.localStorage.removeItem(getLastRefreshStorageKey());
      } else {
        window.localStorage.setItem(getLastRefreshStorageKey(), String(value));
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

  let lastRefreshMarkAt = 0;

  // Höchstens alle paar Sekunden schreiben – bei vielen Karten kommen sonst dutzende Writes pro Scan
  function markPortalRefreshTimestamp() {
    const now = Date.now();
    if (now - lastRefreshMarkAt < REFRESH_MARK_THROTTLE_MS) return;
    lastRefreshMarkAt = now;
    writeLastRefreshTimestamp(now);
  }

  function readProjectConfigsState() {
    const parsed = storageRead(LS_KEY_PROJECT_CONFIG, {});
    return typeof parsed === 'object' ? parsed : {};
  }

  function writeProjectConfigsState(state) {
    storageWrite(LS_KEY_PROJECT_CONFIG, state);
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
    const parsed = storageRead(LS_KEY_PROGRESS_CACHE, null);
    return parsed && typeof parsed === 'object' ? parsed : null;
  }

  function isCacheEntryFresh(entry) {
    const timestamp = Number(entry && entry.timestamp);
    if (!timestamp) return false;
    return Date.now() - timestamp <= (Number(entry.ttl) || PROGRESS_CACHE_TTL_MS);
  }

  // Stale-while-revalidate: abgelaufene Einträge bis zu 24 h behalten, um sie sofort anzuzeigen
  const STALE_MAX_MS = 24 * 60 * 60 * 1000;

  function isCacheEntryAlive(entry) {
    if (isCacheEntryFresh(entry)) return true;
    const timestamp = Number(entry && entry.timestamp);
    return Boolean(timestamp) && Date.now() - timestamp <= STALE_MAX_MS;
  }

  // merge: Einträge anderer Tabs übernehmen (neuere gewinnen), statt sie zu überschreiben
  function writeProgressCacheState(state, merge) {
    const snapshot = {};
    const stored = merge ? readProgressCacheState() : null;
    if (stored) {
      Object.keys(stored).forEach(function (key) {
        if (isCacheEntryAlive(stored[key]) && stored[key].data) {
          snapshot[key] = stored[key];
        }
      });
    }
    for (const key in state) {
      if (!Object.prototype.hasOwnProperty.call(state, key)) continue;
      const entry = state[key];
      if (!entry || typeof entry !== 'object') continue;
      const timestamp = Number(entry.timestamp);
      if (!timestamp || !entry.data) continue;
      if (snapshot[key] && Number(snapshot[key].timestamp) > timestamp) continue;
      snapshot[key] = {
        timestamp,
        ttl: entry.ttl || undefined,
        data: entry.data
      };
    }
    storageWrite(LS_KEY_PROGRESS_CACHE, snapshot);
  }

  // Persistierung bündeln: ein Write pro ~0,5 s statt einem pro Karte
  function scheduleProgressCachePersist() {
    if (progressCacheFlushTimer) return;
    progressCacheFlushTimer = setTimeout(flushProgressCache, 500);
  }

  function flushProgressCache() {
    if (progressCacheFlushTimer) {
      clearTimeout(progressCacheFlushTimer);
      progressCacheFlushTimer = null;
    }
    writeProgressCacheState(progressCache, true);
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
    let dropped = false;
    for (const key in stored) {
      if (!Object.prototype.hasOwnProperty.call(stored, key)) continue;
      const entry = stored[key];
      if (!entry || typeof entry !== 'object') continue;
      if (!isCacheEntryAlive(entry)) {
        dropped = true;
        continue;
      }
      progressCache[key] = {
        data: entry.data,
        timestamp: Number(entry.timestamp),
        ttl: entry.ttl
      };
    }
    if (dropped) {
      scheduleProgressCachePersist();
    }
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

  const BAR_COLORS = {
    spent: '#6FBF73',
    spentHover: '#57A55D',
    neutral: '#D9D4C7',
    bookedFallback: '#2563eb',
    over: '#dc3545'
  };
  // Zweites Portal-Projekt: gleiche Palette, nur das „gebucht"-Segment in Orange
  const WARN_PCT = 80; // Balken wird gelb, sobald so viel Prozent der Stunden verbraucht sind
  const WARN_COLORS = {spent: '#eab308', spentHover: '#ca8a04'};
  const EXTRA_BAR_COLORS = [
    {spent: '#a855f7', spentHover: '#9333ea'},
    {spent: '#14b8a6', spentHover: '#0d9488'},
    {spent: '#ec4899', spentHover: '#db2777'}
  ];
  const BAR_COLORS_SECOND = Object.assign({}, BAR_COLORS, {spent: '#f97316', spentHover: '#ea580c'});

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
    colors: BAR_COLORS
  };

  // Text-Alternative für Screenreader und Tooltip (Farben allein tragen keine Information)
  function describeBar(barOuter, label) {
    barOuter.classList.add('ambient-progress-bar');
    barOuter.setAttribute('role', 'img');
    barOuter.setAttribute('aria-label', 'Portal-Stunden: ' + label);
    barOuter.title = label;
  }

  function createProgressBarElements(progressData, customStyles) {
    if (!progressData) return null;
    const styles = customStyles || {};
    const colors = mergeStyles(PROGRESS_BAR_DEFAULTS.colors, styles.colors);

    const barOuter = document.createElement('div');
    applyStyles(barOuter, mergeStyles(PROGRESS_BAR_DEFAULTS.bar, styles.bar));

    const textLayer = document.createElement('div');
    applyStyles(textLayer, mergeStyles(PROGRESS_BAR_DEFAULTS.textLayer, styles.textLayer));

    let ariaLabel = '';
    const animate = Boolean(styles.animate);

    // „Füllt sich auf": Breite von from → to; zwei Frames Verzögerung, damit der Startwert gerendert ist
    const animateWidth = function (el, from, to) {
      if (!animate) return;
      el.style.width = from;
      el.style.transition = 'width 0.7s cubic-bezier(0.22, 1, 0.36, 1)';
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          el.style.width = to;
        });
      });
    };
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
      animateWidth(neutralBar, '0%', '100%');
      barOuter.appendChild(neutralBar);
      appendCenterText(t('Nicht gefunden'));
      barOuter.appendChild(textLayer);
      describeBar(barOuter, t('Portal: nicht gefunden'));
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
      animateWidth(bookedBar, '0%', '100%');
      barOuter.appendChild(bookedBar);
      appendCenterText(bookedText);
      ariaLabel = bookedText;
    } else if (progressData.over) {
      const overBar = document.createElement('div');
      applyStyles(overBar, {
        height: '100%',
        width: '100%',
        background: colors.over
      });
      animateWidth(overBar, '0%', '100%');
      barOuter.appendChild(overBar);
      let centerText = '\u26A0\uFE0F Over: ' + progressData.over; // Symbol, damit „über Budget" nicht nur über die Farbe erkennbar ist
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
      ariaLabel = centerText;
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

      // Experiment: Warnschwelle – Farbe allein trägt keine Information, deshalb steht der Prozentwert im Label
      const usedPct = total && total > 0 && spentNum !== null ? Math.round((spentNum / total) * 100) : null;
      const warnActive = Boolean(styles.warnPct) && usedPct !== null && usedPct >= styles.warnPct;
      const spentColor = warnActive ? WARN_COLORS.spent : colors.spent;
      const spentHoverColor = warnActive ? WARN_COLORS.spentHover : colors.spentHover;

      let spentBar = null;
      if (showSpentBar) {
        spentBar = document.createElement('div');
        applyStyles(spentBar, {
          height: '100%',
          width: spentWidth + '%',
          background: spentColor,
          float: 'left'
        });
        animateWidth(spentBar, '0%', spentWidth + '%');
        spentBar.addEventListener('mouseenter', function () {
          spentBar.style.background = spentHoverColor;
        });
        spentBar.addEventListener('mouseleave', function () {
          spentBar.style.background = spentColor;
        });
      }

      const remainingBar = document.createElement('div');
      applyStyles(remainingBar, {
        height: '100%',
        width: remainingWidth + '%',
        background: remainingWidth ? colors.neutral : 'transparent',
        float: 'left'
      });

      if (spentBar) {
        animateWidth(remainingBar, '100%', remainingWidth + '%'); // schrumpft, während die Bar sich füllt
      }
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
      ariaLabel = 'Gebucht ' + (progressData.spent || '—') + ', verbleibend ' + (progressData.remaining || '—');
      if (warnActive) ariaLabel += ' – ' + usedPct + ' % verbraucht (Schwelle ' + styles.warnPct + ' %)';
    }

    barOuter.appendChild(textLayer);
    if (animate) {
      textLayer.style.opacity = '0';
      textLayer.style.transition = 'opacity 0.4s ease 0.3s';
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          textLayer.style.opacity = '1';
        });
      });
    }
    describeBar(barOuter, ariaLabel);
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

  // GitLab-eigene Button-Klassen (wie Zahnrad/Plus im Spalten-Header). position + z-index bleiben nötig, weil GitLab
  // einen unsichtbaren Link über die ganze Karte legt (a.board-card-button).
  function createProgressIconButton(html, title, ariaLabel, url, overrides) {
    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = html;
    button.title = title;
    button.setAttribute('aria-label', ariaLabel);
    button.className = 'ambient-btn btn gl-button btn-default btn-icon btn-sm js-no-trigger';
    applyStyles(button, mergeStyles({
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '24px',
      minWidth: '24px',
      height: '24px',
      padding: '0',
      flex: '0 0 auto',
      position: 'relative',
      zIndex: '25'
    }, overrides));
    button.addEventListener(
      'click',
      function (ev) {
        ev.stopPropagation();
        ev.preventDefault();
        openExternal(url);
      },
      true
    );
    return button;
  }

  function createPortalLinkButton(url, overrides) {
    if (!url || !isFeatureOn('portalButtons')) return null;
    return createProgressIconButton(EXTERNAL_LINK_ICON_SVG, t('Im Portal öffnen'), 'Ticket im Portal öffnen', url, overrides);
  }

  function createTimesheetButton(url, overrides) {
    if (!url || !isFeatureOn('portalButtons')) return null;
    return createProgressIconButton(TIMESHEET_ICON_SVG, t('Timesheet erstellen'), 'Timesheet im Portal erstellen', url, overrides);
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
    if (!isCacheEntryFresh(entry)) {
      if (!isCacheEntryAlive(entry)) {
        delete progressCache[cacheKey]; // beim nächsten Persistieren verschwindet der Eintrag auch aus dem Storage
      }
      return null;
    }
    return entry.data;
  }

  // Abgelaufener, aber noch behaltener Wert (nur mit expStaleWhileRevalidate); „keine Buchungen" zählt nicht
  function getStaleProgressEntry(cacheKey) {
    const entry = progressCache[cacheKey];
    if (!entry || !entry.data || entry.data.notFound || isCacheEntryFresh(entry) || !isCacheEntryAlive(entry)) return null;
    return entry.data;
  }

  function getProgressCacheTimestamp(cacheKey) {
    const entry = progressCache[cacheKey];
    return entry ? Number(entry.timestamp) || 0 : 0;
  }

  function findProgressCacheEntryForIssue(projectSettings, issueIid) {
    if (!projectSettings || !issueIid) return null;
    const projectIdentifier = projectSettings.projectKey || projectSettings.projectPath;
    if (!projectIdentifier) return null;

    const primaryKey = buildProgressCacheKey(projectSettings, issueIid);
    if (primaryKey) {
      const primaryCached = getProgressCacheEntry(primaryKey);
      if (primaryCached && !primaryCached.notFound) {
        return primaryCached;
      }
    }

    const suffix = '|' + projectIdentifier + ':' + String(issueIid);
    for (const key in progressCache) {
      if (!Object.prototype.hasOwnProperty.call(progressCache, key)) continue;
      if (!key.endsWith(suffix)) continue;
      const candidate = getProgressCacheEntry(key);
      if (candidate && !candidate.notFound) {
        log('Detail-Cache-Fallback nutzt Board-Cache', key, 'für Issue', issueIid);
        return candidate;
      }
    }

    return null;
  }

  function setProgressCacheEntry(cacheKey, data, ttl) {
    progressCache[cacheKey] = {
      data,
      timestamp: Date.now(),
      ttl: ttl || undefined
    };
    scheduleProgressCachePersist();
  }

  // Leert nur die Einträge des aktuellen Boards – andere Boards behalten ihren Cache
  function clearProgressCache() {
    const boardPrefix = 'board:' + getCurrentBoardIdentifier() + '|';
    Object.keys(progressCache).forEach(function (key) {
      if (key.startsWith(boardPrefix)) {
        delete progressCache[key];
      }
    });
    writeProgressCacheState(progressCache, false);
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
      mrLinksEnabled: mrLinksEnabled,
      ticketActions: (storedProjectConfig && storedProjectConfig.ticketActions) || ''
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
          const luminance = relativeLuminance(rgb);
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
        const luminance = relativeLuminance(rgb);
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

    const luminance = relativeLuminance(rgb);
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
    return boardListElem.querySelector(SEL.boardListHeader);
  }

  function getListNameFromBoardListElem(boardListElem, headerOverride) {
    const header = headerOverride || getBoardListHeaderElement(boardListElem);
    if (!header) return null;
    try {
      const labelSpan = header.querySelector(SEL.listTitleLabelText);
      if (labelSpan && labelSpan.textContent) {
        return labelSpan.textContent.replace(/\s+/g, ' ').trim();
      }

      const h2 = header.querySelector(SEL.listTitle);
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
    const labelElem = header && header.querySelector(SEL.listTitleLabel);
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
      const numberSpan = cardElem.querySelector(SEL.cardNumber + ' span');
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

  // Nur https, keine Zugangsdaten in der URL; Query/Fragment werden verworfen. Ungültig → null.
  function normalizePortalBaseUrl(value) {
    if (!value) {
      return null;
    }
    let raw = String(value).trim();
    if (!raw) {
      return null;
    }
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
      raw = 'https://' + raw;
    }
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname) {
        return null;
      }
      return parsed.origin + parsed.pathname.replace(/\/+$/, '');
    } catch (e) {
      return null;
    }
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

  // Zahl aus "16.25h" / "72,25h" / "1.234,5h" / "1,234.5h" extrahieren; unplausible Werte → null
  function extractHourNumber(text) {
    if (!text) return null;
    const m = String(text).match(/-?\d[\d.,]*/);
    if (!m) return null;
    let token = m[0];
    const lastComma = token.lastIndexOf(',');
    const lastDot = token.lastIndexOf('.');
    if (lastComma !== -1 && lastDot !== -1) {
      // beides vorhanden: das hintere Zeichen ist das Dezimaltrennzeichen
      token = lastComma > lastDot
        ? token.replace(/\./g, '').replace(',', '.')
        : token.replace(/,/g, '');
    } else if (lastComma !== -1) {
      token = token.replace(',', '.');
    }
    token = token.replace(/\.(?=.*\.)/g, ''); // mehrere Punkte: nur der letzte bleibt
    const v = parseFloat(token);
    if (!Number.isFinite(v) || Math.abs(v) > MAX_HOURS_VALUE) return null;
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
    // Zahlen mit „h" sind Stunden; reine Zahlen (z. B. „3 Einträge") nur, wenn es keine Stundenangabe gibt
    const hourMatches = text.match(/\b\d+(?:[.,]\d+)?(?=\s*h\b)/gi);
    const matches = hourMatches && hourMatches.length ? hourMatches : text.match(/\b\d+(?:[.,]\d+)?(?![\d.,])/g);
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
      if (el.children.length) continue; // nur Blattelemente, sonst frisst der Treffer den Text des ganzen Containers
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

  function getOrCreateBadgeContainer(cardElem) {
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

      const wrappingDiv = cardElem.querySelector(SEL.cardBody);
      const footer = cardElem.querySelector(SEL.cardFooter);

      if (footer && wrappingDiv) {
        wrappingDiv.insertBefore(container, footer);
      } else if (wrappingDiv) {
        wrappingDiv.appendChild(container);
      } else {
        cardElem.appendChild(container);
      }
    }
    return container;
  }

  // Einblend-Animation (Animation neu starten, falls das Element sie schon trägt)
  function fadeIn(el) {
    el.classList.remove('ambient-fade-in');
    void el.offsetWidth;
    el.classList.add('ambient-fade-in');
  }

  // Platzhalter, solange das Portal antwortet – verhindert die leere Lücke und das Springen beim Einfügen der Bar
  function showProgressLoading(cardElem) {
    if (!isFeatureOn('progress') || !isCardInActiveColumn(cardElem)) return;
    const container = getOrCreateBadgeContainer(cardElem);
    if (container.firstChild && !container.hasAttribute('data-ambient-loading')) return; // echte Daten nicht überschreiben
    container.setAttribute('data-ambient-loading', '1');
    container.setAttribute('aria-busy', 'true');
    container.style.display = showEnabled ? '' : 'none';
    container.innerHTML = '';
    // Gleiche Zeilenstruktur wie die echte Bar (Buttons links/rechts, min. 24px hoch), damit nichts springt
    const row = document.createElement('div');
    row.className = 'ambient-skeleton-row';
    row.setAttribute('role', 'img');
    row.setAttribute('aria-label', 'Portal-Stunden werden geladen');
    applyStyles(row, {display: 'flex', alignItems: 'center', gap: '6px', minHeight: '24px'});
    const placeholderStyle = {
      background: getThemeAwareBarStyles().barBackground,
      border: '1px solid var(--gl-border-color-strong, rgba(128, 128, 128, 0.55))',
      boxSizing: 'border-box'
    };
    function makePlaceholder(styles) {
      const el = document.createElement('div');
      el.className = 'ambient-skeleton';
      applyStyles(el, mergeStyles(placeholderStyle, styles));
      return el;
    }
    const withButtons = isFeatureOn('portalButtons');
    // Gleiche Höhe wie die echte Bar (18px, siehe injectProgressIntoCard)
    if (withButtons) row.appendChild(makePlaceholder({width: '24px', height: '24px', flex: '0 0 auto', borderRadius: '4px'}));
    row.appendChild(makePlaceholder({height: '18px', flex: '1 1 auto'}));
    if (withButtons) row.appendChild(makePlaceholder({width: '24px', height: '24px', flex: '0 0 auto', borderRadius: '4px'}));
    container.appendChild(row);
  }

  // Platzhalter entfernen, wenn keine Daten kommen (Fehler, keine Buchungen)
  function clearProgressLoading(cardElem) {
    const container = cardElem.querySelector('.ambient-progress-badge[data-ambient-loading]');
    if (container) container.remove();
  }

  function injectProgressIntoCard(cardElem, progressData, progressData2) {
    if (!cardElem || (!progressData && !progressData2)) return;
    if (!isCardInActiveColumn(cardElem)) return;

    const container = getOrCreateBadgeContainer(cardElem);
    // Nur animieren, wenn gerade der Platzhalter ersetzt wird (nicht bei Cache-Treffern/Re-Renders)
    const animateFill = container.hasAttribute('data-ambient-loading') &&
      !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    container.removeAttribute('data-ambient-loading');
    container.removeAttribute('aria-busy');
    container.removeAttribute('data-ambient-stale');
    if (animateFill) fadeIn(container);
    container.style.opacity = '';
    container.title = '';
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
    theme.styles.animate = animateFill;
    theme.styles.warnPct = WARN_PCT;
    const loadedAt = Number(cardElem.getAttribute('data-ambient-loaded-at'));

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
      if (loadedAt) {
        barOuter.title += ' · ' + formatLoadedAgo(loadedAt);
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

      const theme2Styles = Object.assign({}, theme.styles, {colors: BAR_COLORS_SECOND});

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

    appendExtraProjectRows(cardElem, container, theme);
  }

  /******************************************************************
   * Experimente: Karten-Helfer (Summen, Filter, Sortierung, Refresh, Extra-Projekte)
   ******************************************************************/

  let currentScanContext = null; // {hostConfig, projectSettings}, gesetzt in init
  let rescanHook = null; // gesetzt in init: stößt einen entprellten Scan an
  const portalErrorLog = []; // letzte Portal-Fehler (nur im Speicher)
  const PORTAL_ERROR_LOG_MAX = 30;

  function logPortalError(issueIid, reason) {
    portalErrorLog.push({at: Date.now(), issueIid: issueIid, reason: reason});
    if (portalErrorLog.length > PORTAL_ERROR_LOG_MAX) portalErrorLog.shift();
  }

  function describePortalError(reason) {
    if (!reason) return 'unbekannt';
    if (reason.login) return 'Login-Seite (nicht angemeldet?)';
    if (reason.status) return 'HTTP ' + reason.status;
    if (reason.timeout) return 'Timeout';
    if (reason.network) return 'Netzwerkfehler';
    if (reason.tooLarge) return 'Antwort zu groß';
    if (reason.aborted) return 'abgebrochen';
    return String(reason.message || reason);
  }

  function formatLoadedAgo(timestamp) {
    const ms = Date.now() - timestamp;
    return ms < 60000 ? 'gerade geladen' : 'geladen vor ' + formatDuration(ms);
  }

  // Alles zurücksetzen und neu aufbauen, wenn eine Einstellung umgeschaltet wird (ohne Seiten-Reload)
  function applyExperimentChange() {
    document.querySelectorAll(SEL.boardCard).forEach(function (card) {
      clearCardInjections(card);
      card.removeAttribute('data-ambient-skip');
    });
    document.querySelectorAll('.ambient-column-avg').forEach(function (el) { el.remove(); });
    if (rescanHook) rescanHook();
  }

  // Weitere Portal-Projekt-IDs als zusätzliche Balken unter den ersten beiden
  function getExtraProjectIds() {
    return String(expSetting('extraProjectIds', '')).split(/[\s,;]+/).filter(isNumericId).slice(0, 3);
  }

  function appendExtraProjectRows(cardElem, container, theme) {
    const ctx = currentScanContext;
    const ids = getExtraProjectIds();
    const issueIid = getIssueIidFromCard(cardElem);
    if (!ctx || !ids.length || !issueIid) return;
    const ps = ctx.projectSettings;
    ids.forEach(function (pid, idx) {
      const key = buildProgressCacheKey(ps, issueIid, 'pidx:' + pid);
      const render = function (data) {
        if (!container.isConnected || !data || data.notFound) return;
        const old = container.querySelector('.ambient-extra-row[data-pid="' + pid + '"]');
        if (old) old.remove();
        const row = document.createElement('div');
        row.className = 'ambient-extra-row';
        row.setAttribute('data-pid', pid);
        applyStyles(row, {display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px'});
        const styles = Object.assign({}, theme.styles, {
          colors: Object.assign({}, BAR_COLORS, EXTRA_BAR_COLORS[idx % EXTRA_BAR_COLORS.length]),
          animate: false
        });
        const tsButton = createTimesheetButton(buildTimesheetUrl(ps, issueIid, pid));
        if (tsButton) row.appendChild(tsButton);
        const bar = createProgressBarElements(data, styles);
        if (bar) {
          bar.title = 'Portal-Projekt ' + pid + ': ' + bar.title;
          row.appendChild(bar);
        }
        const portalButton = createPortalLinkButton(buildPortalUrl(ps, issueIid, pid));
        if (portalButton) row.appendChild(portalButton);
        container.appendChild(row);
      };
      const cached = key ? getProgressCacheEntry(key) : null;
      if (cached) {
        render(cached);
        return;
      }
      const url = buildPortalUrl(ps, issueIid, pid);
      if (!url || !key || isProjectRequestBlocked(ps.projectKey)) return;
      loadProgressData(url, issueIid)
        .then(function (data) {
          setProgressCacheEntry(key, data || NOT_FOUND_SENTINEL, data ? undefined : NOT_FOUND_TTL_MS);
          render(data);
        })
        .catch(function (err) {
          logPortalError(issueIid, err);
          error('Extra-Projekt', pid, 'Request-Fehler für Issue', issueIid, err);
        });
    });
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

  const mrListCache = {}; // key: projectPath → {mrs: [{iid, title, web_url}], timestamp}

  let currentUserPromise = null;

  function getCurrentUser() {
    if (!currentUserPromise) {
      currentUserPromise = glFetch('/api/v4/user')
        .then(function (res) {
          if (!res.ok) throw new Error('Aktueller User Status ' + res.status);
          return res.json();
        })
        .catch(function (err) {
          currentUserPromise = null; // nächster Versuch darf erneut laden
          throw err;
        });
    }
    return currentUserPromise;
  }

  function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.content : null;
  }

  function assignCurrentUserAsReviewer(projectPath, mrIid) {
    if (!isNumericId(mrIid)) return Promise.reject(new Error('Ungültige MR-IID'));
    return getCurrentUser().then(function (user) {
      const url = '/api/v4/projects/' + encodeURIComponent(projectPath) +
        '/merge_requests/' + mrIid;
      return glFetch(url, {
        method: 'PUT',
        body: JSON.stringify({reviewer_ids: [user.id]})
      }).then(function (res) {
        if (!res.ok) throw new Error('Reviewer zuweisen Status ' + res.status);
        return user;
      });
    });
  }

  const MR_LIST_FAILURE_BACKOFF_MS = NEGATIVE_CACHE_MS;
  const mrListFailedAt = {}; // projectPath → Zeitpunkt des letzten Fehlers

  // Cache hält die Promise: viele Karten gleichzeitig lösen genau einen Request aus
  function loadMergeRequestsForProject(projectPath) {
    const cached = mrListCache[projectPath];
    if (cached && Date.now() - cached.timestamp <= MR_LIST_CACHE_TTL_MS) {
      return cached.promise;
    }
    if (mrListFailedAt[projectPath] && Date.now() - mrListFailedAt[projectPath] < MR_LIST_FAILURE_BACKOFF_MS) {
      return Promise.reject(new Error('MR-Liste: letzter Versuch fehlgeschlagen, warte kurz'));
    }
    const url = '/api/v4/projects/' + encodeURIComponent(projectPath) +
      '/merge_requests?per_page=100&order_by=updated_at';
    const promise = gitlabLimiter(function () { return glFetch(url); })
      .then(function (res) {
        if (!res.ok) throw new Error('MR-Liste Status ' + res.status);
        return res.json();
      })
      .then(function (list) {
        // ponytail: per_page=100, keine Paginierung – bei >100 offenen MRs fehlen ältere
        return list.map(function (mr) {
          return {
            iid: mr.iid,
            title: mr.title,
            web_url: mr.web_url,
            state: mr.state,
            assignee: (mr.assignees && mr.assignees[0]) || mr.assignee || null,
            reviewers: mr.reviewers || [],
            pipelineStatus: (mr.head_pipeline && mr.head_pipeline.status) || null
          };
        });
      })
      .catch(function (err) {
        delete mrListCache[projectPath];
        mrListFailedAt[projectPath] = Date.now();
        throw err;
      });
    mrListCache[projectPath] = {promise: promise, timestamp: Date.now()};
    return promise;
  }

  /******************************************************************
   * Verweildauer in Spalte
   ******************************************************************/

  const columnEnteredAtCache = {}; // key: projectPath#iid#list → {promise: Promise<Date|null>, timestamp}

  function normalizeLabelNameForMatching(name) {
    return normalizeListNameForMatching(String(name || '').replace(/::/g, ' ').replace(/\s+/g, ' '));
  }

  // Label-Events pro Ticket einmal laden und teilen (Verweildauer, Verlauf)
  const labelEventsCache = {}; // key: projectPath#iid → {promise, timestamp}

  function loadLabelEvents(projectPath, issueIid) {
    if (!isNumericId(issueIid)) return Promise.reject(new Error('Ungültige Issue-IID'));
    const key = projectPath + '#' + issueIid;
    const cached = labelEventsCache[key];
    if (cached && Date.now() - cached.timestamp <= COLUMN_AGE_CACHE_TTL_MS) {
      return cached.promise;
    }
    const url = '/api/v4/projects/' + encodeURIComponent(projectPath) +
      '/issues/' + issueIid + '/resource_label_events?per_page=100';
    // ponytail: per_page=100, keine Paginierung – bei >100 Label-Events fehlen neuere
    const promise = gitlabLimiter(function () { return glFetch(url); })
      .then(function (res) {
        if (!res.ok) throw new Error('Label-Events Status ' + res.status);
        return res.json();
      })
      .catch(function (err) {
        delete labelEventsCache[key];
        throw err;
      });
    labelEventsCache[key] = {promise: promise, timestamp: Date.now()};
    return promise;
  }

  // Eintrittszeit pro Ticket+Spalte 30 min in localStorage halten
  const ENTERED_AT_STORE_TTL_MS = 30 * 60 * 1000;
  const ENTERED_AT_STORE_MAX = 600;
  let enteredAtStore = null;
  let enteredAtPersistTimer = null;

  function getEnteredAtStore() {
    if (!enteredAtStore) {
      const parsed = storageRead(LS_KEY_ENTERED_AT, {});
      enteredAtStore = parsed && typeof parsed === 'object' ? parsed : {};
    }
    return enteredAtStore;
  }

  function persistEnteredAtStore() {
    if (enteredAtPersistTimer) return;
    enteredAtPersistTimer = setTimeout(function () {
      enteredAtPersistTimer = null;
      const now = Date.now();
      const store = getEnteredAtStore();
      const keys = Object.keys(store).filter(function (key) {
        return now - Number(store[key].ts) <= ENTERED_AT_STORE_TTL_MS;
      }).sort(function (a, b) { return store[b].ts - store[a].ts; }).slice(0, ENTERED_AT_STORE_MAX);
      const pruned = {};
      keys.forEach(function (key) { pruned[key] = store[key]; });
      enteredAtStore = pruned;
      storageWrite(LS_KEY_ENTERED_AT, pruned);
    }, 1000);
  }

  function clearEnteredAtCaches(projectPath, issueIid) {
    const prefix = projectPath + '#' + issueIid;
    Object.keys(columnEnteredAtCache).forEach(function (key) {
      if (key.indexOf(prefix + '#') === 0) delete columnEnteredAtCache[key];
    });
    delete labelEventsCache[prefix];
    const store = getEnteredAtStore();
    Object.keys(store).forEach(function (key) {
      if (key.indexOf(prefix + '#') === 0) delete store[key];
    });
    persistEnteredAtStore();
  }

  // Kurze Abwesenheit (versehentlich verschoben und gleich zurück) unterbricht den Aufenthalt nicht
  const COLUMN_BLIP_MS = 15 * 60 * 1000;

  // Beginn des aktuellen Aufenthalts in der Spalte `target` (normalisierter Name) aus den Label-Events.
  // Liegt das Label gerade nicht am Ticket (letztes Event = remove, z. B. Events noch nicht aktuell), → null.
  function computeEnteredAt(events, target) {
    const relevant = events.filter(function (ev) {
      return ev.label && ev.created_at && normalizeLabelNameForMatching(ev.label.name) === target;
    }).sort(function (a, b) { return new Date(a.created_at) - new Date(b.created_at); });
    let start = null; // Beginn des (zusammengeführten) Aufenthalts
    let lastRemove = null;
    let open = false;
    relevant.forEach(function (ev) {
      const at = new Date(ev.created_at).getTime();
      if (ev.action === 'add') {
        if (open) return;
        if (start === null || lastRemove === null || at - lastRemove > COLUMN_BLIP_MS) start = at;
        open = true;
      } else if (ev.action === 'remove' && open) {
        lastRemove = at;
        open = false;
      }
    });
    return open && start !== null ? new Date(start) : null;
  }

  function loadColumnEnteredAt(projectPath, issueIid, listName) {
    if (!isNumericId(issueIid)) return Promise.reject(new Error('Ungültige Issue-IID'));
    const key = projectPath + '#' + issueIid + '#' + listName;
    const cached = columnEnteredAtCache[key];
    if (cached && Date.now() - cached.timestamp <= COLUMN_AGE_CACHE_TTL_MS) {
      return cached.promise;
    }
    {
      const stored = getEnteredAtStore()[key];
      if (stored && Date.now() - Number(stored.ts) <= ENTERED_AT_STORE_TTL_MS) {
        const storedPromise = Promise.resolve(stored.t ? new Date(stored.t) : null);
        columnEnteredAtCache[key] = {promise: storedPromise, timestamp: Number(stored.ts)};
        return storedPromise;
      }
    }
    const target = normalizeLabelNameForMatching(listName);
    const promise = loadLabelEvents(projectPath, issueIid)
      .then(function (events) {
        const latest = computeEnteredAt(events, target);
        {
          getEnteredAtStore()[key] = {t: latest ? latest.getTime() : null, ts: Date.now()};
          persistEnteredAtStore();
        }
        return latest;
      })
      .catch(function (err) {
        delete columnEnteredAtCache[key];
        throw err;
      });
    columnEnteredAtCache[key] = {promise: promise, timestamp: Date.now()};
    return promise;
  }

  // Verlauf: Zeit pro Spalten-Label aus den Label-Events (nur Labels, die Board-Spalten sind)
  const lastListByIid = {}; // iid → zuletzt gesehene Spalte (überlebt neu aufgebaute Karten-Elemente)
  const boardColumnLabelSet = {}; // normalisierte Spalten-Label-Namen des aktuellen Boards

  function computeColumnHistory(events) {
    const sorted = events.filter(function (ev) { return ev.label && ev.created_at; })
      .sort(function (a, b) { return new Date(a.created_at) - new Date(b.created_at); });
    const openSince = {};
    const totals = {};
    const order = [];
    sorted.forEach(function (ev) {
      const name = ev.label.name;
      if (!boardColumnLabelSet[normalizeLabelNameForMatching(name)]) return;
      const at = new Date(ev.created_at).getTime();
      if (ev.action === 'add') {
        if (openSince[name] === undefined) openSince[name] = at;
        if (order.indexOf(name) < 0) order.push(name);
      } else if (ev.action === 'remove' && openSince[name] !== undefined) {
        totals[name] = (totals[name] || 0) + at - openSince[name];
        delete openSince[name];
      }
    });
    const now = Date.now();
    Object.keys(openSince).forEach(function (name) {
      totals[name] = (totals[name] || 0) + now - openSince[name];
    });
    return order.map(function (name) {
      return name.replace(/^.*::/, '') + ' ' + formatDuration(totals[name] || 0);
    });
  }

  function formatDuration(ms) {
    const minutes = Math.max(0, Math.floor(ms / 60000));
    if (minutes < 60) return minutes + 'min';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + 'h';
    return Math.floor(hours / 24) + 'd';
  }

  // Schrift der Issue-ID (#1234) übernehmen, damit MR-ID und Verweildauer identisch aussehen
  let issueNumberFontStylesCache = null; // gilt für einen Scan-Durchlauf, vermeidet getComputedStyle pro Karte

  function getIssueNumberFontStyles(footer) {
    if (issueNumberFontStylesCache) return Object.assign({}, issueNumberFontStylesCache);
    const numberText = footer && footer.querySelector(SEL.cardNumberText);
    if (!numberText) return {fontSize: '12px', lineHeight: '1'};
    const c = getComputedStyle(numberText);
    issueNumberFontStylesCache = {fontFamily: c.fontFamily, fontSize: c.fontSize, fontWeight: c.fontWeight, lineHeight: '1'};
    return Object.assign({}, issueNumberFontStylesCache);
  }

  // Für asynchron zurückkommende Requests: Spalte inzwischen ausgeschaltet → nichts mehr einfügen
  function isCardInActiveColumn(cardElem) {
    if (!showEnabled || !cardElem.isConnected) return false;
    const boardListElem = cardElem.closest(SEL.boardList);
    const header = boardListElem && getBoardListHeaderElement(boardListElem);
    const toggle = header && header.querySelector('.ambient-progress-list-toggle');
    return !toggle || toggle.dataset.ambientActive === 'true';
  }

  // Entfernt alles, was das Script in eine Karte eingefügt hat; nächster Scan baut es bei Bedarf neu auf
  function clearCardInjections(cardElem) {
    cardElem.querySelectorAll('.ambient-progress-badge, .ambient-mr-badge, .ambient-column-age, ' +
      '.ambient-card-actions, .ambient-card-actions-row').forEach(function (el) { el.remove(); });
    ['data-ambient-progress-processed', 'data-ambient-entered-at', 'data-ambient-above-avg', 'data-ambient-loaded-at']
      .forEach(function (attr) { cardElem.removeAttribute(attr); });
    cardElem.style.boxShadow = '';
  }

  // Karten in nicht ausgewählten Spalten einmal aufräumen und markieren, damit Scans sie überspringen
  function markCardSkipped(cardElem) {
    if (cardElem.hasAttribute('data-ambient-skip')) return;
    clearCardInjections(cardElem);
    cardElem.setAttribute('data-ambient-skip', '1');
  }

  const SKELETON_FILL = 'var(--gl-background-color-strong, rgba(128, 128, 128, 0.3))';

  // Platzhalter für die Verweildauer in der Karte, bis die Label-Events da sind
  function showColumnAgeLoading(cardElem) {
    if (!isFeatureOn('columnAge') || !isCardInActiveColumn(cardElem) || cardElem.querySelector('.ambient-column-age')) return;
    const footer = cardElem.querySelector(SEL.cardFooter);
    if (!footer) return;
    const numberElem = footer.querySelector(SEL.cardNumber);
    const el = document.createElement('span');
    el.className = 'ambient-column-age ambient-skeleton';
    el.setAttribute('data-ambient-loading', '1');
    el.setAttribute('aria-hidden', 'true');
    applyStyles(el, {display: showEnabled ? 'inline-block' : 'none', width: '40px', height: '12px', marginLeft: '6px',
      verticalAlign: 'middle', background: SKELETON_FILL});
    (numberElem && numberElem.parentElement ? numberElem.parentElement : footer).appendChild(el);
  }

  function clearColumnAgeLoading(cardElem) {
    const el = cardElem.querySelector('.ambient-column-age[data-ambient-loading]');
    if (el) el.remove();
  }

  function injectColumnAgeIntoCard(cardElem, enteredAt) {
    const boardListElem = cardElem.closest(SEL.boardList);
    clearColumnAgeLoading(cardElem);
    let el = cardElem.querySelector('.ambient-column-age');
    if (!enteredAt) {
      if (el) el.remove();
      cardElem.removeAttribute('data-ambient-entered-at');
      scheduleColumnAgeAverage(boardListElem);
      return;
    }
    if (!el) {
      const footer = cardElem.querySelector(SEL.cardFooter);
      if (!footer) return;
      const numberElem = footer.querySelector(SEL.cardNumber);
      el = document.createElement('span');
      el.className = 'ambient-column-age ambient-fade-in';
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
      icon.innerHTML = clockIconSvg();
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
      loadColumnHistory(cardElem, el);
    }
    el.style.display = showEnabled ? 'inline-flex' : 'none';
    cardElem.setAttribute('data-ambient-entered-at', String(enteredAt.getTime()));
    scheduleColumnAgeAverage(boardListElem);
  }

  // Verlauf sofort laden: die Label-Events liegen durch die Verweildauer meist schon im Cache, und ein
  // natives title-Tooltip aktualisiert sich nicht, während man darüber hovert
  function loadColumnHistory(cardElem, el) {
    const ctx = currentScanContext;
    const issueIid = getIssueIidFromCard(cardElem);
    if (!ctx || !issueIid || el.hasAttribute('data-ambient-history-loaded')) return;
    el.setAttribute('data-ambient-history-loaded', '1');
    loadLabelEvents(ctx.projectSettings.projectPath, issueIid)
      .then(function (events) {
        el.setAttribute('data-ambient-history', computeColumnHistory(events).join(' · '));
        scheduleColumnAgeAverage(cardElem.closest(SEL.boardList));
      })
      .catch(function (err) {
        el.removeAttribute('data-ambient-history-loaded');
        error('Verlauf konnte nicht geladen werden für Issue', issueIid, err);
      });
  }

  function median(values) {
    const sorted = values.slice().sort(function (a, b) { return a - b; });
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  const columnAgeAverageTimers = new WeakMap();

  // Pro Spalte höchstens ein Update pro Frame, statt eines pro eintreffender Karte (sonst O(n²) DOM-Arbeit)
  function scheduleColumnAgeAverage(boardListElem) {
    if (!boardListElem || columnAgeAverageTimers.has(boardListElem)) return;
    columnAgeAverageTimers.set(boardListElem, setTimeout(function () {
      columnAgeAverageTimers.delete(boardListElem);
      updateColumnAgeAverage(boardListElem);
    }, 50));
  }

  // Median über alle aktuell geladenen Karten der Spalte; läuft bei jeder neu geladenen Karte erneut
  function updateColumnAgeAverage(boardListElem) {
    if (!boardListElem) return;
    const now = Date.now();
    const cards = boardListElem.querySelectorAll('[data-ambient-entered-at]');
    const ages = [];
    cards.forEach(function (card) {
      ages.push(now - Number(card.getAttribute('data-ambient-entered-at')));
    });
    const avg = ages.length ? median(ages) : null; // Median: einzelne Ausreißer verfälschen den Wert nicht
    updateColumnAgeHeader(boardListElem, avg, cards.length);
    const highlight = Boolean(ageHighlightLookup[normalizeLabelNameForMatching(getColumnLabelText(boardListElem))]);

    cards.forEach(function (card) {
      const el = card.querySelector('.ambient-column-age');
      if (!el) return;
      const enteredAt = new Date(Number(card.getAttribute('data-ambient-entered-at')));
      const age = now - enteredAt.getTime();
      const aboveAvg = avg !== null && age > avg;
      el.querySelector('.ambient-column-age-text').textContent = formatDuration(age);
      const marked = highlight && aboveAvg;
      el.title = t('In dieser Spalte seit ') + enteredAt.toLocaleString(uiLocale()) +
        (marked ? t(' (länger als der Spalten-Median)') : '');
      const history = el.getAttribute('data-ambient-history');
      if (history) el.title += '\nVerlauf: ' + history;
      el.setAttribute('aria-label', el.title);
      card.toggleAttribute('data-ambient-above-avg', marked);
      setColumnAgeBorder(card, el.style.display !== 'none');
    });
  }

  function setColumnAgeBorder(cardElem, visible) {
    const marked = visible && cardElem.hasAttribute('data-ambient-above-avg');
    // box-shadow statt border: folgt dem Radius, kein Layout-Sprung
    cardElem.style.boxShadow = marked ? '0 0 0 2px #dc2626' : '';
  }

  function createColumnAvgElement(countBadge) {
    const el = document.createElement('span');
    el.className = 'ambient-column-avg gl-flex gl-items-center gl-whitespace-nowrap gl-text-subtle gl-text-sm gl-font-bold gl-mr-3';
    el.style.cursor = 'help';
    el.innerHTML = gitlabIconSvg('clock', 'gl-mr-2 gl-icon s14 gl-fill-current') + '<span></span>';
    countBadge.insertBefore(el, countBadge.firstChild);
    return el;
  }

  // Platzhalter für den Median im Spaltenkopf; verschwindet über updateColumnAgeHeader (Wert oder null)
  function showColumnAvgLoading(boardListElem) {
    if (!isFeatureOn('columnAvg')) return;
    const header = getBoardListHeaderElement(boardListElem);
    const countBadge = header && header.querySelector(SEL.issueCountBadge);
    if (!countBadge || countBadge.querySelector('.ambient-column-avg')) return;
    const el = createColumnAvgElement(countBadge);
    el.setAttribute('data-ambient-loading', '1');
    el.setAttribute('aria-hidden', 'true');
    el.lastChild.className = 'ambient-skeleton';
    applyStyles(el.lastChild, {display: 'inline-block', width: '32px', height: '12px', background: SKELETON_FILL});
  }

  function updateColumnAgeHeader(boardListElem, avg, count) {
    if (!isFeatureOn('columnAvg')) avg = null;
    const header = getBoardListHeaderElement(boardListElem);
    // Neben GitLabs Issue-Zähler, mit denselben Utility-Klassen wie der Zähler selbst
    const countBadge = header && header.querySelector(SEL.issueCountBadge);
    if (!countBadge) return;
    let el = countBadge.querySelector('.ambient-column-avg');
    if (avg === null) {
      if (el) el.remove();
      return;
    }
    if (!el) el = createColumnAvgElement(countBadge);
    if (el.hasAttribute('data-ambient-loading')) { // Platzhalter → echter Wert
      el.removeAttribute('data-ambient-loading');
      el.removeAttribute('aria-hidden');
      el.lastChild.className = '';
      el.lastChild.style.cssText = '';
      fadeIn(el);
    }
    el.lastChild.textContent = formatDuration(avg);
    el.title = 'Median-Verweildauer: So lange liegen die aktuell in dieser Spalte geladenen Tickets im Median schon ' +
      'hier (' + count + ' Tickets, gezählt ab dem letzten Hinzufügen des Spalten-Labels). ' +
      (ageHighlightLookup[normalizeLabelNameForMatching(getColumnLabelText(boardListElem))]
        ? 'Tickets über dem Median haben einen roten Rahmen.'
        : 'Roter Rahmen für Tickets über dem Median lässt sich in den Einstellungen pro Spalte aktivieren.');
  }

  function fetchAndDisplayColumnAge(projectSettings, issueIid, cardElem, listName) {
    const projectPath = projectSettings && projectSettings.projectPath;
    if (!projectPath || !issueIid || !cardElem || !listName) return;
    // Per Drag & Drop verschobene Karte: GitLab schreibt das Label-Event kurz nach dem Drop → kurz warten
    const moved = cardElem.hasAttribute('data-ambient-moved');
    cardElem.removeAttribute('data-ambient-moved');
    showColumnAgeLoading(cardElem);
    showColumnAvgLoading(cardElem.closest(SEL.boardList));
    const run = function () {
      loadColumnEnteredAt(projectPath, issueIid, listName)
        .then(function (enteredAt) {
          if (!isCardInActiveColumn(cardElem)) return;
          injectColumnAgeIntoCard(cardElem, enteredAt || (moved ? new Date() : null));
        })
        .catch(function (err) {
          clearColumnAgeLoading(cardElem);
          scheduleColumnAgeAverage(cardElem.closest(SEL.boardList));
          error('Label-Events konnten nicht geladen werden für', projectPath, issueIid, err);
        });
    };
    if (moved) {
      setTimeout(run, 2000);
    } else {
      run();
    }
  }

  function injectMrBadgeIntoCard(cardElem, matches, projectPath, issueIid) {
    const footer = cardElem.querySelector(SEL.cardFooter);
    if (!footer) return;
    const existing = footer.querySelector('.ambient-mr-badge');
    if (existing) existing.remove();
    if (!matches.length) return;

    const el = document.createElement('a');
    el.className = 'ambient-mr-badge' + (existing ? '' : ' ambient-fade-in');
    const multiple = matches.length > 1;
    el.title = multiple
      ? matches.map(function (m) { return '!' + m.iid + ' ' + m.title; }).join('\n')
      : matches[0].title;
    if (multiple) {
      // Mehrere MRs: Klick öffnet ein Dropdown mit allen MRs (statt einer Suche)
      el.setAttribute('role', 'button');
      el.tabIndex = 0;
      el.style.cursor = 'pointer';
      el.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          el.click();
        }
      });
      attachDropdownMenu(el, function () {
        return matches.map(function (m) {
          return {
            label: m.title,
            sub: '!' + m.iid + (m.state === 'merged' ? ' · merged' : ''),
            onSelect: function () { openExternal(m.web_url); }
          };
        });
      }, 'Merge Requests');
    } else {
      const targetUrl = matches[0].web_url;
      el.href = targetUrl;
      el.target = '_blank';
      el.rel = 'noopener noreferrer';
      el.addEventListener(
        'click',
        function (ev) {
          if (ev.target.closest && ev.target.closest('.ambient-mr-reviewer-placeholder')) {
            return;
          }
          ev.stopPropagation();
          ev.preventDefault();
          openExternal(targetUrl);
        },
        true
      );
    }
    const numberElem = footer.querySelector(SEL.cardNumber);
    const matchedColor = numberElem ? getComputedStyle(numberElem).color : 'inherit';
    const allMerged = matches.every(function (m) { return m.state === 'merged'; });
    const badgeColor = allMerged ? '#8e8e93' : matchedColor;

    applyStyles(el, {
      position: 'relative',
      zIndex: multiple ? '25' : '',
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
    icon.innerHTML = mergeRequestIconSvg();
    applyStyles(icon, {width: '16px', height: '16px', display: 'inline-flex'});
    el.appendChild(icon);

    if (matches.length === 1) {
      const numberText = document.createElement('span');
      numberText.textContent = '!' + matches[0].iid;
      applyStyles(numberText, getIssueNumberFontStyles(footer));
      el.appendChild(numberText);
    }

    if (multiple) {
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
      checkmark.title = t('Gemerged');
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
        placeholder.title = onClick ? t('Mich als Reviewer zuweisen') : 'Kein ' + label + ' zugewiesen';
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
              matches[0].reviewers = [user]; // matches zeigt auf dieselben Objekte wie der gecachte MR-Listen-Eintrag
              injectMrBadgeIntoCard(cardElem, matches, projectPath, issueIid);
            })
            .catch(function (err) {
              error('Konnte Reviewer nicht zuweisen für MR', mrIid, err);
            });
        });
      }

      el.appendChild(avatarRow);
    }

    if (!allMerged && matches.length === 1) {
      appendMrExtras(el, matches[0], projectPath);
    }

    if (numberElem) {
      numberElem.insertAdjacentElement('afterend', el);
    } else {
      footer.insertBefore(el, footer.firstChild);
    }
  }

  // Pipeline-Status am MR-Badge (Experiment)
  const PIPELINE_COLORS = {
    success: '#22c55e', failed: '#ef4444', running: '#3b82f6', pending: '#3b82f6', created: '#3b82f6',
    preparing: '#3b82f6', waiting_for_resource: '#3b82f6', manual: '#f59e0b', canceled: '#8e8e93',
    skipped: '#8e8e93', scheduled: '#8e8e93'
  };
  const mrPipelineRequests = {}; // projectPath#mrIid → Promise<string|null>

  function loadMrPipelineStatus(projectPath, mrIid) {
    const key = projectPath + '#' + mrIid;
    if (!mrPipelineRequests[key]) {
      const url = '/api/v4/projects/' + encodeURIComponent(projectPath) + '/merge_requests/' + mrIid +
        '/pipelines?per_page=1';
      mrPipelineRequests[key] = gitlabLimiter(function () { return glFetch(url); })
        .then(function (res) {
          if (!res.ok) throw new Error('MR-Pipelines Status ' + res.status);
          return res.json();
        })
        .then(function (list) { return (list && list[0] && list[0].status) || null; })
        .catch(function (err) {
          delete mrPipelineRequests[key];
          throw err;
        });
    }
    return mrPipelineRequests[key];
  }

  function createPipelineDot(status) {
    const dot = document.createElement('span');
    dot.className = 'ambient-mr-pipeline';
    dot.title = 'Pipeline: ' + status;
    dot.setAttribute('aria-label', 'Pipeline: ' + status);
    applyStyles(dot, {
      display: 'inline-block',
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: PIPELINE_COLORS[status] || '#8e8e93',
      flex: '0 0 auto'
    });
    return dot;
  }

  // Experiment expMrPipeline: Pipeline-Punkt hinter dem MR-Badge
  function appendMrExtras(badgeElem, mr, projectPath) {
    if (!isExp('expMrPipeline')) return;
    const wrap = document.createElement('span');
    applyStyles(wrap, {display: 'inline-flex', alignItems: 'center', gap: '3px', marginLeft: '3px'});
    if (mr.pipelineStatus) {
      wrap.appendChild(createPipelineDot(mr.pipelineStatus));
    } else if (!mr.pipelineChecked) {
      mr.pipelineChecked = true; // pro MR einmal nachladen (Liste enthält die Pipeline nicht immer)
      loadMrPipelineStatus(projectPath, mr.iid)
        .then(function (status) {
          mr.pipelineStatus = status;
          if (status && badgeElem.isConnected) wrap.insertBefore(createPipelineDot(status), wrap.firstChild);
        })
        .catch(function (err) {
          mr.pipelineChecked = false;
          error('Pipeline-Status konnte nicht geladen werden für MR', mr.iid, err);
        });
    }
    badgeElem.appendChild(wrap);
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

  function looksLikeLoginPage(response) {
    if (/\/(accounts\/)?(login|signin)\b/i.test(String(response.finalUrl || ''))) return true;
    return /<input[^>]+type=["']?password/i.test(String(response.responseText || '').slice(0, 20000));
  }

  // Ablehnungen tragen {status} (HTTP/Login → blockiert das Projekt) oder {network|timeout} (vorübergehend)
  function loadProgressData(url, issueIid) {
    if (inflightPortalRequests[url]) {
      return inflightPortalRequests[url];
    }
    const promise = portalLimiter(function () {
      return new Promise(function (resolve, reject) {
        GM_xmlhttpRequest({
          method: 'GET',
          url: url,
          headers: {},
          withCredentials: true,
          timeout: PORTAL_REQUEST_TIMEOUT_MS,
          onload: function (response) {
            if (debugEnabled) {
              log('Response-Status für Issue', issueIid, ':', response.status);
            }
            if (response.status !== 200) {
              warn('Antwort != 200 für Issue', issueIid, 'Status:', response.status);
              reject({status: response.status});
              return;
            }
            if (looksLikeLoginPage(response)) {
              warn('Portal liefert Login-Seite für Issue', issueIid);
              reject({status: 401, login: true});
              return;
            }
            if (String(response.responseText || '').length > MAX_PORTAL_RESPONSE_CHARS) {
              warn('Portal-Antwort zu groß für Issue', issueIid);
              reject({tooLarge: true});
              return;
            }
            const progressData = parseProgressHtml(response.responseText);
            if (!progressData) {
              log('Keine progress-Daten im HTML (keine Buchungen). Issue', issueIid);
              resolve(null);
              return;
            }
            log('Progress-Daten erhalten für Issue', issueIid, progressData);
            resolve(progressData);
          },
          onerror: function () {
            reject({network: true});
          },
          ontimeout: function () {
            reject({timeout: true});
          },
          onabort: function () {
            reject({aborted: true});
          }
        });
      });
    });
    inflightPortalRequests[url] = promise;
    const cleanup = function () {
      delete inflightPortalRequests[url];
    };
    promise.then(cleanup, cleanup);
    return promise;
  }

  const fetchRetryState = {}; // cacheKey → {attempts, retryAt}

  // Gibt true zurück, wenn Portal-Requests gestartet wurden (zählt für das Scan-Limit)
  function fetchAndDisplayProgress(hostConfig, projectSettings, issueIid, cardElem) {
    if (!issueIid || !cardElem) return false;

    const projectKey = projectSettings && projectSettings.projectKey;
    if (isProjectRequestBlocked(projectKey)) {
      log('Requests pausiert für Projekt', projectSettings ? projectSettings.projectPath : '<unbekannt>');
      return false;
    }

    const projectId = projectSettings.projectId;
    if (!projectId) {
      warn('Kein projectId für', projectSettings.projectPath, '; progress wird nicht geladen.');
      return false;
    }
    const cacheKey = buildProgressCacheKey(projectSettings, issueIid);
    if (!cacheKey) {
      warn('Konnte Cache-Schlüssel nicht bestimmen für Issue', issueIid);
      return false;
    }

    const url = buildPortalUrl(projectSettings, issueIid);
    if (!url) {
      warn(
        'Keine (gültige) Portal-Basis konfiguriert für',
        projectSettings.projectPath,
        '; Fortschritt wird nicht geladen.'
      );
      return false;
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
      const cachedAt = getProgressCacheTimestamp(cacheKey) || getProgressCacheTimestamp(cacheKey2);
      if (cachedAt) cardElem.setAttribute('data-ambient-loaded-at', String(cachedAt));
      const effectiveCached = (cached && cached.notFound && !projectSettings.useSecondPortalProjectId)
        ? null
        : cached;
      injectProgressIntoCard(cardElem, effectiveCached, cachedSecondary);
      return false;
    }

    if (!showEnabled) {
      return false;
    }

    // Abgelaufenen Wert sofort zeigen (gedimmt), frische Daten kommen im Hintergrund
    let staleShown = false;
    {
      const stale = getStaleProgressEntry(cacheKey);
      const stale2 = cacheKey2 ? getStaleProgressEntry(cacheKey2) : null;
      if (stale || stale2) {
        const staleAt = getProgressCacheTimestamp(cacheKey) || getProgressCacheTimestamp(cacheKey2);
        if (staleAt) cardElem.setAttribute('data-ambient-loaded-at', String(staleAt));
        injectProgressIntoCard(cardElem, stale, stale2);
        const staleContainer = cardElem.querySelector('.ambient-progress-badge');
        if (staleContainer) {
          staleContainer.setAttribute('data-ambient-stale', '1');
          staleContainer.style.opacity = '0.6';
          staleContainer.title = 'Veraltet (' + formatLoadedAgo(staleAt) + ') – wird aktualisiert';
        }
        staleShown = true;
      }
    }

    // Nach Fehlschlägen kurz warten, danach (begrenzt) erneut versuchen
    const retryState = fetchRetryState[cacheKey] || (fetchRetryState[cacheKey] = {attempts: 0, retryAt: 0});
    if (Date.now() < retryState.retryAt) {
      cardElem.removeAttribute('data-ambient-progress-processed');
      return false;
    }

    log('Hole Progress-Daten für Issue', issueIid);
    if (!staleShown) showProgressLoading(cardElem);

    const promises = [loadProgressData(url, issueIid)];
    if (projectSettings.useSecondPortalProjectId && projectSettings.projectId2) {
      if (!url2) {
        url2 = buildPortalUrl(projectSettings, issueIid, projectSettings.projectId2);
      }
      if (url2) {
        log('Hole auch Progress-Daten für zweites Portal-Projekt', issueIid);
        promises.push(loadProgressData(url2, issueIid));
      }
    }

    Promise.allSettled(promises)
      .then(function (results) {
        const fulfilled = results.filter(function (r) { return r.status === 'fulfilled'; });
        const rejected = results.filter(function (r) { return r.status === 'rejected'; });
        if (fulfilled.length) {
          clearProjectRequestBlock(projectKey);
        }
        rejected.forEach(function (r) {
          error('Request-Fehler für Issue ' + issueIid + ':', r.reason);
          logPortalError(issueIid, r.reason);
          if (r.reason && r.reason.status) {
            blockProjectRequests(projectKey, r.reason.status);
          }
        });

        const progressData = results[0].status === 'fulfilled' ? results[0].value : null;
        const progressData2 = results[1] && results[1].status === 'fulfilled' ? results[1].value : null;

        if (!progressData && !progressData2) {
          clearProgressLoading(cardElem);
          if (staleShown && !rejected.length) {
            cardElem.querySelectorAll('.ambient-progress-badge[data-ambient-stale]').forEach(function (el) { el.remove(); });
          }
          if (rejected.length) {
            cardElem.querySelectorAll('.ambient-progress-badge[data-ambient-stale]').forEach(function (el) {
              el.title = 'Veraltet – Aktualisierung fehlgeschlagen';
            });
            // vorübergehender Fehler: nicht cachen, später erneut versuchen (begrenzt)
            retryState.attempts += 1;
            retryState.retryAt = Date.now() + NEGATIVE_CACHE_MS;
            if (retryState.attempts < MAX_FETCH_RETRIES) {
              cardElem.removeAttribute('data-ambient-progress-processed');
            }
            return;
          }
          // sauber „keine Buchungen": kurz cachen, damit nicht jeder Reload alle Karten neu abfragt
          setProgressCacheEntry(cacheKey, NOT_FOUND_SENTINEL, NOT_FOUND_TTL_MS);
          if (projectSettings.useSecondPortalProjectId) {
            injectProgressIntoCard(cardElem, NOT_FOUND_SENTINEL, null);
          }
          markPortalRefreshTimestamp();
          return;
        }

        delete fetchRetryState[cacheKey];
        if (progressData) {
          setProgressCacheEntry(cacheKey, progressData);
        }
        if (progressData2 && cacheKey2) {
          setProgressCacheEntry(cacheKey2, progressData2);
        }

        cardElem.setAttribute('data-ambient-loaded-at', String(Date.now()));
        injectProgressIntoCard(cardElem, progressData, progressData2);
        markPortalRefreshTimestamp();
      })
      .catch(function (err) {
        error('Fehler beim Verarbeiten der Portal-Antwort für Issue ' + issueIid + ':', err);
      })
      .then(function () {
        clearProgressLoading(cardElem); // Platzhalter nie stehen lassen; echte Bars tragen kein data-ambient-loading mehr
      });
    return true;
  }

  /******************************************************************
   * Board-Scan
   ******************************************************************/

  /******************************************************************
   * Split-Labels: "workflow::Design" als [Workflow | Design] in Label-Farbe
   ******************************************************************/

  const SPLIT_LABEL_EXCLUDED = '.gl-new-dropdown-panel, .gl-dropdown-menu, [role="listbox"], [role="menu"], ' +
    '[data-testid*="filtered-search"], .gl-filtered-search-token, .filtered-search-box';
  const SPLIT_LABEL_PATTERN = /^(workflow)::(.+)$/i;

  function getLabelColor(labelElem) {
    const textElem = labelElem.querySelector('.gl-label-text') || labelElem;
    const candidates = [textElem, labelElem];
    for (let i = 0; i < candidates.length; i++) {
      const bg = getComputedStyle(candidates[i]).backgroundColor;
      if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') return bg;
    }
    const cssVar = getComputedStyle(labelElem).getPropertyValue('--label-background-color').trim();
    return cssVar || '#6b7280';
  }

  function createSplitLabel(labelElem, scope, name) {
    const color = getLabelColor(labelElem);
    const textElem = labelElem.querySelector('.gl-label-text') || labelElem;
    const font = getComputedStyle(textElem);
    const originalStyle = getComputedStyle(labelElem);
    const originalHeight = labelElem.getBoundingClientRect().height; // vor dem Ausblenden messen
    const el = document.createElement('span');
    el.className = 'ambient-split-label';
    el.setAttribute('role', 'link');
    el.setAttribute('aria-label', scope + '::' + name);
    el.title = scope + '::' + name; // volle Beschriftung, falls bei langen Namen gekürzt wird
    el.tabIndex = 0;
    applyStyles(el, {
      display: 'inline-flex',
      alignItems: 'stretch',
      border: '1px solid ' + color,
      borderRadius: '999px',
      overflow: 'hidden',
      cursor: 'pointer',
      boxSizing: 'border-box',
      alignSelf: 'center',
      minWidth: '0',
      verticalAlign: originalStyle.verticalAlign,
      height: originalHeight ? originalHeight + 'px' : '',
      margin: originalStyle.margin,
      fontFamily: font.fontFamily,
      fontSize: font.fontSize,
      fontWeight: font.fontWeight,
      lineHeight: font.lineHeight,
      whiteSpace: 'nowrap'
    });
    const left = createTextSpan(scope.charAt(0).toUpperCase() + scope.slice(1), {
      display: 'inline-flex',
      alignItems: 'center',
      background: color,
      color: getContrastTextColor(color, '#1f2937', '#ffffff'),
      padding: '0 8px'
    });
    const right = createTextSpan(name, {
      display: 'inline-flex',
      alignItems: 'center',
      background: 'var(--gl-background-color-default, #ffffff)',
      color: 'var(--gl-text-color-default, #1f2937)',
      padding: '0 8px'
    });
    el.appendChild(left);
    el.appendChild(right);
    // Klick/Enter an das ausgeblendete Original weiterreichen: behält GitLabs Verhalten (z. B. Board filtern)
    const forward = function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      const link = labelElem.querySelector('a');
      if (link) link.click();
    };
    el.addEventListener('click', forward);
    el.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') forward(ev);
    });
    return el;
  }

  // Eingeklappte Spalten drehen den Label-Text (writing-mode: vertical) – dort bleibt GitLabs Original stehen
  // Erkennung über writing-mode, gedrehte Titel (transform) oder eine „collapsed"-Klasse an einem Vorfahren
  function isVerticalText(elem) {
    if (/vertical|sideways/.test(getComputedStyle(elem).writingMode || '')) return true;
    const title = elem.closest(SEL.listTitle);
    if (title && getComputedStyle(title).transform !== 'none' && getComputedStyle(title).transform !== '') return true;
    return Boolean(elem.closest('[class*="collapsed"]'));
  }

  function applySplitLabels(cardElem) {
    // Spalte wurde eingeklappt: Split-Label wieder entfernen, das Original wird sichtbar
    cardElem.querySelectorAll(SEL.cardLabel + '[data-ambient-split="1"]').forEach(function (labelElem) {
      if (!isVerticalText(labelElem)) return;
      const sibling = labelElem.nextElementSibling;
      if (sibling && sibling.classList.contains('ambient-split-label')) sibling.remove();
      labelElem.removeAttribute('data-ambient-split');
    });
    // verwaiste Split-Labels (Original wurde von GitLab neu gerendert) entfernen
    cardElem.querySelectorAll('.ambient-split-label').forEach(function (el) {
      const prev = el.previousElementSibling;
      if (!prev || prev.getAttribute('data-ambient-split') !== '1' || !prev.isConnected) el.remove();
    });
    cardElem.querySelectorAll(SEL.cardLabel + ':not([data-ambient-split])').forEach(function (labelElem) {
      // Dropdowns, Filterleiste: dort bleibt GitLabs Original (Auswahl/Filter funktionieren darüber)
      if (labelElem.closest(SPLIT_LABEL_EXCLUDED) || isVerticalText(labelElem)) return;
      const match = normalizeWhitespace(labelElem.textContent).match(SPLIT_LABEL_PATTERN);
      if (!match) {
        labelElem.setAttribute('data-ambient-split', '0'); // kein Workflow-Label → nicht erneut prüfen
        return;
      }
      labelElem.after(createSplitLabel(labelElem, match[1], match[2].trim()));
      labelElem.setAttribute('data-ambient-split', '1');
    });
    cardElem.querySelectorAll(SEL.boardListHeader + ' .ambient-split-label').forEach(fitSplitLabel);
  }

  // Reicht der Platz im Spalten-Header nicht, wird der Scope-Teil („Workflow") zum schmalen Farbbalken, damit
  // mehr vom Namen sichtbar bleibt (der volle Text steht im Tooltip)
  function fitSplitLabel(el) {
    const left = el.firstElementChild;
    const right = el.lastElementChild;
    if (!left || !right || left === right) return;
    const compact = {width: '10px', padding: '0', fontSize: '0', overflow: 'hidden'};
    applyStyles(left, {width: '', padding: '0 8px', fontSize: '', overflow: ''}); // erst volle Breite probieren
    if (right.scrollWidth > right.clientWidth + 1) applyStyles(left, compact);
  }

  function removeSplitLabels() {
    document.querySelectorAll('.ambient-split-label').forEach(function (el) { el.remove(); });
    document.querySelectorAll('[data-ambient-split]').forEach(function (el) { el.removeAttribute('data-ambient-split'); });
  }

  let scanRunCounter = 0;
  let totalFetchesSincePageLoad = 0;

  function scanBoard(hostConfig, projectSettings) {
    scanRunCounter += 1;
    issueNumberFontStylesCache = null;

    const rootBoardsApp = document.querySelector(SEL.boardsApp);
    if (!rootBoardsApp) {
      log(
        'scanBoard run #' +
        scanRunCounter +
        ', keine .boards-app gefunden – Board noch nicht initialisiert?'
      );
      return;
    }

    const boardLists = rootBoardsApp.querySelectorAll(SEL.boardList);
    log('scanBoard run #' + scanRunCounter + ', Listen gefunden:', boardLists.length);
    if (!boardLists.length) {
      qs(document, 'boardList'); // einmalige Warnung im Debug-Modus, falls GitLab das Markup geändert hat
      return;
    }

    if (!showEnabled) {
      // Spalten-Buttons (Auge + Sortierung) komplett entfernen; bei „an" baut ensureListSelectionCheckbox sie neu auf
      rootBoardsApp.querySelectorAll('.ambient-progress-list-toggle, .ambient-progress-sort-toggle')
        .forEach(function (button) { button.remove(); });
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
      if (columnLabelText) boardColumnLabelSet[normalizeLabelNameForMatching(columnLabelText)] = true;
      if (header && isFeatureOn('splitLabels')) {
        applySplitLabels(header); // das Original bleibt im DOM, Listen-/Label-Namen werden weiter daraus gelesen
      }

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

      const cards = boardListElem.querySelectorAll(SEL.boardCard);
      if (debugEnabled) {
        log('Liste #' + li + ' "' + displayListName + '" allowed: ' + isAllowed + ', Karten: ' + cards.length);
      }

      for (let k = 0; k < cards.length; k++) {
        const cardElem = cards[k];
        if (isFeatureOn('splitLabels')) {
          applySplitLabels(cardElem);
        }
        if (!isAllowed) {
          markCardSkipped(cardElem);
          continue;
        }
        cardElem.removeAttribute('data-ambient-skip');

        // Experiment: in andere Spalte gezogen → Verweildauer neu bestimmen
        const trackedIid = getIssueIidFromCard(cardElem);
        const previousList = trackedIid ? lastListByIid[trackedIid] : undefined;
        if (trackedIid) lastListByIid[trackedIid] = columnLabelText || '';
        if (previousList !== undefined && previousList !== (columnLabelText || '')) {
          const movedIid = trackedIid;
          if (movedIid && projectSettings.projectPath) clearEnteredAtCaches(projectSettings.projectPath, movedIid);
          cardElem.querySelectorAll('.ambient-column-age').forEach(function (el) { el.remove(); });
          cardElem.removeAttribute('data-ambient-entered-at');
          cardElem.removeAttribute('data-ambient-progress-processed');
          cardElem.setAttribute('data-ambient-moved', '1');
          scheduleColumnAgeAverage(boardListElem);
        }

        if (cardElem.getAttribute('data-ambient-progress-processed') === '1') {
          continue;
        }

        const issueIid = getIssueIidFromCard(cardElem);

        if (!issueIid) {
          warn('Konnte Issue-IID für Karte nicht bestimmen, Karte wird übersprungen.');
          cardElem.setAttribute('data-ambient-progress-processed', '1');
          continue;
        }

        if (isFeatureOn('mrBadge')) {
          fetchAndDisplayMrInfo(projectSettings, issueIid, cardElem);
        }
        if (isFeatureOn('columnAge')) {
          fetchAndDisplayColumnAge(projectSettings, issueIid, cardElem, columnLabelText);
        }
        injectCardActions(cardElem, issueIid, projectSettings);

        if (!isFeatureOn('progress')) {
          cardElem.setAttribute('data-ambient-progress-processed', '1');
          continue;
        }

        if (newFetchesThisScan >= MAX_NEW_FETCHES_PER_SCAN) {
          limitReached = true;
          break;
        }

        cardElem.setAttribute('data-ambient-progress-processed', '1');
        if (fetchAndDisplayProgress(hostConfig, projectSettings, issueIid, cardElem)) {
          newFetchesThisScan++;
          totalFetchesSincePageLoad++;
        }
      }
    }

    if (debugEnabled) {
      log(
        'scanBoard run #' + scanRunCounter + ': Listen ' + boardLists.length +
        ', Karten ' + rootBoardsApp.querySelectorAll(SEL.boardCard).length +
        ', Badges ' + rootBoardsApp.querySelectorAll('.ambient-progress-badge').length +
        ', neue Fetches ' + newFetchesThisScan + '/' + MAX_NEW_FETCHES_PER_SCAN +
        (limitReached ? ' (Limit erreicht)' : '') +
        ', gesamt seit Seitenaufruf ' + totalFetchesSincePageLoad
      );
    }

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

  let lastDetailHref = null;
  let lastMrHref = null;

  function scanIssueDetail(hostConfig, projectSettings) {
    if (window.location.href !== lastDetailHref) {
      lastDetailHref = window.location.href;
      resetDetailRetryState(); // SPA-Navigation: neue Ansicht bekommt wieder alle Versuche
    }
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

    const wrapperList = document.querySelectorAll(SEL.detailWrapper);
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
    const titleEl = document.querySelector(SEL.mrTitle);
    if (!titleEl) return null;

    // Priorität 1: <a data-iid="..."> Link im Titel
    const issueLink = titleEl.querySelector('a[data-iid]');
    if (issueLink) {
      const iid = issueLink.getAttribute('data-iid');
      if (iid) return iid;
    }

    // Priorität 2: Text-Pattern "#<ID>" im Titel – nur eindeutig (genau eine verschiedene ID), sonst raten wir falsch
    const text = titleEl.textContent || '';
    const ids = (text.match(/#(\d+)/g) || []).filter(function (id, i, all) { return all.indexOf(id) === i; });
    return ids.length === 1 ? ids[0].slice(1) : null;
  }

  // "[Label]\n/quick\n/actions" → [{label, body}]
  function parseTicketActions(text) {
    const actions = [];
    let current = null;
    String(text || '').split('\n').forEach(function (line) {
      const header = line.trim().match(/^\[(.+)\]$/);
      if (header) {
        current = {label: header[1].trim(), lines: []};
        actions.push(current);
      } else if (current) {
        current.lines.push(line);
      }
    });
    return actions
      .map(function (a) {
        return {label: a.label, body: a.lines.join('\n').trim()};
      })
      .filter(function (a) {
        return a.body;
      });
  }

  // Postet Quick Actions als Kommentar aufs Ticket – nutzt die GitLab-Session, kein Token.
  function runTicketAction(projectPath, issueIid, body) {
    if (!isNumericId(issueIid)) return Promise.reject(new Error('Ungültige Issue-IID'));
    return glFetch(
      '/api/v4/projects/' + encodeURIComponent(projectPath) + '/issues/' + issueIid + '/notes',
      {method: 'POST', body: JSON.stringify({body: body})}
    ).then(function (res) {
      if (!res.ok) {
        throw new Error('HTTP ' + res.status);
      }
    });
  }

  // Quick Actions, die Tickets schließen/umhängen, vor dem Absenden bestätigen lassen
  const DESTRUCTIVE_QUICK_ACTION = /^\/(close|reopen|merge|delete|move)\b/im;

  // Führt eine Ticket-Aktion aus (mit Rückfrage bei schließenden Aktionen) und meldet das Ergebnis als Toast
  function runTicketActionWithFeedback(projectSettings, issueIid, action, onDone) {
    if (DESTRUCTIVE_QUICK_ACTION.test(action.body) &&
      !window.confirm('„' + action.label + '“ auf #' + issueIid + ' ausführen?\n\n' + action.body)) {
      if (onDone) onDone();
      return;
    }
    runTicketAction(projectSettings.projectPath, issueIid, action.body)
      .then(function () {
        showToast({text: '„' + action.label + '“ auf #' + issueIid + ' ausgeführt', variant: 'success'});
      })
      .catch(function (err) {
        error('Ticket-Aktion fehlgeschlagen:', err);
        showToast({text: '„' + action.label + '“ fehlgeschlagen: ' + err.message, variant: 'warning'});
      })
      .then(function () {
        if (onDone) onDone();
      });
  }

  function createTicketActionsRow(projectSettings, issueIid) {
    const actions = parseTicketActions(projectSettings && projectSettings.ticketActions);
    if (!actions.length || !issueIid) return null;

    const row = document.createElement('div');
    applyStyles(row, {
      display: 'flex',
      gap: '0.35rem',
      flexWrap: 'wrap',
      marginTop: '0.5rem'
    });

    actions.forEach(function (action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = action.label;
      button.title = action.body;
      button.className = 'ambient-btn btn gl-button btn-default btn-sm';
      button.addEventListener('click', function (ev) {
        ev.preventDefault();
        if (button.disabled) return;
        button.disabled = true;
        runTicketActionWithFeedback(projectSettings, issueIid, action, function () {
          button.disabled = false;
        });
      });
      row.appendChild(button);
    });
    return row;
  }

  // Menü im GitLab-Stil an einen Toggle-Button hängen. Das Menü hängt am body (position: fixed), damit es nicht
  // vom Karten-Container abgeschnitten wird. Maus-/Pointer-Events werden gestoppt, weil GitLabs Board-Karte das
  // Ticket schon bei mouseup öffnet und Sortable bei pointerdown mit dem Ziehen beginnt.
  function attachDropdownMenu(toggle, buildItems, title) {
    toggle.classList.add('js-no-trigger');
    toggle.setAttribute('aria-haspopup', 'menu');
    toggle.setAttribute('aria-expanded', 'false');
    let menu = null;

    function onOutside(ev) {
      if (menu && !menu.contains(ev.target) && !toggle.contains(ev.target)) close();
    }

    function onKey(ev) {
      if (!menu) return;
      if (ev.key === 'Escape') {
        ev.preventDefault();
        close();
        toggle.focus();
      } else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault();
        const items = Array.prototype.slice.call(menu.querySelectorAll('[role="menuitem"]'));
        const index = items.indexOf(document.activeElement);
        const next = ev.key === 'ArrowDown' ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
        items[next].focus();
      }
    }

    function close() {
      if (!menu) return;
      menu.remove();
      menu = null;
      toggle.setAttribute('aria-expanded', 'false');
      document.removeEventListener('click', onOutside, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', close, true);
    }

    function open() {
      menu = document.createElement('div');
      menu.className = 'ambient-dropdown-menu';
      menu.setAttribute('role', 'menu');
      // Optik wie GitLabs Dropdowns (z. B. Assignee-Auswahl): Panel mit Kopfzeile, Trennlinie und großzügigen Zeilen
      applyStyles(menu, {
        position: 'fixed',
        zIndex: '10000',
        minWidth: '220px',
        maxWidth: '360px',
        maxHeight: '60vh',
        overflowY: 'auto',
        padding: '0 0 4px',
        borderRadius: '8px',
        border: '1px solid var(--gl-border-color-default, #dcdcde)',
        background: 'var(--gl-dropdown-background-color, var(--gl-background-color-overlap, var(--gl-background-color-default, #fff)))',
        color: 'var(--gl-text-color-default, #333238)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        fontSize: '14px'
      });
      if (title) {
        const header = createTextSpan(title, {display: 'block', padding: '10px 12px', fontWeight: '700',
          borderBottom: '1px solid var(--gl-border-color-default, #dcdcde)', marginBottom: '4px'});
        menu.appendChild(header);
      }
      const list = document.createElement('div');
      applyStyles(list, {padding: '0 4px'});
      menu.appendChild(list);
      buildItems().forEach(function (entry) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'ambient-dropdown-item js-no-trigger';
        item.setAttribute('role', 'menuitem');
        item.appendChild(createTextSpan(entry.label, {display: 'block', fontWeight: entry.sub ? '600' : '400'}));
        if (entry.sub) item.appendChild(createTextSpan(entry.sub, {display: 'block', fontSize: '12px', opacity: '0.7'}));
        if (entry.title) item.title = entry.title;
        applyStyles(item, {
          display: 'block',
          width: '100%',
          padding: '8px 12px',
          border: 'none',
          borderRadius: '4px',
          background: 'transparent',
          color: 'inherit',
          fontSize: '14px',
          lineHeight: '1.4',
          textAlign: 'left',
          cursor: 'pointer'
        });
        item.addEventListener('click', function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
          close();
          entry.onSelect();
        });
        list.appendChild(item);
      });
      document.body.appendChild(menu);
      const rect = toggle.getBoundingClientRect();
      menu.style.top = Math.round(rect.bottom + 4) + 'px';
      menu.style.left = Math.max(8, Math.min(Math.round(rect.left), window.innerWidth - menu.offsetWidth - 8)) + 'px';
      toggle.setAttribute('aria-expanded', 'true');
      document.addEventListener('click', onOutside, true);
      document.addEventListener('keydown', onKey, true);
      window.addEventListener('scroll', close, true);
      const first = menu.querySelector('[role="menuitem"]');
      if (first) first.focus();
    }

    ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend'].forEach(function (type) {
      toggle.addEventListener(type, function (ev) { ev.stopPropagation(); });
    });
    toggle.addEventListener('click', function (ev) {
      ev.stopPropagation();
      ev.preventDefault();
      if (menu) {
        close();
      } else {
        open();
      }
    });
  }

  // Dropdown im GitLab-Stil (Blitz-Icon): zeigt die Ticket-Aktionen als Menü; Karten-Footer und Issue-Detail.
  // Das Menü hängt am body (position: fixed), damit es nicht vom Karten-Container abgeschnitten wird.
  function createTicketActionsDropdown(projectSettings, issueIid, withLabel) {
    const actions = parseTicketActions(projectSettings && projectSettings.ticketActions);
    if (!actions.length || !issueIid) return null;
    const wrap = document.createElement('span');
    wrap.className = 'ambient-card-actions';
    // position + z-index: GitLabs Karte legt einen unsichtbaren Link (a.board-card-button, inset-0) über alles, was
    // nicht darüber liegt – ohne das würde jeder Klick das Ticket öffnen
    applyStyles(wrap, {display: 'inline-flex', alignItems: 'center', marginLeft: withLabel ? '0' : '6px', position: 'relative', zIndex: '25'});
    wrap.classList.add('js-no-trigger');

    const toggle = document.createElement('button');
    toggle.type = 'button';
    // GitLabs eigene Button-Klassen: Karte = Icon-Button wie das Zahnrad, Detail = Button mit Text
    toggle.className = 'ambient-btn ambient-dropdown-toggle btn gl-button btn-sm ' +
      (withLabel ? 'btn-default' : 'btn-default btn-default-tertiary btn-icon');
    toggle.title = t('Ticket-Aktionen');
    toggle.setAttribute('aria-label', t('Ticket-Aktionen'));
    toggle.innerHTML = KEBAB_ICON_SVG +
      (withLabel ? '<span class="gl-button-text">' + t('Ticket-Aktionen') + '</span>' + CHEVRON_DOWN_ICON_SVG : '');
    if (!withLabel) {
      applyStyles(toggle, {
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minWidth: '24px', width: '24px', height: '24px', padding: '0', flex: '0 0 auto'
      });
    }

    attachDropdownMenu(toggle, function () {
      return actions.map(function (action) {
        return {
          label: action.label,
          title: action.body,
          onSelect: function () { runTicketActionWithFeedback(projectSettings, issueIid, action); }
        };
      });
    }, t('Ticket-Aktionen'));
    wrap.appendChild(toggle);
    return wrap;
  }

  // GitLabs Board-Karte öffnet das Ticket bei mouseup und startet das Ziehen bei pointerdown. Events auf unseren
  // Aktions-Elementen werden deshalb schon in der Capture-Phase am document gestoppt (der Klick selbst läuft weiter).
  function installNoTriggerGuard() {
    ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'dragstart'].forEach(function (type) {
      document.addEventListener(type, function (ev) {
        const target = ev.target;
        if (target && target.closest && target.closest('.ambient-card-actions, .ambient-dropdown-menu')) {
          ev.stopPropagation();
        }
      }, true);
    });
  }

  function injectCardActions(cardElem, issueIid, projectSettings) {
    if (cardElem.querySelector('.ambient-card-actions')) return;
    const footer = cardElem.querySelector(SEL.cardFooter);
    const dropdown = footer && createTicketActionsDropdown(projectSettings, issueIid, false);
    if (dropdown) footer.appendChild(dropdown);
  }

  function injectProgressIntoMRDetail(assigneeBlock, progressData, portalUrl, timesheetUrl, projectSettings, issueIid) {
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

    const actionsRow = createTicketActionsRow(projectSettings, issueIid);
    if (actionsRow) {
      container.appendChild(actionsRow);
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
      log('MR-Detail lädt Progress-Daten (Projekt', projectSettings.projectPath + ',', 'Issue', issueIid + ')');
      totalFetchesSincePageLoad++;
      loadProgressData(url, issueIid)
        .then(function (progressData) {
          clearProjectRequestBlock(projectSettings.projectKey);
          if (!progressData) return;
          setProgressCacheEntry(cacheKey, progressData);
          injectProgressIntoMRDetail(assigneeBlock, progressData, url, buildTimesheetUrl(projectSettings, issueIid), projectSettings, issueIid);
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

    injectProgressIntoMRDetail(assigneeBlock, cached, url, buildTimesheetUrl(projectSettings, issueIid), projectSettings, issueIid);
    const parent = assigneeBlock.parentElement;
    if (parent) {
      parent.dataset.ambientProgressMrIssueIid = issueIid;
    }
  }

  /******************************************************************
   * Ticket-Assignee-Umzuweisen auf der MR-Detailseite
   ******************************************************************/

  function loadMergeRequestDetails(projectPath, mrIid) {
    if (!isNumericId(mrIid)) return Promise.reject(new Error('Ungültige MR-IID'));
    const url = '/api/v4/projects/' + encodeURIComponent(projectPath) + '/merge_requests/' + mrIid;
    return glFetch(url)
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
    if (!isNumericId(issueIid)) return Promise.reject(new Error('Ungültige Issue-IID'));
    const url = '/api/v4/projects/' + encodeURIComponent(projectPath) + '/issues/' + issueIid;
    return glFetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error('Issue-Status ' + res.status);
        return res.json();
      })
      .then(function (issue) {
        return issue.assignees || [];
      });
  }

  function updateIssueAssignee(projectPath, issueIid, userId) {
    if (!isNumericId(issueIid)) return Promise.reject(new Error('Ungültige Issue-IID'));
    const url = '/api/v4/projects/' + encodeURIComponent(projectPath) + '/issues/' + issueIid;
    return glFetch(url, {
      method: 'PUT',
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
      button.className = 'ambient-btn btn gl-button btn-default btn-sm';
      applyStyles(button, {display: 'inline-flex', alignItems: 'center', gap: '0.25rem'});

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
    if (window.location.href !== lastMrHref) {
      lastMrHref = window.location.href;
      resetMRRetryState();
    }
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

    const assigneeBlock = document.querySelector(SEL.mrAssigneeBlock);
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
      log('Ticket-Detail lädt Progress-Daten (Projekt', projectSettings.projectPath + ',', 'Issue', issueIid + ')');
      totalFetchesSincePageLoad++;
      loadProgressData(url, issueIid)
        .then(function (progressData) {
          clearProjectRequestBlock(projectSettings.projectKey);
          if (!progressData) return;
          setProgressCacheEntry(cacheKey, progressData);
          injectProgressIntoIssueDetail(detailWrapperElem, progressData, url, buildTimesheetUrl(projectSettings, issueIid), issueIid);
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

    injectProgressIntoIssueDetail(detailWrapperElem, cached, url, buildTimesheetUrl(projectSettings, issueIid), issueIid);
    detailWrapperElem.dataset.ambientProgressIssueIid = issueIid;
  }

  function injectProgressIntoIssueDetail(detailWrapperElem, progressData, portalUrl, timesheetUrl, issueIid) {
    if (!detailWrapperElem || !progressData) return;

    const windowBackground = getGitLabWindowBackgroundColor(true);
    const theme = getThemeAwareBarStyles({
      barOverrides: {flex: '1 1 auto', minWidth: '0'}
    });
    theme.styles.warnPct = WARN_PCT;
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
      const assigneesSection = detailWrapperElem.querySelector(SEL.detailAssignees);
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

    if (issueIid && currentScanContext) {
      const dropdown = createTicketActionsDropdown(currentScanContext.projectSettings, issueIid, true);
      if (dropdown) {
        applyStyles(dropdown, {marginTop: '0.5rem'});
        container.appendChild(dropdown);
      }
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
    const buttonGroup = header.querySelector(SEL.boardListButtons);
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
    ensureColumnSortButton(header, buttonGroup, button, projectSettings);
  }

  // Sortier-Menü pro Spalte (nur für Label-Spalten): Unassigned nach oben / nach Assignee gruppieren
  function ensureColumnSortButton(header, buttonGroup, eyeButton, projectSettings) {
    const hasLabel = Boolean(header.querySelector(SEL.listTitleLabel));
    let sortButton = buttonGroup.querySelector('button.ambient-progress-sort-toggle');
    if (!hasLabel) {
      if (sortButton) sortButton.remove();
      return;
    }
    if (sortButton) return;
    sortButton = document.createElement('button');
    sortButton.type = 'button';
    sortButton.className = 'ambient-progress-sort-toggle btn gl-button btn-default btn-sm btn-icon';
    sortButton.title = t('Spalte sortieren');
    sortButton.setAttribute('aria-label', t('Spalte sortieren'));
    sortButton.innerHTML = gitlabIconSvg('sort-lowest', 'gl-button-icon gl-icon s16 gl-fill-current');
    eyeButton.insertAdjacentElement('afterend', sortButton);
    attachDropdownMenu(sortButton, function () {
      const column = getColumnLabelText(header.closest(SEL.boardList), header);
      return [
        {
          label: t('Unassigned nach oben'),
          title: 'Ändert die Reihenfolge in dieser Spalte für das ganze Team',
          onSelect: function () { sortBoardColumns(projectSettings, 'unassigned', column); }
        },
        {
          label: t('Nach Assignee gruppieren'),
          title: 'Ändert die Reihenfolge in dieser Spalte für das ganze Team',
          onSelect: function () { sortBoardColumns(projectSettings, 'assignee', column); }
        }
      ];
    }, t('Spalte sortieren'));
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

  // Jetzt aktualisieren: alles verwerfen und neu scannen, ohne die Seite neu zu laden (Scroll bleibt erhalten)
  function softRefresh(projectSettings) {
    clearProgressCache();
    if (projectSettings) clearProjectRequestBlock(projectSettings.projectKey);
    Object.keys(fetchRetryState).forEach(function (key) { delete fetchRetryState[key]; });
    Object.keys(mrListCache).forEach(function (key) { delete mrListCache[key]; });
    Object.keys(mrListFailedAt).forEach(function (key) { delete mrListFailedAt[key]; });
    Object.keys(columnEnteredAtCache).forEach(function (key) { delete columnEnteredAtCache[key]; });
    Object.keys(labelEventsCache).forEach(function (key) { delete labelEventsCache[key]; });
    Object.keys(mrPipelineRequests).forEach(function (key) { delete mrPipelineRequests[key]; });
    enteredAtStore = {};
    storageRemove(LS_KEY_ENTERED_AT);
    updateLastRefreshLabel();
    showToast({text: t('Cache geleert, aktualisiere…'), variant: 'info'});
    applyExperimentChange();
  }

  let switchIdCounter = 0;

  function makeSwitch(labelText, checked, onChange) {
    switchIdCounter += 1;
    const labelId = 'ambient-switch-label-' + switchIdCounter;
    const wrapper = document.createElement('div');
    wrapper.className = 'ambient-switch-row';
    applyStyles(wrapper, {
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      cursor: 'pointer',
      padding: '0.4rem 0.6rem',
      borderRadius: '6px'
    });

    const labelSpan = document.createElement('span');
    labelSpan.id = labelId;
    labelSpan.textContent = labelText;
    applyStyles(labelSpan, {
      fontWeight: '400',
      flex: '1 1 auto'
    });

    const switchWrapper = document.createElement('div');
    applyStyles(switchWrapper, {
      position: 'relative',
      width: '38px',
      height: '20px',
      flex: '0 0 auto'
    });

    const slider = document.createElement('span');
    slider.className = 'ambient-switch-slider';
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
    checkbox.className = 'ambient-switch-input';
    checkbox.setAttribute('role', 'switch');
    checkbox.setAttribute('aria-labelledby', labelId);
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

    // Checkbox vor dem Slider, damit `.ambient-switch-input:focus-visible + .ambient-switch-slider` greift
    switchWrapper.appendChild(checkbox);
    switchWrapper.appendChild(slider);

    wrapper.appendChild(labelSpan);
    wrapper.appendChild(switchWrapper);
    return wrapper;
  }

  function createToolbar(hostConfig, projectSettings) {
    const existing = document.getElementById('ambient-progress-toolbar');
    if (existing) return existing;

    const windowBackground = getGitLabWindowBackgroundColor(true);

    const targetSelectors = TOOLBAR_TARGET_SELECTORS;
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
      removeSplitLabels();
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

    const globalSection = createGlobalSettingsSection(mrLinksToggle, debugToggle, projectSettings, function () {
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
    gearButton.setAttribute('aria-haspopup', 'dialog');
    gearButton.setAttribute('aria-expanded', 'false');
    gearButton.setAttribute('aria-controls', 'ambient-progress-settings');
    gearButtonElement = gearButton;
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
    dropdown.id = 'ambient-progress-settings';
    dropdown.setAttribute('role', 'dialog');
    dropdown.setAttribute('aria-label', 'Progress-Einstellungen');
    // Seitenpanel wie GitLabs Ticket-Vorschau (Drawer): rechts angedockt, unter der Top-Bar, ca. halbe Fensterbreite.
    // `top` wird beim Öffnen aus der Höhe der Top-Bar berechnet. Das Panel hängt am body, damit kein transformierter
    // Vorfahre das position: fixed bricht.
    applyStyles(dropdown, {
      position: 'fixed',
      top: '49px',
      right: '0',
      bottom: '0',
      background: windowBackground,
      color: toolbarTextColor,
      borderLeft: '1px solid var(--gl-border-color-default, #4c4b51)',
      borderRadius: '12px 0 0 0',
      boxShadow: '-8px 0 24px rgba(15, 23, 42, 0.35)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: '260',
      gap: '0',
      padding: '0',
      fontSize: '14px',
      width: 'clamp(480px, 48vw, 1400px)',
      maxWidth: '100vw',
      overflowY: 'auto',
      opacity: '0',
      transform: 'translateX(32px)',
      pointerEvents: 'none',
      visibility: 'hidden', // geschlossen auch aus Tab-Reihenfolge und Screenreader-Baum
      transition: 'opacity 0.2s ease, transform 0.2s ease, visibility 0s linear 0.2s'
    });

    const panelHeader = document.createElement('div');
    applyStyles(panelHeader, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '0.5rem',
      padding: '0.9rem 1.25rem',
      position: 'sticky',
      top: '0',
      zIndex: '2',
      background: windowBackground,
      borderBottom: '1px solid var(--gl-border-color-default, #4c4b51)'
    });
    const panelTitle = createTextSpan(t('Progress-Einstellungen'), {fontSize: '1.1rem', fontWeight: '700'});
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'ambient-btn btn gl-button btn-default btn-default-tertiary btn-icon btn-sm';
    closeButton.title = t('Schließen');
    closeButton.setAttribute('aria-label', t('Schließen'));
    closeButton.innerHTML = '<svg class="gl-button-icon gl-icon s16" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
    panelHeader.appendChild(panelTitle);
    panelHeader.appendChild(closeButton);
    dropdown.appendChild(panelHeader);

    // Inhalt scrollt, Kopf und Speichern-Leiste bleiben stehen
    const content = document.createElement('div');
    applyStyles(content, {
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem',
      padding: '1rem 1.25rem',
      flex: '1 0 auto'
    });
    dropdown.appendChild(content);

    // Status-Karte: Version, Anzeige-Schalter, letzte Aktualisierung
    const statusCard = document.createElement('div');
    statusCard.className = 'ambient-card-box';
    applyStyles(statusCard, CARD_STYLES);
    applyStyles(statusCard, {padding: '0.5rem 0.4rem', gap: '0.1rem'});
    content.appendChild(statusCard);

    const versionRow = document.createElement('div');
    applyStyles(versionRow, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '0.5rem'
    });
    const versionLabel = document.createElement('div');
    versionLabel.textContent = 'Version ' + SCRIPT_VERSION;
    applyStyles(versionLabel, {fontSize: '0.85rem', fontWeight: '600', padding: '0 0.6rem'});
    showToggle.title = 'Blendet alle Anzeigen des Scripts auf einmal aus (gilt für alle Boards)';
    applyStyles(showToggle, {flex: '0 0 auto'});
    showToggle.firstChild.style.flex = '0 0 auto';
    versionRow.appendChild(versionLabel);
    versionRow.appendChild(showToggle);
    statusCard.appendChild(versionRow);

    const timestampRow = document.createElement('div');
    applyStyles(timestampRow, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '0.5rem',
      padding: '0.25rem 0.6rem'
    });

    const timestampLabel = document.createElement('div');
    applyStyles(timestampLabel, {
      fontSize: '0.8rem',
      opacity: '0.7'
    });
    lastRefreshLabelElement = timestampLabel;
    updateLastRefreshLabel();
    timestampRow.appendChild(timestampLabel);

    if (projectSettings) {
      const refreshButton = document.createElement('button');
      refreshButton.type = 'button';
      refreshButton.textContent = '↻';
      refreshButton.title = t('Jetzt aktualisieren');
      refreshButton.setAttribute('aria-label', 'Cache leeren und neu laden');
      refreshButton.className = 'ambient-btn ambient-btn-primary btn gl-button btn-confirm btn-sm';
      refreshButton.addEventListener('click', function () {
        softRefresh(projectSettings);
      });
      manualRefreshButtonElement = refreshButton;
      timestampRow.appendChild(refreshButton);
    }

    statusCard.appendChild(timestampRow);

    const releaseNotificationRow = document.createElement('div');
    applyStyles(releaseNotificationRow, CARD_STYLES);
    applyStyles(releaseNotificationRow, {display: 'none', gap: '0.25rem', padding: '0.7rem 0.9rem'});

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
    content.appendChild(releaseNotificationRow);

    const rateLimitNotificationRow = document.createElement('div');
    applyStyles(rateLimitNotificationRow, CARD_STYLES);
    applyStyles(rateLimitNotificationRow, {display: 'none', gap: '0.25rem', padding: '0.7rem 0.9rem'});

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
    content.appendChild(rateLimitNotificationRow);
    updateRateLimitWarningUI(getCachedRateLimitWarning());

    content.appendChild(globalSection);
    let projectConfigDetails = null;
    if (projectSettings) {
      const boardConfigured = Boolean(projectSettings.projectId && projectSettings.portalBaseUrl);
      // Zugeklappt, sobald das Board eingerichtet ist
      const boardSection = createCollapsibleGroup(
        'Board-Einstellungen',
        'Gelten nur für ' + (projectSettings.projectPath || 'dieses Board'),
        !boardConfigured
      );
      const ageHighlightSection = createAgeHighlightSection(projectSettings);
      refreshAgeHighlightSection = ageHighlightSection.refresh;
      boardSection.appendChild(ageHighlightSection.element);

      const projectConfigSection = createProjectConfigSection(hostConfig, projectSettings, scheduleAutosave);
      // Eingerichtete Boards brauchen die Konfiguration selten → zugeklappt
      projectConfigDetails = createCollapsible(
        'Projekt-Konfiguration',
        !boardConfigured
      );
      projectConfigDetails.body.appendChild(projectConfigSection);
      boardSection.appendChild(projectConfigDetails.element);
      content.appendChild(boardSection);
    }

    // Änderungen werden entprellt sofort übernommen; geänderte Felder leuchten kurz grün
    let autosaveTimer = null;

    // Fehler am Feld anzeigen (aria-invalid + Status mit role="alert"); kein Fokusklau beim Tippen
    function fail(input, statusElement, message) {
      if (statusElement) statusElement.textContent = message;
      [projectIdInputElement, portalUrlInputElement, projectId2InputElement].forEach(function (el) {
        el.removeAttribute('aria-invalid');
      });
      input.setAttribute('aria-invalid', 'true');
    }

    function commitProjectConfig() {
      if (!projectSettings || !projectIdInputElement || !portalUrlInputElement || !projectId2InputElement || !useSecondProjectIdToggleCheckbox) {
        return;
      }
      const projectAttempt = projectIdInputElement.value.trim();
      const portalRaw = portalUrlInputElement.value.trim();
      const projectAttempt2 = projectId2InputElement.value.trim();
      const useSecond = useSecondProjectIdToggleCheckbox.checked;
      const actionsAttempt = ticketActionsInputElement ? ticketActionsInputElement.value.trim() : '';

      // Unvollständige/ungültige Eingaben werden nicht gespeichert (Hinweis am Feld, solange man tippt)
      if (!projectAttempt) {
        return fail(projectIdInputElement, projectStatusElement, 'Bitte gib eine Projekt-ID ein.');
      }
      if (!/^\d+$/.test(projectAttempt)) {
        return fail(projectIdInputElement, projectStatusElement, 'Projekt-ID darf nur Zahlen enthalten.');
      }
      if (!portalRaw) {
        return fail(portalUrlInputElement, portalStatusElement, 'Bitte gib eine Portal-Base URL ein.');
      }
      const portalAttempt = normalizePortalBaseUrl(portalRaw);
      if (!portalAttempt) {
        return fail(
          portalUrlInputElement,
          portalStatusElement,
          'Ungültige URL: nur https:// ohne Benutzername/Passwort erlaubt.'
        );
      }
      if (useSecond && !projectAttempt2) {
        return fail(
          projectId2InputElement,
          projectId2StatusElement,
          'Bitte gib eine zweite Projekt-ID ein (oder deaktiviere das Feature).'
        );
      }
      if (useSecond && !/^\d+$/.test(projectAttempt2)) {
        return fail(projectId2InputElement, projectId2StatusElement, 'Zweite Projekt-ID darf nur Zahlen enthalten.');
      }

      const entry = {};
      const changedFields = [];
      if (projectAttempt !== projectSettings.projectId) {
        entry.projectId = projectAttempt;
        changedFields.push(projectIdInputElement);
      }
      if (portalAttempt !== projectSettings.portalBaseUrl) {
        entry.portalBaseUrl = portalAttempt;
        changedFields.push(portalUrlInputElement);
      }
      if (projectAttempt2 !== (projectSettings.projectId2 || '')) {
        entry.portalProjectId2 = projectAttempt2;
        changedFields.push(projectId2InputElement);
      }
      if (useSecond !== (projectSettings.useSecondPortalProjectId || false)) {
        entry.useSecondPortalProjectId = useSecond;
        changedFields.push(projectId2InputElement);
      }
      if (actionsAttempt !== (projectSettings.ticketActions || '').trim()) {
        entry.ticketActions = actionsAttempt;
        changedFields.push(ticketActionsInputElement);
      }
      if (!changedFields.length) return;

      writeProjectConfigEntry(projectSettings.projectKey, entry);
      if (entry.projectId) projectSettings.projectId = entry.projectId;
      if (entry.portalBaseUrl) projectSettings.portalBaseUrl = entry.portalBaseUrl;
      if (entry.portalProjectId2 !== undefined) projectSettings.projectId2 = entry.portalProjectId2;
      if (entry.useSecondPortalProjectId !== undefined) {
        projectSettings.useSecondPortalProjectId = entry.useSecondPortalProjectId;
      }
      if (entry.ticketActions !== undefined) projectSettings.ticketActions = entry.ticketActions;
      [projectStatusElement, portalStatusElement, projectId2StatusElement].forEach(function (el) {
        if (el) el.textContent = '';
      });
      [projectIdInputElement, portalUrlInputElement, projectId2InputElement].forEach(function (el) {
        el.removeAttribute('aria-invalid');
      });
      changedFields.forEach(function (el) {
        if (el) flashSaved(el);
      });
      // Portal-relevante Änderungen: Cache leeren und neu laden (ohne Seiten-Reload)
      if (entry.projectId || entry.portalBaseUrl || entry.portalProjectId2 !== undefined ||
        entry.useSecondPortalProjectId !== undefined) {
        clearProgressCache();
        clearProjectRequestBlock(projectSettings.projectKey);
        softRefresh(projectSettings);
      }
    }

    function scheduleAutosave() {
      clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(commitProjectConfig, 700);
    }

    gearWrapper.appendChild(gearButton);
    document.body.appendChild(dropdown);
    bar.appendChild(gearWrapper);

    let dropdownLocked = false;

    function updateDropdownVisibility() {
      const isOpen = dropdownLocked;
      dropdown.style.opacity = isOpen ? '1' : '0';
      dropdown.style.transform = isOpen ? 'translateX(0)' : 'translateX(32px)';
      dropdown.style.pointerEvents = isOpen ? 'auto' : 'none';
      dropdown.style.visibility = isOpen ? 'visible' : 'hidden';
      dropdown.style.transition = isOpen
        ? 'opacity 0.2s ease, transform 0.2s ease, visibility 0s'
        : 'opacity 0.2s ease, transform 0.2s ease, visibility 0s linear 0.2s';
      gearButton.setAttribute('aria-expanded', String(isOpen));
    }

    function setDropdownOpen(open, restoreFocus) {
      dropdownLocked = open;
      if (open) {
        // unter der GitLab-Top-Bar andocken
        const topbar = document.querySelector('header.super-topbar, header[class*="topbar"], .top-bar-fixed');
        dropdown.style.top = (topbar ? Math.round(topbar.getBoundingClientRect().bottom) + 1 : 49) + 'px';
      }
      if (open && refreshAgeHighlightSection) refreshAgeHighlightSection();
      updateDropdownVisibility();
      if (open) {
        const firstFocusable = dropdown.querySelector('input, button, summary, textarea');
        if (firstFocusable) firstFocusable.focus();
      } else if (restoreFocus) {
        gearButton.focus();
      }
    }

    gearButton.addEventListener('click', function () {
      setDropdownOpen(!dropdownLocked, true);
    });
    closeButton.addEventListener('click', function () {
      setDropdownOpen(false, true);
    });

    const onDocumentClick = function (event) {
      if (!dropdownLocked || gearWrapper.contains(event.target) || dropdown.contains(event.target)) {
        return;
      }
      setDropdownOpen(false, false);
    };
    const onDocumentKeydown = function (event) {
      if (event.key === 'Escape' && dropdownLocked) {
        setDropdownOpen(false, true);
      }
    };
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onDocumentKeydown);
    // beim Neuaufbau (Theme-Wechsel) Listener wieder entfernen
    bar.ambientCleanup = function () {
      document.removeEventListener('click', onDocumentClick);
      document.removeEventListener('keydown', onDocumentKeydown);
      dropdown.remove();
    };

    updateReleaseNotificationUI(getCachedReleaseInfo());
    updateGearLabel();
    insertParent.appendChild(bar);
    refreshPortalBaseWarning(projectSettings);
    return bar;
  }

  function repositionToolbarIfNeeded() {
    const bar = document.getElementById('ambient-progress-toolbar');
    if (!bar) return;
    for (let si = 0; si < TOOLBAR_TARGET_SELECTORS.length; si++) {
      const candidate = document.querySelector(TOOLBAR_TARGET_SELECTORS[si]);
      if (candidate) {
        if (bar.parentNode !== candidate) {
          log('[reposition] Verschiebe Toolbar → ' + candidate.tagName + '#' + candidate.id);
          candidate.appendChild(bar);
        }
        return;
      }
    }
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
      icon.innerHTML = mergeRequestIconSvg();
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
    linksBar.appendChild(makeMrIconLink('assignee_username', 'A', '#10b981', 'Meine MRs'));
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

    const wrapper = document.querySelector(SEL.breadcrumbsWrapper);
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
    fontSize: '0.85rem',
    fontWeight: '600',
    opacity: '0.85'
  };

  // Beschriftung über Formularfeldern
  const FIELD_LABEL_STYLES = {fontSize: '0.85rem', fontWeight: '600'};
  const FIELD_HINT_STYLES = {fontSize: '0.78rem', opacity: '0.65', lineHeight: '1.35'};

  const CARD_STYLES = {
    display: 'flex',
    flexDirection: 'column',
    border: '1px solid var(--gl-border-color-default, #4c4b51)',
    borderRadius: '10px',
    background: 'var(--gl-background-color-subtle, rgba(128, 128, 128, 0.07))'
  };

  // Aufklappbare Karte (Titel + Untertitel, Chevron rechts); Inhalt hängt direkt am <details>
  function createCollapsibleGroup(title, subtitle, open) {
    const details = document.createElement('details');
    details.open = Boolean(open);
    details.className = 'ambient-card';
    applyStyles(details, CARD_STYLES);
    applyStyles(details, {overflow: 'hidden', paddingBottom: open ? '0.75rem' : '0'});
    details.addEventListener('toggle', function () {
      details.style.paddingBottom = details.open ? '0.75rem' : '0';
    });
    const summary = document.createElement('summary');
    summary.className = 'ambient-chevron-right';
    applyStyles(summary, {display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '0.8rem 1rem'});
    const text = document.createElement('div');
    applyStyles(text, {display: 'flex', flexDirection: 'column', gap: '0.1rem'});
    text.appendChild(createTextSpan(title, {fontSize: '1rem', fontWeight: '700'}));
    text.appendChild(createTextSpan(subtitle, {fontSize: '0.8rem', opacity: '0.65'}));
    summary.appendChild(text);
    details.appendChild(summary);
    return details;
  }

  // Unterbereich innerhalb einer Karte: Trennlinie oben, Chevron links
  function createCollapsible(title, open) {
    const details = document.createElement('details');
    details.open = Boolean(open);
    applyStyles(details, {
      margin: '0.5rem 1rem 0',
      padding: '0.6rem 0 0',
      borderTop: '1px solid var(--gl-border-color-default, #4c4b51)'
    });
    const summary = document.createElement('summary');
    summary.className = 'ambient-chevron-left';
    summary.textContent = title;
    applyStyles(summary, Object.assign({cursor: 'pointer', padding: '0.2rem 0'}, SETTINGS_SUBHEADING_STYLES));
    const body = document.createElement('div');
    applyStyles(body, {paddingTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.6rem'});
    details.appendChild(summary);
    details.appendChild(body);
    return {element: details, body: body};
  }

  // Schalter in zwei Spalten, solange das Panel breit genug ist
  function createSwitchGrid() {
    const grid = document.createElement('div');
    applyStyles(grid, {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
      gap: '0.1rem 0.75rem'
    });
    return grid;
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
      ['columnAge', 'Verweildauer (Uhr im Footer)'],
      ['splitLabels', 'workflow::-Labels als Split-Label']
    ]},
    {title: 'Spalten', items: [
      ['columnAvg', 'Median-Verweildauer im Header']
    ]},
    {title: 'Andere Ansichten', items: [
      ['mrLinks'],
      ['issueDetail', 'Progress im Issue-Detail'],
      ['mrPageProgress', 'Progress im MR'],
      ['mrAssigneeButtons', 'Ticket-Assignee-Buttons im MR']
    ]}
  ];

  /******************************************************************
   * Diagnose- und Daten-Werkzeuge (Einstellungen → Globale Einstellungen → Erweitert)
   ******************************************************************/

  // Selektoren, die auf der aktuellen Ansicht Treffer liefern sollten
  function getRelevantSelectorKeys() {
    if (isMergeRequestPage()) return ['mrTitle', 'mrAssigneeBlock', 'breadcrumbsWrapper'];
    const keys = ['breadcrumbsWrapper'];
    if (isBoardView()) {
      keys.push('boardsApp', 'boardList', 'boardCard', 'boardListHeader', 'boardListButtons',
        'listTitle', 'cardNumber', 'cardFooter', 'cardBody');
    }
    if (shouldAttemptIssueDetailInjection()) keys.push('detailWrapper');
    return keys;
  }

  function collectSelectorReport() {
    return getRelevantSelectorKeys().map(function (key) {
      let count = 0;
      try {
        count = document.querySelectorAll(SEL[key]).length;
      } catch (e) {
        count = 0;
      }
      return {key: key, selector: SEL[key], count: count};
    });
  }

  function runSelectorSelftest() {
    const report = collectSelectorReport();
    const missing = report.filter(function (r) { return r.count === 0; });
    console.log(LOG_PREFIX, 'Selektor-Selbsttest', report);
    showToast({
      text: missing.length
        ? 'Selbsttest: ohne Treffer → ' + missing.map(function (r) { return r.key; }).join(', ') +
        ' (Details in der Konsole)'
        : 'Selbsttest: alle ' + report.length + ' Selektoren gefunden.',
      variant: missing.length ? 'warning' : 'success'
    });
  }

  // Ohne Portal-URL, Zugangsdaten oder Ticketdaten – nur das, was für einen Fehlerbericht nötig ist
  function buildDebugInfo() {
    const lines = [
      'Script-Version: ' + SCRIPT_VERSION +
      (typeof GM_info !== 'undefined' && GM_info.script ? ' (Tampermonkey: ' + GM_info.script.version + ')' : ''),
      'Ansicht: ' + (isMergeRequestPage() ? 'Merge Request' : isBoardView() ? 'Board' : isIssueDetailView() ? 'Issue' : 'andere'),
      'Browser: ' + navigator.userAgent,
      'Features: ' + JSON.stringify(features),
      'Selektoren:'
    ];
    collectSelectorReport().forEach(function (r) {
      lines.push('  ' + r.key + ': ' + r.count);
    });
    return lines.join('\n');
  }

  function copyToClipboard(text, successMessage) {
    const done = function () { showToast({text: successMessage, variant: 'success'}); };
    const failed = function () {
      console.log(LOG_PREFIX, text);
      showToast({text: 'Kopieren nicht möglich – Text steht in der Konsole.', variant: 'warning'});
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, failed);
    } else {
      failed();
    }
  }

  // Export/Import der Projekt-Konfiguration (nie Zugangsdaten – die gibt es nicht)
  function exportProjectConfig(projectSettings) {
    const data = {
      projectId: projectSettings.projectId || '',
      portalBaseUrl: projectSettings.portalBaseUrl || '',
      portalProjectId2: projectSettings.projectId2 || '',
      useSecondPortalProjectId: Boolean(projectSettings.useSecondPortalProjectId),
      ticketActions: projectSettings.ticketActions || ''
    };
    copyToClipboard(JSON.stringify(data, null, 2), 'Konfiguration in die Zwischenablage kopiert.');
  }

  function importProjectConfig(projectSettings) {
    const raw = window.prompt('Exportierte Konfiguration (JSON) einfügen:');
    if (!raw) return;
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      showToast({text: 'Import fehlgeschlagen: kein gültiges JSON.', variant: 'warning'});
      return;
    }
    applyProjectConfigData(projectSettings, data);
  }

  // Validiert und speichert eine Konfiguration (Import-Dialog und Konfig-Link teilen sich das)
  function applyProjectConfigData(projectSettings, data) {
    const portalBaseUrl = normalizePortalBaseUrl(data && data.portalBaseUrl);
    const useSecond = Boolean(data && data.useSecondPortalProjectId);
    const projectId2 = String((data && data.portalProjectId2) || '');
    if (!data || !isNumericId(data.projectId) || !portalBaseUrl || (projectId2 && !isNumericId(projectId2)) ||
      (useSecond && !projectId2)) {
      showToast({text: 'Import fehlgeschlagen: Projekt-ID/Portal-URL ungültig.', variant: 'warning'});
      return false;
    }
    writeProjectConfigEntry(projectSettings.projectKey, {
      projectId: String(data.projectId),
      portalBaseUrl: portalBaseUrl,
      portalProjectId2: projectId2,
      useSecondPortalProjectId: useSecond,
      ticketActions: String(data.ticketActions || '')
    });
    clearProgressCache();
    showToast({text: 'Konfiguration importiert – Seite wird neu geladen.', variant: 'success'});
    setTimeout(function () { window.location.reload(); }, 400);
    return true;
  }

  // Experiment expConfigLink: Konfiguration als Link (#ptp-config=…) teilen; Empfänger bestätigt vor dem Übernehmen
  const CONFIG_LINK_PREFIX = '#ptp-config=';

  function buildConfigLink(projectSettings) {
    const data = {
      projectId: projectSettings.projectId || '',
      portalBaseUrl: projectSettings.portalBaseUrl || '',
      portalProjectId2: projectSettings.projectId2 || '',
      useSecondPortalProjectId: Boolean(projectSettings.useSecondPortalProjectId),
      ticketActions: projectSettings.ticketActions || ''
    };
    const encoded = window.btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    return window.location.origin + window.location.pathname + CONFIG_LINK_PREFIX + encodeURIComponent(encoded);
  }

  function copyConfigLink(projectSettings) {
    if (!window.confirm('Der Link enthält Portal-URL und Ticket-Aktionen. Nur intern teilen. Link kopieren?')) return;
    copyToClipboard(buildConfigLink(projectSettings), 'Konfig-Link kopiert.');
  }

  function importConfigFromLocationHash(projectSettings) {
    const hash = window.location.hash || '';
    if (!isExp('expConfigLink') || hash.indexOf(CONFIG_LINK_PREFIX) !== 0) return;
    let data = null;
    try {
      data = JSON.parse(decodeURIComponent(escape(window.atob(decodeURIComponent(hash.slice(CONFIG_LINK_PREFIX.length))))));
    } catch (e) {
      showToast({text: 'Konfig-Link ungültig.', variant: 'warning'});
    }
    history.replaceState(null, '', window.location.pathname + window.location.search);
    if (!data) return;
    const portal = normalizePortalBaseUrl(data.portalBaseUrl);
    if (!portal) {
      showToast({text: 'Konfig-Link: Portal-URL ungültig.', variant: 'warning'});
      return;
    }
    if (window.confirm('Konfiguration aus Link übernehmen?\n\nPortal: ' + portal + '\nProjekt-ID: ' +
      String(data.projectId) + '\n\nNur übernehmen, wenn du dem Absender und dem Portal vertraust.')) {
      applyProjectConfigData(projectSettings, data);
    }
  }

  // Auto-Selbsttest: nach einem Script-Update einmal prüfen, ob GitLabs Markup noch passt
  function maybeRunAutoSelftest() {
    if (storageRead(LS_KEY_SELFTEST_VERSION, null) === SCRIPT_VERSION) return;
    setTimeout(function () {
      if (!showEnabled) return; // „Anzeigen" aus → auch kein Selbsttest-Toast; nächster Start versucht es erneut
      storageWrite(LS_KEY_SELFTEST_VERSION, SCRIPT_VERSION);
      const missing = collectSelectorReport().filter(function (r) { return r.count === 0; });
      log('Auto-Selbsttest nach Update auf', SCRIPT_VERSION, 'ohne Treffer:', missing.map(function (r) { return r.key; }));
      if (missing.length) {
        showToast({
          text: 'Auto-Selbsttest: ohne Treffer → ' + missing.map(function (r) { return r.key; }).join(', ') +
            ' – hat GitLab das Markup geändert?',
          variant: 'warning'
        });
      }
    }, 4000);
  }

  /******************************************************************
   * Experimente-Menü (Erweitert → Experimente)
   ******************************************************************/

  // Eingabefelder: GitLabs Formularklassen liefern Rahmen/Hintergrund passend zum Theme
  function flashSaved(el) {
    el.style.transition = 'border-color 0.3s ease, box-shadow 0.3s ease';
    el.style.borderColor = '#22c55e';
    el.style.boxShadow = '0 0 0 2px rgba(34, 197, 94, 0.35)';
    setTimeout(function () {
      el.style.borderColor = '';
      el.style.boxShadow = '';
    }, 1200);
  }

  const FORM_INPUT_CLASSES = 'form-control gl-form-input';
  const EXPERIMENT_INPUT_STYLES = {
    padding: '0.4rem 0.6rem',
    fontSize: '0.9rem',
    width: '100%',
    boxSizing: 'border-box'
  };

  function createExperimentSettingField(labelText, key, fallback, options) {
    const opts = options || {};
    const wrap = document.createElement('label');
    applyStyles(wrap, {display: 'flex', flexDirection: 'column', gap: '0.3rem', padding: '0 0.6rem'});
    wrap.appendChild(createTextSpan(labelText, FIELD_LABEL_STYLES));
    const input = document.createElement(opts.multiline ? 'textarea' : 'input');
    input.className = FORM_INPUT_CLASSES;
    if (opts.multiline) input.rows = 3;
    input.value = String(expSetting(key, fallback));
    input.placeholder = opts.placeholder || '';
    applyStyles(input, EXPERIMENT_INPUT_STYLES);
    input.addEventListener('change', function () {
      saveExperiment(key, opts.number ? Number(input.value) || fallback : input.value.trim());
      applyExperimentChange();
      flashSaved(input);
    });
    wrap.appendChild(input);
    return wrap;
  }

  function createExperimentButton(text, title, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.title = title;
    button.className = 'ambient-btn btn gl-button btn-default btn-sm';
    applyStyles(button, {width: '100%', justifyContent: 'flex-start'});
    button.addEventListener('click', onClick);
    return button;
  }

  function createExperimentsSection(projectSettings) {
    const section = createCollapsible('Experimente (zum Testen)', false);
    const intro = document.createElement('div');
    intro.style.padding = '0 0.6rem';
    intro.textContent = 'Noch nicht übernommene Ideen, standardmäßig aus. Änderungen wirken sofort auf dem Board.';
    applyStyles(intro, FIELD_HINT_STYLES);
    section.body.appendChild(intro);

    const switches = {};
    const extraFields = {};
    const extraButtons = {
      expConfigLink: function () {
        return createExperimentButton('Konfig-Link kopieren', 'Projekt-Konfiguration als Link teilen', function () {
          copyConfigLink(projectSettings);
        });
      }
    };

    EXPERIMENT_MENU.forEach(function (group) {
      const groupElem = document.createElement('div');
      applyStyles(groupElem, {display: 'flex', flexDirection: 'column', gap: '0.25rem'});
      const heading = document.createElement('div');
      heading.textContent = group.title;
      applyStyles(heading, Object.assign({padding: '0 0.6rem'}, SETTINGS_SUBHEADING_STYLES));
      groupElem.appendChild(heading);
      group.items.forEach(function (item) {
        const key = item[0];
        const row = makeSwitch(t(item[1]), isExp(key), function (val) {
          saveExperiment(key, val);
          applyExperimentChange();
        });
        applyStyles(row, {justifyContent: 'space-between'});
        switches[key] = row;
        groupElem.appendChild(row);
        (extraFields[key] || []).forEach(function (def) {
          groupElem.appendChild(createExperimentSettingField(def[0], def[1], def[2], def[3]));
        });
        if (extraButtons[key]) groupElem.appendChild(extraButtons[key]());
      });
      section.body.appendChild(groupElem);
    });

    const allButtons = document.createElement('div');
    applyStyles(allButtons, {display: 'flex', gap: '0.4rem'});
    [['Alle an', true], ['Alle aus', false]].forEach(function (def) {
      allButtons.appendChild(createExperimentButton(def[0], def[0] + ' (nur Schalter, Werte bleiben)', function () {
        Object.keys(switches).forEach(function (key) {
          const input = switches[key].querySelector('input');
          if (!input || input.checked === def[1]) return;
          input.checked = def[1];
          input.dispatchEvent(new Event('change')); // speichert und aktualisiert den Schalter-Look
        });
      }));
    });
    section.body.appendChild(allButtons);
    return section.element;
  }

  // Alles entfernen, was das Script lokal gespeichert hat
  function clearAllScriptData() {
    if (!window.confirm('Alle lokal gespeicherten Daten des Scripts löschen (Konfiguration, Cache, Einstellungen)?')) {
      return;
    }
    try {
      Object.keys(window.localStorage).forEach(function (key) {
        if (key.indexOf('portalProgress') === 0 || key.indexOf('ambientProgress') === 0) {
          window.localStorage.removeItem(key);
        }
      });
    } catch (e) {
      error('Löschen der lokalen Daten fehlgeschlagen:', e);
    }
    window.location.reload();
  }

  function showPortalErrors() {
    console.table(portalErrorLog.map(function (entry) {
      return {zeit: new Date(entry.at).toLocaleTimeString(uiLocale()), ticket: '#' + entry.issueIid, fehler: describePortalError(entry.reason)};
    }));
    showToast({
      text: portalErrorLog.length
        ? 'Letzte Fehler: ' + portalErrorLog.slice(-5).map(function (entry) {
          return '#' + entry.issueIid + ' ' + describePortalError(entry.reason);
        }).join(' · ') + ' (alle in der Konsole)'
        : 'Keine Portal-Fehler in dieser Sitzung.',
      variant: portalErrorLog.length ? 'warning' : 'success',
      duration: 9000
    });
  }

  // Zielreihenfolge: stabil nach Schlüssel sortiert; „unassigned" = zugewiesene hinter unzugewiesene,
  // „assignee" = zusätzlich je Person (erster Assignee) zusammengefasst, Unassigned zuerst.
  function assigneeSortKey(issue, mode) {
    const first = issue.assignees && issue.assignees[0];
    if (!first) return '0';
    return mode === 'assignee' ? '1' + String(first.name || first.username || '').toLowerCase() : '1';
  }

  // Minimale Verschiebungen, um die aktuelle Reihenfolge in die Zielreihenfolge zu bringen:
  // von oben nach unten jede falsch stehende Karte hinter ihren Zielvorgänger setzen (bzw. an die Spitze).
  function planReorder(issues, mode) {
    const target = issues.map(function (issue, index) { return {issue: issue, index: index, key: assigneeSortKey(issue, mode)}; })
      .sort(function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : a.index - b.index; })
      .map(function (entry) { return entry.issue; });
    const current = issues.slice();
    const moves = [];
    for (let i = 0; i < target.length; i++) {
      if (current[i] === target[i]) continue;
      moves.push(i === 0
        ? {iid: target[i].iid, move_before_id: current[0].id}
        : {iid: target[i].iid, move_after_id: target[i - 1].id});
      current.splice(current.indexOf(target[i]), 1);
      current.splice(i, 0, target[i]);
    }
    return moves;
  }

  // Ändert die gespeicherte Reihenfolge (relative_position) einer Spalte – also für alle Teammitglieder sichtbar
  function sortBoardColumns(projectSettings, mode, columnLabel) {
    const projectPath = projectSettings && projectSettings.projectPath;
    if (!projectPath || !columnLabel) return;
    const labels = [columnLabel];
    if (!window.confirm('Die Reihenfolge ändert sich für ALLE im Team.\n\n' +
      (mode === 'assignee' ? 'Tickets werden nach Assignee gruppiert (Unassigned zuerst)' : 'Tickets ohne Assignee werden nach oben sortiert') +
      ' in der Spalte „' + columnLabel + '“.\n\nFortfahren?')) {
      return;
    }
    const base = '/api/v4/projects/' + encodeURIComponent(projectPath) + '/issues';
    let moved = 0;
    labels.reduce(function (chain, label) {
      return chain.then(function () {
        // ponytail: per_page=100, keine Paginierung – ab 100 offenen Tickets pro Spalte fehlen die hinteren
        return glFetch(base + '?state=opened&labels=' + encodeURIComponent(label) +
          '&order_by=relative_position&sort=asc&per_page=100')
          .then(function (res) {
            if (!res.ok) throw new Error('Tickets laden: HTTP ' + res.status);
            return res.json();
          })
          .then(function (issues) {
            return planReorder(issues, mode).reduce(function (inner, move) {
              return inner.then(function () {
                const body = move.move_after_id ? {move_after_id: move.move_after_id} : {move_before_id: move.move_before_id};
                return glFetch(base + '/' + move.iid + '/reorder', {method: 'PUT', body: JSON.stringify(body)})
                  .then(function (res) {
                    if (!res.ok) throw new Error('Verschieben von #' + move.iid + ': HTTP ' + res.status);
                    moved++;
                  });
              });
            }, Promise.resolve());
          });
      });
    }, Promise.resolve())
      .then(function () {
        showToast({text: moved + ' Ticket(s) verschoben – lade neu…', variant: 'success'});
        setTimeout(function () { window.location.reload(); }, 800);
      })
      .catch(function (err) {
        error('Sortierung fehlgeschlagen:', err);
        showToast({text: 'Sortierung abgebrochen: ' + err.message + (moved ? ' (' + moved + ' bereits verschoben)' : ''), variant: 'warning'});
      });
  }

  function createDataToolButtons(projectSettings) {
    const defs = [
      ['Selektor-Selbsttest', 'Prüft, ob die GitLab-Elemente gefunden werden, auf die sich das Script verlässt', runSelectorSelftest],
      ['Debug-Info kopieren', 'Version, Ansicht und Selektor-Treffer für Fehlerberichte (ohne Portal-URL)', function () {
        copyToClipboard(buildDebugInfo(), 'Debug-Info kopiert.');
      }]
    ];
    if (projectSettings) {
      defs.push(['Konfiguration exportieren', 'Projekt-ID, Portal-URL und Ticket-Aktionen als JSON kopieren', function () {
        exportProjectConfig(projectSettings);
      }]);
      defs.push(['Konfiguration importieren', 'Zuvor exportiertes JSON einfügen', function () {
        importProjectConfig(projectSettings);
      }]);
    }
    defs.push(['Portal-Fehler anzeigen', 'Letzte Portal-Fehler dieser Seitensitzung (Toast + Konsole)', showPortalErrors]);
    defs.push(['Alle lokalen Daten löschen', 'Entfernt Konfiguration, Cache und Einstellungen dieses Scripts', clearAllScriptData]);
    return defs.map(function (def) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = def[0];
      button.title = def[1];
      button.className = 'ambient-btn btn gl-button btn-default btn-sm';
      applyStyles(button, {width: '100%', justifyContent: 'flex-start'});
      button.addEventListener('click', def[2]);
      return button;
    });
  }

  function createGlobalSettingsSection(mrLinksToggle, debugToggle, projectSettings, onFeatureChanged) {
    // Globale Einstellungen ändern sich selten → standardmäßig zugeklappt
    const section = createCollapsibleGroup(t('Globale Einstellungen'), t('Gelten für alle Boards'), false);
    const subRows = [];

    function updateSubRows() {
      subRows.forEach(function (row) {
        setSettingDisabled(row.elem, !isFeatureOn(FEATURE_PARENTS[row.key]));
      });
    }

    FEATURE_MENU.forEach(function (group) {
      const groupElem = document.createElement('div');
      applyStyles(groupElem, {display: 'flex', flexDirection: 'column', gap: '0.25rem', padding: '0.5rem 1rem 0'});
      const heading = document.createElement('div');
      heading.textContent = t(group.title);
      applyStyles(heading, Object.assign({padding: '0 0.6rem'}, SETTINGS_SUBHEADING_STYLES));
      groupElem.appendChild(heading);
      const grid = createSwitchGrid();
      groupElem.appendChild(grid);
      group.items.forEach(function (item) {
        const key = item[0];
        const row = key === 'mrLinks'
          ? mrLinksToggle
          : makeSwitch(t(item[1]), features[key] !== false, function (val) {
            saveFeature(key, val);
            updateSubRows();
            onFeatureChanged();
          });
        if (FEATURE_PARENTS[key]) {
          row.style.paddingLeft = '1.8rem';
          subRows.push({key: key, elem: row});
        }
        grid.appendChild(row);
      });
      section.appendChild(groupElem);
    });

    const advanced = createCollapsible(t('Erweitert'), false);
    const advancedSwitches = createSwitchGrid();
    advancedSwitches.appendChild(debugToggle);
    const languageToggle = makeSwitch('Englische Oberfläche (teilweise, Reload nötig)', experiments.english === true, function (val) {
      saveExperiment('english', val);
      showToast({text: val ? 'Language changes after reload.' : 'Sprache ändert sich nach dem Neuladen.', variant: 'info'});
    });
    advancedSwitches.appendChild(languageToggle);
    advanced.body.appendChild(advancedSwitches);
    const extraIdsField = createExperimentSettingField('Weitere Portal-Projekt-IDs (Komma, max. 3) – zusätzliche Balken',
      'extraProjectIds', '', {placeholder: '1234, 5678'});
    advanced.body.appendChild(extraIdsField);
    const toolGrid = document.createElement('div');
    applyStyles(toolGrid, {display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.5rem', padding: '0 0.6rem'});
    createDataToolButtons(projectSettings).forEach(function (button) {
      toolGrid.appendChild(button);
    });
    advanced.body.appendChild(toolGrid);
    section.appendChild(advanced.element);
    section.appendChild(createExperimentsSection(projectSettings));

    mrLinksToggle.querySelector('span').textContent = t('MR-Buttons in der Topbar');
    updateSubRows();
    return section;
  }

  function createAgeHighlightSection(projectSettings) {
    const panelBackground = getGitLabWindowBackgroundColor(true);
    const panelTextColor = getToolbarForegroundColor();
    const section = document.createElement('div');
    applyStyles(section, {
      padding: '0.25rem 1rem 0',
      width: '100%',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.45rem',
      color: panelTextColor
    });
    const heading = document.createElement('div');
    heading.textContent = 'Roter Rahmen bei Median-Überschreitung';
    applyStyles(heading, FIELD_LABEL_STYLES);
    const hint = document.createElement('div');
    hint.textContent = 'Spalten, in denen Tickets über dem Spalten-Median rot umrandet werden.';
    applyStyles(hint, FIELD_HINT_STYLES);

    // <details> als Combobox: Summary zeigt Auswahl, aufgeklappt Checkbox-Liste
    const combo = document.createElement('details');
    // contain: Auswahltext darf das Menü nicht verbreitern, Summary kürzt mit Ellipsis
    applyStyles(combo, {position: 'relative', width: '100%', contain: 'inline-size'});
    const summary = document.createElement('summary');
    applyStyles(summary, {
      padding: '0.4rem 0.6rem',
      borderRadius: '6px',
      border: '1px solid var(--gl-border-color-strong, #374151)',
      background: panelBackground,
      color: panelTextColor,
      fontSize: '0.9rem',
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
      border: '1px solid var(--gl-border-color-strong, #374151)',
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
        ? 'Spalten, in denen Tickets über dem Spalten-Median rot umrandet werden.'
        : 'Benötigt die globale Einstellung „Verweildauer".';
      options.innerHTML = '';
      const labels = [];
      document.querySelectorAll(SEL.boardList).forEach(function (boardListElem) {
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
          document.querySelectorAll(SEL.boardList).forEach(updateColumnAgeAverage);
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
    applyStyles(section, {
      padding: '0.25rem 0 0.5rem',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.45rem',
      color: panelTextColor
    });
    const heading = document.createElement('div');
    heading.textContent = 'Portal-Projekt-ID';
    applyStyles(heading, FIELD_LABEL_STYLES);

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
    input.className = FORM_INPUT_CLASSES;
    applyStyles(input, {flex: '1 1 auto', padding: '0.4rem 0.6rem', fontSize: '0.9rem'});
    projectIdInputElement = input;

    const status = document.createElement('div');
    applyStyles(status, {
      fontSize: '0.75rem',
      color: '#f87171',
      minHeight: '0'
    });

    projectStatusElement = status;
    status.id = 'ambient-project-status';
    status.setAttribute('role', 'alert');
    input.setAttribute('aria-describedby', status.id);
    input.setAttribute('aria-label', 'Portal-Projekt-ID');

    input.addEventListener('input', function () {
      status.textContent = '';
      input.removeAttribute('aria-invalid');
      if (typeof onValuesChanged === 'function') {
        onValuesChanged();
      }
    });

    formRow.appendChild(input);
    section.appendChild(heading);
    section.appendChild(formRow);
    section.appendChild(status);

    const portalHeading = document.createElement('div');
    portalHeading.textContent = 'Portal-Base URL';
    applyStyles(portalHeading, FIELD_LABEL_STYLES);

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
    portalInput.className = FORM_INPUT_CLASSES;
    applyStyles(portalInput, {flex: '1 1 auto', padding: '0.4rem 0.6rem', fontSize: '0.9rem'});
    portalUrlInputElement = portalInput;

    const portalStatus = document.createElement('div');
    applyStyles(portalStatus, {
      fontSize: '0.75rem',
      color: '#f87171',
      minHeight: '0'
    });
    portalStatusElement = portalStatus;
    portalStatus.id = 'ambient-portal-status';
    portalStatus.setAttribute('role', 'alert');
    portalInput.setAttribute('aria-describedby', portalStatus.id);
    portalInput.setAttribute('aria-label', 'Portal-Base URL');

    portalInput.addEventListener('input', function () {
      portalStatus.textContent = '';
      portalInput.removeAttribute('aria-invalid');
      if (typeof onValuesChanged === 'function') {
        onValuesChanged();
      }
    });

    portalRow.appendChild(portalInput);
    section.appendChild(portalHeading);
    section.appendChild(createTextSpan('Nur https://, ohne Benutzername/Passwort. Wird nur lokal gespeichert.', FIELD_HINT_STYLES));
    section.appendChild(portalRow);
    section.appendChild(portalStatus);


    const secondIdHeading = document.createElement('div');
    secondIdHeading.textContent = 'Zweite Portal-Projekt-ID';
    applyStyles(secondIdHeading, Object.assign({marginTop: '0.9rem'}, FIELD_LABEL_STYLES));

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
    input2.className = FORM_INPUT_CLASSES;
    applyStyles(input2, {flex: '1 1 auto', padding: '0.4rem 0.6rem', fontSize: '0.9rem',
      opacity: input2.disabled ? '0.4' : '1',
      cursor: input2.disabled ? 'not-allowed' : 'text'});
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
      color: '#f87171',
      minHeight: '0'
    });

    projectId2StatusElement = status2;
    status2.id = 'ambient-project2-status';
    status2.setAttribute('role', 'alert');
    input2.setAttribute('aria-describedby', status2.id);
    input2.setAttribute('aria-label', 'Zweite Portal-Projekt-ID');

    input2.addEventListener('input', function () {
      status2.textContent = '';
      input2.removeAttribute('aria-invalid');
      if (typeof onValuesChanged === 'function') {
        onValuesChanged();
      }
    });

    formRow2.appendChild(input2);
    section.appendChild(secondIdHeading);
    section.appendChild(toggleContainer);
    section.appendChild(formRow2);
    section.appendChild(status2);


    const actionsHeading = document.createElement('div');
    actionsHeading.textContent = 'Ticket-Aktionen im MR';
    applyStyles(actionsHeading, Object.assign({marginTop: '0.9rem'}, FIELD_LABEL_STYLES));

    const actionsInput = document.createElement('textarea');
    actionsInput.rows = 5;
    actionsInput.setAttribute('aria-label', 'Ticket-Aktionen im MR');
    actionsInput.placeholder = '[Ticket abschließen]\n/unassign me\n/label ~"workflow::Done"\n/unlabel ~"workflow::Review"';
    actionsInput.value = projectSettings.ticketActions || '';
    actionsInput.className = FORM_INPUT_CLASSES;
    applyStyles(actionsInput, {padding: '0.5rem 0.6rem', fontSize: '0.85rem', fontFamily: 'monospace', resize: 'vertical'});
    ticketActionsInputElement = actionsInput;
    actionsInput.addEventListener('input', function () {
      if (typeof onValuesChanged === 'function') {
        onValuesChanged();
      }
    });

    section.appendChild(actionsHeading);
    section.appendChild(createTextSpan('Eine Zeile [Name] startet einen Button, die Zeilen darunter sind seine Quick Actions.', FIELD_HINT_STYLES));
    section.appendChild(actionsInput);
    return section;
  }

  /******************************************************************
   * Init
   ******************************************************************/

  // Eigene Einfügungen (Badges, Toolbar, Toasts) lösen sonst selbst wieder Scans aus
  function isOwnNode(node) {
    const id = node.id || '';
    const cls = typeof node.className === 'string' ? node.className : '';
    return id.indexOf('ambient-') === 0 || id === 'js-my-mr-links' || cls.indexOf('ambient-') !== -1;
  }

  function hasForeignAddedNodes(mutations) {
    for (let i = 0; i < mutations.length; i++) {
      const added = mutations[i].addedNodes;
      for (let j = 0; added && j < added.length; j++) {
        if (added[j].nodeType === 1 && !isOwnNode(added[j])) return true;
      }
    }
    return false;
  }

  function init() {
    log('Userscript gestartet, URL:', window.location.href);

    if (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version !== SCRIPT_VERSION) {
      warn('SCRIPT_VERSION (' + SCRIPT_VERSION + ') passt nicht zu @version (' + GM_info.script.version + ')');
    }

    if (isMergeRequestPage()) {
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
    if (debugEnabled) {
      log('projectKey:', projectSettings.projectKey, 'projectPath:', projectSettings.projectPath);
    }

    currentScanContext = {hostConfig: hostConfig, projectSettings: projectSettings};
    installNoTriggerGuard();
    importConfigFromLocationHash(projectSettings);
    ensureStylesheet();
    window.addEventListener('pagehide', flushProgressCache);
    createToolbar(hostConfig, projectSettings);
    createMrLinksBar();

    scheduleReleaseCheck();
    applyShowFlagToAllBadges();
    applyShowFlagToDetailBadges();

    // Alle Scans laufen über einen einzigen, entprellten Einstieg; MR-Seite oder Board wird zur Laufzeit bestimmt
    function runScans() {
      repositionToolbarIfNeeded();
      repositionMrLinksIfNeeded();
      if (isFeatureOn('splitLabels')) {
        applySplitLabels(document.body); // auch Issue-Detail, Board-Drawer und MR-Seite
      }
      if (isMergeRequestPage()) {
        scanMergeRequestPage(hostConfig, projectSettings);
      } else {
        scanBoard(hostConfig, projectSettings);
        scanIssueDetail(hostConfig, projectSettings);
      }
    }

    let scanTimer = null;

    function scheduleScan() {
      if (scanTimer) return;
      scanTimer = setTimeout(function () {
        scanTimer = null;
        runScans();
      }, SCAN_DEBOUNCE_MS);
    }

    rescanHook = scheduleScan;
    maybeRunAutoSelftest();

    let initialScanDone = false;

    function tryInitialScan() {
      if (initialScanDone) return;
      initialScanDone = true;
      log('Initialer Scan');
      runScans();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryInitialScan);
    } else {
      tryInitialScan();
    }

    if (!document.body) {
      log('document.body nicht verfügbar; MutationObserver wird nicht gestartet.');
      return;
    }

    // Immer auf body beobachten: .boards-app kann bei Board-Wechseln neu gemountet werden
    new MutationObserver(function (mutations) {
      if (hasForeignAddedNodes(mutations)) {
        scheduleScan();
      }
    }).observe(document.body, {childList: true, subtree: true});

    // GitLab-Theme-Wechsel zur Laufzeit: Farb-Caches verwerfen und Toolbar neu aufbauen
    let lastDark = isGitLabDarkModeActive();
    new MutationObserver(function () {
      const dark = isGitLabDarkModeActive();
      if (dark === lastDark) return;
      lastDark = dark;
      gitlabWindowBackgroundCache.light = null;
      gitlabWindowBackgroundCache.default = null;
      const oldBar = document.getElementById('ambient-progress-toolbar');
      if (oldBar) {
        if (oldBar.ambientCleanup) oldBar.ambientCleanup();
        oldBar.remove();
      }
      const oldLinks = document.getElementById('js-my-mr-links');
      if (oldLinks) oldLinks.remove();
      createToolbar(hostConfig, projectSettings);
      createMrLinksBar();
    }).observe(document.documentElement, {attributes: true, attributeFilter: ['class', 'data-theme']});
  }

  init();
})
();
