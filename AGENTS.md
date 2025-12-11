# Repository Guidelines

## Project Structure & Module Organization

- Root-level `portal-gitlab-ticket-progress.js` is the sole userscript source. Keep Tampermonkey-compatible metadata (
  name, match, grant, update/download URLs) near the top and preserve existing helper functions below.
- `README.md` holds installation, configuration, and security guidance; update it whenever documentation or workflow
  expectations change.
- Ignore the `.idea/` directory unless asked; it is user-specific IDE state and should not be committed.

## Build, Test, and Development Commands

- There is no build or package step—this is a single userscript. Editing the `.js` file and reloading Tampermonkey is
  the default working loop.
- Run browser-side validation by installing the script via the documented URL and using the GitLab board to verify UI
  injections and portal fetching.
- Use `rg`/`sed`/`node` as needed for quick checks, but do not add npm tooling unless explicitly required.

## Coding Style & Naming Conventions

- Follow the existing 2-space indentation, single quotes for strings where already used, and descriptive helper names (
  e.g., `createProjectConfigSection`).
- Keep the toolbar/config panels modular and avoid inline styles that clash with GitLab’s theme. Use `applyStyles`
  helper to keep style adjustments centralized.
- Maintain metadata comments (e.g., `// ==UserScript==` block) sorted by importance; update version numbers when
  behavior changes.
- Always bump the `@version` in the metadata header for every non-trivial change so Tampermonkey users receive updates.

## Testing Guidelines

- No automated test suite exists. Manual verification via the GitLab board and Developer Console (debug logs) is
  expected after changes.
- When adjusting parsing logic, mention in the commit/PR what scenarios were manually inspected (board columns, portal
  detail page).

## Commit & Pull Request Guidelines

- Keep commit messages imperative and specific (e.g., “Add portal warning banner”).
- PRs should include a short summary, any manual verification performed, and reference issue numbers if applicable.
  Mention README updates whenever behavior/documentation changes.
- Link new contributions to the installation instructions if they affect the workflow (e.g., new toolbar toggles or
  config options).

## Configuration & Security Tips

- Portal credentials are never stored—only the base URL goes into localStorage. Reinforce that message in any doc
  changes.
- Protect the raw install URL and update metadata; do not expose additional endpoints or secrets in the README or script
  headers.
