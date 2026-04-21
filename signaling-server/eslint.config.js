import js from "@eslint/js";
import tseslint from "typescript-eslint";

// ESLint v9 flat config for signaling-server.
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // TypeScript file rules.
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        process: "readonly",
        console: "readonly",
        crypto: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
      },
    },
    rules: {
      // Disallow console.log in production (allow error/warn only).
      "no-console": ["error", { allow: ["error", "warn"] }],
      // Unused variables: ignore leading underscore params (common convention for intentionally unused args).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Ignore patterns.
    ignores: ["dist/**", "node_modules/**"],
  }
);
