import tseslint from "typescript-eslint";
import tsParser from "@typescript-eslint/parser";
import js from "@eslint/js";
import react from "eslint-plugin-react";
import { globalIgnores } from "eslint/config";

export default tseslint.config(
  { files: ["**/*.{js,mjs,cjs,ts,tsx}"] },
  globalIgnores(["dist/", ".data/"]),
  js.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat["jsx-runtime"],
  tseslint.configs.recommended,
  {
    languageOptions: {
      parser: tsParser,
    },

    settings: {
      react: {
        version: "16.0",
      },
    },

    rules: {
      "@typescript-eslint/no-require-imports": "off",

      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],

      "react/no-unknown-property": [
        "error",
        {
          ignore: ["onFocusIn", "onFocusOut"],
        },
      ],
    },
  },
  {
    files: ["icons/*.svg.tsx"],
    rules: {
      "react/display-name": 0,
    },
  },
);
