import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module"
      }
    },
    plugins: {
      "@typescript-eslint": tseslint
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "no-undef": "off",
      "@typescript-eslint/no-explicit-any": "off"
    }
  },
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/uploads/**",
      "**/data/**",
      "**/rendered/**",
      "**/*.log"
    ]
  },
  prettier
];
