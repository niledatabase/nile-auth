const { resolve } = require("node:path");

const project = resolve(process.cwd(), "tsconfig.json");

/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: [
    "eslint:recommended",
    "prettier",
    require.resolve("@vercel/style-guide/eslint/next"),
    "turbo",
    'plugin:@typescript-eslint/recommended'
  ],
  globals: {
    React: true,
    JSX: true,
    jest: true
  },
  env: {
    node: true,
    browser: true,
    jest: true
  },
  plugins: ["only-warn"],
  settings: {
    "import/resolver": {
      typescript: {
        project,
      },
    },
  },
  ignorePatterns: [
    // Ignore dotfiles
    ".*.js",
    "node_modules/",
  ],
  rules: {
    "@typescript-eslint/no-unused-vars": "error",
    "no-unused-vars": "off",
    "no-console": "error"
  },
  overrides: [{ files: ["*.js?(x)", "*.ts?(x)"] }],
};
