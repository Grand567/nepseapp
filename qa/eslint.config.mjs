// QA-only ESLint config (does not affect the app). Run from repo root: npx --prefix qa eslint -c qa/eslint.config.mjs src
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import react from 'eslint-plugin-react';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['**/node_modules/**', 'dist/**', 'android/**', 'src/data/**/*.json'] },
  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks, react },
    settings: { react: { version: '18.3' } },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react/jsx-key': 'error',
      'react/no-array-index-key': 'warn',
      'react/no-direct-mutation-state': 'error',
      'react/jsx-no-undef': 'error',
      'react/jsx-uses-vars': 'error',
      'no-undef': 'off', // TS/JSX globals noisy; covered by sentinel audit + tsc
      'no-unused-vars': 'off',
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-self-compare': 'error',
      'no-constant-condition': ['warn', { checkLoops: false }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-console': 'warn',
      'no-debugger': 'error',
      'no-async-promise-executor': 'error',
      'no-promise-executor-return': 'warn',
      'require-atomic-updates': 'off',
      'no-unsafe-finally': 'error',
      'no-cond-assign': 'error',
    },
  },
];
