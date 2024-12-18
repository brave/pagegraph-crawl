// This eslint config is used for checking the typescript in the project
// (e.g., src/*). The other eslint config file (eslint-neostandard.config.js)
// is used for linting the code in this project written in JS (e.g., test/*.js).

import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import stylistic from '@stylistic/eslint-plugin'

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  stylistic.configs['recommended-flat'],
  {
    rules: {
      'max-len': ['error', 80, {
        'ignoreStrings': true,
      }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        "caughtErrorsIgnorePattern": "ignore"
      }],
      'camelcase': ['error', {
        'properties': 'never'
      }]
    }
  },
  {
    plugins: {
      '@stylistic': stylistic
    },
    rules: {
      "@stylistic/indent": ["error", 2, {
        "FunctionExpression": {
          "parameters": "first"
        },
        "CallExpression" : {
          "arguments": "first",
        },
        "ArrayExpression": "first",
      }],
      "@stylistic/space-before-function-paren": ["error", "always"],
    }
  }
)