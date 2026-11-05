const js = require('@eslint/js');
const globals = require('globals');
const prettier = require('eslint-config-prettier');

const reactHooks = require('eslint-plugin-react-hooks');
const react = require('eslint-plugin-react');


module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.jest
      }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  },

{
  files: ['web/**/*.{js,jsx}'],

  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    globals: {
      ...globals.browser,
      ...globals.node
    },
    parserOptions: {
      ecmaFeatures: {
        jsx: true
      }
    }
  },

  plugins: {
    react,
    'react-hooks': reactHooks
  },

  rules: {
    ...reactHooks.configs.flat.recommended.rules,
    'react/jsx-uses-vars': 'error'
  }
},

  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**'
    ]
  },



  prettier
];
