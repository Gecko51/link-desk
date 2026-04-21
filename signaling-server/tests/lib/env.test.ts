import { loadEnv } from "@/lib/env";

describe("loadEnv", () => {
  it("parses valid env with defaults", () => {
    const env = loadEnv({ PORT: "3001", LOG_LEVEL: "info", NODE_ENV: "development" });
    expect(env.PORT).toBe(3001);
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.NODE_ENV).toBe("development");
  });

  it("applies defaults when vars are missing", () => {
    const env = loadEnv({});
    expect(env.PORT).toBe(3001);
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.NODE_ENV).toBe("development");
  });

  it("throws on invalid PORT", () => {
    expect(() => loadEnv({ PORT: "not-a-number" })).toThrow();
  });

  it("throws on invalid LOG_LEVEL", () => {
    expect(() => loadEnv({ LOG_LEVEL: "shouty" })).toThrow();
  });
});
