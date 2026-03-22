import eslint from "@eslint/js";
import nPlugin from "eslint-plugin-n";
import importPlugin from "eslint-plugin-import";

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
      import: importPlugin
    },
    languageOptions: {
      globals: {
        console: "readonly",
        setInterval: "readonly",
        setTimeout: "readonly",
        clearInterval: "readonly",
        clearTimeout: "readonly",
        process: "readonly",
        fetch: "readonly"
      }
    },
    rules: {
      indent: ["error", 4],
      "linebreak-style": ["error", "unix"],
      quotes: ["error", "double"],
      semi: ["error", "always"],
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": "off",
      "import/order": ["error", {
        groups: [
          "builtin",
          "external",
          "internal"
        ],
        "newlines-between": "always"
      }],
      "n/no-missing-import": "off",
      "n/no-unpublished-import": "off",
      "no-useless-escape": "warn"
    }
  }
];
