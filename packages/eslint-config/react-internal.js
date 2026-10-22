const globals = require("globals");
const library = require("./library");

/** @type {import("eslint").Linter.Config[]} */
module.exports = [
  ...library,
  {
    languageOptions: {
      globals: globals.browser,
    },
  },
];
