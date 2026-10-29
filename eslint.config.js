import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // The engine must stay free of UI and backend code (SETUP.md step 2, ENGINE.md §9).
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-*', 'zustand', 'zustand/*', 'firebase', 'firebase/*', 'i18next', 'i18next-*'], message: 'src/engine must not import UI or backend code.' },
            { group: ['**/features/**', '**/pages/**', '**/store/**', '**/lib/**', '**/i18n/**', '**/app/**'], message: 'src/engine must not import app code.' },
          ],
        },
      ],
    },
  },
])
