import eslint from "@eslint/js";
import nPlugin from "eslint-plugin-n";
import unicornPlugin from "eslint-plugin-unicorn";
import perfectionistPlugin from "eslint-plugin-perfectionist";

export default [
  {
    ignores: [
      "node_modules/**",
      "*.min.js",
      "package-lock.json",
      "db.sqlite",
      "eslint.config.js"
    ]
  },
  eslint.configs.recommended,

  {
    plugins: {
      n: nPlugin,
      unicorn: unicornPlugin,
      perfectionist: perfectionistPlugin
    },
    languageOptions: {
      globals: {
        console: "readonly",
        setInterval: "readonly",
        setTimeout: "readonly",
        clearInterval: "readonly",
        clearTimeout: "readonly",
        process: "readonly",
        fetch: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly"
      }
    },
    rules: {
      // ── Style Rules ──────────────────────────────────────────────
      indent: ["error", 4],
      "linebreak-style": ["error", "unix"],
      quotes: ["error", "double"],
      semi: ["error", "always"],

      // ── Core Best Practices ──────────────────────────────────────
      "no-unused-vars": "error",
      "no-undef": "error",
      "no-eval": "error",
      "no-console": "error",
      "no-prototype-builtins": "error",
      "no-shadow": "error",
      "prefer-const": "error",
      "require-await": "warn",

      // ── Node.js Rules (eslint-plugin-n) ──────────────────────────
      "n/no-missing-import": "warn",
      "n/no-unpublished-import": "warn",
      "n/no-process-exit": "off",

      // ── Import Rules (replaced import/order with perfectionist) ──
      "perfectionist/sort-imports": ["error", {
        groups: [
          "builtin",
          "external",
          "internal",
          ["parent", "sibling"],
          "index"
        ],
        newlinesBetween: 1,
        type: "alphabetical",
        order: "asc"
      }],

      // ── Object Sorting (eslint-plugin-perfectionist) ─────────────
      "perfectionist/sort-objects": ["error", {
        type: "alphabetical",
        order: "asc",
        ignoreCase: false
      }],

      // ── Unicorn Rules (eslint-plugin-unicorn) ────────────────────
      // String operations
      "unicorn/prefer-string-starts-ends-with": "error",
      "unicorn/prefer-string-trim-start-end": "error",
      "unicorn/prefer-includes": "error",

      // Array operations
      "unicorn/prefer-array-some": "error",
      "unicorn/prefer-array-find": "error",
      "unicorn/prefer-spread": "error",

      // Object operations
      "unicorn/prefer-object-from-entries": "error",

      // Modern patterns
      "unicorn/prefer-ternary": ["error", "only-single-line"],
      "unicorn/prefer-switch": "error",
      "unicorn/no-negated-condition": "error",
      "unicorn/consistent-function-scoping": "warn",

      // Escape sequences (replaces no-useless-escape)
      "unicorn/better-regex": "error",
      "unicorn/no-useless-undefined": "error",

      // ── Legacy rules (superseded by unicorn) ─────────────────────
      "no-useless-escape": "warn"
    }
  }
];
