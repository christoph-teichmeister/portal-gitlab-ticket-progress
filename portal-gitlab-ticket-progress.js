// ==UserScript==
// @name         Portal GitLab Ticket Progress
// @namespace    https://beyonder.de/
// @version      2026.10.52
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
  const SCRIPT_VERSION = '2026.10.52';
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
    cardTitleLink: '[data-testid="board-card-title-link"]',
    issueTitle: '[data-testid="work-item-title"], [data-testid="base-layout-sticky-header"] a.gl-font-bold',
    cardLabel: '.gl-label',
    detailWrapper: '.work-item-attributes-wrapper',
    detailAssignees: '[data-testid="work-item-assignees"]',
    mrTitle: 'h1[data-testid="title-content"]',
    mrStickyTitle: '.merge-request-sticky-title',
    mrAssigneeBlock: '[data-testid="assignee-block-container"]',
    breadcrumbsWrapper: '#js-vue-page-breadcrumbs-wrapper'
  };
  const TOOLBAR_TARGET_SELECTORS = [SEL.breadcrumbsWrapper, '.panel-header-inner-actions', '.top-bar-container', '.top-bar-fixed'];
  const warnedSelectors = {};

  function qs(root, key) {
    const el = (root || document).querySelector(SEL[key]);
    if (!el && debugEnabled && !warnedSelectors[key]) {
      warnedSelectors[key] = true;
      console.warn(LOG_PREFIX, 'Selektor ohne Treffer (GitLab-UI geändert?):', key, SEL[key]);
    }
    return el;
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
      // Schalter: natives role=switch-Checkbox, ganze Zeile ist das Label
      '.ambient-setting-row{display:flex;align-items:center;gap:.75rem;padding:.6rem 1rem;min-height:52px;box-sizing:border-box}' +
      '.ambient-switch-row{cursor:pointer;margin:0;font-weight:400}' +
      '.ambient-switch-compact{gap:.6rem;padding:.3rem .5rem .3rem .8rem;min-height:36px;border-radius:999px;border:1px solid var(--gl-border-color-default,#4c4b51)}' +
      '.ambient-switch-elbow{display:flex;flex:0 0 auto;opacity:.6;margin-top:-.9rem}' +
      '.ambient-switch-input{appearance:none;-webkit-appearance:none;position:relative;flex:0 0 auto;width:36px;height:20px;margin:0;border-radius:999px;background:#89888d;cursor:pointer;transition:background .2s ease}' +
      '.ambient-switch-input::before{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.35);transition:transform .2s ease}' +
      '.ambient-switch-input:checked{background:#1f75cb}' +
      '.ambient-switch-input:checked::before{transform:translateX(16px)}' +
      '.ambient-switch-input:focus-visible{outline:2px solid #60a5fa;outline-offset:2px}' +
      '.gl-label[data-ambient-split="1"]{display:none !important}' +
      // wie GitLabs Entfernen-Button: beim Hover ein runder Kreis in Label-Farbe hinter dem „×"
      '.ambient-split-label-close:hover,.ambient-split-label-close:focus-visible{background:var(--ambient-close-hover-bg) !important;color:var(--ambient-close-hover-fg) !important}' +
      // Dropdown-Menü wie GitLabs Dropdowns (z. B. Assignee-Auswahl): Panel mit Kopfzeile, Trennlinie, großzügigen Zeilen
      '.ambient-dropdown-menu{position:fixed;z-index:10000;min-width:220px;max-width:360px;max-height:60vh;overflow-y:auto;' +
      'padding:0 0 4px;border-radius:8px;border:1px solid var(--gl-border-color-default,#dcdcde);font-size:14px;' +
      'background:var(--gl-dropdown-background-color,var(--gl-background-color-overlap,var(--gl-background-color-default,#fff)));' +
      'color:var(--gl-text-color-default,#333238);box-shadow:0 4px 12px rgba(0,0,0,.3)}' +
      '.ambient-dropdown-title{display:block;padding:10px 12px;margin-bottom:4px;font-weight:700;border-bottom:1px solid var(--gl-border-color-default,#dcdcde)}' +
      '.ambient-dropdown-list{padding:0 4px}' +
      '.ambient-dropdown-item{display:block;width:100%;padding:8px 12px;border:none;border-radius:4px;background:transparent;color:inherit;font-size:14px;line-height:1.4;text-align:left;cursor:pointer}' +
      '.ambient-dropdown-item>span{display:block}' +
      '.ambient-dropdown-item:hover,.ambient-dropdown-item:focus-visible{background:var(--gl-background-color-strong,rgba(128,128,128,.18)) !important;outline:none}' +
      '.ambient-dropdown-toggle:hover{background:var(--gl-background-color-strong,rgba(128,128,128,.18)) !important}' +
      '.ambient-card-actions svg,.ambient-progress-sort-toggle svg{pointer-events:none}' +
      '.ambient-btn:not(.btn):not(.ambient-btn-primary):hover:not(:disabled){background:#374151 !important;border-color:#9ca3af !important;color:#fff !important}' +
      '.ambient-btn.btn:not(.btn-confirm):hover{background:var(--gl-background-color-strong,rgba(128,128,128,.18)) !important}' +
      '.ambient-split-label{min-width:0;max-width:100%;flex:0 1 auto}' +
      // seit dem GitLab-Update ohne #js-injected-page-breadcrumbs: MR-Buttons und Toolbar in die Breadcrumb-Zeile holen;
      // bei schmalem Fenster kürzen sich die Breadcrumbs, unsere Buttons bleiben rechts
      '#js-vue-page-breadcrumbs-wrapper:has(>#js-my-mr-links,>#ambient-progress-toolbar){display:flex;align-items:center;gap:.25rem}' +
      '#js-vue-page-breadcrumbs-wrapper:has(>#js-my-mr-links,>#ambient-progress-toolbar)>nav.gl-breadcrumbs{flex:1 1 auto;min-width:0}' +
      '#js-my-mr-links,#js-vue-page-breadcrumbs-wrapper>#ambient-progress-toolbar{flex:0 0 auto}' +
      '#js-my-mr-links{margin-left:auto}' +
      '.ambient-split-label>span:first-child{flex:0 0 auto}' +
      '.ambient-split-label>span:nth-child(2){min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      // GitLabs h2 hat hier Standard-Abstände (20px oben / 10px unten) und sitzt dadurch ~5px unter den Icons
      '[data-testid="board-list-header"] .board-title-text{min-width:0;margin-top:0 !important;margin-bottom:0 !important}' +
      // Zähler mit Median/SP-Summe nie stauchen: lange Spalten-Labels kürzen sich (Ellipse) statt dass „Σ 13 SP" umbricht
      '[data-testid="board-list-header"] [data-testid="issue-count-badge"]:has(.ambient-column-sp,.ambient-column-avg){flex-shrink:0}' +
      // Titel füllt die Kartenbreite, damit der Schätzungs-Badge (float) ganz rechts steht – links von GitLabs
      // Verschiebe-Menü, das beim Hover in der reservierten rechten Ecke erscheint
      '.board-card-title:has(.ambient-estimate-badge){flex-grow:1}' +
      '.board-card .ambient-estimate-badge{cursor:pointer;transition:margin-right .15s ease}' +
      // Bewegliche Spalten reservieren rechts 24px (gl-mr-6) für das Verschiebe-Menü, Closed nicht → Badge stand
      // unterschiedlich weit rechts. Menü liegt jetzt über der Ecke, der Badge weicht ihm nur beim Hover aus.
      '.board-card :has(> .board-card-title + .move-to-position){position:relative}' +
      '.board-card .board-card-title + .move-to-position{position:absolute;top:0;right:0}' +
      '.board-card .board-card-title:has(.ambient-estimate-badge):has(+ .move-to-position){margin-right:0 !important}' +
      '.board-card:is(:hover,:focus-within):has(.move-to-position) .ambient-estimate-badge{margin-right:28px}' +
      // Hover für das MR-Badge: Fläche per box-shadow vergrößert, damit sich das Layout nicht verschiebt
      '.ambient-mr-badge:hover{background:var(--gl-background-color-strong,rgba(128,128,128,.22));box-shadow:0 0 0 3px var(--gl-background-color-strong,rgba(128,128,128,.22));border-radius:4px;text-decoration:underline !important}' +
      // Einstellungs-Panel: rechts angedockt, unter der Top-Bar (`top` setzt das Öffnen); hängt am body, damit kein
      // transformierter Vorfahre position: fixed bricht. Platz für den Scrollbalken immer reservieren (sonst springt die
      // Breite zwischen Reitern), horizontal abschneiden (Einschieben der Reiter). Geschlossen: aus Tab-Reihenfolge und
      // Screenreader-Baum (visibility), fährt nach rechts hinaus ohne Ausblenden.
      "#ambient-progress-settings{position:fixed;top:49px;right:0;bottom:0;z-index:260;display:flex;flex-direction:column;" +
      "width:clamp(480px,42vw,720px);max-width:100vw;padding:0;font-size:14px;box-sizing:border-box;" +
      "background:" + THEME_BG + ";color:" + THEME_FG + ";border-left:1px solid var(--gl-border-color-default,#4c4b51);" +
      "border-radius:12px 0 0 0;box-shadow:-8px 0 24px rgba(15,23,42,.35);overflow-y:auto;overflow-x:hidden;scrollbar-gutter:stable;" +
      "transform:translateX(calc(100% + 32px));visibility:hidden;pointer-events:none;transition:transform .25s ease-in,visibility 0s linear .25s}" +
      '#ambient-progress-settings.ambient-open{transform:none;visibility:visible;pointer-events:auto;transition:transform .25s ease-out,visibility 0s}' +
      // Einstellungs-Panel: Trennlinien zwischen Zeilen einer Karte, Zeilen- und Tab-Hover
      '#ambient-progress-settings [role=alert]:empty{display:none}' +
      '#ambient-progress-settings .ambient-setting-list>*+*:not(.ambient-row-extra){border-top:1px solid var(--gl-border-color-default,#4c4b51)}' +
      '#ambient-progress-settings .ambient-switch-row:hover{background:var(--gl-background-color-strong,rgba(128,128,128,.14))}' +
      // Segment-Umschalter (Unterreiter, Sprache): gewählter Knopf per aria-pressed
      '.ambient-seg{display:flex;flex:0 0 auto;gap:2px;padding:3px;border-radius:8px;border:1px solid var(--gl-border-color-default,#4c4b51)}' +
      '.ambient-seg>button{min-height:32px;padding:.2rem .75rem;border:0;border-radius:6px;background:transparent;color:inherit;font-size:.85rem;font-weight:500;white-space:nowrap;cursor:pointer;opacity:.7}' +
      '.ambient-seg>button[aria-pressed=true]{background:var(--gl-background-color-strong,rgba(128,128,128,.14));opacity:1}' +
      '.ambient-seg-fill>button{flex:1 1 0;padding:.2rem .5rem}' +
      '#ambient-progress-settings .ambient-tab{display:inline-flex;align-items:center;gap:.4rem;min-height:44px;padding:0 .75rem;border:0;border-radius:6px 6px 0 0;background:transparent;color:inherit;font-size:.9rem;white-space:nowrap;cursor:pointer;font-weight:400;opacity:.75}' +
      '#ambient-progress-settings .ambient-tab[aria-selected=true]{font-weight:600;opacity:1;box-shadow:inset 0 -2px 0 #1f75cb}' +
      '.ambient-tab-badge{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;box-sizing:border-box;border-radius:999px;font-size:.7rem;font-weight:600;background:var(--gl-background-color-strong,rgba(128,128,128,.25))}' +
      '.ambient-tab-badge:empty{display:none}' +
      '.ambient-tab-badge-warning{background:#e9be74;color:#1f1e24}' +
      '#ambient-progress-settings .ambient-tab:hover{background:var(--gl-background-color-strong,rgba(128,128,128,.14))}' +
      '#ambient-progress-settings code{padding:0.1rem 0.4rem;border-radius:4px;background:var(--gl-background-color-strong,rgba(128,128,128,.14))}' +
      // Toast oben rechts; Farbe je data-variant (info ist Standard)
      '#ambient-progress-toast{position:fixed;top:1rem;right:1rem;z-index:1050;max-width:320px;padding:.75rem 1.25rem;' +
      'border-radius:10px;box-shadow:0 15px 40px rgba(15,23,42,.35);font-size:.85rem;font-weight:600;line-height:1.4;' +
      'overflow:hidden;pointer-events:none;background:#0f172a;color:#d1d5db;transform:translateX(110%);opacity:0;' +
      'transition:transform .35s ease,opacity .35s ease}' +
      '#ambient-progress-toast.ambient-toast-visible{transform:none;opacity:1}' +
      '#ambient-progress-toast[data-variant=warning]{background:#fbbf24;color:#1f2937}' +
      '#ambient-progress-toast[data-variant=success]{background:#10b981;color:#0f172a}' +
      // Fortschrittsbalken: Segmente nebeneinander (float), Text darübergelegt; Füll-Animation nur bei frisch geladenen Daten
      '.ambient-bar{position:relative;height:16px;border-radius:999px;overflow:hidden;background:var(--gl-background-color-default,#18171d)}' +
      '.ambient-bar-fill{height:100%;float:left}' +
      '.ambient-bar-spent:hover{background:var(--ambient-hover) !important}' +
      '.ambient-bar-text{position:absolute;inset:0;display:flex;align-items:center;justify-content:space-between;padding:0 8px;pointer-events:none;color:#000}' +
      '.ambient-bar-grow{animation:ambient-grow .7s cubic-bezier(.22,1,.36,1)}' +
      '.ambient-bar-shrink{animation:ambient-shrink .7s cubic-bezier(.22,1,.36,1)}' +
      '.ambient-bar-animate{animation:ambient-fade-in .4s ease .3s backwards}' +
      '@keyframes ambient-grow{from{width:0}}' +
      '@keyframes ambient-shrink{from{width:100%}}' +
      '.ambient-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:24px;min-width:24px;height:24px;padding:0;flex:0 0 auto;position:relative;z-index:25}' +
      '.ambient-progress-row{display:flex;align-items:center;gap:6px}' +
      '.ambient-extra-row{margin-top:4px}' +
      '.ambient-progress-row-detail{gap:.35rem;font-size:12px;flex-wrap:wrap;width:100%}' +
      '.ambient-progress-detail-badge{margin-bottom:.6rem;padding:.45rem 0;border-radius:10px;background:' + THEME_BG + '}' +
      '.ambient-progress-mr-badge{padding:1rem 0;border-bottom:1px solid var(--gl-border-color-subtle);background:' + THEME_BG + '}' +
      '.ambient-mr-badge-merged{opacity:.6}.ambient-mr-badge-merged:hover{opacity:.8}' +
      // Buttons in der Breadcrumb-Zeile (Zahnrad, MR-Links) mit 20px-Icon und Punkt/Badge in der Ecke
      '.ambient-header-btn{padding:.35rem;display:inline-flex;align-items:center;justify-content:center;min-width:38px;min-height:38px;position:relative;overflow:visible;cursor:pointer;color:' + THEME_FG + '}' +
      '.ambient-header-icon{width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center}' +
      '.ambient-header-icon svg{width:20px;height:20px;display:block;fill:currentColor}' +
      '.ambient-header-dot{position:absolute;top:4px;width:10px;height:10px;border-radius:50%;background:#ef4444;box-shadow:0 0 0 2px ' + THEME_BG + ';pointer-events:none}' +
      '.ambient-mr-link-badge{position:absolute;bottom:2px;right:2px;min-width:12px;height:12px;padding:0 2px;border-radius:6px;color:#fff;font-size:9px;font-weight:700;line-height:12px;text-align:center;box-shadow:0 0 0 2px ' + THEME_BG + ';pointer-events:none}' +
      '.ambient-mr-link{opacity:.85}.ambient-mr-link:hover{opacity:1}' +
      '.ambient-sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}' +
      '.ambient-skeleton{border-radius:999px;animation:ambient-pulse 1.2s ease-in-out infinite}' +
      '@keyframes ambient-pulse{50%{opacity:.35}}' +
      // Geladene Werte blenden ein, statt hart aufzutauchen
      '@keyframes ambient-fade-in{from{opacity:0}}' +
      '.ambient-fade-in{animation:ambient-fade-in .35s ease-out}' +
      '@media (prefers-reduced-motion: reduce){#ambient-progress-toolbar *,#ambient-progress-settings,#ambient-progress-settings *,#ambient-progress-toast{transition:none !important}.ambient-skeleton,.ambient-fade-in,.ambient-bar-grow,.ambient-bar-shrink,.ambient-bar-animate{animation:none}}';
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

  // GitLab-REST unter /api/v4/projects/<Pfad>, durch den Limiter; prüft den Status, liefert JSON (leere Antwort → null)
  function glApi(projectPath, subPath, label, options) {
    return gitlabLimiter(function () {
      return glFetch('/api/v4/projects/' + encodeURIComponent(projectPath) + subPath, options);
    }).then(function (res) {
      if (!res.ok) throw new Error(label + ': HTTP ' + res.status);
      return res.text();
    }).then(function (text) {
      return text ? JSON.parse(text) : null;
    });
  }

  // Promise pro Schlüssel merken (ttlMs: wie lange; ohne = bis zum Neuladen). Fehlschläge werden vergessen.
  function memoPromise(cache, key, ttlMs, load) {
    const hit = cache[key];
    if (hit && (!ttlMs || Date.now() - hit.timestamp <= ttlMs)) return hit.promise;
    const promise = load().catch(function (err) {
      if (cache[key] && cache[key].promise === promise) delete cache[key];
      throw err;
    });
    cache[key] = {promise: promise, timestamp: Date.now()};
    return promise;
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
  // JSON aus localStorage; fehlt der Wert, ist er kaputt oder hat er nicht den Typ des Fallbacks (Objekt) → fallback
  function storageRead(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      const parsed = raw === null ? null : JSON.parse(raw);
      if (parsed === null || parsed === undefined) return fallback;
      if (fallback && typeof fallback === 'object' && typeof parsed !== 'object') return fallback;
      return parsed;
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
  let toastElement = null;
  let toastHideTimer = null;
  let lastPortalWarningAt = 0;
  const blockedProjectRequests = {};
  let projectIdInputElement = null;
  let portalUrlInputElement = null;
  let projectStatusElement = null;
  let portalStatusElement = null;
  let extraIdsInputElement = null;
  let extraIdsStatusElement = null;
  let lastRefreshLabelElement = null;
  let manualRefreshButtonElement = null;
  let ticketActionsInputElement = null;
  // GitLab rendert Seitenleisten verzögert: bis zu 3 erneute Scans im Abstand von 700 ms, bis das Ziel-Element da ist
  function createRetry(label, rescan) {
    let attempts = 0;
    let timer = null;
    return {
      reset: function () {
        attempts = 0;
        clearTimeout(timer);
        timer = null;
      },
      schedule: function () {
        if (timer || attempts >= 3) return;
        attempts += 1;
        timer = setTimeout(function () {
          timer = null;
          log(label + ' noch nicht vorhanden – erneuter Versuch #' + attempts);
          rescan();
        }, 700);
      }
    };
  }
  const detailRetry = createRetry('Detail-Teilnehmerbereich', function () {
    if (currentScanContext) scanIssueDetail(currentScanContext.projectSettings);
  });
  const mrRetry = createRetry('MR-Progress-Block', function () {
    if (currentScanContext) scanMergeRequestPage(currentScanContext.projectSettings);
  });

  // Debug / Anzeige – gesteuert über Toolbar, persistiert in localStorage
  const LS_KEY_LIST_SELECTIONS = 'ambientProgressListSelections';
  const LS_KEY_PROJECT_CONFIG = 'ambientProgressProjectConfigs';
  const LS_KEY_LAST_REFRESH = 'ambientProgressLastRefresh';
  const LS_KEY_PROGRESS_CACHE = 'ambientProgressCache';
  const LS_KEY_LAST_BOARD_ID = 'ambientProgressLastBoardId';
  const LS_KEY_RELEASE_INFO = 'ambientProgressReleaseInfo';
  const LS_KEY_RATE_LIMIT_WARNING = 'ambientProgressRateLimitWarning';
  const LS_KEY_AGE_HIGHLIGHT_LISTS = 'ambientProgressAgeHighlightLists';

  // Globale Feature-Schalter (gelten für alle Boards), auch Anzeigen (show), Debug-Logs (debug) und MR-Buttons (mrLinks)
  const LS_KEY_FEATURES = 'ambientProgressFeatures';
  const FEATURE_PARENTS = {
    portalButtons: 'progress',
    mrAvatars: 'mrBadge',
    estimateStripTitle: 'estimateBadge',
    columnSp: 'estimateBadge',
    columnAvg: 'columnAge',
    issuePortalButtons: 'issueDetail',
    issueActions: 'issueDetail',
    mrPortalButtons: 'mrPageProgress',
    mrActions: 'mrPageProgress'
  };
  let features = readFeatures();
  let debugEnabled = features.debug === true; // Default: aus
  let showEnabled = features.show !== false; // Default: an
  let mrLinksEnabled = features.mrLinks !== false; // Default: an

  function readFeatures() {
    return storageRead(LS_KEY_FEATURES, {});
  }

  function saveFeature(key, value) {
    features[key] = value;
    storageWrite(LS_KEY_FEATURES, features);
  }

  // Default an; Unter-Features nur aktiv, wenn das Eltern-Feature aktiv ist
  function isFeatureOn(key) {
    if (!showEnabled) return false; // „Anzeigen" ist Hauptschalter für alles
    // Board ohne Schätzungen (Tab „Dieses Board“): kein Badge, auch kein rotes „? SP“
    if (key === 'estimateBadge' && currentScanContext && currentScanContext.projectSettings.estimateEnabled === false) return false;
    const parent = FEATURE_PARENTS[key];
    return features[key] !== false && (!parent || isFeatureOn(parent));
  }

  // Experimente (noch nicht übernommene Ideen, standardmäßig aus) unter Zahnrad → Tab Experimente,
  // [Schlüssel, Label, Beschreibung]. Im selben Objekt liegen auch dauerhafte Einstellungen (Sprache, weitere Portal-Projekt-IDs).
  const LS_KEY_EXPERIMENTS = 'ambientProgressExperiments';
  const LS_KEY_ENTERED_AT = 'ambientProgressEnteredAt';
  const LS_KEY_SELFTEST_VERSION = 'ambientProgressSelftestVersion';
  const EXPERIMENT_MENU = [
    {title: 'Merge Requests', items: [
      ['expMrPipeline', 'Pipeline-Status am MR-Badge', 'Farbiger Punkt für den letzten Pipeline-Lauf']
    ]},
    {title: 'Betrieb', items: [
      ['expConfigLink', 'Konfiguration als Link teilen', 'Board-Setup per Link weitergeben, Empfänger bestätigt vor dem Übernehmen']
    ]}
  ];
  let experiments = readExperiments();

  function readExperiments() {
    const result = storageRead(LS_KEY_EXPERIMENTS, {});
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

  // Teil-Übersetzung (Einstellung „Sprache"): nur Texte, die hier stehen; alles andere bleibt Deutsch
  const EN_TEXTS = {
    'Board-Karten': 'Board cards',
    'Verweildauer': 'Time in column',
    'Fortschrittsbalken': 'Progress bar',
    'Portal- & Timesheet-Buttons': 'Portal & timesheet buttons',
    'MR-Badge': 'MR badge',
    'Assignee- & Reviewer-Avatare': 'Assignee & reviewer avatars',
    'Schätzung als Badge': 'Estimate badge',
    'Geteilte Scoped Labels': 'Split scoped labels',
    'Uhr im Karten-Footer': 'Clock in card footer',
    'Median im Spalten-Header': 'Median in column header',
    'Fortschritt im Ticket': 'Progress in ticket',
    'Fortschritt im Merge Request': 'Progress in merge request',
    'Ticket-Assignee-Buttons': 'Ticket assignee buttons',
    'MR-Schnellzugriff': 'MR quick access',
    'Anzeige': 'Display',
    'Dieses Board': 'This board',
    'Erweitert': 'Advanced',
    'Experimente': 'Experiments',
    'Aktiv': 'Active',
    'Pausiert': 'Paused',
    'Nicht gefunden': 'Not found',
    'Portal: nicht gefunden': 'Portal: not found',
    'Im Portal öffnen': 'Open in portal',
    'Timesheet erstellen': 'Create timesheet',
    'Daten neu laden': 'Reload data',
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
    messageText: null
  };

  let rateLimitWarningActive = null; // null = noch nicht aus localStorage geladen
  let rateLimitNotificationElements = {
    badge: null,
    messageRow: null,
    messageText: null
  };
  let lastRateLimitToastAt = 0;

  const LOG_PREFIX = '[GitLab Progress]';
  const PROGRESS_CACHE_TTL_MS = 60 * 60 * 1000;
  // Stale-while-revalidate: abgelaufene Einträge bis zu 24 h behalten, um sie sofort anzuzeigen
  const STALE_MAX_MS = 24 * 60 * 60 * 1000;
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

  function ensureToastElement() {
    if (toastElement) return toastElement;
    const el = document.createElement('div');
    el.id = 'ambient-progress-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'true');
    document.body.appendChild(el);
    toastElement = el;
    return el;
  }

  function hideToast() {
    if (toastElement) toastElement.classList.remove('ambient-toast-visible');
  }

  function showToast(options) {
    if (!options || !options.text) return;
    const {
      text,
      variant = 'info',
      duration = TOAST_DEFAULT_DURATION_MS
    } = options;
    const el = ensureToastElement();
    el.dataset.variant = variant;
    const isAlert = variant === 'warning';
    el.setAttribute('role', isAlert ? 'alert' : 'status');
    el.setAttribute('aria-live', isAlert ? 'assertive' : 'polite');
    el.textContent = text;
    void el.offsetWidth;
    el.classList.add('ambient-toast-visible');
    clearTimeout(toastHideTimer);
    toastHideTimer = setTimeout(hideToast, Math.max(duration, text.length * 60));
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
      text: 'Portal-URL fehlt oder ist ungültig (nur https) -> Zahnrad → „Dieses Board“ öffnen und' +
        ' eintragen.',
      variant: 'warning'
    });
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
    if (projectKey) delete blockedProjectRequests[projectKey];
  }

  /******************************************************************
   * Utils
   ******************************************************************/

  function readListSelectionsState() {
    return storageRead(LS_KEY_LIST_SELECTIONS, {});
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
      version: String(parsed.version || ''),
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

  // CalVer „2026.10.3" → [2026, 10, 3]; nicht-numerische Segmente zählen als 0
  function parseVersionSegments(value) {
    return String(value || '').split('.').map(function (segment) {
      return parseInt(segment, 10) || 0;
    });
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
    if (!elements.badge || !elements.messageRow || !elements.messageText) {
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
      elements.messageText.textContent = '⚠️ Update verfügbar: ' + info.version;
      elements.messageNotes.textContent = info.notes || '';
      elements.messageNotes.style.display = info.notes ? 'block' : 'none';
    } else {
      elements.badge.style.display = 'none';
      elements.messageRow.style.display = 'none';
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
    if (!elements.badge || !elements.messageRow || !elements.messageText) {
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
    } else {
      elements.badge.style.display = 'none';
      elements.messageRow.style.display = 'none';
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
          latestReleaseInfo = {version: versionMatch[1], checkedAt: Date.now()};
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

  // Update-Hinweis: oberster Abschnitt aus CHANGELOG.md (gleiche Raw-Domain wie das Script)
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
      // Notizen fehlen, wenn der letzte Check lief, als die installierte Version noch nicht älter war
      if (!cached.notes && isRemoteVersionGreater(cached.version, SCRIPT_VERSION)) {
        fetchChangelogNotes(cached);
      }
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
    const value = storageRead(getLastRefreshStorageKey(), null);
    return typeof value === 'number' ? value : null;
  }

  function writeLastRefreshTimestamp(value) {
    if (value === null || value === undefined) {
      storageRemove(getLastRefreshStorageKey());
    } else {
      storageWrite(getLastRefreshStorageKey(), value);
    }
    updateLastRefreshLabel();
  }

  function updateLastRefreshLabel() {
    if (!lastRefreshLabelElement) {
      return;
    }
    const timestamp = readLastRefreshTimestamp();
    lastRefreshLabelElement.textContent = timestamp
      ? 'Daten geladen: ' + formatRefreshTimestamp(timestamp)
      : 'Daten geladen: -';
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
    return storageRead(LS_KEY_PROJECT_CONFIG, {});
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
    return storageRead(LS_KEY_PROGRESS_CACHE, null);
  }

  function isCacheEntryFresh(entry) {
    const timestamp = Number(entry && entry.timestamp);
    if (!timestamp) return false;
    return Date.now() - timestamp <= (Number(entry.ttl) || PROGRESS_CACHE_TTL_MS);
  }

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
    const value = storageRead(LS_KEY_LAST_BOARD_ID, null);
    return value === null ? null : String(value);
  }

  function writeLastBoardIdentifierToStorage(value) {
    storageWrite(LS_KEY_LAST_BOARD_ID, value);
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

  // läuft pro Cache-Key jeder Karte: localStorage nur bei Wechsel anfassen
  let lastBoardIdentifier;
  function getCurrentBoardIdentifier() {
    if (lastBoardIdentifier === undefined) {
      lastBoardIdentifier = readLastBoardIdentifierFromStorage();
    }
    const fromPath = getBoardIdentifierFromPath();
    if (fromPath && fromPath !== lastBoardIdentifier) {
      lastBoardIdentifier = fromPath;
      writeLastBoardIdentifierToStorage(fromPath);
    }
    return lastBoardIdentifier || 'default';
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

  function createTextSpan(text, styles) {
    const span = document.createElement('span');
    span.textContent = text;
    applyStyles(span, styles);
    return span;
  }

  const BAR_COLORS = {
    spent: '#6FBF73',
    spentHover: '#57A55D',
    neutral: '#D9D4C7',
    bookedFallback: '#2563eb',
    over: '#dc3545'
  };
  const WARN_PCT = 80; // Balken wird gelb, sobald so viel Prozent der Stunden verbraucht sind
  const WARN_COLORS = {spent: '#eab308', spentHover: '#ca8a04'};
  const EXTRA_BAR_COLORS = [
    {spent: '#a855f7', spentHover: '#9333ea'},
    {spent: '#14b8a6', spentHover: '#0d9488'},
    {spent: '#ec4899', spentHover: '#db2777'}
  ];
  
  // Text-Alternative für Screenreader und Tooltip (Farben allein tragen keine Information)
  function describeBar(barOuter, label) {
    barOuter.classList.add('ambient-progress-bar');
    barOuter.setAttribute('role', 'img');
    barOuter.setAttribute('aria-label', 'Portal-Stunden: ' + label);
    barOuter.title = label;
  }

  // Statische Optik in .ambient-bar* im Stylesheet; inline nur Breiten, Farben und Overrides aus customStyles
  function createProgressBarElements(progressData, customStyles) {
    if (!progressData) return null;
    const styles = customStyles || {};
    const colors = Object.assign({}, BAR_COLORS, styles.colors);
    const animate = Boolean(styles.animate);

    const barOuter = document.createElement('div');
    barOuter.className = 'ambient-bar';
    applyStyles(barOuter, styles.bar);

    const textLayer = document.createElement('div');
    textLayer.className = 'ambient-bar-text' + (animate ? ' ambient-bar-animate' : '');
    applyStyles(textLayer, styles.textLayer);

    // „Füllt sich auf": CSS-Animation von 0 (grow) bzw. 100 % (shrink) auf die gesetzte Breite
    const addFill = function (width, color, animation) {
      const fill = document.createElement('div');
      fill.className = 'ambient-bar-fill' + (animate ? ' ambient-bar-' + animation : '');
      applyStyles(fill, {width: width + '%', background: color});
      barOuter.appendChild(fill);
      return fill;
    };
    const appendCenterText = function (text) {
      textLayer.style.justifyContent = 'center';
      textLayer.appendChild(createTextSpan(text, Object.assign({fontWeight: '600'}, styles.centerLabel)));
    };

    let ariaLabel = '';
    if (progressData.notFound) {
      addFill(100, colors.neutral, 'grow');
      appendCenterText(t('Nicht gefunden'));
      ariaLabel = t('Portal: nicht gefunden');
    } else if (progressData.booked && !progressData.spent && !progressData.remaining && !progressData.over) {
      const bookedText = (progressData.bookedLabel || 'Booked Hours') + ': ' + progressData.booked;
      addFill(100, colors.bookedFallback || colors.neutral, 'grow');
      appendCenterText(bookedText);
      ariaLabel = bookedText;
    } else if (progressData.over) {
      addFill(100, colors.over, 'grow');
      let centerText = '\u26A0\uFE0F Over: ' + progressData.over; // Symbol, damit „über Budget" nicht nur über die Farbe erkennbar ist
      if (progressData.booked) {
        const bookedHours = extractHourNumber(progressData.booked);
        const overHours = extractHourNumber(progressData.over);
        const diffText = bookedHours !== null && overHours !== null ? formatBookedHoursDisplay(bookedHours - overHours) : null;
        centerText += ' (' + progressData.booked + (diffText ? '/' + diffText : '') + ')';
      }
      appendCenterText(centerText);
      ariaLabel = centerText;
    } else {
      const spentNum = extractHourNumber(progressData.spent);
      const remainingNum = extractHourNumber(progressData.remaining);
      const total = spentNum !== null && remainingNum !== null ? spentNum + remainingNum : null;

      const showSpentBar = spentNum !== null && spentNum > 0;
      let spentWidth = 0;
      let remainingWidth = 100;
      if (showSpentBar && total > 0) {
        spentWidth = Math.max(5, Math.min(95, (spentNum / total) * 100));
        remainingWidth = Math.max(5, 100 - spentWidth);
      }

      // Warnschwelle – Farbe allein trägt keine Information, deshalb steht der Prozentwert im Label
      const usedPct = total > 0 && spentNum !== null ? Math.round((spentNum / total) * 100) : null;
      const warnActive = Boolean(styles.warnPct) && usedPct !== null && usedPct >= styles.warnPct;

      if (showSpentBar) {
        const spentBar = addFill(spentWidth, warnActive ? WARN_COLORS.spent : colors.spent, 'grow');
        spentBar.classList.add('ambient-bar-spent');
        spentBar.style.setProperty('--ambient-hover', warnActive ? WARN_COLORS.spentHover : colors.spentHover);
      }
      // schrumpft, während die Bar sich füllt
      addFill(remainingWidth, colors.neutral, showSpentBar ? 'shrink' : '');

      const labelStyle = {fontWeight: '500'};
      textLayer.appendChild(createTextSpan(progressData.spent || '—', Object.assign({}, labelStyle, styles.spentLabel)));
      textLayer.appendChild(createTextSpan(progressData.remaining || '—', Object.assign({}, labelStyle, styles.remainingLabel)));
      ariaLabel = 'Gebucht ' + (progressData.spent || '—') + ', verbleibend ' + (progressData.remaining || '—');
      if (warnActive) ariaLabel += ' – ' + usedPct + ' % verbraucht (Schwelle ' + styles.warnPct + ' %)';
    }

    barOuter.appendChild(textLayer);
    describeBar(barOuter, ariaLabel);
    return barOuter;
  }

  function getThemeAwareBarStyles(options) {
    var opts = options || {};
    var isDark = isGitLabDarkModeActive();
    var barBackground = isDark ? 'var(--gl-background-color-default, #18171d)' : 'var(--gl-background-color-subtle, #E5EAF0)';
    var textColor = getContrastTextColor(BAR_COLORS.neutral);

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
        warnPct: WARN_PCT, // für alle Balken (Karte, Ticket, MR) gleich
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
    button.className = 'ambient-btn btn gl-button btn-default btn-icon btn-sm js-no-trigger ambient-icon-btn';
    applyStyles(button, overrides);
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

  // featureKey: welcher Schalter die Buttons hier steuert (Karte, Ticket oder MR)
  function createPortalLinkButton(url, overrides, featureKey) {
    if (!url || !isFeatureOn(featureKey || 'portalButtons')) return null;
    return createProgressIconButton(EXTERNAL_LINK_ICON_SVG, t('Im Portal öffnen'), 'Ticket im Portal öffnen', url, overrides);
  }

  function createTimesheetButton(url, overrides, featureKey) {
    if (!url || !isFeatureOn(featureKey || 'portalButtons')) return null;
    return createProgressIconButton(TIMESHEET_ICON_SVG, t('Timesheet erstellen'), 'Timesheet im Portal erstellen', url, overrides);
  }

  // Zeile „Timesheet-Button | Balken | Portal-Button" (Karte, Ticket, MR); Optik je Ort über className
  function buildProgressRow(className, progressData, barStyles, portalUrl, timesheetUrl, buttonsFeature) {
    const row = document.createElement('div');
    row.className = className;
    [
      createTimesheetButton(timesheetUrl, null, buttonsFeature),
      createProgressBarElements(progressData, barStyles),
      createPortalLinkButton(portalUrl, null, buttonsFeature)
    ].forEach(function (el) {
      if (el) row.appendChild(el);
    });
    return row;
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

  // Abgelaufener, aber noch behaltener Wert (bis STALE_MAX_MS); „keine Buchungen" zählt nicht
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

  function getProjectSettings() {
    const projectPath = getGitLabProjectPathFromLocation();
    log('Ermittelter projectPath aus URL:', projectPath);
    if (!projectPath) {
      warn('Konnte GitLab-Projektpfad nicht bestimmen.');
      return null;
    }
    const projectKey = window.location.hostname + '|' + projectPath;
    const storedSelection = readListSelectionEntry(projectKey);
    const storedProjectConfig = readProjectConfigEntry(projectKey);
    if (!storedProjectConfig) log('Noch keine gespeicherte Konfiguration für Projektpfad:', projectPath);
    const initialLookup = storedSelection ? storedSelection.include : {};
    const listFilterMode = storedSelection && storedSelection.explicit ? 'explicit' : 'auto';
    const projectId = (storedProjectConfig && storedProjectConfig.projectId) || null;
    const portalBaseUrl = (storedProjectConfig && storedProjectConfig.portalBaseUrl) || null;

    return {
      projectPath,
      projectKey,
      projectId,
      extraProjectIds: extraProjectIdsFromConfig(storedProjectConfig),
      allowedListLookup: initialLookup,
      listFilterMode,
      portalBaseUrl,
      ticketActions: (storedProjectConfig && storedProjectConfig.ticketActions) || '',
      estimateEnabled: !storedProjectConfig || storedProjectConfig.estimateEnabled !== false,
      portalWarning: !storedProjectConfig || storedProjectConfig.portalWarning !== false,
      closedDays: clampClosedDays(storedProjectConfig && storedProjectConfig.closedDays)
    };
  }

  const GITLAB_BG_SELECTORS = [
    '.top-bar-container',
    '.top-bar-fixed',
    '.gl-app-header',
    '.gl-top-bar',
    'body'
  ];
  const GITLAB_THEME_BG_VARS = ['--theme-background-color', '--gl-background-color-default'];
  // Seiten- und Textfarbe als CSS-Variablen: folgen einem Theme-Wechsel ohne Neuaufbau
  const THEME_BG = 'var(--theme-background-color, var(--gl-background-color-default, #fff))';
  const THEME_FG = 'var(--gl-text-color-default, #28272d)';

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

  // gecacht, läuft pro Karte; der Theme-Observer in init() setzt den Cache zurück
  let darkModeCache = null;
  function isGitLabDarkModeActive() {
    if (darkModeCache !== null) return darkModeCache;
    const html = document.documentElement;
    const theme = (html.getAttribute('data-theme') || '').toLowerCase();
    let dark = theme.includes('dark') ? true : theme.includes('light') ? false : null;
    if (dark === null) {
      const classes = html.className + ' ' + (document.body ? document.body.className : '');
      if (/(^|\s)(gl-theme-|gl-|theme-)dark(\s|$)/.test(classes)) dark = true;
      else if (/(^|\s)(gl-theme-|gl-|theme-)light(\s|$)/.test(classes)) dark = false;
    }
    if (dark === null) {
      const rgb = parseCssColorToRgb(
        getFirstCssVariableValue(GITLAB_THEME_BG_VARS) || getComputedBackgroundFromSelectors(GITLAB_BG_SELECTORS)
      );
      dark = rgb ? relativeLuminance(rgb) <= 0.55 : false;
    }
    log('isGitLabDarkModeActive', dark);
    darkModeCache = dark;
    return dark;
  }

  function parseCssColorToRgb(value) {
    if (!value || typeof value !== 'string') return null;
    const v = value.trim().toLowerCase();
    const rgb = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
    if (rgb) return {r: parseFloat(rgb[1]), g: parseFloat(rgb[2]), b: parseFloat(rgb[3])};
    let hex = v.charAt(0) === '#' ? v.slice(1) : '';
    if (hex.length === 3) hex = hex.replace(/./g, '$&$&');
    if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(hex)) return null;
    return {r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16)};
  }

  function getContrastTextColor(bgColor, darkColor, lightColor) {
    const rgb = parseCssColorToRgb(bgColor);
    return rgb && relativeLuminance(rgb) > 0.55 ? darkColor || '#0f172a' : lightColor || '#f8fafc';
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

  // „Review (3)" → „review": angehängte Klammer-Zusätze (auch mehrere) weg, klein geschrieben
  function normalizeListNameForMatching(name) {
    return String(name || '').replace(/(\s*\([^()]*\))+\s*$/, '').toLowerCase().trim();
  }

  function getIssueIidFromCard(cardElem) {
    if (!cardElem) return null;

    const iid = cardElem.getAttribute('data-item-iid');
    if (iid) return iid;

    const numberSpan = cardElem.querySelector(SEL.cardNumber + ' span');
    const m = numberSpan && numberSpan.textContent.match(/#(\d+)/);
    return m ? m[1] : null;
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

  // Zahl oder Text → „6.5h"; auf zwei Nachkommastellen gerundet (keine Float-Reste wie 6.4999999h)
  function formatBookedHoursDisplay(value) {
    const hours = typeof value === 'number' ? value : extractHourNumber(value);
    if (hours === null || isNaN(hours)) return null;
    return (Math.round(hours * 100) / 100 || 0) + 'h';
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
        log('parseProgressHtml: Kein Progress-Container gefunden → Fallback Booked Hours.');
        return fallbackBooked();
      }

      // Tailwind markup: the title attribute carries the values as plain text,
      // independent of segment divs/classes/order → prefer this over anything else.
      const titleAttr = progressDiv.getAttribute('title');
      const fromTitle = parseProgressFromTitleAttr(titleAttr);
      if (fromTitle) {
        log('parseProgressHtml: Werte aus title-Attribut geparst:', fromTitle);
        // „Booked hours" im title sind die gebuchten Stunden: kein zweiter Durchlauf über das ganze Dokument
        if (fromTitle.spent) return Object.assign(fromTitle, {booked: fromTitle.spent, bookedLabel: 'Booked Hours'});
        return attachBookedInfo(fromTitle);
      }

      log('parseProgressHtml: title-Attribut nicht auswertbar → Fallback Booked Hours.');
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
            log('parseBookedHours: Wert inline gefunden für "' + (label || 'Booked Hours') + '":', formattedInline);
            return {value: formattedInline, label: label || 'Booked Hours'};
          }
          log('parseBookedHours: inline Wert enthält keine Stundenangabe, überspringe:', inlineVal);
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
              log('parseBookedHours: Wert aus Tabellenzeile gefunden für "' + label + '":', formatted);
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
            log('parseBookedHours: Summe der Werte neben "' + label + '" gefunden:', formattedSum);
            return {value: formattedSum, label: label};
          }
        }
        candidateVal = normalizeWhitespace(candidateEl.textContent);
        const formattedAdjacent = formatBookedHoursDisplay(candidateVal);
        if (formattedAdjacent) {
          log('parseBookedHours: Wert neben "' + label + '" gefunden:', formattedAdjacent);
          return {value: formattedAdjacent, label: label};
        }
        log('parseBookedHours: Nebenwert enthält keine Stundenangabe, überspringe:', candidateVal);
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
      applyStyles(el, Object.assign({}, placeholderStyle, styles));
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

  function injectProgressIntoCard(cardElem, progressData) {
    if (!cardElem || !progressData) return;
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
    const loadedAt = Number(cardElem.getAttribute('data-ambient-loaded-at'));

    const row = buildProgressRow('ambient-progress-row', progressData, theme.styles,
      cardElem.getAttribute('data-ambient-progress-url'), cardElem.getAttribute('data-ambient-timesheet-url'));
    if (loadedAt) row.querySelector('.ambient-progress-bar').title += ' · ' + formatLoadedAgo(loadedAt);
    container.appendChild(row);
    appendExtraProjectRows(cardElem, container, theme);
  }

  /******************************************************************
   * Experimente: Karten-Helfer (Summen, Filter, Sortierung, Refresh, Extra-Projekte)
   ******************************************************************/

  let currentScanContext = null; // {projectSettings}, gesetzt in init
  let rescanHook = null; // gesetzt in init: stößt einen entprellten Scan an
  const SCAN_LIMIT_RETRY_MS = 2000;
  let scanLimitRetryTimer = null;
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
    document.querySelectorAll('.ambient-column-avg, .ambient-column-sp').forEach(function (el) { el.remove(); });
    removeEstimateBadges(); // Muster können sich geändert haben
    if (rescanHook) rescanHook();
  }

  // Weitere Portal-Projekte pro Board (höchstens 3), je ein zusätzlicher Balken auf der Karte
  function parseExtraProjectIds(text) {
    return String(text || '').split(/[\s,;]+/).filter(Boolean);
  }

  // Früher gab es pro Board ein „zweites Portal-Projekt" (portalProjectId2) und eine globale ID-Liste: beide fließen ein,
  // bis das Board eigene IDs speichert
  function extraProjectIdsFromConfig(config) {
    if (config && typeof config.extraProjectIds === 'string') return config.extraProjectIds;
    const ids = config && config.useSecondPortalProjectId && config.portalProjectId2 ? [String(config.portalProjectId2)] : [];
    parseExtraProjectIds(expSetting('extraProjectIds', '')).forEach(function (id) { ids.push(id); });
    return ids.filter(function (id, i) { return isNumericId(id) && ids.indexOf(id) === i; }).slice(0, 3).join(', ');
  }

  function getExtraProjectIds() {
    const ps = currentScanContext && currentScanContext.projectSettings;
    return ps ? parseExtraProjectIds(ps.extraProjectIds).filter(isNumericId).slice(0, 3) : [];
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
        const styles = Object.assign({}, theme.styles, {
          colors: Object.assign({}, BAR_COLORS, EXTRA_BAR_COLORS[idx % EXTRA_BAR_COLORS.length]),
          animate: false
        });
        const row = buildProgressRow('ambient-progress-row ambient-extra-row', data, styles,
          buildPortalUrl(ps, issueIid, pid), buildTimesheetUrl(ps, issueIid, pid));
        row.setAttribute('data-pid', pid);
        const bar = row.querySelector('.ambient-progress-bar');
        bar.title = 'Portal-Projekt ' + pid + ': ' + bar.title;
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

  const currentUserCache = {};

  function getCurrentUser() {
    return memoPromise(currentUserCache, 'me', 0, function () {
      return glFetch('/api/v4/user').then(function (res) {
        if (!res.ok) throw new Error('Aktueller User: HTTP ' + res.status);
        return res.json();
      });
    });
  }

  function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.content : null;
  }

  function assignCurrentUserAsReviewer(projectPath, mrIid) {
    if (!isNumericId(mrIid)) return Promise.reject(new Error('Ungültige MR-IID'));
    return getCurrentUser().then(function (user) {
      return glApi(projectPath, '/merge_requests/' + mrIid, 'Reviewer zuweisen',
        {method: 'PUT', body: JSON.stringify({reviewer_ids: [user.id]})}).then(function () { return user; });
    });
  }

  const MR_LIST_FAILURE_BACKOFF_MS = NEGATIVE_CACHE_MS;
  const mrListFailedAt = {}; // projectPath → Zeitpunkt des letzten Fehlers

  // Cache hält die Promise: viele Karten gleichzeitig lösen genau einen Request aus
  function loadMergeRequestsForProject(projectPath) {
    if (mrListFailedAt[projectPath] && Date.now() - mrListFailedAt[projectPath] < MR_LIST_FAILURE_BACKOFF_MS) {
      return Promise.reject(new Error('MR-Liste: letzter Versuch fehlgeschlagen, warte kurz'));
    }
    return memoPromise(mrListCache, projectPath, MR_LIST_CACHE_TTL_MS, function () {
      return glApi(projectPath, '/merge_requests?per_page=100&order_by=updated_at', 'MR-Liste')
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
          mrListFailedAt[projectPath] = Date.now();
          throw err;
        });
    });
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
    // ponytail: per_page=100, keine Paginierung – bei >100 Label-Events fehlen neuere
    return memoPromise(labelEventsCache, projectPath + '#' + issueIid, COLUMN_AGE_CACHE_TTL_MS, function () {
      return glApi(projectPath, '/issues/' + issueIid + '/resource_label_events?per_page=100', 'Label-Events');
    });
  }

  // Closed-Spalte: nur Tickets, die in den letzten N Tagen geschlossen wurden (Standard 28, höchstens 40)
  const CLOSED_DAYS_DEFAULT = 28;
  const CLOSED_DAYS_MAX = 40;

  function clampClosedDays(value) {
    const days = Math.round(Number(value));
    if (!days || days < 1) return CLOSED_DAYS_DEFAULT;
    return Math.min(days, CLOSED_DAYS_MAX);
  }

  // GitLabs eingebaute Closed-Liste hat kein Label
  function isClosedListHeader(header, listNameLower) {
    return Boolean(header) && !header.querySelector(SEL.listTitleLabel) &&
      (listNameLower === 'closed' || listNameLower === 'geschlossen');
  }

  const recentlyClosedCache = {}; // key: projectPath#Tage → {promise, timestamp}
  const recentlyClosedIids = {}; // gleicher key → Set der IIDs, sobald geladen (bleibt bis zum nächsten Laden stehen)

  // Synchron für scanBoard: null, solange noch nichts geladen ist; das Laden stößt danach einen Scan an
  function getRecentlyClosedIids(projectSettings) {
    const days = projectSettings.closedDays || CLOSED_DAYS_DEFAULT;
    const key = projectSettings.projectPath + '#' + days;
    memoPromise(recentlyClosedCache, key, COLUMN_AGE_CACHE_TTL_MS, function () {
      const cutoff = Date.now() - days * 86400000;
      const since = encodeURIComponent(new Date(cutoff).toISOString());
      const iids = new Set();
      // Kein closed_after in der API: geschlossen heißt auch aktualisiert, closed_at filtert den Rest
      // ponytail: höchstens 3 Seiten à 100 – bei mehr als 300 geänderten geschlossenen Tickets fehlen die ältesten
      function loadPage(page) {
        return glApi(projectSettings.projectPath, '/issues?state=closed&order_by=updated_at&per_page=100&page=' + page +
          '&updated_after=' + since, 'Geschlossene Tickets').then(function (issues) {
          (issues || []).forEach(function (issue) {
            if (Date.parse(issue.closed_at) >= cutoff) iids.add(String(issue.iid));
          });
          if (issues && issues.length === 100 && page < 3) return loadPage(page + 1);
        });
      }
      return loadPage(1).then(function () {
        recentlyClosedIids[key] = iids;
        log('Closed-Spalte: ' + iids.size + ' Tickets der letzten ' + days + ' Tage');
        if (rescanHook) rescanHook();
      });
    }).catch(function (err) { warn('Geschlossene Tickets nicht geladen:', err); });
    return recentlyClosedIids[key] || null;
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
    // localStorage-Wert überbrückt den Kaltstart, damit die Uhr ohne Request erscheint
    const stored = getEnteredAtStore()[key];
    if (!columnEnteredAtCache[key] && stored && Date.now() - Number(stored.ts) <= ENTERED_AT_STORE_TTL_MS) {
      columnEnteredAtCache[key] = {promise: Promise.resolve(stored.t ? new Date(stored.t) : null), timestamp: Number(stored.ts)};
    }
    return memoPromise(columnEnteredAtCache, key, COLUMN_AGE_CACHE_TTL_MS, function () {
      return loadLabelEvents(projectPath, issueIid).then(function (events) {
        const latest = computeEnteredAt(events, normalizeLabelNameForMatching(listName));
        getEnteredAtStore()[key] = {t: latest ? latest.getTime() : null, ts: Date.now()};
        persistEnteredAtStore();
        return latest;
      });
    });
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
    if (cardElem.ambientPreview) return showEnabled; // Karte der Einstellungs-Vorschau
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
    removeEstimateBadges(cardElem);
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

  // Board-Filter aus der URL → Parameter der Issues-API, damit die SP-Summe dieselben Tickets zählt wie das Board
  const BOARD_FILTER_TO_API = {
    'label_name[]': 'labels', 'not[label_name][]': 'not[labels]',
    milestone_title: 'milestone', 'not[milestone_title]': 'not[milestone]',
    assignee_username: 'assignee_username', 'assignee_username[]': 'assignee_username',
    'not[assignee_username][]': 'not[assignee_username]', assignee_id: 'assignee_id',
    author_username: 'author_username', 'not[author_username]': 'not[author_username]',
    search: 'search', my_reaction_emoji: 'my_reaction_emoji', weight: 'weight', iteration_id: 'iteration_id',
    confidential: 'confidential', 'types[]': 'issue_type'
  };

  // Query für alle Tickets einer Spalte: Label-Spalte → offen mit Label, Closed → geschlossen; plus Board-Filter
  function buildColumnIssueQuery(search, columnLabel) {
    const params = {state: [columnLabel ? 'opened' : 'closed']};
    if (columnLabel) params.labels = [columnLabel];
    new URLSearchParams(search).forEach(function (value, key) {
      const apiKey = BOARD_FILTER_TO_API[key];
      if (apiKey) (params[apiKey] = params[apiKey] || []).push(value);
    });
    return Object.keys(params).sort().map(function (key) {
      return encodeURIComponent(key) + '=' + encodeURIComponent(params[key].join(','));
    }).join('&');
  }

  const COLUMN_SP_MAX_PAGES = 10;
  const columnSpCache = {};

  // Alle Tickets der Spalte seitenweise laden (nicht nur die geladenen Karten) und SP aus den Titeln summieren
  function fetchColumnSp(projectPath, query) {
    return memoPromise(columnSpCache, projectPath + '?' + query, 5 * 60 * 1000, function () {
      const patterns = getEstimatePatterns();
      const total = {sp: 0, issues: 0, missing: 0, truncated: false};
      function loadPage(page) {
        return glApi(projectPath, '/issues?' + query + '&per_page=100&page=' + page, 'SP-Summe').then(function (issues) {
          issues.forEach(function (issue) {
            const estimate = parseEstimate(issue.title || '', patterns);
            total.issues++;
            if (estimate.kind === 'sp') total.sp += parseFloat(estimate.label.replace(',', '.')) || 0;
            else if (estimate.kind === 'none') total.missing++;
          });
          if (issues.length < 100) return total;
          // ponytail: max. 1000 Tickets pro Spalte (Closed ohne Filter), danach „≥“
          if (page >= COLUMN_SP_MAX_PAGES) {
            total.truncated = true;
            return total;
          }
          return loadPage(page + 1);
        });
      }
      return loadPage(1);
    });
  }

  // „Σ 13 SP“ neben GitLabs Zähler; Label-Spalten und Closed, Open nicht
  function updateColumnSp(boardListElem, header, projectSettings) {
    const countBadge = header.querySelector(SEL.issueCountBadge);
    if (!countBadge) return;
    let el = countBadge.querySelector('.ambient-column-sp');
    const columnLabel = header.querySelector(SEL.listTitleLabel) ? getColumnLabelText(boardListElem, header) : null;
    const isClosed = !columnLabel &&
      /^(closed|geschlossen)$/.test(normalizeListNameForMatching(getListNameFromBoardListElem(boardListElem, header)));
    if (!isFeatureOn('columnSp') || !projectSettings.projectPath || (!columnLabel && !isClosed)) {
      if (el) el.remove();
      return;
    }
    // GitLabs Zähler im Schlüssel: Drag & Drop oder Filterwechsel ändert ihn → neu summieren
    const gitlabCount = Array.prototype.filter.call(countBadge.childNodes, function (node) {
      return !(node.classList && /\bambient-/.test(node.className));
    }).map(function (node) { return node.textContent; }).join('').trim();
    const query = buildColumnIssueQuery(window.location.search, columnLabel);
    const key = query + '|' + gitlabCount;
    if (el && el.getAttribute('data-ambient-key') === key) return;
    if (!el) {
      el = document.createElement('span');
      el.className = 'ambient-column-sp gl-flex gl-items-center gl-whitespace-nowrap gl-text-subtle gl-text-sm gl-font-bold gl-mr-3';
      el.style.cursor = 'help';
      countBadge.insertBefore(el, countBadge.firstChild);
    }
    el.setAttribute('data-ambient-key', key);
    fetchColumnSp(projectSettings.projectPath, query).then(function (total) {
      if (el.getAttribute('data-ambient-key') !== key) return; // inzwischen neu angestoßen
      el.textContent = 'Σ ' + (total.truncated ? '≥ ' : '') + (Math.round(total.sp * 10) / 10) + ' SP';
      el.title = 'Story Points aller ' + total.issues + ' Tickets dieser Spalte (auch nicht geladene, mit Board-Filtern)' +
        (total.missing ? ', ' + total.missing + ' ohne Schätzung' : '') +
        (total.truncated ? '. Nur die ersten ' + COLUMN_SP_MAX_PAGES * 100 + ' Tickets gezählt.' : '');
    }).catch(function (err) {
      warn('SP-Summe fehlgeschlagen:', err);
      el.remove();
    });
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
      textDecoration: 'none'
    });
    if (allMerged) el.classList.add('ambient-mr-badge-merged');

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
    return memoPromise(mrPipelineRequests, projectPath + '#' + mrIid, 0, function () {
      return glApi(projectPath, '/merge_requests/' + mrIid + '/pipelines?per_page=1', 'MR-Pipelines')
        .then(function (list) { return (list && list[0] && list[0].status) || null; });
    });
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
            log('Response-Status für Issue', issueIid, ':', response.status);
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
  function fetchAndDisplayProgress(projectSettings, issueIid, cardElem) {
    if (!issueIid || !cardElem) return false;

    const projectKey = projectSettings && projectSettings.projectKey;
    if (isProjectRequestBlocked(projectKey)) {
      log('Requests pausiert für Projekt', projectSettings ? projectSettings.projectPath : '<unbekannt>');
      return false;
    }

    const cacheKey = buildProgressCacheKey(projectSettings, issueIid);
    const url = buildPortalUrl(projectSettings, issueIid);
    if (!url || !cacheKey) {
      warn('Keine Portal-Basis oder Projekt-ID für', projectSettings.projectPath, '; Fortschritt wird nicht geladen.');
      return false;
    }
    cardElem.setAttribute('data-ambient-progress-url', url);
    const timesheetUrl = buildTimesheetUrl(projectSettings, issueIid);
    if (timesheetUrl) {
      cardElem.setAttribute('data-ambient-timesheet-url', timesheetUrl);
    }

    // Mit weiteren Portal-Projekten bleibt der Container auch bei „nicht gefunden", damit deren Balken Platz haben
    const hasExtraProjects = getExtraProjectIds().length > 0;
    const cached = getProgressCacheEntry(cacheKey);
    if (cached) {
      log('Cache-Hit für Issue', issueIid);
      const cachedAt = getProgressCacheTimestamp(cacheKey);
      if (cachedAt) cardElem.setAttribute('data-ambient-loaded-at', String(cachedAt));
      injectProgressIntoCard(cardElem, cached.notFound && !hasExtraProjects ? null : cached);
      return false;
    }

    if (!showEnabled) {
      return false;
    }

    // Abgelaufenen Wert sofort zeigen (gedimmt), frische Daten kommen im Hintergrund
    let staleShown = false;
    {
      const stale = getStaleProgressEntry(cacheKey);
      if (stale) {
        const staleAt = getProgressCacheTimestamp(cacheKey);
        if (staleAt) cardElem.setAttribute('data-ambient-loaded-at', String(staleAt));
        injectProgressIntoCard(cardElem, stale);
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

    loadProgressData(url, issueIid)
      .then(function (progressData) {
        clearProjectRequestBlock(projectKey);
        delete fetchRetryState[cacheKey];
        if (!progressData) {
          // sauber „keine Buchungen": kurz cachen, damit nicht jeder Reload alle Karten neu abfragt
          cardElem.querySelectorAll('.ambient-progress-badge[data-ambient-stale]').forEach(function (el) { el.remove(); });
          setProgressCacheEntry(cacheKey, NOT_FOUND_SENTINEL, NOT_FOUND_TTL_MS);
          if (hasExtraProjects) injectProgressIntoCard(cardElem, NOT_FOUND_SENTINEL);
          markPortalRefreshTimestamp();
          return;
        }
        setProgressCacheEntry(cacheKey, progressData);
        cardElem.setAttribute('data-ambient-loaded-at', String(Date.now()));
        injectProgressIntoCard(cardElem, progressData);
        markPortalRefreshTimestamp();
      }, function (reason) {
        error('Request-Fehler für Issue ' + issueIid + ':', reason);
        logPortalError(issueIid, reason);
        if (reason && reason.status) blockProjectRequests(projectKey, reason.status);
        cardElem.querySelectorAll('.ambient-progress-badge[data-ambient-stale]').forEach(function (el) {
          el.title = 'Veraltet – Aktualisierung fehlgeschlagen';
        });
        // vorübergehender Fehler: nicht cachen, später erneut versuchen (begrenzt)
        retryState.attempts += 1;
        retryState.retryAt = Date.now() + NEGATIVE_CACHE_MS;
        if (retryState.attempts < MAX_FETCH_RETRIES) {
          cardElem.removeAttribute('data-ambient-progress-processed');
        }
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
   * Split-Labels: "scope::Name" als [Scope | Name] in Label-Farbe
   ******************************************************************/

  // Schätzung im Kartentitel („(3 SP)", „[Spike: 1,5h]", „(1 Tag)") als Badge statt im Text – der echte GitLab-Titel bleibt,
  // das Portal liest die Schätzung daraus. Standard-Muster wie beim Issue-Syncer des Portals.
  const DEFAULT_ESTIMATE_PATTERNS =
    'sp: [(\\[]\\s*(\\d+(?:[.,]\\d+)?)\\s*SP\\s*[)\\]]\n' +
    'timebox: [(\\[]\\s*(?:(?:Timebox|Spike)\\s*:?\\s*)?(\\d+(?:[.,]\\d+)?)\\s*(h|std\\.?|stunden?|tage?|d)\\s*[)\\]]';
  // GitLabs Badge-Varianten (wie „Open"-Status), passen sich hellem/dunklem Theme an
  const ESTIMATE_BADGE_VARIANTS = {sp: 'badge-success', timebox: 'badge-warning', none: 'badge-danger'};
  let estimatePatternCache = {text: null, patterns: []};

  // Eine Zeile pro Muster: „sp: <Regex>" oder „timebox: <Regex>"; kaputte Zeilen landen in errors
  function parseEstimatePatterns(text) {
    const patterns = [];
    const errors = [];
    String(text || '').split('\n').forEach(function (line) {
      if (!line.trim()) return;
      const match = line.match(/^\s*(sp|timebox)\s*:\s*(.+?)\s*$/i);
      try {
        if (!match) throw new Error('Format „sp: <Regex>" / „timebox: <Regex>"');
        patterns.push({kind: match[1].toLowerCase(), regex: new RegExp(match[2], 'i')});
      } catch (e) {
        errors.push(line.trim());
      }
    });
    return {patterns: patterns, errors: errors};
  }

  function getEstimatePatterns() {
    const text = String(expSetting('estimatePatterns', DEFAULT_ESTIMATE_PATTERNS));
    if (estimatePatternCache.text !== text) {
      const parsed = parseEstimatePatterns(text);
      if (parsed.errors.length) warn('Ungültige Schätzungs-Muster ignoriert:', parsed.errors);
      estimatePatternCache = {
        text: text,
        patterns: parsed.patterns.length ? parsed.patterns : parseEstimatePatterns(DEFAULT_ESTIMATE_PATTERNS).patterns
      };
    }
    return estimatePatternCache.patterns;
  }

  // Erstes passendes Muster gewinnt; ohne Treffer kind „none"
  function parseEstimate(title, patterns) {
    for (let i = 0; i < patterns.length; i++) {
      const match = title.match(patterns[i].regex);
      if (!match) continue;
      const value = match[1] || '';
      // Gruppe 2 (optional) ist die Einheit: Tag/Tage/d → Tage, sonst Stunden
      const days = /^[td]/i.test(match[2] || '');
      const unit = days ? (value === '1' ? ' Tag' : ' Tage') : 'h';
      return {
        kind: patterns[i].kind,
        label: patterns[i].kind === 'sp' ? (value || '?') + ' SP' : ('Timebox ' + (value ? value + unit : '')).trim(),
        cleanTitle: (title.slice(0, match.index) + ' ' + title.slice(match.index + match[0].length)).replace(/\s+/g, ' ').trim()
      };
    }
    return {kind: 'none', label: '? SP', cleanTitle: title};
  }

  // Nur der Text-Knoten mit der Schätzung wird gekürzt, der Rest bleibt GitLabs (MR-Titel enthalten Links wie #123).
  // Rendert GitLab den Titel neu, steht die Schätzung wieder im Text → Badge wird neu gebaut.
  // showMissing: rotes „? SP" ohne Schätzung (Tickets ja, MRs nein – deren Ticket kann trotzdem geschätzt sein)
  // pinRight (Board-Karten): Badge fest oben rechts, der Titel bricht davor um
  function applyEstimateBadge(container, showMissing, pinRight) {
    const patterns = getEstimatePatterns();
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let textNode = null;
    let estimate = null;
    for (let node = walker.nextNode(); node && !textNode; node = walker.nextNode()) {
      if (node.parentElement.closest('.ambient-estimate-badge')) continue;
      const parsed = parseEstimate(node.data, patterns);
      if (parsed.kind !== 'none') {
        textNode = node;
        estimate = parsed;
      }
    }
    const existing = container.querySelector('.ambient-estimate-badge');
    const stripTitle = isFeatureOn('estimateStripTitle');
    if (!textNode && (existing || !showMissing)) return;
    if (!stripTitle && existing && existing.ambientTextNode === textNode) return; // Titel bleibt ungekürzt, Badge steht schon
    if (existing) existing.remove(); // GitLab hat den Text zurückgesetzt, nicht wiederherstellen

    const badge = createTextSpan(estimate ? estimate.label : '? SP', pinRight
      ? {float: 'right', marginLeft: '0.5rem', whiteSpace: 'nowrap'}
      : {marginLeft: '0.35em', whiteSpace: 'nowrap', verticalAlign: 'middle', fontSize: '0.55em', padding: '0.15em 0.5em',
        position: 'relative', top: '-0.18em'});
    badge.className = 'ambient-estimate-badge gl-badge badge badge-pill ' +
      ESTIMATE_BADGE_VARIANTS[estimate ? estimate.kind : 'none'];
    badge.dataset.label = badge.textContent;
    if (!textNode) badge.title = 'Keine Schätzung im Titel';
    if (pinRight) {
      badge.title = (badge.title ? badge.title + ' · ' : '') + 'Klick: nur „' + badge.textContent + '" zeigen, erneut: alle';
      badge.addEventListener('click', function (ev) {
        ev.preventDefault(); // Badge sitzt im Titel-Link, sonst öffnet sich das Ticket
        ev.stopPropagation();
        toggleEstimateFilter(badge.dataset.label);
      });
    }
    if (pinRight) container.prepend(badge); // Float muss vor dem Text stehen
    else if (textNode) textNode.after(badge);
    else container.appendChild(badge);
    if (!textNode) return;
    badge.ambientTextNode = textNode;
    badge.dataset.ambientOriginal = textNode.data;
    if (stripTitle) textNode.data = textNode.data.match(/^\s*/)[0] + estimate.cleanTitle; // führendes Leerzeichen nach einem Link bleibt
  }

  // Klick auf einen Board-Badge blendet alle Karten mit anderer Schätzung aus; per :has() greift das auch für
  // Karten, die GitLab später nachlädt. Nur bis zum Neuladen, nicht gespeichert.
  let estimateFilter = '';
  function toggleEstimateFilter(label) {
    estimateFilter = estimateFilter === label ? '' : label;
    let style = document.getElementById('ambient-estimate-filter');
    if (!style) {
      style = document.createElement('style');
      style.id = 'ambient-estimate-filter';
      document.head.appendChild(style);
    }
    const match = '.ambient-estimate-badge[data-label="' + CSS.escape(estimateFilter) + '"]';
    style.textContent = estimateFilter
      ? SEL.boardCard + ':not(:has(' + match + ')){display:none !important}' +
        SEL.boardCard + ' ' + match + '{outline:2px solid currentColor;outline-offset:1px}'
      : '';
  }

  // Board-Karten laufen über scanBoard (nur aktive Spalten), hier Issue-Detail/-Drawer und MR-Seite
  function applyEstimateBadges() {
    document.querySelectorAll(SEL.issueTitle).forEach(function (el) {
      applyEstimateBadge(el, true);
    });
    document.querySelectorAll(SEL.mrTitle + ', ' + SEL.mrStickyTitle).forEach(function (el) {
      applyEstimateBadge(el, false);
    });
  }

  function removeEstimateBadges(root) {
    (root || document).querySelectorAll('.ambient-estimate-badge').forEach(function (badge) {
      if (badge.ambientTextNode) badge.ambientTextNode.data = badge.dataset.ambientOriginal;
      badge.remove();
    });
  }

  const SPLIT_LABEL_EXCLUDED = '.gl-new-dropdown-panel, .gl-dropdown-menu, [role="listbox"], [role="menu"], ' +
    '[data-testid*="filtered-search"], .gl-filtered-search-token, .filtered-search-box';
  const SPLIT_LABEL_PATTERN = /^(.+)::(.+)$/;

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

  // Label-Farbe als Schrift auf dem Seitenhintergrund: zu dunkel/hell → Richtung Weiß (Dark Mode) bzw. Schwarz mischen,
  // bis WCAG-Kontrast 4.5:1 erreicht ist (Farbton bleibt erkennbar)
  function readableOnPageBackground(color) {
    const rgb = parseCssColorToRgb(color);
    if (!rgb) return color;
    const dark = isGitLabDarkModeActive();
    const bg = dark ? {r: 24, g: 23, b: 29} : {r: 255, g: 255, b: 255};
    const lin = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const lum = function (c) { return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b); };
    const ratio = function (c) {
      const a = lum(c), b = lum(bg);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    const target = dark ? 255 : 0;
    let c = {r: rgb.r, g: rgb.g, b: rgb.b};
    for (let i = 0; i < 20 && ratio(c) < 4.5; i++) {
      c = {r: Math.round(c.r + (target - c.r) * 0.1), g: Math.round(c.g + (target - c.g) * 0.1), b: Math.round(c.b + (target - c.b) * 0.1)};
    }
    return 'rgb(' + c.r + ', ' + c.g + ', ' + c.b + ')';
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
      color: readableOnPageBackground(color), // wie bei GitLabs Scoped Labels: Label-Farbe als Schrift, bei Bedarf aufgehellt
      padding: '0 8px'
    });
    el.appendChild(left);
    el.appendChild(right);
    // Entfernbares Label (Ticket-Detail): eigenes „×" klickt GitLabs ausgeblendeten Entfernen-Button
    const close = labelElem.querySelector('.gl-label-close');
    if (close) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ambient-split-label-close';
      btn.textContent = '×';
      btn.setAttribute('aria-label', close.getAttribute('aria-label') || 'Remove label');
      applyStyles(btn, {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'center',
        flex: '0 0 auto',
        width: '14px',
        height: '14px',
        border: '0',
        borderRadius: '50%',
        margin: '0 4px 0 -2px',
        padding: '0',
        background: 'transparent',
        color: right.style.color,
        font: 'inherit',
        lineHeight: '1',
        cursor: 'pointer'
      });
      btn.style.setProperty('--ambient-close-hover-bg', color);
      btn.style.setProperty('--ambient-close-hover-fg', getContrastTextColor(color, '#1f2937', '#ffffff'));
      el.style.background = right.style.background; // Hintergrund hinter dem Button, damit der Kreis frei steht
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        close.click();
      });
      el.appendChild(btn);
    }
    // Klick/Enter an das ausgeblendete Original weiterreichen: behält GitLabs Verhalten (z. B. Board filtern)
    const forward = function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      const link = labelElem.querySelector('a');
      if (link) link.click();
    };
    el.addEventListener('click', forward);
    el.addEventListener('keydown', function (ev) {
      if (ev.target === el && (ev.key === 'Enter' || ev.key === ' ')) forward(ev);
    });
    return el;
  }

  // Eingeklappte Spalten drehen den Label-Text (writing-mode: vertical) – dort bleibt GitLabs Original stehen
  // Erkennung über writing-mode, gedrehte Titel (transform) oder eine „collapsed"-Klasse an einem Vorfahren
  function isVerticalText(elem) {
    if (/vertical|sideways/.test(getComputedStyle(elem).writingMode || '')) return true;
    const title = elem.closest(SEL.listTitle);
    if (title && getComputedStyle(title).transform !== 'none' && getComputedStyle(title).transform !== '') return true;
    // „hide-collapsed" (MR-Sidebar) heißt nur „bei eingeklappter Sidebar ausblenden", nicht eingeklappt;
    // „page-with-super-sidebar-collapsed" sitzt am Seiten-Layout, wenn GitLabs linke Navigation eingeklappt ist
    return Boolean(elem.closest('[class*="collapsed"]:not(.hide-collapsed):not(.page-with-super-sidebar-collapsed)'));
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
        labelElem.setAttribute('data-ambient-split', '0'); // kein Scoped Label → nicht erneut prüfen
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
    const right = el.children[1];
    if (!left || !right) return;
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

  function scanBoard(projectSettings) {
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

      if (header) updateColumnSp(boardListElem, header, projectSettings);
      if (listName && header) {
        ensureListSelectionCheckbox(
          header,
          listName,
          listNameLower,
          projectSettings
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

      // Closed-Spalte: Script nur auf kürzlich geschlossenen Karten (null = Liste lädt noch)
      const isClosedList = isAllowed && isClosedListHeader(header, listNameLower);
      const closedIids = isClosedList ? getRecentlyClosedIids(projectSettings) : null;

      const cards = boardListElem.querySelectorAll(SEL.boardCard);
      log('Liste #' + li + ' "' + displayListName + '" allowed: ' + isAllowed + ', Karten: ' + cards.length);

      for (let k = 0; k < cards.length; k++) {
        const cardElem = cards[k];
        const titleLink = isFeatureOn('estimateBadge') && cardElem.querySelector(SEL.cardTitleLink);
        if (!isAllowed || (isClosedList && !(closedIids && closedIids.has(getIssueIidFromCard(cardElem))))) {
          markCardSkipped(cardElem);
          // inaktive Spalten (z. B. Closed): SP-Badge ja, rotes „? SP" nein
          if (titleLink) applyEstimateBadge(titleLink, false, true);
          continue;
        }
        cardElem.removeAttribute('data-ambient-skip');
        if (titleLink) applyEstimateBadge(titleLink, true, true);

        // in andere Spalte gezogen → Verweildauer neu bestimmen
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
        if (isFeatureOn('columnAge') && !isClosedList) { // Liegezeit in Closed sagt nichts
          fetchAndDisplayColumnAge(projectSettings, issueIid, cardElem, columnLabelText);
        }
        if (isFeatureOn('cardActions')) injectCardActions(cardElem, issueIid, projectSettings);

        if (!isFeatureOn('progress')) {
          cardElem.setAttribute('data-ambient-progress-processed', '1');
          continue;
        }

        if (newFetchesThisScan >= MAX_NEW_FETCHES_PER_SCAN) {
          limitReached = true;
          break;
        }

        cardElem.setAttribute('data-ambient-progress-processed', '1');
        if (fetchAndDisplayProgress(projectSettings, issueIid, cardElem)) {
          newFetchesThisScan++;
          totalFetchesSincePageLoad++;
        }
      }
    }

    if (debugEnabled) { // Guard bleibt: die Zählung kostet zwei querySelectorAll pro Scan
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
      // Ohne DOM-Änderung käme kein nächster Scan → selbst nachlegen, gedrosselt auf einen pro SCAN_LIMIT_RETRY_MS
      if (!scanLimitRetryTimer) {
        scanLimitRetryTimer = setTimeout(function () {
          scanLimitRetryTimer = null;
          if (rescanHook) rescanHook();
        }, SCAN_LIMIT_RETRY_MS);
      }
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

  function scanIssueDetail(projectSettings) {
    if (window.location.href !== lastDetailHref) {
      lastDetailHref = window.location.href;
      detailRetry.reset(); // SPA-Navigation: neue Ansicht bekommt wieder alle Versuche
    }
    if (!projectSettings) {
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
      detailRetry.schedule();
      return;
    }
    detailRetry.reset();

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

      loadDetailProgress(projectSettings, issueIid, wrapper, 'ambientProgressIssueIid', function (data, url, tsUrl) {
        injectProgressIntoIssueDetail(wrapper, data, url, tsUrl, issueIid);
      });
    }
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
    return glApi(projectPath, '/issues/' + issueIid + '/notes', 'Ticket-Aktion',
      {method: 'POST', body: JSON.stringify({body: body})});
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
    row.className = 'ambient-ticket-actions-row';
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
    toggle.setAttribute('data-ambient-menu-toggle', '');
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
      if (title) {
        const header = createTextSpan(title);
        header.className = 'ambient-dropdown-title';
        menu.appendChild(header);
      }
      const list = document.createElement('div');
      list.className = 'ambient-dropdown-list';
      menu.appendChild(list);
      buildItems().forEach(function (entry) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'ambient-dropdown-item js-no-trigger';
        item.setAttribute('role', 'menuitem');
        item.appendChild(createTextSpan(entry.label, {fontWeight: entry.sub ? '600' : '400'}));
        if (entry.sub) item.appendChild(createTextSpan(entry.sub, {fontSize: '12px', opacity: '0.7'}));
        if (entry.title) item.title = entry.title;
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

    // mousedown & Co. fängt installNoTriggerGuard ab (sonst startet GitLab Drag oder öffnet die Karte)
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
        if (target && target.closest && target.closest('.ambient-card-actions, .ambient-dropdown-menu, [data-ambient-menu-toggle]')) {
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

  // Ticket- und MR-Seitenleiste: Balken-Zeile in den (schon platzierten) Container zeichnen
  function fillDetailBadge(container, progressData, portalUrl, timesheetUrl, buttonsFeature) {
    const theme = getThemeAwareBarStyles({barOverrides: {flex: '1 1 auto', minWidth: '0'}});
    container.style.display = showEnabled ? '' : 'none';
    container.style.color = theme.textColor;
    container.innerHTML = '';
    container.appendChild(buildProgressRow('ambient-progress-row ambient-progress-row-detail', progressData, theme.styles,
      portalUrl, timesheetUrl, buttonsFeature));
  }

  function injectProgressIntoMRDetail(assigneeBlock, progressData, portalUrl, timesheetUrl, projectSettings, issueIid) {
    const parent = assigneeBlock && assigneeBlock.parentElement;
    if (!parent || !progressData) return;
    let container = parent.querySelector('.ambient-progress-mr-badge');
    if (!container) {
      container = document.createElement('div');
      container.className = 'ambient-progress-mr-badge';
      parent.insertBefore(container, assigneeBlock);
    }
    fillDetailBadge(container, progressData, portalUrl, timesheetUrl, 'mrPortalButtons');
    const actionsRow = isFeatureOn('mrActions') && createTicketActionsRow(projectSettings, issueIid);
    if (actionsRow) container.appendChild(actionsRow);
  }

  // Ticket- und MR-Seitenleiste: aus dem Cache zeichnen oder einmal laden. markElem.dataset[markKey] bekommt die IID,
  // damit der Scan die Ansicht überspringt – schon vor dem Request, sonst fragt jeder Scan nach Fehler erneut an.
  function loadDetailProgress(projectSettings, issueIid, markElem, markKey, render) {
    if (!issueIid || !markElem) return;
    const url = buildPortalUrl(projectSettings, issueIid);
    const cacheKey = buildProgressCacheKey(projectSettings, issueIid);
    if (!url || !cacheKey) {
      warn('Keine Portal-Basis oder Projekt-ID für', projectSettings.projectPath, '; Detail-Fortschritt wird nicht geladen.');
      return;
    }
    const timesheetUrl = buildTimesheetUrl(projectSettings, issueIid);
    const cached = findProgressCacheEntryForIssue(projectSettings, issueIid);
    if (!cached && isProjectRequestBlocked(projectSettings.projectKey)) return;
    markElem.dataset[markKey] = issueIid;
    if (cached) {
      log('Detail liest Cache (Projekt', projectSettings.projectPath + ', Issue', issueIid + ')');
      render(cached, url, timesheetUrl);
      return;
    }
    log('Detail lädt Progress-Daten (Projekt', projectSettings.projectPath + ', Issue', issueIid + ')');
    totalFetchesSincePageLoad++;
    loadProgressData(url, issueIid)
      .then(function (progressData) {
        clearProjectRequestBlock(projectSettings.projectKey);
        if (!progressData) return;
        setProgressCacheEntry(cacheKey, progressData);
        render(progressData, url, timesheetUrl);
      })
      .catch(function (err) {
        error('Request-Fehler für Issue ' + issueIid + ' (Detailansicht):', err);
        if (err && err.status) blockProjectRequests(projectSettings.projectKey, err.status);
      });
  }

  /******************************************************************
   * Ticket-Assignee-Umzuweisen auf der MR-Detailseite
   ******************************************************************/

  function loadMergeRequestDetails(projectPath, mrIid) {
    if (!isNumericId(mrIid)) return Promise.reject(new Error('Ungültige MR-IID'));
    return glApi(projectPath, '/merge_requests/' + mrIid, 'MR')
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
    return glApi(projectPath, '/issues/' + issueIid, 'Ticket').then(function (issue) {
      return issue.assignees || [];
    });
  }

  function updateIssueAssignee(projectPath, issueIid, userId) {
    if (!isNumericId(issueIid)) return Promise.reject(new Error('Ungültige Issue-IID'));
    return glApi(projectPath, '/issues/' + issueIid, 'Assignee setzen',
      {method: 'PUT', body: JSON.stringify({assignee_ids: [userId]})});
  }

  function createTicketAssigneeContainer() {
    const container = document.createElement('div');
    container.className = 'ambient-ticket-assignee-badge';
    applyStyles(container, {
      padding: '0.5rem 0',
      borderBottomStyle: 'solid',
      borderBottomWidth: '1px',
      borderColor: 'var(--gl-border-color-subtle)',
      background: THEME_BG,
      fontSize: '12px',
      display: 'flex',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '0.4rem'
    });
    return container;
  }

  // Inhalt des Ticket-Assignee-Blocks: data = {status} (Laden/Fehler) oder {assignees, mrInfo}.
  // Auch die Einstellungs-Vorschau nutzt das mit Beispieldaten, damit sie genau wie die MR-Seite aussieht.
  function renderTicketAssigneeBlock(container, data, onAssign) {
    container.innerHTML = '';
    const label = document.createElement('span');
    label.textContent = 'Ticket-Assignee:';
    applyStyles(label, {fontWeight: '600', opacity: '0.8'});
    container.appendChild(label);

    const currentWrap = document.createElement('span');
    applyStyles(currentWrap, {display: 'inline-flex', alignItems: 'center', gap: '0.25rem'});
    container.appendChild(currentWrap);

    const quickActionsWrap = document.createElement('span');
    applyStyles(quickActionsWrap, {display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem'});
    container.appendChild(quickActionsWrap);

    if (data.status) {
      currentWrap.textContent = data.status;
      return;
    }

    const assignees = data.assignees;
    const currentId = assignees[0] ? assignees[0].id : null;
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

    const shownIds = {};
    [
      [data.mrInfo.assignee, 'MR-Assignee zuweisen'],
      [data.mrInfo.author, 'MR-Author zuweisen'],
      [data.mrInfo.reviewer, 'MR-Reviewer zuweisen']
    ].forEach(function (entry) {
      const user = entry[0];
      if (!user || shownIds[user.id] || user.id === currentId) return;
      shownIds[user.id] = true;
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
      text.textContent = entry[1] + ': ' + user.name;
      applyStyles(text, {fontSize: '11px'});
      button.appendChild(text);

      if (onAssign) {
        button.addEventListener(
          'click',
          function (ev) {
            ev.stopPropagation();
            ev.preventDefault();
            onAssign(user, button);
          },
          true
        );
      }
      quickActionsWrap.appendChild(button);
    });
  }

  function injectIssueAssigneeBlock(assigneeBlock, projectPath, issueIid) {
    const parent = assigneeBlock.parentElement;
    if (!parent || !projectPath || !issueIid) return;

    let container = parent.querySelector('.ambient-ticket-assignee-badge');
    if (!container) {
      container = createTicketAssigneeContainer();
      parent.insertBefore(container, assigneeBlock);
    }
    parent.dataset.ambientTicketAssigneeIid = issueIid;
    renderTicketAssigneeBlock(container, {status: 'Lädt…'});

    const mrIid = getMrIidFromLocation();

    Promise.all([
      loadIssueAssignees(projectPath, issueIid),
      mrIid
        ? loadMergeRequestDetails(projectPath, mrIid)
        : Promise.resolve({author: null, assignee: null, reviewer: null})
    ])
      .then(function (results) {
        renderTicketAssigneeBlock(container, {assignees: results[0], mrInfo: results[1]}, function (user, button) {
          button.disabled = true;
          updateIssueAssignee(projectPath, issueIid, user.id)
            .then(function () {
              injectIssueAssigneeBlock(assigneeBlock, projectPath, issueIid);
            })
            .catch(function (err) {
              button.disabled = false;
              error('Konnte Ticket-Assignee nicht aktualisieren für Issue', issueIid, err);
            });
        });
      })
      .catch(function (err) {
        error('Konnte Ticket-Assignee-Infos nicht laden für Issue', issueIid, err);
        renderTicketAssigneeBlock(container, {status: 'Fehler beim Laden'});
      });
  }

  function scanMergeRequestPage(projectSettings) {
    if (window.location.href !== lastMrHref) {
      lastMrHref = window.location.href;
      mrRetry.reset();
    }
    if (!projectSettings) {
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
      mrRetry.schedule();
      return;
    }

    mrRetry.reset();

    const parent = assigneeBlock.parentElement;
    if (isFeatureOn('mrPageProgress') && (!parent || parent.dataset.ambientProgressMrIssueIid !== issueIid)) {
      loadDetailProgress(projectSettings, issueIid, parent, 'ambientProgressMrIssueIid', function (data, url, tsUrl) {
        injectProgressIntoMRDetail(assigneeBlock, data, url, tsUrl, projectSettings, issueIid);
      });
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
      log('Konnte show-Parameter nicht parsen:', e);
    }
    return null;
  }

  // settingsOverride: nur die Einstellungs-Vorschau (Beispiel-Ticket-Aktionen)
  function injectProgressIntoIssueDetail(detailWrapperElem, progressData, portalUrl, timesheetUrl, issueIid, settingsOverride) {
    if (!detailWrapperElem || !progressData) return;

    let container = detailWrapperElem.querySelector('.ambient-progress-detail-badge');
    if (!container) {
      container = document.createElement('div');
      container.className = 'ambient-progress-detail-badge';
      const assigneesSection = detailWrapperElem.querySelector(SEL.detailAssignees);
      detailWrapperElem.insertBefore(container, assigneesSection || detailWrapperElem.firstChild);
    }
    fillDetailBadge(container, progressData, portalUrl, timesheetUrl, 'issuePortalButtons');

    const actionSettings = settingsOverride || (currentScanContext && currentScanContext.projectSettings);
    if (issueIid && actionSettings && isFeatureOn('issueActions')) {
      const dropdown = createTicketActionsDropdown(actionSettings, issueIid, true);
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
    projectSettings
  ) {
    if (!header || !listName || !listNameLower) return;
    // Als Icon-Button in GitLabs Button-Gruppe (+ / ⚙); eingeklappte Spalten blenden die Gruppe selbst aus
    let buttonGroup = header.querySelector(SEL.boardListButtons);
    // GitLabs Closed-Liste hat keine Button-Gruppe → eigene neben dem Zähler, sonst ist das Auge dort nicht schaltbar
    if (isClosedListHeader(header, listNameLower)) {
      const ownGroup = header.querySelector('.ambient-closed-buttons');
      const countBadge = header.querySelector(SEL.issueCountBadge);
      if (isVerticalText(header) || !countBadge) {
        if (ownGroup) ownGroup.remove();
        return;
      }
      if (!buttonGroup) {
        buttonGroup = document.createElement('div');
        buttonGroup.className = 'ambient-closed-buttons board-list-button-group gl-flex gl-pl-2';
        countBadge.after(buttonGroup);
      }
    }
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
        scanBoard(projectSettings);
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
    // ohne Portal-URL + Projekt-ID hat das Auge nichts zu schalten; Sortieren bleibt
    button.style.display = projectSettings.projectId && projectSettings.portalBaseUrl ? '' : 'none';
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
    if (!baseUrl && projectSettings.portalWarning !== false) {
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

  // Ganze Zeile ist ein <label>: Klick irgendwo schaltet um, die Checkbox (role=switch) trägt Zustand und Fokus.
  // options: desc (zweite Zeile), where (Chip hinter dem Label), child (Unter-Feature, eingerückt), compact (Pill im Kopf)
  function makeSwitch(labelText, checked, onChange, options) {
    const opts = options || {};
    switchIdCounter += 1;
    const labelId = 'ambient-switch-label-' + switchIdCounter;
    const wrapper = document.createElement('label');
    wrapper.className = 'ambient-setting-row ambient-switch-row' + (opts.compact ? ' ambient-switch-compact' : '');

    if (opts.child) {
      const elbow = document.createElement('span');
      elbow.className = 'ambient-switch-elbow';
      elbow.setAttribute('aria-hidden', 'true');
      // ↳-Pfeil; fill per style, weil GitLabs CSS SVGs sonst flächig füllt
      elbow.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" style="fill:none;stroke:currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path style="fill:none" d="M3 2v5a3 3 0 0 0 3 3h7M10 7l3 3-3 3"/></svg>';
      wrapper.appendChild(elbow);
    }

    const text = createRowText(labelText, opts.desc, opts.where);
    const labelSpan = text.firstChild.firstChild;
    labelSpan.id = labelId;
    wrapper.ambientLabel = labelSpan;

    // natives Checkbox-Element, als Schalter gezeichnet (.ambient-switch-input im Stylesheet)
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'ambient-switch-input';
    checkbox.setAttribute('role', 'switch');
    checkbox.setAttribute('aria-labelledby', labelId);
    if (opts.desc) {
      text.lastChild.id = labelId + '-desc';
      checkbox.setAttribute('aria-describedby', text.lastChild.id);
    }
    checkbox.checked = checked;
    checkbox.addEventListener('change', function () {
      onChange(checkbox.checked);
    });

    wrapper.appendChild(text);
    wrapper.appendChild(checkbox);
    return wrapper;
  }

  // 20px-Icon für die Buttons in der Breadcrumb-Zeile (Zahnrad, MR-Links)
  function createHeaderIcon(svgHtml) {
    const icon = document.createElement('span');
    icon.className = 'ambient-header-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = svgHtml;
    const svg = icon.querySelector('svg');
    if (svg) svg.setAttribute('focusable', 'false');
    return icon;
  }

  let toolbarCleanup = null;
  function createToolbar(projectSettings) {
    const existing = document.getElementById('ambient-progress-toolbar');
    if (existing) return existing;
    // Vue kann die alte Toolbar samt Referenz verwerfen: deren Listener und Panel hier immer abräumen
    if (toolbarCleanup) toolbarCleanup();
    toolbarCleanup = null;


    const insertParent = findToolbarTarget() || document.body;
    log('[createToolbar] Toolbar wird eingefügt in: ' + insertParent.tagName + '#' + insertParent.id);

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
      color: THEME_FG
    });

    let refreshAgeHighlightSection = null;

    const showToggle = makeSwitch(showEnabled ? t('Aktiv') : t('Pausiert'), showEnabled, function (val) {
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
      scheduleRerender();
      showToggle.ambientLabel.textContent = showEnabled ? t('Aktiv') : t('Pausiert');
      displayTab.refresh();
    }, {compact: true});

    // Alle Injektionen entfernen und neu scannen – Daten kommen aus den Caches, kein Request-Burst
    function rerenderFeatures() {
      document.querySelectorAll(
        '.ambient-progress-badge, .ambient-mr-badge, .ambient-column-age, .ambient-column-avg, .ambient-column-sp,' +
        ' .ambient-progress-detail-badge, .ambient-progress-mr-badge, .ambient-ticket-assignee-badge'
      ).forEach(function (el) { el.remove(); });
      removeSplitLabels();
      removeEstimateBadges();
      document.querySelectorAll('[data-ambient-progress-processed]').forEach(clearCardInjections);
      document.querySelectorAll(
        '[data-ambient-progress-issue-iid], [data-ambient-progress-mr-issue-iid], [data-ambient-ticket-assignee-iid]'
      ).forEach(function (el) {
        delete el.dataset.ambientProgressIssueIid;
        delete el.dataset.ambientProgressMrIssueIid;
        delete el.dataset.ambientTicketAssigneeIid;
      });
      if (rescanHook) rescanHook(); // derselbe Scan wie bei DOM-Änderungen (inkl. Split-Labels, Schätzungs-Badges)
    }

    const gearButton = document.createElement('button');
    gearButton.type = 'button';
    gearButton.setAttribute('aria-label', 'Progress-Einstellungen');
    gearButton.setAttribute('aria-haspopup', 'dialog');
    gearButton.setAttribute('aria-expanded', 'false');
    gearButton.setAttribute('aria-controls', 'ambient-progress-settings');
    gearButtonElement = gearButton;
    gearButton.setAttribute('title', 'Einstellungen');
    gearButton.className = 'btn gl-button btn-default btn-md btn-default-tertiary btn-icon ambient-header-btn';
    gearButton.appendChild(createHeaderIcon(TOOLBAR_ICON_SVG));
    // roter Punkt: rechts oben = Update verfügbar, links oben = Rate-Limit
    const releaseBadge = createTextSpan('');
    releaseBadge.className = 'ambient-header-dot';
    releaseBadge.setAttribute('aria-hidden', 'true');
    applyStyles(releaseBadge, {right: '4px', display: 'none'});
    gearButton.appendChild(releaseBadge);
    releaseNotificationElements.badge = releaseBadge;

    const rateLimitBadge = createTextSpan('');
    rateLimitBadge.className = 'ambient-header-dot';
    rateLimitBadge.setAttribute('aria-hidden', 'true');
    applyStyles(rateLimitBadge, {left: '4px', display: 'none'});
    gearButton.appendChild(rateLimitBadge);
    rateLimitNotificationElements.badge = rateLimitBadge;

    const dropdown = document.createElement('div');
    dropdown.id = 'ambient-progress-settings';
    dropdown.setAttribute('role', 'dialog');
    dropdown.setAttribute('aria-label', 'Progress-Einstellungen');
    // Seitenpanel wie GitLabs Ticket-Vorschau (Drawer), Stil in #ambient-progress-settings im Stylesheet
    // Kopf (Titel, Hauptschalter, Schließen, Tabs) und Fuß (Datenstand, Neu laden) bleiben beim Scrollen stehen
    const panelHeader = document.createElement('div');
    applyStyles(panelHeader, {
      display: 'flex',
      flexDirection: 'column',
      gap: '0.6rem',
      padding: '0.9rem 1.25rem 0',
      position: 'sticky',
      top: '0',
      zIndex: '2',
      background: THEME_BG,
      borderBottom: SETTINGS_BORDER
    });
    const titleRow = document.createElement('div');
    applyStyles(titleRow, {display: 'flex', alignItems: 'center', gap: '0.75rem'});
    const titleBox = document.createElement('div');
    applyStyles(titleBox, {flex: '1 1 auto', minWidth: '0', display: 'flex', flexDirection: 'column'});
    titleBox.appendChild(createTextSpan(t('Progress-Einstellungen'), {fontSize: '1.05rem', fontWeight: '600'}));
    titleBox.appendChild(createTextSpan('Version ' + SCRIPT_VERSION, {fontSize: '0.78rem', color: SETTINGS_SUBTLE_TEXT}));
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'ambient-btn btn gl-button btn-default btn-default-tertiary btn-icon btn-sm';
    closeButton.title = t('Schließen');
    closeButton.setAttribute('aria-label', t('Schließen'));
    closeButton.innerHTML = '<svg class="gl-button-icon gl-icon s16" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
    showToggle.title = 'Blendet alle Anzeigen des Scripts auf einmal aus (gilt für alle Boards)';
    titleRow.appendChild(titleBox);
    titleRow.appendChild(showToggle);
    titleRow.appendChild(closeButton);
    panelHeader.appendChild(titleRow);
    dropdown.appendChild(panelHeader);

    const content = document.createElement('div');
    applyStyles(content, {
      display: 'flex',
      flexDirection: 'column',
      gap: '1.25rem',
      padding: '1.25rem',
      flex: '1 0 auto'
    });
    dropdown.appendChild(content);

    // Update-Hinweis ganz oben, damit er vor „Daten neu laden" (lädt nur Daten) ins Auge fällt
    const releaseNotificationRow = document.createElement('div');
    applyStyles(releaseNotificationRow, {
      display: 'none',
      flexDirection: 'column',
      gap: '0.3rem',
      padding: '0.6rem 0.75rem',
      borderRadius: '6px',
      border: '1px solid #fbbf24',
      background: 'rgba(251, 191, 36, 0.12)',
      fontSize: '0.8rem',
      lineHeight: '1.35'
    });
    const releaseNotificationText = document.createElement('div');
    applyStyles(releaseNotificationText, {fontWeight: '700'});
    const releaseNotificationSteps = document.createElement('div');
    releaseNotificationSteps.textContent =
      'So updatest du: Tampermonkey-Icon → Dashboard → Script anhaken → „Aktualisieren“ (oder Tab „Installierte Userscripts“ → Updates suchen), danach diese Seite neu laden.';
    const releaseNotificationNotes = document.createElement('div');
    applyStyles(releaseNotificationNotes, {whiteSpace: 'pre-line', opacity: '0.8', fontSize: '0.75rem'});
    releaseNotificationRow.appendChild(releaseNotificationText);
    releaseNotificationRow.appendChild(releaseNotificationSteps);
    releaseNotificationRow.appendChild(releaseNotificationNotes);
    releaseNotificationElements.messageRow = releaseNotificationRow;
    releaseNotificationElements.messageText = releaseNotificationText;
    releaseNotificationElements.messageNotes = releaseNotificationNotes;
    content.appendChild(releaseNotificationRow);

    const rateLimitNotificationRow = document.createElement('div');
    applyStyles(rateLimitNotificationRow, CARD_STYLES);
    applyStyles(rateLimitNotificationRow, {display: 'none', gap: '0.25rem', padding: '0.7rem 0.9rem'});

    const rateLimitNotificationText = document.createElement('div');
    applyStyles(rateLimitNotificationText, {
      fontSize: '0.78rem',
      lineHeight: '1.35',
      opacity: '0.9',
      color: THEME_FG
    });

    rateLimitNotificationRow.appendChild(rateLimitNotificationText);
    rateLimitNotificationElements.messageRow = rateLimitNotificationRow;
    rateLimitNotificationElements.messageText = rateLimitNotificationText;
    content.appendChild(rateLimitNotificationRow);
    updateRateLimitWarningUI(getCachedRateLimitWarning());

    // Tabs (WAI-ARIA-Tabs: Pfeiltasten wechseln, nur der aktive Tab ist in der Tab-Reihenfolge)
    const tabDefs = [['anzeige', t('Anzeige')], ['board', t('Dieses Board')], ['erweitert', t('Erweitert')],
      ['labor', t('Experimente')]];
    const tabList = document.createElement('div');
    tabList.setAttribute('role', 'tablist');
    tabList.setAttribute('aria-label', 'Bereiche');
    applyStyles(tabList, {display: 'flex', gap: '0.25rem', overflowX: 'auto'});
    const tabButtons = {};
    const tabBadges = {};
    tabDefs.forEach(function (def) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ambient-tab';
      button.id = 'ambient-tab-' + def[0];
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', 'ambient-tabpanel-' + def[0]);
      button.appendChild(createTextSpan(def[1]));
      const badge = createTextSpan('');
      badge.className = 'ambient-tab-badge';
      button.appendChild(badge);
      button.addEventListener('click', function () {
        selectTab(def[0]);
      });
      tabButtons[def[0]] = button;
      tabBadges[def[0]] = badge;
      tabList.appendChild(button);
    });
    tabList.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const keys = tabDefs.map(function (def) { return def[0]; });
      const step = event.key === 'ArrowRight' ? 1 : keys.length - 1;
      const next = keys[(keys.indexOf(activeSettingsTab) + step) % keys.length];
      selectTab(next);
      tabButtons[next].focus();
      event.preventDefault();
    });
    panelHeader.appendChild(tabList);

    function setTabBadge(key, text, warning) {
      const badge = tabBadges[key];
      if (!badge) return;
      badge.textContent = text;
      badge.classList.toggle('ambient-tab-badge-warning', Boolean(warning));
    }

    // Das Board erst nach dem nächsten Paint neu aufbauen: der Schalter springt sofort um, schnelle Klicks werden
    // gebündelt. Synchron blockierte das Neu-Rendern aller Karten den Klick spürbar.
    let rerenderTimer = null;

    function scheduleRerender() {
      clearTimeout(rerenderTimer);
      rerenderTimer = setTimeout(function () {
        rerenderFeatures();
        if (refreshAgeHighlightSection) refreshAgeHighlightSection();
      }, 120);
    }

    const onFeatureChanged = scheduleRerender;

    const displayTab = createDisplayTab(onFeatureChanged, function () {
      const input = showToggle.querySelector('input');
      input.checked = true;
      input.dispatchEvent(new Event('change')); // speichert und aktualisiert Schalter, Label und Tab
    }, projectSettings);
    const tabPanels = {anzeige: displayTab.element};
    // Vorschau unter den Tabs im festen Kopf: bleibt sichtbar, die Schalter scrollen darunter durch
    const pinnedPreview = document.createElement('div');
    applyStyles(pinnedPreview, {padding: '0.75rem 0 0.9rem'});
    pinnedPreview.appendChild(displayTab.pinned);
    panelHeader.appendChild(pinnedPreview);
    const boardTab = createBoardTab(projectSettings, scheduleAutosave, function (configured) {
      setTabBadge('board', configured ? '' : '!', true);
    });
    refreshAgeHighlightSection = boardTab.refreshAgeHighlight;
    tabPanels.board = boardTab.element;
    tabPanels.erweitert = createAdvancedTab(projectSettings);
    tabPanels.labor = createExperimentsTab(projectSettings, function (count) {
      setTabBadge('labor', count ? String(count) : '', false);
    });
    Object.keys(tabPanels).forEach(function (key) {
      tabPanels[key].id = 'ambient-tabpanel-' + key;
      tabPanels[key].setAttribute('role', 'tabpanel');
      tabPanels[key].setAttribute('aria-labelledby', 'ambient-tab-' + key);
      content.appendChild(tabPanels[key]);
    });

    function selectTab(key) {
      const keys = tabDefs.map(function (def) { return def[0]; });
      const previous = activeSettingsTab;
      activeSettingsTab = key;
      Object.keys(tabButtons).forEach(function (k) {
        const selected = k === key;
        tabButtons[k].setAttribute('aria-selected', String(selected));
        tabButtons[k].tabIndex = selected ? 0 : -1;
        tabPanels[k].style.display = selected ? 'flex' : 'none';
      });
      pinnedPreview.style.display = key === 'anzeige' ? 'block' : 'none';
      if (key === 'anzeige' && previous && previous !== key) displayTab.refresh(); // Board-Overrides neu zählen
      if (previous && previous !== key) {
        const direction = keys.indexOf(key) > keys.indexOf(previous) ? 1 : -1;
        animateTabIn(tabPanels[key], direction);
        if (key === 'anzeige') animateTabIn(pinnedPreview, direction);
      }
    }

    // Ein noch nicht eingerichtetes Board öffnet direkt auf „Dieses Board"
    const boardConfigured = Boolean(projectSettings.projectId && projectSettings.portalBaseUrl);
    selectTab(boardConfigured ? (activeSettingsTab || 'anzeige') : 'board');

    const panelFooter = document.createElement('div');
    applyStyles(panelFooter, {
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      padding: '0.7rem 1.25rem',
      position: 'sticky',
      bottom: '0',
      zIndex: '2',
      background: THEME_BG,
      borderTop: SETTINGS_BORDER
    });
    const timestampLabel = document.createElement('div');
    applyStyles(timestampLabel, {flex: '1 1 auto', fontSize: '0.8rem', color: SETTINGS_SUBTLE_TEXT});
    lastRefreshLabelElement = timestampLabel;
    updateLastRefreshLabel();
    panelFooter.appendChild(timestampLabel);
    const refreshButton = document.createElement('button');
    refreshButton.type = 'button';
    refreshButton.textContent = '↻ ' + t('Daten neu laden');
    refreshButton.title = 'Cache leeren und Portal-Daten neu laden';
    refreshButton.className = 'ambient-btn btn gl-button btn-default btn-sm';
    refreshButton.addEventListener('click', function () {
      softRefresh(projectSettings);
    });
    manualRefreshButtonElement = refreshButton;
    panelFooter.appendChild(refreshButton);
    dropdown.appendChild(panelFooter);

    // Änderungen werden entprellt sofort übernommen; geänderte Felder leuchten kurz grün
    let autosaveTimer = null;

    // Fehler am Feld anzeigen (aria-invalid + Status mit role="alert"); kein Fokusklau beim Tippen
    function fail(input, statusElement, message) {
      if (statusElement) statusElement.textContent = message;
      [projectIdInputElement, portalUrlInputElement, extraIdsInputElement].forEach(function (el) {
        el.removeAttribute('aria-invalid');
      });
      input.setAttribute('aria-invalid', 'true');
    }

    function commitProjectConfig() {
      if (!projectIdInputElement || !portalUrlInputElement || !extraIdsInputElement) {
        return;
      }
      const projectAttempt = projectIdInputElement.value.trim();
      const portalRaw = portalUrlInputElement.value.trim();
      const extraIds = parseExtraProjectIds(extraIdsInputElement.value);
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
      if (!extraIds.every(isNumericId)) {
        return fail(extraIdsInputElement, extraIdsStatusElement, 'Nur Zahlen, durch Komma getrennt.');
      }
      if (extraIds.length > 3) {
        return fail(extraIdsInputElement, extraIdsStatusElement, 'Höchstens 3 weitere Projekt-IDs.');
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
      if (extraIds.join(', ') !== projectSettings.extraProjectIds) {
        entry.extraProjectIds = extraIds.join(', ');
        changedFields.push(extraIdsInputElement);
      }
      if (actionsAttempt !== (projectSettings.ticketActions || '').trim()) {
        entry.ticketActions = actionsAttempt;
        changedFields.push(ticketActionsInputElement);
      }
      if (!changedFields.length) return;

      writeProjectConfigEntry(projectSettings.projectKey, entry);
      if (entry.projectId) projectSettings.projectId = entry.projectId;
      if (entry.portalBaseUrl) projectSettings.portalBaseUrl = entry.portalBaseUrl;
      if (entry.extraProjectIds !== undefined) projectSettings.extraProjectIds = entry.extraProjectIds;
      if (entry.ticketActions !== undefined) projectSettings.ticketActions = entry.ticketActions;
      boardTab.updateStatus();
      [projectStatusElement, portalStatusElement, extraIdsStatusElement].forEach(function (el) {
        if (el) el.textContent = '';
      });
      [projectIdInputElement, portalUrlInputElement, extraIdsInputElement].forEach(function (el) {
        el.removeAttribute('aria-invalid');
      });
      changedFields.forEach(function (el) {
        if (el) flashSaved(el);
      });
      // Portal-relevante Änderungen: Cache leeren und neu laden (ohne Seiten-Reload)
      if (entry.projectId || entry.portalBaseUrl || entry.extraProjectIds !== undefined) {
        clearProgressCache();
        clearProjectRequestBlock(projectSettings.projectKey);
        softRefresh(projectSettings);
      }
    }

    function scheduleAutosave() {
      clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(commitProjectConfig, 700);
    }

    document.body.appendChild(dropdown);
    bar.appendChild(gearButton);

    let dropdownLocked = false;

    function updateDropdownVisibility() {
      dropdown.classList.toggle('ambient-open', dropdownLocked);
      gearButton.setAttribute('aria-expanded', String(dropdownLocked));
    }

    function setDropdownOpen(open, restoreFocus) {
      dropdownLocked = open;
      if (open) {
        // unter der GitLab-Top-Bar andocken
        const topbar = document.querySelector('header.super-topbar, header[class*="topbar"], .top-bar-fixed');
        dropdown.style.top = (topbar ? Math.round(topbar.getBoundingClientRect().bottom) + 1 : 49) + 'px';
      }
      if (open && refreshAgeHighlightSection) refreshAgeHighlightSection();
      if (open) displayTab.refreshPreview();
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
      if (!dropdownLocked || gearButton.contains(event.target) || dropdown.contains(event.target)) {
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
    toolbarCleanup = function () {
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

  // erster vorhandener Platz für die Toolbar (Breadcrumb-Zeile, sonst Top-Bar)
  function findToolbarTarget() {
    for (const sel of TOOLBAR_TARGET_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function repositionToolbarIfNeeded() {
    const bar = document.getElementById('ambient-progress-toolbar');
    const target = bar && findToolbarTarget();
    if (target && bar.parentNode !== target) {
      log('[reposition] Verschiebe Toolbar → ' + target.tagName + '#' + target.id);
      target.appendChild(bar);
    }
  }

  function getCurrentProjectPath() {
    const marker = '/-/';
    const idx = window.location.pathname.indexOf(marker);
    if (idx === -1) return null;
    const projectPath = window.location.pathname.slice(0, idx).replace(/^\/+|\/+$/g, '');
    if (!projectPath) return null;
    return projectPath;
  }

  function buildMrLinksBar(projectPath) {
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
      const baseHref = '/' + projectPath + '/-/merge_requests/?sort=merged_at_desc&state=opened';
      link.href = baseHref; // bis der eingeloggte User geladen ist: ungefilterte Liste
      getCurrentUser().then(function (user) {
        link.href = baseHref + '&' + queryParam + '=' + encodeURIComponent(user.username);
      }).catch(function (err) {
        warn('MR-Link: aktueller User nicht ladbar', err);
      });
      link.title = tooltip;
      link.setAttribute('aria-label', tooltip);
      link.className = 'btn gl-button btn-default btn-md btn-default-tertiary btn-icon ambient-header-btn ambient-mr-link';
      link.appendChild(createHeaderIcon(mergeRequestIconSvg()));

      const badge = document.createElement('span');
      badge.textContent = badgeLabel;
      badge.setAttribute('aria-hidden', 'true');
      badge.className = 'ambient-mr-link-badge';
      badge.style.background = badgeColor;
      link.appendChild(badge);

      return link;
    }

    linksBar.appendChild(makeMrIconLink('reviewer_username', 'R', '#3b82f6', 'MRs, bei denen ich Reviewer bin'));
    linksBar.appendChild(makeMrIconLink('assignee_username', 'A', '#10b981', 'Meine MRs'));
    return linksBar;
  }

  function insertMrLinksBar(wrapper, linksBar) {
    const toolbar = document.getElementById('ambient-progress-toolbar');
    if (toolbar && toolbar.parentNode === wrapper) {
      wrapper.insertBefore(linksBar, toolbar);
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
    const toolbar = document.getElementById('ambient-progress-toolbar');
    const needsMove = linksBar.parentNode !== wrapper ||
      (toolbar && toolbar.parentNode === wrapper && linksBar.nextSibling !== toolbar);
    if (needsMove) {
      insertMrLinksBar(wrapper, linksBar);
    }
  }

  // Einstellungs-Panel: Farben aus GitLabs Theme-Variablen, damit Hell und Dunkel ohne eigene Paletten passen
  const SETTINGS_ACCENT = '#1f75cb';
  const SETTINGS_BORDER = '1px solid var(--gl-border-color-default, #4c4b51)';
  const SETTINGS_SUBTLE_TEXT = 'var(--gl-text-color-subtle, rgba(128, 128, 128, 0.95))';
  const SETTINGS_DANGER = 'var(--gl-text-color-danger, #dd2b0e)';
  const SETTINGS_SUCCESS = 'var(--gl-text-color-success, #108548)';
  const SETTINGS_STRONG_BACKGROUND = 'var(--gl-background-color-strong, rgba(128, 128, 128, 0.14))';

  const SETTINGS_SUBHEADING_STYLES = {
    margin: '0',
    padding: '0 0.25rem',
    fontSize: '0.8rem',
    fontWeight: '600',
    color: SETTINGS_SUBTLE_TEXT
  };

  // Beschriftung über Formularfeldern
  const FIELD_LABEL_STYLES = {fontSize: '0.85rem', fontWeight: '600'};
  const FIELD_HINT_STYLES = {fontSize: '0.8rem', color: SETTINGS_SUBTLE_TEXT, lineHeight: '1.4'};
  const CHIP_STYLES = {
    fontSize: '0.7rem',
    fontWeight: '500',
    padding: '0 0.45rem',
    borderRadius: '999px',
    border: SETTINGS_BORDER,
    color: SETTINGS_SUBTLE_TEXT,
    whiteSpace: 'nowrap'
  };
  const TAB_PANEL_STYLES = {display: 'flex', flexDirection: 'column', gap: '1.25rem'};
  // Geschlossenes Panel: ganz rechts aus dem Bild, samt Schatten

  // Neuer Reiter gleitet kurz aus der Richtung ein, in die gewechselt wurde (1 = nach rechts, -1 = nach links)
  function animateTabIn(el, direction) {
    if (!el.animate || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    el.animate([
      {opacity: 0, transform: 'translateX(' + (direction * 24) + 'px)'},
      {opacity: 1, transform: 'translateX(0)'}
    ], {duration: 200, easing: 'ease-out'});
  }

  const CARD_STYLES = {
    display: 'flex',
    flexDirection: 'column',
    border: SETTINGS_BORDER,
    borderRadius: '10px',
    background: 'var(--gl-background-color-subtle, rgba(128, 128, 128, 0.07))'
  };

  // Gruppe: Überschrift (+ Zusatz rechts) über einer Karte, deren Zeilen per Stylesheet Trennlinien bekommen
  function createSettingsGroup(title, aside) {
    const group = document.createElement('section');
    applyStyles(group, {display: 'flex', flexDirection: 'column', gap: '0.5rem'});
    const head = document.createElement('div');
    applyStyles(head, {display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem'});
    const heading = document.createElement('h3');
    heading.textContent = title;
    applyStyles(heading, SETTINGS_SUBHEADING_STYLES);
    const asideElement = createTextSpan(aside || '', {fontSize: '0.78rem', color: SETTINGS_SUBTLE_TEXT});
    head.appendChild(heading);
    head.appendChild(asideElement);
    const list = document.createElement('div');
    list.className = 'ambient-setting-list';
    applyStyles(list, CARD_STYLES);
    applyStyles(list, {overflow: 'hidden'});
    group.appendChild(head);
    group.appendChild(list);
    return {element: group, list: list, heading: heading, aside: asideElement};
  }

  // Karte mit Titel (rechts Platz für einen Status) und optionalem Erklärtext
  function createPanelCard(title, text) {
    const card = document.createElement('section');
    applyStyles(card, CARD_STYLES);
    applyStyles(card, {padding: '1rem 1.1rem', gap: '0.8rem'});
    const head = document.createElement('div');
    applyStyles(head, {display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem'});
    const heading = document.createElement('h3');
    heading.textContent = title;
    applyStyles(heading, {margin: '0', fontSize: '0.95rem', fontWeight: '600'});
    head.appendChild(heading);
    card.appendChild(head);
    if (text) card.appendChild(createTextSpan(text, FIELD_HINT_STYLES));
    return {element: card, head: head};
  }

  // Label (+ Chip) und Beschreibung einer Zeile
  function createRowText(label, desc, where) {
    const text = document.createElement('span');
    applyStyles(text, {flex: '1 1 auto', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '0.1rem'});
    const title = document.createElement('span');
    applyStyles(title, {display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '500'});
    title.appendChild(createTextSpan(label));
    if (where) title.appendChild(createTextSpan(where, CHIP_STYLES));
    text.appendChild(title);
    if (desc) text.appendChild(createTextSpan(desc, FIELD_HINT_STYLES));
    return text;
  }

  // Zeile mit Text links und Button rechts (Diagnose, Gefahrenzone)
  function createActionRow(label, desc, buttonText, onClick, danger) {
    const row = document.createElement('div');
    row.className = 'ambient-setting-row';
    row.appendChild(createRowText(label, desc));
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = buttonText;
    button.className = 'ambient-btn btn gl-button btn-sm ' + (danger ? 'btn-danger btn-danger-secondary' : 'btn-default');
    applyStyles(button, {flex: '0 0 auto', minWidth: '92px'});
    button.addEventListener('click', onClick);
    row.appendChild(button);
    return row;
  }

  function setSettingDisabled(elem, disabled) {
    applyStyles(elem, {opacity: disabled ? '0.45' : '1', pointerEvents: disabled ? 'none' : ''});
    const input = elem.querySelector('input');
    if (input) input.disabled = disabled;
  }

  // Pro Unterreiter (view) des Anzeige-Tabs: [Schlüssel, Label, Beschreibung]. Unter-Features (FEATURE_PARENTS) stehen direkt hinter
  // ihrem Eltern-Feature und werden eingerückt.
  const FEATURE_MENU = [
    {view: 'board', title: 'Board-Karten', items: [
      ['progress', 'Fortschrittsbalken', 'Gebuchte vs. geschätzte Stunden aus dem Portal'],
      ['portalButtons', 'Portal- & Timesheet-Buttons', 'Direkt zum Ticket im Portal oder zur Buchung'],
      ['mrBadge', 'MR-Badge', 'Verknüpfte Merge Requests mit Status'],
      ['mrAvatars', 'Assignee- & Reviewer-Avatare', 'Wer am MR arbeitet und wer reviewt'],
      ['estimateBadge', 'Schätzung als Badge', '„(3 SP)“ oder „(Timebox: 4h)“ aus dem Titel wird ein Badge, auch in Ticket und MR'],
      ['estimateStripTitle', 'Schätzung aus dem Titel nehmen', 'Aus: „(3 SP)“ bleibt zusätzlich im Titel stehen, z. B. für Scripte, die SP aus dem Titel zählen'],
      ['columnSp', 'SP-Summe im Spalten-Header', 'Alle Tickets der Spalte (auch nicht geladene), berücksichtigt die Board-Filter'],
      ['splitLabels', 'Geteilte Scoped Labels', 'workflow::Review zweifarbig darstellen, auch in Ticket und MR'],
      ['cardActions', 'Ticket-Aktionen-Menü', '⋮ im Karten-Footer mit deinen Ticket-Aktionen (Tab „Dieses Board“)']
    ]},
    {view: 'board', title: 'Verweildauer', items: [
      ['columnAge', 'Uhr im Karten-Footer', 'Wie lange das Ticket schon in der Spalte liegt'],
      ['columnAvg', 'Median im Spalten-Header', 'Typische Liegezeit der Spalte']
    ]},
    {view: 'ticket', title: 'Ticket-Seitenleiste', items: [
      ['issueDetail', 'Fortschrittsbalken', 'Portal-Balken in der Ticket-Ansicht und im Board-Drawer'],
      ['issuePortalButtons', 'Portal- & Timesheet-Buttons', 'Links und rechts neben dem Balken'],
      ['issueActions', 'Ticket-Aktionen', 'Dropdown mit deinen Ticket-Aktionen (Tab „Dieses Board“)']
    ]},
    {view: 'mr', title: 'Merge-Request-Seitenleiste', items: [
      ['mrPageProgress', 'Fortschrittsbalken', 'Portal-Balken des verknüpften Tickets'],
      ['mrPortalButtons', 'Portal- & Timesheet-Buttons', 'Links und rechts neben dem Balken'],
      ['mrActions', 'Ticket-Aktionen', 'Buttons mit deinen Ticket-Aktionen (Tab „Dieses Board“)'],
      ['mrAssigneeButtons', 'Ticket-Assignee-Buttons', 'Ticket per Klick an MR-Assignee, -Author oder -Reviewer geben']
    ]},
    {view: 'topbar', title: 'Breadcrumb-Zeile', items: [
      ['mrLinks', 'MR-Schnellzugriff', 'Buttons zu deinen offenen MRs neben dem Zahnrad']
    ]}
  ];

  /******************************************************************
   * Diagnose- und Daten-Werkzeuge (Einstellungen → Tab Erweitert)
   ******************************************************************/

  // Selektoren, die auf der aktuellen Ansicht Treffer liefern sollten
  function getRelevantSelectorKeys() {
    if (isMergeRequestPage()) return ['mrTitle', 'mrAssigneeBlock', 'breadcrumbsWrapper'];
    const keys = ['breadcrumbsWrapper'];
    if (isBoardView()) {
      keys.push('boardsApp', 'boardList', 'boardCard', 'boardListHeader', 'boardListButtons',
        'listTitle', 'cardNumber', 'cardFooter', 'cardBody', 'cardTitleLink');
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
      extraProjectIds: projectSettings.extraProjectIds || '',
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
    const extraIds = parseExtraProjectIds(extraProjectIdsFromConfig(data)); // nimmt auch das alte Format (zweites Projekt)
    if (!data || !isNumericId(data.projectId) || !portalBaseUrl || !extraIds.every(isNumericId)) {
      showToast({text: 'Import fehlgeschlagen: Projekt-ID/Portal-URL ungültig.', variant: 'warning'});
      return false;
    }
    writeProjectConfigEntry(projectSettings.projectKey, {
      projectId: String(data.projectId),
      portalBaseUrl: portalBaseUrl,
      extraProjectIds: extraIds.slice(0, 3).join(', '),
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
      extraProjectIds: projectSettings.extraProjectIds || '',
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
   * Eingabefelder und Buttons für die Einstellungs-Tabs
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

  // options: placeholder, hint (Text unter dem Feld), chip (z. B. „alle Boards" hinter dem Label)
  function createExperimentButton(text, title, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.title = title;
    button.className = 'ambient-btn btn gl-button btn-default btn-sm';
    button.addEventListener('click', onClick);
    return button;
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
    if (!window.confirm('Die Reihenfolge ändert sich für ALLE im Team.\n\n' +
      (mode === 'assignee' ? 'Tickets werden nach Assignee gruppiert (Unassigned zuerst)' : 'Tickets ohne Assignee werden nach oben sortiert') +
      ' in der Spalte „' + columnLabel + '“.\n\nFortfahren?')) {
      return;
    }
    let moved = 0;
    // ponytail: per_page=100, keine Paginierung – ab 100 offenen Tickets pro Spalte fehlen die hinteren
    glApi(projectPath, '/issues?state=opened&labels=' + encodeURIComponent(columnLabel) +
      '&order_by=relative_position&sort=asc&per_page=100', 'Tickets laden')
      .then(function (issues) {
        return planReorder(issues, mode).reduce(function (chain, move) {
          return chain.then(function () {
            const body = move.move_after_id ? {move_after_id: move.move_after_id} : {move_before_id: move.move_before_id};
            return glApi(projectPath, '/issues/' + move.iid + '/reorder', 'Verschieben von #' + move.iid,
              {method: 'PUT', body: JSON.stringify(body)}).then(function () { moved++; });
          });
        }, Promise.resolve());
      })
      .then(function () {
        showToast({text: moved + ' Ticket(s) verschoben – lade neu…', variant: 'success'});
        setTimeout(function () { window.location.reload(); }, 800);
      })
      .catch(function (err) {
        error('Sortierung fehlgeschlagen:', err);
        showToast({text: 'Sortierung abgebrochen: ' + err.message + (moved ? ' (' + moved + ' bereits verschoben)' : ''), variant: 'warning'});
      });
  }

  // [Label, Beschreibung, Button, Aktion] für „Diagnose & Daten" im Tab Erweitert
  function createDataToolDefs(projectSettings) {
    return [
      ['Selektor-Selbsttest', 'Prüft, ob die GitLab-Elemente gefunden werden, auf die sich das Script verlässt', 'Ausführen',
        runSelectorSelftest],
      ['Portal-Fehler', 'Letzte Portal-Fehler dieser Seitensitzung (Toast + Konsole)', 'Anzeigen', showPortalErrors],
      ['Debug-Info', 'Version, Ansicht und Selektor-Treffer für Fehlerberichte (ohne Portal-URL)', 'Kopieren', function () {
        copyToClipboard(buildDebugInfo(), 'Debug-Info kopiert.');
      }],
      ['Konfiguration exportieren', 'Projekt-ID, Portal-URL und Ticket-Aktionen als JSON', 'Kopieren', function () {
        exportProjectConfig(projectSettings);
      }],
      ['Konfiguration importieren', 'Zuvor exportiertes JSON einfügen', 'Einfügen…', function () {
        importProjectConfig(projectSettings);
      }]
    ];
  }

  /******************************************************************
   * Einstellungs-Tabs: Anzeige, Dieses Board, Erweitert, Experimente
   ******************************************************************/

  let activeSettingsTab = null; // bleibt beim Neuaufbau der Toolbar (Theme-Wechsel) erhalten

  function setMrLinksEnabled(val) {
    mrLinksEnabled = val;
    saveFeature('mrLinks', mrLinksEnabled);
    log('MR-Buttons geändert auf:', mrLinksEnabled);
    if (mrLinksEnabled) {
      createMrLinksBar();
    } else {
      const existingMrLinks = document.getElementById('js-my-mr-links');
      if (existingMrLinks) existingMrLinks.remove();
    }
  }

  // Vorschau im Anzeige-Tab, eine pro Unterreiter. Sie zeigt das echte Ergebnis: die Board-Karte ist eine Kopie einer
  // Karte von diesem Board (samt Spalten-Header), Ticket-, MR- und Topbar-Ausschnitt baut dieselben Funktionen wie die
  // echten Seiten, nur mit Beispieldaten. Ausgeschaltetes fehlt also genau wie später; Hover umrandet das Element.
  function portalButtonSelector(scope) {
    return scope + ' button[aria-label="Ticket im Portal öffnen"], ' + scope + ' button[aria-label="Timesheet im Portal erstellen"]';
  }

  const PREVIEW_FEATURE_SELECTORS = {
    progress: '.ambient-progress-badge .ambient-progress-bar',
    portalButtons: portalButtonSelector('.ambient-progress-badge'),
    cardActions: '.ambient-card-actions',
    issuePortalButtons: portalButtonSelector('.ambient-progress-detail-badge'),
    issueActions: '.ambient-progress-detail-badge .ambient-card-actions',
    mrPortalButtons: portalButtonSelector('.ambient-progress-mr-badge'),
    mrActions: '.ambient-ticket-actions-row',
    mrBadge: '.ambient-mr-badge',
    mrAvatars: '.ambient-mr-badge img, .ambient-mr-reviewer-placeholder',
    estimateBadge: '.ambient-estimate-badge',
    estimateStripTitle: '.ambient-estimate-badge',
    splitLabels: '.ambient-split-label',
    columnAge: '.ambient-column-age',
    columnAvg: '.ambient-column-avg',
    columnSp: '.ambient-column-sp',
    issueDetail: '.ambient-progress-detail-badge',
    mrPageProgress: '.ambient-progress-mr-badge',
    mrAssigneeButtons: '.ambient-ticket-assignee-badge',
    mrLinks: '.ambient-preview-mr-links'
  };
  const PREVIEW_SAMPLE_PROGRESS = {booked: '3.5h', bookedLabel: 'Booked Hours'};
  const PREVIEW_SAMPLE_ACTIONS = '[Ticket abschließen]\n/done';
  let previewCardIid = null; // dieselbe Karte bleibt über Aktualisierungen hinweg die Vorschau

  function previewAvatarUrl(initials, color) {
    return 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">' +
      '<circle cx="16" cy="16" r="16" fill="' + color + '"/><text x="16" y="21" font-family="sans-serif" font-size="13" ' +
      'fill="#fff" text-anchor="middle">' + initials + '</text></svg>');
  }

  // Karte nur als GitLab-Gerüst (Titel, Labels, Footer); bevorzugt eine mit Scoped Label, damit „Geteilte Scoped
  // Labels“ etwas zu zeigen hat. Alles vom Script wird danach mit Beispieldaten neu gezeichnet.
  function findPreviewCard() {
    const cards = Array.prototype.slice.call(document.querySelectorAll(SEL.boardCard), 0, 80);
    const same = cards.filter(function (card) { return previewCardIid && getIssueIidFromCard(card) === previewCardIid; })[0];
    if (same) return same;
    const scoped = cards.filter(function (card) {
      return Array.prototype.some.call(card.querySelectorAll(SEL.cardLabel), function (label) {
        return SPLIT_LABEL_PATTERN.test(normalizeWhitespace(label.textContent));
      });
    })[0];
    const best = scoped || cards[0] || null;
    previewCardIid = best ? getIssueIidFromCard(best) : null;
    return best;
  }

  // Split-Labels zurück auf GitLabs Original
  function resetPreviewSplitLabels(root) {
    root.querySelectorAll('.ambient-split-label').forEach(function (el) { el.remove(); });
    root.querySelectorAll('[data-ambient-split]').forEach(function (el) { el.removeAttribute('data-ambient-split'); });
  }

  // Alles entfernen, was das Script in die Karten-Kopie eingefügt hat (der Schätzungs-Badge hat den Titeltext gekürzt)
  function resetPreviewCard(clone) {
    clone.querySelectorAll('.ambient-estimate-badge').forEach(function (badge) {
      const original = badge.dataset.ambientOriginal;
      const parent = badge.parentNode;
      badge.remove();
      if (original === undefined) return;
      const walker = document.createTreeWalker(parent, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.data.trim()) {
          node.data = original;
          return;
        }
      }
    });
    resetPreviewSplitLabels(clone);
    clearCardInjections(clone);
    clone.querySelectorAll('[class*="ambient-"]').forEach(function (el) { el.remove(); });
  }

  function stripPreviewIds(root) {
    [root].concat(Array.prototype.slice.call(root.querySelectorAll('[id], [data-testid]'))).forEach(function (el) {
      el.removeAttribute('id');
      el.removeAttribute('data-testid');
    });
  }

  // Spalten-Header und Karte: GitLab-Gerüst kopieren, dann mit denselben Funktionen wie auf dem Board zeichnen
  function renderPreviewBoard(content, card, projectSettings, urls) {
    const iid = getIssueIidFromCard(card) || '1';
    const list = card.closest(SEL.boardList);
    const header = list && list.querySelector(SEL.boardListHeader);
    const nodes = []; // Karte; der Header behält data-testid (siehe unten)
    // Spalte (Farbe wie GitLabs Board-Spalte) in einem dunkleren Block, wie auf dem Board vor dem Seitenhintergrund
    const dark = isGitLabDarkModeActive();
    applyStyles(content, {
      background: dark ? '#1e1d23' : '#ffffff',
      padding: '0.75rem',
      borderRadius: '8px',
      boxSizing: 'border-box'
    });
    const column = document.createElement('div');
    applyStyles(column, {
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
      width: 'fit-content',
      maxWidth: '100%',
      padding: '0.5rem',
      borderRadius: '8px',
      boxSizing: 'border-box',
      background: dark ? '#2c2b31' : '#ececef'
    });
    content.appendChild(column);

    if (header) {
      const headerClone = header.cloneNode(true);
      resetPreviewSplitLabels(headerClone);
      headerClone.querySelectorAll('.ambient-column-avg, .ambient-column-sp').forEach(function (el) { el.remove(); });
      applyStyles(headerClone, {width: header.getBoundingClientRect().width + 'px', maxWidth: '100%', boxSizing: 'border-box'});
      column.appendChild(headerClone); // angehängt, damit berechnete Styles (Label-Farben) stimmen
      // data-testid bleibt am Header: Layout-Regeln (GitLab und unser min-width:0) hängen daran; gesucht wird der
      // Header nur innerhalb einer echten Spalte, die Kopie fällt also nie in einen Scan
      headerClone.querySelectorAll('[id]').forEach(function (el) { el.removeAttribute('id'); });
      const countBadge = headerClone.querySelector(SEL.issueCountBadge);
      if (countBadge && isFeatureOn('columnAvg')) {
        createColumnAvgElement(countBadge).lastChild.textContent = formatDuration(2 * 24 * 3600 * 1000);
      }
      // nach dem Median, damit das Split-Label wie im Original auf den restlichen Platz schrumpft
      if (showEnabled && isFeatureOn('splitLabels')) {
        applySplitLabels(headerClone);
        headerClone.querySelectorAll('.ambient-split-label').forEach(fitSplitLabel);
      }
    }

    const clone = card.cloneNode(true);
    clone.ambientPreview = true; // isCardInActiveColumn: Kopie gilt als aktive Spalte
    resetPreviewCard(clone);
    applyStyles(clone, {width: card.getBoundingClientRect().width + 'px', maxWidth: '100%', listStyle: 'none'});
    column.appendChild(clone);
    nodes.push(clone);
    if (showEnabled) {
      if (isFeatureOn('splitLabels')) applySplitLabels(clone);
      const titleLink = clone.querySelector(SEL.cardTitleLink);
      if (titleLink && isFeatureOn('estimateBadge')) applyEstimateBadge(titleLink, true, true);
      if (isFeatureOn('progress')) {
        clone.setAttribute('data-ambient-progress-url', urls.portal);
        clone.setAttribute('data-ambient-timesheet-url', urls.timesheet);
        injectProgressIntoCard(clone, urls.data);
      }
      if (isFeatureOn('mrBadge')) {
        injectMrBadgeIntoCard(clone, [{
          iid: 87,
          title: 'Beispiel-Merge-Request',
          state: 'opened',
          web_url: '#',
          assignee: {id: 2, name: 'Jana E.', avatar_url: previewAvatarUrl('JE', '#1f8a8a')},
          reviewers: [{id: 3, name: 'Max M.', avatar_url: previewAvatarUrl('MM', '#6f5bd2')}]
        }], projectSettings ? projectSettings.projectPath : '', iid);
      }
      if (isFeatureOn('columnAge')) {
        injectColumnAgeIntoCard(clone, new Date(Date.now() - 22 * 3600 * 1000));
        const ageText = clone.querySelector('.ambient-column-age-text');
        if (ageText) ageText.textContent = formatDuration(22 * 3600 * 1000);
      }
      if (isFeatureOn('cardActions')) {
        injectCardActions(clone, iid, Object.assign({}, projectSettings, {
          ticketActions: (projectSettings && projectSettings.ticketActions) || PREVIEW_SAMPLE_ACTIONS
        }));
      }
    }
    // gleich im selben Durchlauf: Scans und Selektoren dürfen die Kopien nie für echte Elemente halten
    nodes.forEach(stripPreviewIds);
  }

  // Kopie ohne ids/data-testid, damit Scans, Selektoren und getElementById die Kopie nicht für das Original halten
  function clonePreviewNode(node) {
    const clone = node.cloneNode(true);
    [clone].concat(Array.prototype.slice.call(clone.querySelectorAll('[id], [data-testid]'))).forEach(function (el) {
      el.removeAttribute('id');
      el.removeAttribute('data-testid');
    });
    applyStyles(clone, {width: node.getBoundingClientRect().width + 'px', maxWidth: '100%', margin: '0', boxSizing: 'border-box'});
    return clone;
  }

  function createPreviewContext(label, value) {
    const row = document.createElement('div');
    applyStyles(row, {padding: '0.5rem 0', borderBottom: '1px solid var(--gl-border-color-subtle, rgba(128, 128, 128, 0.25))', fontSize: '12px', opacity: '0.55'});
    row.appendChild(createTextSpan(label, {display: 'block', fontWeight: '600'}));
    row.appendChild(createTextSpan(value));
    return row;
  }

  function buildPreviewContent(view, projectSettings) {
    const iid = previewCardIid || '1';
    const data = PREVIEW_SAMPLE_PROGRESS;
    // Ticket-Aktionen immer zeigen: die eigenen, sonst ein Beispiel
    const sampleSettings = Object.assign({}, projectSettings, {
      ticketActions: (projectSettings && projectSettings.ticketActions) || PREVIEW_SAMPLE_ACTIONS
    });
    const portalUrl = (projectSettings && buildPortalUrl(projectSettings, iid)) || 'https://portal.example';
    const timesheetUrl = (projectSettings && buildTimesheetUrl(projectSettings, iid)) || 'https://portal.example';
    // Wie GitLabs rechte Seitenleiste: Breite, Seitenhintergrund und Innenabstand, damit die eingefügten Boxen wie auf
    // der echten Seite mit dem Hintergrund verschmelzen und nicht am Rand kleben
    const sidebarFrame = {
      boxSizing: 'border-box',
      padding: '0.6rem 0.9rem',
      borderRadius: '8px',
      border: SETTINGS_BORDER,
      background: THEME_BG
    };
    const sidebar = document.createElement('div');
    applyStyles(sidebar, Object.assign({width: '320px', maxWidth: '100%', display: 'flex', flexDirection: 'column'}, sidebarFrame));

    if (view === 'board') {
      const card = findPreviewCard();
      if (!card) {
        return createTextSpan('Hier ist kein Board geladen – öffne ein Board, um die Karten-Vorschau zu sehen.', FIELD_HINT_STYLES);
      }
      const column = document.createElement('div');
      applyStyles(column, {display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: '100%'});
      column.renderPreview = function () {
        renderPreviewBoard(column, card, projectSettings, {portal: portalUrl, timesheet: timesheetUrl, data: data});
      };
      return column;
    }

    if (view === 'ticket') {
      sidebar.appendChild(createPreviewContext('Assignee', 'Alex K.'));
      sidebar.appendChild(createPreviewContext('Labels', 'API'));
      if (isFeatureOn('issueDetail')) injectProgressIntoIssueDetail(sidebar, data, portalUrl, timesheetUrl, iid, sampleSettings);
      return sidebar;
    }

    if (view === 'mr') {
      const assigneeBlock = createPreviewContext('Assignee', 'Jana E.');
      sidebar.appendChild(assigneeBlock);
      sidebar.appendChild(createPreviewContext('Reviewer', 'Max M.'));
      if (isFeatureOn('mrPageProgress')) {
        injectProgressIntoMRDetail(assigneeBlock, data, portalUrl, timesheetUrl, sampleSettings, iid);
      }
      if (isFeatureOn('mrAssigneeButtons')) {
        const container = createTicketAssigneeContainer();
        sidebar.insertBefore(container, assigneeBlock);
        const alex = {id: 1, name: 'Alex K.', avatar_url: previewAvatarUrl('AK', '#b07a2a')};
        const jana = {id: 2, name: 'Jana E.', avatar_url: previewAvatarUrl('JE', '#1f8a8a')};
        const max = {id: 3, name: 'Max M.', avatar_url: previewAvatarUrl('MM', '#6f5bd2')};
        renderTicketAssigneeBlock(container, {assignees: [alex], mrInfo: {assignee: jana, author: jana, reviewer: max}});
      }
      return sidebar;
    }

    // Breadcrumb-Zeile: MR-Buttons (falls an) und das Zahnrad
    const row = document.createElement('div');
    applyStyles(row, Object.assign({display: 'flex', alignItems: 'center', gap: '0.25rem'}, sidebarFrame, {padding: '0.35rem 0.6rem'}));
    row.appendChild(createTextSpan((getCurrentProjectPath() || 'gruppe/projekt') + ' / …', {flex: '1 1 auto', opacity: '0.55', fontSize: '0.85rem'}));
    if (mrLinksEnabled && showEnabled) {
      const linksBar = buildMrLinksBar(getCurrentProjectPath() || '');
      linksBar.removeAttribute('id');
      linksBar.classList.add('ambient-preview-mr-links');
      row.appendChild(linksBar);
    }
    const gear = gearButtonElement && clonePreviewNode(gearButtonElement);
    if (gear) {
      gear.style.width = '';
      gear.querySelectorAll('span[aria-hidden="true"]').forEach(function (dot) {
        if (!dot.querySelector('svg')) dot.remove(); // Update-/Rate-Limit-Punkte gehören nicht in die Vorschau
      });
      row.appendChild(gear);
    }
    return row;
  }

  function createFeaturePreview(view, projectSettings) {
    const box = document.createElement('div');
    applyStyles(box, CARD_STYLES);
    applyStyles(box, {padding: '0.75rem 0.9rem 0.9rem', gap: '0.6rem', fontSize: '0.8rem'});
    const head = document.createElement('div');
    applyStyles(head, {display: 'flex', justifyContent: 'space-between', gap: '0.75rem', color: SETTINGS_SUBTLE_TEXT});
    head.appendChild(createTextSpan('Vorschau', {fontSize: '0.7rem', fontWeight: '600', letterSpacing: '0.06em', textTransform: 'uppercase'}));
    const hint = createTextSpan('', {fontSize: '0.78rem', textAlign: 'right'});
    head.appendChild(hint);
    box.appendChild(head);

    const body = document.createElement('div');
    body.setAttribute('aria-hidden', 'true'); // nur Illustration, die Schalter tragen Label und Beschreibung
    body.inert = true; // echte Buttons: Klicks dürfen nichts auslösen
    body.className = 'ambient-preview';
    // kein overflow: der würde Umrandungen (2px außerhalb) und den roten Karten-Rahmen abschneiden; Kopien sind per
    // maxWidth auf die Vorschaubreite begrenzt. Das Padding lässt Platz für beides.
    applyStyles(body, {padding: '6px'});
    box.appendChild(body);

    const labels = {};
    FEATURE_MENU.forEach(function (group) {
      group.items.forEach(function (item) {
        labels[item[0]] = t(item[1]);
      });
    });
    const defaultHint = 'Fahre über einen Schalter, um sein Element zu sehen';
    let highlighted = null;

    function highlight(key) {
      highlighted = key;
      body.querySelectorAll('[data-ambient-preview-outline]').forEach(function (el) {
        applyStyles(el, {outline: '', outlineOffset: '', backgroundColor: el.getAttribute('data-ambient-preview-outline')});
        el.removeAttribute('data-ambient-preview-outline');
      });
      if (!key) {
        hint.textContent = defaultHint;
        return;
      }
      const found = body.querySelectorAll(PREVIEW_FEATURE_SELECTORS[key]);
      // Umrandung nach innen plus Tönung: manche Eltern (z. B. Karten-Footer) schneiden alles außerhalb ab
      found.forEach(function (el) {
        el.setAttribute('data-ambient-preview-outline', el.style.backgroundColor);
        applyStyles(el, {outline: '2px solid ' + SETTINGS_ACCENT, outlineOffset: '-2px', backgroundColor: 'rgba(31, 117, 203, 0.18)'});
      });
      hint.textContent = labels[key] + (found.length ? '' : isFeatureOn(key) ? ' – hier gerade nicht sichtbar' : ' – aus, erscheint nicht');
    }

    function refresh() {
      body.textContent = '';
      const content = buildPreviewContent(view, projectSettings);
      content.classList.add('ambient-preview-content'); // eigener Knoten: löst keinen Board-Scan aus
      body.appendChild(content);
      if (content.renderPreview) content.renderPreview(); // Board-Karte braucht den DOM (berechnete Farben)
      highlight(highlighted);
    }

    hint.textContent = defaultHint;
    return {element: box, refresh: refresh, highlight: highlight};
  }

  const DISPLAY_SUBTABS = [['board', 'Board-Karte'], ['ticket', 'Ticket'], ['mr', 'Merge Request'], ['topbar', 'Topbar']];
  let activeDisplaySubtab = 'board';

  function createDisplayTab(onFeatureChanged, onResume, projectSettings) {
    const panel = document.createElement('div');
    applyStyles(panel, TAB_PANEL_STYLES);

    const pausedNote = document.createElement('div');
    pausedNote.setAttribute('role', 'status');
    applyStyles(pausedNote, {
      display: 'none',
      alignItems: 'center',
      gap: '0.75rem',
      padding: '0.6rem 0.9rem',
      borderRadius: '8px',
      background: SETTINGS_STRONG_BACKGROUND,
      fontSize: '0.85rem'
    });
    pausedNote.appendChild(createTextSpan('Alle Anzeigen sind pausiert. Deine Auswahl bleibt erhalten.', {flex: '1 1 auto'}));
    const resumeButton = document.createElement('button');
    resumeButton.type = 'button';
    resumeButton.textContent = 'Fortsetzen';
    resumeButton.className = 'ambient-btn btn gl-button btn-default btn-sm';
    resumeButton.addEventListener('click', onResume);
    pausedNote.appendChild(resumeButton);
    panel.appendChild(pausedNote);

    // Unterreiter und Vorschau hängt der Aufrufer in den festen Panel-Kopf, damit sie beim Scrollen stehen bleiben
    const pinned = document.createElement('div');
    applyStyles(pinned, {display: 'flex', flexDirection: 'column', gap: '0.6rem'});
    const subnav = document.createElement('div');
    subnav.setAttribute('role', 'group');
    subnav.setAttribute('aria-label', 'Ansicht');
    subnav.className = 'ambient-seg ambient-seg-fill';
    pinned.appendChild(subnav);

    const subtabs = {};
    DISPLAY_SUBTABS.forEach(function (def) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = t(def[1]);
      button.addEventListener('click', function () {
        selectSubtab(def[0]);
      });
      subnav.appendChild(button);
      const preview = createFeaturePreview(def[0], projectSettings);
      pinned.appendChild(preview.element);
      const section = document.createElement('div');
      applyStyles(section, TAB_PANEL_STYLES);
      panel.appendChild(section);
      subtabs[def[0]] = {button: button, preview: preview, section: section};
    });

    let previewTimers = [];

    // Erst nach dem Neu-Rendern (scheduleRerender + Scan) neu bauen: das Neu-Rendern räumt auch die Vorschau ab
    function schedulePreviewRefresh() {
      previewTimers.forEach(clearTimeout);
      const preview = subtabs[activeDisplaySubtab].preview;
      previewTimers = [setTimeout(preview.refresh, 400), setTimeout(preview.refresh, 1200)];
    }

    const rows = {};
    const groups = [];
    FEATURE_MENU.forEach(function (group) {
      const settingsGroup = createSettingsGroup(t(group.title));
      const preview = subtabs[group.view].preview;
      group.items.forEach(function (item) {
        const key = item[0];
        const row = makeSwitch(t(item[1]), key === 'mrLinks' ? mrLinksEnabled : features[key] !== false, function (val) {
          if (key === 'mrLinks') {
            setMrLinksEnabled(val);
          } else {
            saveFeature(key, val);
            onFeatureChanged();
          }
          refresh();
          schedulePreviewRefresh();
        }, {desc: item[2], child: Boolean(FEATURE_PARENTS[key])});
        ['mouseenter', 'focusin'].forEach(function (type) {
          row.addEventListener(type, function () { preview.highlight(key); });
        });
        ['mouseleave', 'focusout'].forEach(function (type) {
          row.addEventListener(type, function () { preview.highlight(null); });
        });
        rows[key] = row;
        settingsGroup.list.appendChild(row);
      });
      groups.push({items: group.items, aside: settingsGroup.aside});
      subtabs[group.view].section.appendChild(settingsGroup.element);
    });

    function selectSubtab(key) {
      const previous = activeDisplaySubtab;
      const keys = DISPLAY_SUBTABS.map(function (def) { return def[0]; });
      activeDisplaySubtab = key;
      Object.keys(subtabs).forEach(function (k) {
        const selected = k === key;
        subtabs[k].button.setAttribute('aria-pressed', String(selected));
        subtabs[k].preview.element.style.display = selected ? 'flex' : 'none';
        subtabs[k].section.style.display = selected ? 'flex' : 'none';
      });
      subtabs[key].preview.refresh();
      if (previous !== key) {
        const direction = keys.indexOf(key) > keys.indexOf(previous) ? 1 : -1;
        animateTabIn(subtabs[key].preview.element, direction);
        animateTabIn(subtabs[key].section, direction);
      }
    }

    function refresh() {
      pausedNote.style.display = showEnabled ? 'none' : 'flex';
      refreshEstimateOverrides();
      Object.keys(rows).forEach(function (key) {
        const parent = FEATURE_PARENTS[key];
        const boardOff = key === 'estimateBadge' && projectSettings && projectSettings.estimateEnabled === false;
        setSettingDisabled(rows[key], !showEnabled || boardOff || Boolean(parent && !isFeatureOn(parent)));
      });
      groups.forEach(function (group) {
        const on = group.items.filter(function (item) {
          return item[0] === 'mrLinks' ? mrLinksEnabled : features[item[0]] !== false;
        }).length;
        group.aside.textContent = on + ' von ' + group.items.length + ' an';
      });
    }

    // Chip am globalen Schalter, wenn Boards ihn im Tab „Dieses Board“ überstimmen
    const estimateOverrideChip = createTextSpan('', CHIP_STYLES);
    rows.estimateBadge.ambientLabel.parentNode.appendChild(estimateOverrideChip);

    function refreshEstimateOverrides() {
      const configs = readProjectConfigsState();
      const currentKey = projectSettings && projectSettings.projectKey;
      const offKeys = Object.keys(configs).filter(function (key) {
        return configs[key] && configs[key].estimateEnabled === false;
      });
      estimateOverrideChip.style.display = offKeys.length ? '' : 'none';
      estimateOverrideChip.textContent = offKeys.indexOf(currentKey) !== -1
        ? 'aus auf diesem Board' + (offKeys.length > 1 ? ' +' + (offKeys.length - 1) : '')
        : 'aus auf ' + offKeys.length + (offKeys.length === 1 ? ' Board' : ' Boards');
      estimateOverrideChip.title = 'Abgeschaltet (Tab „Dieses Board“):\n' + offKeys.map(function (key) {
        return key.split('|').pop() + (key === currentKey ? ' (dieses Board)' : '');
      }).join('\n');
    }

    selectSubtab(activeDisplaySubtab);
    refresh();
    return {
      element: panel,
      pinned: pinned,
      refresh: function () {
        refresh();
        schedulePreviewRefresh();
      },
      refreshPreview: function () {
        subtabs[activeDisplaySubtab].preview.refresh();
      }
    };
  }

  function createBoardTab(projectSettings, onValuesChanged, onStatus) {
    const panel = document.createElement('div');
    applyStyles(panel, TAB_PANEL_STYLES);

    const scope = document.createElement('div');
    applyStyles(scope, {display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.85rem', color: SETTINGS_SUBTLE_TEXT});
    scope.appendChild(createTextSpan('Gilt nur für'));
    const path = document.createElement('code');
    path.textContent = projectSettings.projectPath || 'dieses Board';
    scope.appendChild(path);
    panel.appendChild(scope);

    const config = createProjectConfigSection(projectSettings, onValuesChanged);
    const age = createAgeHighlightSection(projectSettings);
    panel.appendChild(config.portalCard);
    panel.appendChild(createBoardEstimateSection(projectSettings));
    panel.appendChild(createClosedDaysSection(projectSettings));
    panel.appendChild(age.element);
    panel.appendChild(config.actionsCard);

    // Bis Portal-URL und Projekt-ID gespeichert sind, bleiben die übrigen Karten gesperrt
    function updateStatus() {
      const configured = Boolean(projectSettings.projectId && projectSettings.portalBaseUrl);
      config.setConfigured(configured);
      [age.element, config.actionsCard].forEach(function (el) {
        el.inert = !configured;
        el.style.opacity = configured ? '1' : '0.45';
      });
      onStatus(configured);
    }

    updateStatus();
    return {element: panel, refreshAgeHighlight: age.refresh, updateStatus: updateStatus};
  }

  function createAdvancedTab(projectSettings) {
    const panel = document.createElement('div');
    applyStyles(panel, TAB_PANEL_STYLES);

    const general = createSettingsGroup('Allgemein');
    const languageRow = document.createElement('div');
    languageRow.className = 'ambient-setting-row';
    languageRow.appendChild(createRowText('Sprache', 'Teilweise übersetzt · wirkt nach dem Neuladen'));
    const languageSwitch = document.createElement('div');
    languageSwitch.setAttribute('role', 'group');
    languageSwitch.setAttribute('aria-label', 'Sprache');
    languageSwitch.className = 'ambient-seg';
    const languageButtons = [['de', 'Deutsch'], ['en', 'English']].map(function (def) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = def[1];
      button.addEventListener('click', function () {
        const english = def[0] === 'en';
        if ((experiments.english === true) === english) return;
        saveExperiment('english', english);
        paintLanguage();
        showToast({text: english ? 'Language changes after reload.' : 'Sprache ändert sich nach dem Neuladen.', variant: 'info'});
      });
      languageSwitch.appendChild(button);
      return {english: def[0] === 'en', button: button};
    });

    function paintLanguage() {
      languageButtons.forEach(function (entry) {
        entry.button.setAttribute('aria-pressed', String(entry.english === (experiments.english === true)));
      });
    }

    paintLanguage();
    languageRow.appendChild(languageSwitch);
    general.list.appendChild(languageRow);
    general.list.appendChild(makeSwitch('Debug-Logs', debugEnabled, function (val) {
      debugEnabled = val;
      saveFeature('debug', debugEnabled);
      console.log(LOG_PREFIX, 'Debug geändert auf:', debugEnabled);
    }, {desc: 'Ausführliche Ausgaben in der Browser-Konsole'}));
    panel.appendChild(general.element);

    panel.appendChild(createEstimatePatternGroup());

    const tools = createSettingsGroup('Diagnose & Daten');
    createDataToolDefs(projectSettings).forEach(function (def) {
      tools.list.appendChild(createActionRow(def[0], def[1], def[2], def[3]));
    });
    panel.appendChild(tools.element);

    const danger = createSettingsGroup('Gefahrenzone');
    danger.heading.style.color = SETTINGS_DANGER;
    danger.list.style.borderColor = SETTINGS_DANGER;
    danger.list.appendChild(createActionRow('Alle lokalen Daten löschen',
      'Entfernt Konfiguration, Cache und Einstellungen auf allen Boards. Lässt sich nicht rückgängig machen.',
      'Löschen…', clearAllScriptData, true));
    panel.appendChild(danger.element);
    return panel;
  }

  function createEstimatePatternGroup() {
    const group = createSettingsGroup('Schätzungs-Muster');
    group.list.className = '';
    applyStyles(group.list, {padding: '0.9rem 1rem', gap: '0.6rem'});
    group.list.appendChild(createTextSpan('Woran das Script Schätzungen im Titel erkennt. Eine Zeile pro Muster: ' +
      '„sp: <Regex>" oder „timebox: <Regex>", Gruppe 1 ist die Zahl, Gruppe 2 optional die Einheit (h/Tag).', FIELD_HINT_STYLES));
    const textarea = document.createElement('textarea');
    textarea.className = FORM_INPUT_CLASSES;
    textarea.rows = 3;
    textarea.spellcheck = false;
    textarea.setAttribute('aria-label', 'Schätzungs-Muster');
    textarea.value = String(expSetting('estimatePatterns', DEFAULT_ESTIMATE_PATTERNS));
    applyStyles(textarea, Object.assign({}, EXPERIMENT_INPUT_STYLES, {fontFamily: 'monospace', fontSize: '0.8rem', resize: 'vertical'}));
    group.list.appendChild(textarea);

    const footer = document.createElement('div');
    applyStyles(footer, {display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem'});
    const status = createTextSpan('', {fontSize: '0.8rem'});
    status.setAttribute('role', 'status');
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = 'Auf Standard zurücksetzen';
    reset.className = 'ambient-btn btn gl-button btn-default btn-default-tertiary btn-sm';
    footer.appendChild(status);
    footer.appendChild(reset);
    group.list.appendChild(footer);

    function validate() {
      const value = textarea.value.trim();
      const parsed = parseEstimatePatterns(value);
      const isDefault = !value || value === DEFAULT_ESTIMATE_PATTERNS;
      if (parsed.errors.length) {
        status.textContent = parsed.errors.length + ' ungültig (ignoriert): ' + parsed.errors.join(' | ');
      } else {
        status.textContent = value ? parsed.patterns.length + ' Muster gültig' + (isDefault ? ' · Standard' : '') : 'Leer · Standard-Muster aktiv';
      }
      status.style.color = parsed.errors.length ? SETTINGS_DANGER : SETTINGS_SUCCESS;
      reset.style.display = isDefault ? 'none' : '';
    }

    function save(value) {
      saveExperiment('estimatePatterns', value === DEFAULT_ESTIMATE_PATTERNS ? '' : value);
      applyExperimentChange();
      validate();
    }

    textarea.addEventListener('input', validate);
    textarea.addEventListener('change', function () {
      save(textarea.value.trim());
      flashSaved(textarea);
    });
    reset.addEventListener('click', function () {
      textarea.value = DEFAULT_ESTIMATE_PATTERNS;
      save(DEFAULT_ESTIMATE_PATTERNS);
    });
    validate();
    return group.element;
  }

  function createExperimentsTab(projectSettings, onCountChanged) {
    const panel = document.createElement('div');
    applyStyles(panel, TAB_PANEL_STYLES);
    panel.appendChild(createTextSpan('Ideen im Test. Standardmäßig aus, wirken sofort auf dem Board und können sich noch ' +
      'ändern oder wieder verschwinden.', {
      padding: '0.7rem 0.9rem',
      borderRadius: '8px',
      background: SETTINGS_STRONG_BACKGROUND,
      fontSize: '0.85rem',
      lineHeight: '1.45'
    }));

    // Zusatz-Buttons erscheinen unter ihrem Schalter, solange das Experiment an ist
    const extraActions = {
      expConfigLink: function () {
        return createExperimentButton('Konfig-Link kopieren', 'Projekt-Konfiguration als Link teilen', function () {
          copyConfigLink(projectSettings);
        });
      }
    };

    function countOn() {
      let count = 0;
      EXPERIMENT_MENU.forEach(function (group) {
        group.items.forEach(function (item) {
          if (isExp(item[0])) count += 1;
        });
      });
      return count;
    }

    EXPERIMENT_MENU.forEach(function (group) {
      const settingsGroup = createSettingsGroup(group.title);
      group.items.forEach(function (item) {
        const key = item[0];
        let action = null;
        settingsGroup.list.appendChild(makeSwitch(t(item[1]), isExp(key), function (val) {
          saveExperiment(key, val);
          setTimeout(applyExperimentChange, 120); // nach dem Paint, damit der Schalter sofort umspringt
          if (action) action.style.display = val ? 'flex' : 'none';
          onCountChanged(countOn());
        }, {desc: item[2], where: 'Beta'}));
        if (extraActions[key] && projectSettings) {
          action = document.createElement('div');
          action.className = 'ambient-row-extra';
          applyStyles(action, {display: isExp(key) ? 'flex' : 'none', padding: '0 1rem 0.8rem'});
          action.appendChild(extraActions[key]());
          settingsGroup.list.appendChild(action);
        }
      });
      panel.appendChild(settingsGroup.element);
    });
    onCountChanged(countOn());
    return panel;
  }

  // Pro Board: Boards ohne Schätzungen (z. B. Deli) bekommen sonst auf jeder Karte ein rotes „? SP“
  function createBoardEstimateSection(projectSettings) {
    const card = createPanelCard('Schätzungen');
    const toggle = makeSwitch('Schätzung als Badge auf diesem Board', projectSettings.estimateEnabled !== false, function (value) {
      projectSettings.estimateEnabled = value;
      writeProjectConfigEntry(projectSettings.projectKey, {estimateEnabled: value});
      applyExperimentChange();
    }, {desc: 'Aus, wenn dieses Board keine SP/Timeboxen nutzt. Der globale Schalter liegt unter Anzeige → Board-Karten.'});
    toggle.style.margin = '0 -1.1rem -1rem';
    card.element.appendChild(toggle);
    return card.element;
  }

  // Pro Board: wie weit die Closed-Spalte zurückschaut (wirkt nur, wenn ihr Auge an ist)
  function createClosedDaysSection(projectSettings) {
    const card = createPanelCard('Closed-Spalte');
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.max = String(CLOSED_DAYS_MAX);
    input.step = '1';
    input.setAttribute('aria-label', 'Tage zurück in der Closed-Spalte');
    input.className = FORM_INPUT_CLASSES;
    applyStyles(input, EXPERIMENT_INPUT_STYLES);
    input.value = String(projectSettings.closedDays || CLOSED_DAYS_DEFAULT);
    input.addEventListener('change', function () {
      const days = clampClosedDays(input.value);
      input.value = String(days);
      projectSettings.closedDays = days;
      writeProjectConfigEntry(projectSettings.projectKey, {closedDays: days});
      if (rescanHook) rescanHook();
    });
    card.element.appendChild(input);
    card.element.appendChild(createTextSpan('Ist das Auge der Closed-Spalte an, läuft das Script nur auf Tickets, die in ' +
      'so vielen Tagen geschlossen wurden (1–' + CLOSED_DAYS_MAX + ').', FIELD_HINT_STYLES));
    return card.element;
  }

  function createAgeHighlightSection(projectSettings) {
    const card = createPanelCard('Liegezeit hervorheben');
    const hint = createTextSpan('', FIELD_HINT_STYLES);
    card.element.appendChild(hint);
    const chips = document.createElement('div');
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', 'Spalten mit rotem Rahmen');
    applyStyles(chips, {display: 'flex', flexWrap: 'wrap', gap: '0.5rem'});
    card.element.appendChild(chips);

    function createChip(key, text, enabled) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.disabled = !enabled;
      applyStyles(chip, {
        minHeight: '32px',
        padding: '0.3rem 0.8rem',
        borderRadius: '999px',
        border: '1px solid',
        fontSize: '0.85rem',
        fontWeight: '500',
        cursor: enabled ? 'pointer' : 'not-allowed',
        opacity: enabled ? '1' : '0.45'
      });

      function paint() {
        const on = Boolean(ageHighlightLookup[key]);
        chip.textContent = (on ? '✓ ' : '') + text;
        chip.setAttribute('aria-pressed', String(on));
        applyStyles(chip, {
          background: on ? SETTINGS_ACCENT : 'transparent',
          borderColor: on ? SETTINGS_ACCENT : 'var(--gl-border-color-strong, #5c5a62)',
          color: on ? '#ffffff' : 'inherit'
        });
      }

      chip.addEventListener('click', function () {
        if (ageHighlightLookup[key]) {
          delete ageHighlightLookup[key];
        } else {
          ageHighlightLookup[key] = true;
        }
        saveAgeHighlightLookup();
        paint();
        document.querySelectorAll(SEL.boardList).forEach(updateColumnAgeAverage);
      });
      paint();
      return chip;
    }

    // Spalten erst beim Öffnen lesen – Board ist beim Toolbar-Aufbau evtl. noch nicht gerendert
    function refresh() {
      loadAgeHighlightLookup(projectSettings.projectKey);
      // Rahmen braucht die Verweildauer-Daten
      const enabled = isFeatureOn('columnAge');
      hint.textContent = enabled
        ? 'Tickets, die länger als der Spalten-Median liegen, bekommen in diesen Spalten einen roten Rahmen.'
        : 'Benötigt „Uhr im Karten-Footer“ im Tab Anzeige.';
      chips.textContent = '';
      const seen = {};
      document.querySelectorAll(SEL.boardList).forEach(function (boardListElem) {
        const header = getBoardListHeaderElement(boardListElem);
        if (!header || !header.querySelector('.board-title-text .gl-label')) return; // Open/Closed ohne Label
        const text = getColumnLabelText(boardListElem, header);
        const key = normalizeLabelNameForMatching(text);
        if (!key || seen[key]) return;
        seen[key] = true;
        chips.appendChild(createChip(key, text, enabled));
      });
      if (!chips.firstChild) {
        chips.appendChild(createTextSpan('Keine Label-Spalten gefunden.', FIELD_HINT_STYLES));
      }
    }

    return {element: card.element, refresh: refresh};
  }

  // Portal-Verbindung (Karte mit Status) und Ticket-Aktionen; Felder speichern per Autosave (onValuesChanged)
  function createProjectConfigSection(projectSettings, onValuesChanged) {
    const portal = createPanelCard('Portal-Verbindung');
    const pill = document.createElement('span');
    applyStyles(pill, {display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', fontWeight: '500'});
    pill.appendChild(createTextSpan('', {width: '8px', height: '8px', borderRadius: '50%', background: 'currentColor'}));
    const pillText = createTextSpan('');
    pill.appendChild(pillText);
    portal.head.appendChild(pill);
    const intro = createTextSpan('Zwei Angaben, dann erscheinen Fortschrittsbalken und Portal-Buttons auf den Karten. ' +
      'Zugangsdaten speichert das Script nie, nur die URL – lokal in deinem Browser.', FIELD_HINT_STYLES);
    portal.element.appendChild(intro);
    const stepNumbers = [];

    function createInputField(labelText, input, hintText, statusId, step) {
      const field = document.createElement('div');
      applyStyles(field, {display: 'flex', flexDirection: 'column', gap: '0.35rem'});
      const label = document.createElement('label');
      label.htmlFor = input.id;
      applyStyles(label, Object.assign({display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0'}, FIELD_LABEL_STYLES));
      if (step) {
        const number = createTextSpan(String(step), {
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          background: SETTINGS_ACCENT,
          color: '#ffffff',
          fontSize: '0.7rem',
          alignItems: 'center',
          justifyContent: 'center'
        });
        number.setAttribute('aria-hidden', 'true');
        stepNumbers.push(number);
        label.appendChild(number);
      }
      label.appendChild(document.createTextNode(labelText));
      field.appendChild(label);
      input.className = FORM_INPUT_CLASSES;
      applyStyles(input, EXPERIMENT_INPUT_STYLES);
      field.appendChild(input);
      if (hintText) field.appendChild(createTextSpan(hintText, FIELD_HINT_STYLES));
      const status = document.createElement('div');
      status.id = statusId;
      status.setAttribute('role', 'alert');
      applyStyles(status, {fontSize: '0.78rem', color: '#f87171'});
      input.setAttribute('aria-describedby', statusId);
      input.addEventListener('input', function () {
        status.textContent = '';
        input.removeAttribute('aria-invalid');
        onValuesChanged();
      });
      field.appendChild(status);
      return {element: field, status: status};
    }

    const portalInput = document.createElement('input');
    portalInput.type = 'text';
    portalInput.id = 'ambient-portal-url';
    portalInput.placeholder = 'https://user-portal.arbeitgeber.com';
    portalInput.value = projectSettings.portalBaseUrl || '';
    portalUrlInputElement = portalInput;
    const portalField = createInputField('Portal-URL', portalInput,
      'Nur https://, ohne Benutzername/Passwort. Wird nur lokal gespeichert.', 'ambient-portal-status', 1);
    portalStatusElement = portalField.status;
    portal.element.appendChild(portalField.element);

    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'ambient-project-id';
    input.inputMode = 'numeric';
    input.placeholder = 'z. B. 4711';
    input.value = projectSettings.projectId || '';
    projectIdInputElement = input;
    const projectField = createInputField('Portal-Projekt-ID', input, '', 'ambient-project-status', 2);
    projectStatusElement = projectField.status;
    portal.element.appendChild(projectField.element);

    // Boards, die bewusst ohne Portal laufen, sollen nicht bei jedem Laden warnen
    const warningToggle = makeSwitch('Warnung bei fehlender Portal-URL', projectSettings.portalWarning !== false, function (value) {
      projectSettings.portalWarning = value;
      writeProjectConfigEntry(projectSettings.projectKey, {portalWarning: value});
    }, {desc: 'Aus, wenn dieses Board kein Portal nutzt: dann kein gelber Hinweis-Toast mehr.'});
    warningToggle.style.margin = '0 -1.1rem';
    portal.element.appendChild(warningToggle);

    // Weitere Projekt-IDs unter einer Trennlinie, erst nach der Einrichtung sichtbar
    const extras = document.createElement('div');
    applyStyles(extras, {flexDirection: 'column', margin: '0.25rem -1.1rem -1rem', padding: '0.9rem 1.1rem 0.2rem', borderTop: SETTINGS_BORDER});
    const extraInput = document.createElement('input');
    extraInput.type = 'text';
    extraInput.id = 'ambient-extra-project-ids';
    extraInput.placeholder = 'z. B. 4712, 4713';
    extraInput.value = projectSettings.extraProjectIds || '';
    extraIdsInputElement = extraInput;
    const extraField = createInputField('Weitere Projekt-IDs', extraInput,
      'Für Tickets, die auch in anderen Portal-Projekten gebucht werden: kommagetrennt, höchstens 3, je ein eigener Balken.',
      'ambient-extra-ids-status');
    extraIdsStatusElement = extraField.status;
    extras.appendChild(extraField.element);
    portal.element.appendChild(extras);

    const actions = createPanelCard('Ticket-Aktionen im Merge Request',
      'Eine Zeile [Name] startet einen Button, die Zeilen darunter sind seine Quick Actions.');
    const actionsInput = document.createElement('textarea');
    actionsInput.rows = 5;
    actionsInput.setAttribute('aria-label', 'Ticket-Aktionen im MR');
    actionsInput.placeholder = '[Ticket abschließen]\n/unassign me\n/label ~"workflow::Done"\n/unlabel ~"workflow::Review"';
    actionsInput.value = projectSettings.ticketActions || '';
    actionsInput.className = FORM_INPUT_CLASSES;
    applyStyles(actionsInput, {padding: '0.5rem 0.6rem', fontSize: '0.85rem', fontFamily: 'monospace', resize: 'vertical'});
    ticketActionsInputElement = actionsInput;
    actions.element.appendChild(actionsInput);
    // Vorschau der Buttons, die aus dem Text entstehen
    const actionsPreview = document.createElement('div');
    applyStyles(actionsPreview, {display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem'});
    actions.element.appendChild(actionsPreview);

    function renderActionsPreview() {
      actionsPreview.textContent = '';
      actionsPreview.appendChild(createTextSpan('Ergibt:', {color: SETTINGS_SUBTLE_TEXT}));
      const parsed = parseTicketActions(actionsInput.value);
      if (!parsed.length) actionsPreview.appendChild(createTextSpan('keine Buttons', {color: SETTINGS_SUBTLE_TEXT}));
      parsed.forEach(function (action) {
        actionsPreview.appendChild(createTextSpan(action.label, {
          padding: '0.15rem 0.55rem',
          borderRadius: '6px',
          border: SETTINGS_BORDER,
          background: SETTINGS_STRONG_BACKGROUND
        }));
      });
    }

    actionsInput.addEventListener('input', function () {
      renderActionsPreview();
      onValuesChanged();
    });
    renderActionsPreview();

    function setConfigured(configured) {
      pillText.textContent = configured ? 'Verbunden · Projekt ' + projectSettings.projectId : 'Nicht eingerichtet';
      pill.style.color = configured ? SETTINGS_SUCCESS : 'var(--gl-text-color-warning, #c17d10)';
      intro.style.display = configured ? 'none' : '';
      warningToggle.style.display = configured ? 'none' : ''; // eingerichtet → Warnung kommt eh nicht
      extras.style.display = configured ? 'flex' : 'none';
      stepNumbers.forEach(function (el) {
        el.style.display = configured ? 'none' : 'inline-flex';
      });
      applyStyles(portal.element, {
        borderColor: configured ? 'var(--gl-border-color-default, #4c4b51)' : SETTINGS_ACCENT,
        boxShadow: configured ? 'none' : '0 0 0 3px rgba(31, 117, 203, 0.18)'
      });
    }

    return {portalCard: portal.element, actionsCard: actions.element, setConfigured: setConfigured};
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
    // immer ausgeben (unabhängig von Debug): unterscheidet „nicht injiziert“ von „gestartet, aber fehlgeschlagen“
    console.log(LOG_PREFIX, 'v' + SCRIPT_VERSION + ' injiziert auf', window.location.href);
    log('Userscript gestartet, URL:', window.location.href);

    if (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version !== SCRIPT_VERSION) {
      warn('SCRIPT_VERSION (' + SCRIPT_VERSION + ') passt nicht zu @version (' + GM_info.script.version + ')');
    }

    if (isMergeRequestPage()) {
      log('Merge-Request-Seite erkannt; starte MR-Progress-Injection.');
    }

    const projectSettings = getProjectSettings();
    if (!projectSettings) {
      warn('Keine projectSettings – Script beendet sich.');
      return;
    }

    log('projectKey:', projectSettings.projectKey, 'projectPath:', projectSettings.projectPath);

    currentScanContext = {projectSettings: projectSettings};
    ensureStylesheet(); // vor allem, was einen Toast zeigen kann
    installNoTriggerGuard();
    importConfigFromLocationHash(projectSettings);
    window.addEventListener('pagehide', flushProgressCache);
    createToolbar(projectSettings);
    createMrLinksBar();

    scheduleReleaseCheck();
    applyShowFlagToAllBadges();
    applyShowFlagToDetailBadges();

    // Alle Scans laufen über einen einzigen, entprellten Einstieg; MR-Seite oder Board wird zur Laufzeit bestimmt
    function runScans() {
      // GitLab (Vue) kann den Toolbar-Container neu rendern und die Toolbar mitnehmen → neu aufbauen
      if (!document.getElementById('ambient-progress-toolbar')) {
        createToolbar(projectSettings);
      }
      repositionToolbarIfNeeded();
      repositionMrLinksIfNeeded();
      if (isFeatureOn('splitLabels')) {
        applySplitLabels(document.body); // einziger Durchlauf: Board-Header und -Karten, Issue-Detail, Drawer, MR-Seite
      }
      if (isFeatureOn('estimateBadge')) {
        applyEstimateBadges(); // Issue-Detail/-Drawer, MR-Seite (Karten in scanBoard)
      }
      if (isMergeRequestPage()) {
        scanMergeRequestPage(projectSettings);
      } else {
        scanBoard(projectSettings);
        scanIssueDetail(projectSettings);
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

    // GitLab-Theme-Wechsel zur Laufzeit: Farben der Toolbar folgen per CSS-Variable, nur den Dark-Mode-Cache verwerfen
    new MutationObserver(function () {
      darkModeCache = null;
    }).observe(document.documentElement, {attributes: true, attributeFilter: ['class', 'data-theme']});
  }

  // Muss nach allen Deklarationen laufen (sonst TDZ); ein defekter Cache darf das Skript nicht lahmlegen
  try {
    hydrateProgressCacheFromStorage();
  } catch (e) {
    console.warn(LOG_PREFIX, 'Cache konnte nicht geladen werden', e);
  }
  init();
})
();
