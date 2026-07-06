import { defineConfig } from "vitest/config";

// Minimal Vitest config for pure-function tests (units.ts, linter, aggregation).
// No jsdom/DOM environment this phase — add @testing-library/react + jsdom
// in a later phase if/when component-level tests are needed.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.js"],
  },
});
