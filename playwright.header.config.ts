import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Real-session header integration on Chromium and Firefox. Shared presentation
// is covered in component tests without repeating the complete workflow.
export default defineConfig({
  ...base,
  testMatch: "**/header-overlap.spec.ts",
});
