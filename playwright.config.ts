import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// e2e runs against the production build (`npm run build` first) in local-only mode: no Supabase
// env, so there is no login gate and sync is off. /api/ai/* is mocked per test with page.route.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;

// Prefer the preinstalled Chromium (never `playwright install` here); fall back to Playwright's own.
const PREINSTALLED = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium/chrome-linux/chrome"];
const executablePath = process.env.E2E_CHROMIUM ?? PREINSTALLED.find((p) => existsSync(p));

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 3,
  reporter: process.env.CI ? "github" : "list",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    ...devices["Pixel 7"],
    baseURL: BASE_URL,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: "ru-RU",
    timezoneId: "Europe/Paris",
    // A service worker would answer requests before page.route sees them.
    serviceWorkers: "block",
    trace: "retain-on-failure",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    // Today's phone UI. Desktop specs (desktop-*.spec.ts) run only in the desktop project.
    { name: "mobile-chromium", testIgnore: /desktop-.*\.spec\.ts/ },
    {
      name: "desktop-chromium",
      testMatch: /desktop-.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 800 },
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
        baseURL: BASE_URL,
        locale: "ru-RU",
        timezoneId: "Europe/Paris",
        serviceWorkers: "block",
        launchOptions: executablePath ? { executablePath } : {},
      },
    },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 60_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    },
  },
});
