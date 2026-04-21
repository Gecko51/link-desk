import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Unmount any rendered components between tests to avoid cross-test leaks.
afterEach(() => {
  cleanup();
});

// Mock Tauri's invoke() for all tests by default. Individual tests override
// the mock via vi.mocked(invoke).mockResolvedValueOnce(...) as needed.
// Returns a resolved promise so hooks calling .then() don't throw.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(""),
}));
