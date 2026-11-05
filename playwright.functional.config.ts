import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
// Complete functional regression, excluding the separate header integration.
export default defineConfig({
  ...base,
  testIgnore: "**/header-overlap.spec.ts",
  projects: base.projects?.filter(
    (project) => project.name !== "firefox-header",
  ),
});
