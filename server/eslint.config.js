import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// Server lint (src only; tests run under `npm test`). `npm run lint --workspace=server`.
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['src/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.node },
    rules: {
      // `{ rows: _r, ...rest }` drops a field on purpose.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
    },
  },
  {
    // Connector clients and mappers read untyped third-party JSON (SP-API, Ads, Flipkart, Shiprocket, BigQuery rows …):
    // `any` there is narrowed field by field. Kept visible as a warning, not an error.
    files: ['src/connectors/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'warn' },
  },
])
