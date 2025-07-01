module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint", "unicorn"],
  extends: ["eslint:recommended", "plugin:unicorn/recommended", "prettier"],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    // Explicitly disable type checking - syntax only
    project: false,
  },
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    // Let TypeScript handle type checking - ESLint focuses on code style and logic

    // Disable ALL TypeScript type-aware rules - TypeScript compiler handles types
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": "off", // Use TypeScript compiler for this
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/explicit-module-boundary-types": "off",
    "@typescript-eslint/no-empty-function": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-types": "off",
    "@typescript-eslint/no-inferrable-types": "off",

    // General code quality
    "no-console": "off", // We need console for CLI output
    "no-debugger": "error",
    "no-alert": "error",
    "no-eval": "error",
    "no-implied-eval": "error",
    "no-new-func": "error",
    "no-script-url": "error",
    "no-self-compare": "error",
    "no-sequences": "error",
    "no-throw-literal": "error",
    "no-unmodified-loop-condition": "error",
    "no-unused-expressions": "error",
    "no-useless-call": "error",
    "no-useless-concat": "error",
    "no-useless-return": "error",
    "no-void": "error",
    "prefer-promise-reject-errors": "error",
    "require-await": "error",

    // Variable usage
    "no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        ignoreRestSiblings: true,
        destructuredArrayIgnorePattern: "^_",
      },
    ],

    // Style and formatting - Disabled: Let Prettier handle all formatting
    // These rules conflict with Prettier and create noise
    // indent: ["error", 2],                    // Prettier handles
    // quotes: ["error", "single", { avoidEscape: true }], // Prettier handles
    // semi: ["error", "always"],               // Prettier handles
    // "comma-dangle": ["error", "never"],      // Prettier handles
    // "object-curly-spacing": ["error", "always"], // Prettier handles
    // "array-bracket-spacing": ["error", "never"], // Prettier handles
    // "space-before-function-paren": ["error", "never"], // Prettier handles
    // "keyword-spacing": "error",              // Prettier handles
    // "space-infix-ops": "error",              // Prettier handles
    // "eol-last": "error",                     // Prettier handles
    // "no-trailing-spaces": "error",          // Prettier handles
    // "no-multiple-empty-lines": ["error", { max: 2, maxEOF: 1 }], // Prettier handles

    // Best practices
    curly: ["error", "all"],
    eqeqeq: ["error", "always"],
    "no-var": "error",
    "prefer-const": "error",
    "prefer-arrow-callback": "error",
    "arrow-spacing": "error",
    "no-duplicate-imports": "error",
    "object-shorthand": "error",
    "prefer-template": "error",

    // Unicorn rule adjustments for CLI tool
    "unicorn/no-console-spaces": "off", // We format console output deliberately
    "unicorn/no-process-exit": "off", // CLI tool needs to exit
    "unicorn/prefer-module": "off", // Using CommonJS for config files
    "unicorn/prefer-top-level-await": "off", // Not needed in all contexts
    "unicorn/no-array-for-each": "off", // forEach is fine for side effects
    "unicorn/prefer-event-target": "off", // Node.js project - EventEmitter is appropriate
    "unicorn/prefer-string-slice": "error",
    "unicorn/prefer-array-some": "error",
    "unicorn/prefer-includes": "error",
    "unicorn/prefer-object-from-entries": "error",
    "unicorn/no-useless-undefined": "error",
    "unicorn/prefer-ternary": "error",

    // Additional unicorn rules for NPM package quality
    "unicorn/filename-case": [
      "error",
      { case: "kebabCase", ignore: ["CLAUDE.md", "README.md"] },
    ],
    "unicorn/consistent-function-scoping": "error",
    "unicorn/no-lonely-if": "error",
    "unicorn/prefer-logical-operator-over-ternary": "error",
    "unicorn/prefer-native-coercion-functions": "error",
    "unicorn/prefer-number-properties": "error",
    "unicorn/prefer-optional-catch-binding": "error",
    "unicorn/throw-new-error": "error",
  },
  ignorePatterns: [
    "dist/", // Ignore built files
    "node_modules/",
    "__tests__/", // Ignore test files that aren't in tsconfig
    "**/*.test.ts",
    "**/*.spec.ts",
    "database/", // Ignore database files (SQL init scripts, etc.)
    // Note: We now allow ESLint to process TypeScript files for style/syntax checks
    // while TypeScript compiler handles type checking
  ],
  overrides: [
    {
      files: ["**/*.test.ts", "**/*.spec.ts"],
      env: {
        jest: true,
      },
      rules: {
        // Allow more flexibility in test files
        "unicorn/no-null": "off",
      },
    },
    {
      files: ["**/*.cjs", "**/postinstall.cjs", "**/debug-postinstall.cjs"],
      rules: {
        // Allow more flexibility in CommonJS/legacy files
        "unicorn/no-null": "off",
        "unicorn/no-nested-ternary": "off",
        "unicorn/prevent-abbreviations": "off",
      },
    },
  ],
};
