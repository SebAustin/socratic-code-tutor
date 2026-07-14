import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "jsdom",
    environmentOptions: { jsdom: { url: "http://localhost" } },
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: [
        "src/lib/*.ts",
        "src/features/tutor/{guardrail,hintLadder,promptBuilder,traceSummary}.ts",
        "src/features/session/storage.ts",
        "src/features/teacher/{aggregate,tagParsing,export}.ts",
        "src/server/ratelimit.ts",
      ],
      thresholds: { lines: 80 },
    },
  },
});
