// Nur echte Fehler (kein Stil): undefinierte/doppelte Namen, unerreichbarer Code, tote Variablen
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    files: ['portal-gitlab-ticket-progress.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: Object.assign({}, globals.browser, {
        GM_xmlhttpRequest: 'readonly', GM_info: 'readonly', GM_getValue: 'readonly', GM_setValue: 'readonly', GM_deleteValue: 'readonly'
      })
    },
    rules: {'no-unused-vars': ['warn', {args: 'none', caughtErrors: 'none'}], 'no-empty': 'off'}
  },
  {files: ['tests/*.js'], languageOptions: {ecmaVersion: 2022, sourceType: 'commonjs', globals: globals.node}, rules: {'no-new-func': 'off', 'no-unused-vars': 'off'}}
];
