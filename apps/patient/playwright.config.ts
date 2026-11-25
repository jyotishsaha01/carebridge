import { defineConfig, devices } from "@playwright/test";

const testUrl = "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: testUrl,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm exec next dev --hostname 127.0.0.1 --port 3100",
    url: testUrl,
    env: { NEXT_PUBLIC_API_URL: testUrl },
    reuseExistingServer: false,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
