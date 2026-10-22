const next = require("@next/eslint-plugin-next");
const globals = require("globals");
const library = require("./library");

/** @type {import("eslint").Linter.Config[]} */
module.exports = [
  ...library,
  {
    languageOptions: {
      globals: globals.browser,
    },
    plugins: { "@next/next": next },
    rules: {
      ...next.configs.recommended.rules,
      ...next.configs["core-web-vitals"].rules,
    },
  },
];
