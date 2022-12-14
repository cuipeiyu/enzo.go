module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  globals: {
    defineEmits: 'readonly',
    defineProps: 'readonly',
    __APP_VERSION__: 'readonly',
  },
  extends: [
    'plugin:@typescript-eslint/recommended',
    'airbnb-base',
  ],
  plugins: ['@typescript-eslint'],
  parserOptions: {
    ecmaVersion: 2021,
    parser: '@typescript-eslint/parser',
  },
  rules: {
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/ban-types': 'off',
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-this-alias': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { 'argsIgnorePattern': '^_' }],
    '@typescript-eslint/no-var-requires': 'off',
    'array-element-newline': ['error', 'consistent'],
    'arrow-parens': 'off',
    'class-methods-use-this': 'off',
    'comma-dangle': ['error', 'always-multiline'],
    'consistent-return': 'off',
    'default-case': 'off',
    'eol-last': 'off',
    'eqeqeq': 'off',
    'func-names': 'off',
    'global-require': 'off',
    'guard-for-in': 'off',
    'import/extensions': 'off',
    'import/named': 'off',
    'import/no-cycle': 'off',
    'import/no-extraneous-dependencies': 'off',
    'import/no-unresolved': 'off',
    'import/order': 'off',
    'import/prefer-default-export': 'off',
    'implicit-arrow-linebreak': 'off',
    'indent': ['error', 2],
    'linebreak-style': ['error', 'unix'],
    'max-len': 'off',
    'max-classes-per-file': 'off',
    'no-await-in-loop': 'off',
    'no-bitwise': 'off',
    'no-case-declarations': 'off',
    'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'no-continue': 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'no-dupe-keys': 'off',
    'no-else-return': 'error',
    'no-empty': 'off',
    'no-mixed-operators': 'off',
    'no-nested-ternary': 'off',
    'no-new': 'off',
    'no-param-reassign': 'off',
    'no-plusplus': 'off',
    'no-prototype-builtins': 'off',
    'no-restricted-syntax': 'off',
    'no-return-await': 'off',
    'no-shadow': 'off',
    'no-tabs': 'off',
    'no-trailing-spaces': 'off',
    'no-underscore-dangle': 'off',
    'no-unused-expressions': 'off',
    'no-unused-vars': ['warn', { 'argsIgnorePattern': '^_' }],
    'no-use-before-define': 'off',
    'no-void': 'off',
    'object-curly-newline': 'off',
    'object-curly-spacing': ['error', 'always'],
    'one-var': 'off',
    'one-var-declaration-per-line': 'off',
    'prefer-const': 'off',
    'prefer-destructuring': 'off',
    'prefer-template': 'off',
    'quotes': ['error', 'single'],
    'quote-props': 'off',
    'radix': 'off',
    'semi': ['error', 'always'],
    'symbol-description': 'off',
    'template-curly-spacing': 'off',
  },
};
