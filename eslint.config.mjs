import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";

/** @type {import('eslint').Linter.Config[]} */
export default [
  {files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],},
  {languageOptions: { globals: {...globals.browser, ...globals.node} }},
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
  { ignores: ["**/.next/**"]},
  {rules: {
    "react/react-in-jsx-scope": "off", // Disable if using React 17+
    "react/prop-types": "off",         // Disable if using TypeScript
  "no-constant-binary-expression": "off",
  "@typescript-eslint/no-explicit-any": "off"
  }},
];