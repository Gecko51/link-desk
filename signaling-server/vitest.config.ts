import { defineConfig } from "vitest/config";
import path from "node:path";

// Vitest configuration for signaling-server.
// Environment: Node.js (not jsdom), globals enabled, path alias @/ → src/.
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.{test,spec}.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
