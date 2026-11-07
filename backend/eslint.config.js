import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      // Copied from the tested Medium importer; the .js files are covered by
      // the frontend tests. The TypeScript adapter next to them is linted.
      "src/integrations/medium/*.js",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: {
      globals: {
        module: "writable",
        require: "readonly",
        __dirname: "readonly",
      },
    },
  },
);
