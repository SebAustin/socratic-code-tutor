import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([
    ".next/**",
    ".remember/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    // Operational tooling (demo-video recording pipeline), plain-Node CJS by design —
    // not part of the app's TypeScript surface.
    "demo-video/**",
    // Local editor tooling, untracked (gitignored).
    ".cursor/**",
  ]),
]);
