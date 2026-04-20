// ESLint v10 flat config (replaces .eslintrc.cjs which is not supported in ESLint 9+).
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import reactRefreshPlugin from "eslint-plugin-react-refresh";

export default [
  // Files to ignore globally
  {
    ignores: ["dist/**", "src-tauri/**", "node_modules/**"],
  },
  // TypeScript + React rules for all TS/TSX source files
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        // Browser globals
        window: "readonly",
        document: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        // Node globals (for config files)
        process: "readonly",
        __dirname: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooksPlugin,
      "react-refresh": reactRefreshPlugin,
    },
    rules: {
      // TypeScript recommended rules (spread from plugin)
      ...tsPlugin.configs.recommended.rules,
      // React hooks recommended rules
      ...reactHooksPlugin.configs.recommended.rules,
      // Custom rule overrides
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
  // Disable react-refresh rule for shadcn/ui generated components — they
  // intentionally export both components and non-component constants
  // (e.g. buttonVariants). Must come AFTER the general block to override it.
  {
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
];
