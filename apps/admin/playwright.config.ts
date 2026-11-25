import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:3002", trace: "retain-on-failure" },
  webServer: { command: "pnpm exec next dev --hostname 127.0.0.1 --port 3002", url: "http://127.0.0.1:3002", reuseExistingServer: false, env: { NEXT_PUBLIC_API_URL: "http://127.0.0.1:3002" } },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
