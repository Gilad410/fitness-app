import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import eslintConfigPrettier from 'eslint-config-prettier'
import globals from 'globals'

export default [
  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  eslintConfigPrettier,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
    },
  },
  {
    // One-off Node tooling (data-import scripts, local schema tests) --
    // never shipped to the browser bundle, so the Node global env
    // applies here instead of globals.browser above.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'scripts/**/node_modules/**'],
  },
]
