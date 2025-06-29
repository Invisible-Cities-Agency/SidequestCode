module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['unicorn'],
  extends: [
    'eslint:recommended',
    'plugin:unicorn/recommended'
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    // Let TypeScript handle type checking - ESLint focuses on code style and logic
    
    // General code quality
    'no-console': 'off', // We need console for CLI output
    'no-debugger': 'error',
    'no-alert': 'error',
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error',
    'no-self-compare': 'error',
    'no-sequences': 'error',
    'no-throw-literal': 'error',
    'no-unmodified-loop-condition': 'error',
    'no-unused-expressions': 'error',
    'no-useless-call': 'error',
    'no-useless-concat': 'error',
    'no-useless-return': 'error',
    'no-void': 'error',
    'prefer-promise-reject-errors': 'error',
    'require-await': 'error',
    
    // Style and formatting
    'indent': ['error', 2],
    'quotes': ['error', 'single', { avoidEscape: true }],
    'semi': ['error', 'always'],
    'comma-dangle': ['error', 'never'],
    'object-curly-spacing': ['error', 'always'],
    'array-bracket-spacing': ['error', 'never'],
    'space-before-function-paren': ['error', 'never'],
    'keyword-spacing': 'error',
    'space-infix-ops': 'error',
    'eol-last': 'error',
    'no-trailing-spaces': 'error',
    'no-multiple-empty-lines': ['error', { max: 2, maxEOF: 1 }],
    
    // Best practices
    'curly': ['error', 'all'],
    'eqeqeq': ['error', 'always'],
    'no-var': 'error',
    'prefer-const': 'error',
    'prefer-arrow-callback': 'error',
    'arrow-spacing': 'error',
    'no-duplicate-imports': 'error',
    'object-shorthand': 'error',
    'prefer-template': 'error',
    
    // Unicorn rule adjustments for CLI tool
    'unicorn/no-console-spaces': 'off', // We format console output deliberately
    'unicorn/no-process-exit': 'off', // CLI tool needs to exit
    'unicorn/prefer-module': 'off', // Using CommonJS for config files
    'unicorn/prefer-top-level-await': 'off', // Not needed in all contexts
    'unicorn/no-array-for-each': 'off', // forEach is fine for side effects
    'unicorn/prefer-string-slice': 'error',
    'unicorn/prefer-array-some': 'error',
    'unicorn/prefer-includes': 'error',
    'unicorn/prefer-object-from-entries': 'error',
    'unicorn/no-useless-undefined': 'error',
    'unicorn/prefer-ternary': 'error',
    
    // Additional unicorn rules for NPM package quality
    'unicorn/filename-case': ['error', { case: 'kebabCase', ignore: ['CLAUDE.md', 'README.md'] }],
    'unicorn/consistent-function-scoping': 'error',
    'unicorn/no-lonely-if': 'error',
    'unicorn/prefer-logical-operator-over-ternary': 'error',
    'unicorn/prefer-native-coercion-functions': 'error',
    'unicorn/prefer-number-properties': 'error',
    'unicorn/prefer-optional-catch-binding': 'error',
    'unicorn/throw-new-error': 'error'
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    '*.js', // Ignore built JS files
    '.eslintrc.cjs', // Allow this config file
    '__tests__/', // Ignore test files that aren't in tsconfig
    '**/*.test.ts',
    '**/*.spec.ts'
  ],
  overrides: [
    {
      files: ['**/*.test.ts', '**/*.spec.ts'],
      env: {
        jest: true
      },
      rules: {
        // Allow more flexibility in test files
        'unicorn/no-null': 'off'
      }
    }
  ]
};