const js = require("@eslint/js");
const tseslint = require("typescript-eslint");
const globals = require("globals");
const prettier = require("eslint-config-prettier/flat");

/** @type {import("eslint").Linter.Config[]} */
module.exports = [
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/.turbo/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-require-imports": "off",
      "no-unused-vars": "off",
    },
  },
  prettier,
];
