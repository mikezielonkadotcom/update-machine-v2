import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['.next/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      // Allow any types during incremental type tightening
      '@typescript-eslint/no-explicit-any': 'off',
      // Allow unused vars prefixed with _
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // Catch empty catch blocks (we fixed these, keep them honest)
      'no-empty': ['warn', { allowEmptyCatch: false }],
      // Allow require() in config files
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];
