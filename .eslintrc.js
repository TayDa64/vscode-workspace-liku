// .eslintrc.js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020, // or higher
    sourceType: 'module',
    project: ['./tsconfig.json'], // Point to your tsconfig for typed linting rules
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    // 'plugin:@typescript-eslint/recommended-requiring-type-checking', // Optional: more strict
  ],
  env: {
    node: true,
    es6: true,
  },
  rules: {
    // Add or override rules here
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn', // Be mindful of 'any'
  },
  ignorePatterns: ['dist', 'node_modules', '.vscode-test', 'src/webview/test'], // Ignore build output and tests
};