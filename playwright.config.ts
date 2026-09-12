import { defineConfig, devices } from '@playwright/test';

// Every engine runs the same suite so a browser-specific regression (WebKit audio,
// Firefox worklets) fails here rather than in someone's hands.
export default defineConfig({
  testDir: './tests',
  // These suites assert on real-time audio and layout; running them in parallel
  // starves the CPU and produces timing flakes rather than useful failures.
  workers: 1,
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4173', port: 4173, reuseExistingServer: true },
  use: { baseURL: 'http://127.0.0.1:4173' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      // Playwright's Windows WebKit build ships without Web Audio (AudioContext,
      // OfflineAudioContext and AudioWorkletNode are all undefined), so only the
      // specs that do not need audio run here: install/offline and degradation.
      testMatch: /(offline|degradation)\.spec\.ts/,
    },
  ],
});
