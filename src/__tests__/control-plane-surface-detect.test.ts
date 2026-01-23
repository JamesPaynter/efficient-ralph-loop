import { describe, expect, it } from "vitest";

import { detectSurfaceChanges } from "../control-plane/policy/surface-detect.js";



// =============================================================================
// TESTS
// =============================================================================

describe("control-plane surface detection", () => {
  it("categorizes changed files with default surface patterns", () => {
    const result = detectSurfaceChanges([
      "api/openapi.yaml",
      "proto/service.proto",
      ".env.local",
      "config/app.yaml",
      "deploy/values.yaml",
      "db/migrations/20240101_init.sql",
      "src/migration/001/step.sql",
      "src/index.ts",
      "package.json",
      "docs/readme.md",
    ]);

    expect(result.is_surface_change).toBe(true);
    expect(result.categories).toEqual([
      "contract",
      "config",
      "migration",
      "public-entrypoint",
    ]);

    expect(result.matched_files.contract).toEqual([
      "api/openapi.yaml",
      "proto/service.proto",
    ]);
    expect(result.matched_files.config).toEqual([
      ".env.local",
      "config/app.yaml",
      "deploy/values.yaml",
    ]);
    expect(result.matched_files.migration).toEqual([
      "db/migrations/20240101_init.sql",
      "src/migration/001/step.sql",
    ]);
    expect(result.matched_files["public-entrypoint"]).toEqual([
      "package.json",
      "src/index.ts",
    ]);
  });

  it("returns an empty detection when no files match", () => {
    const result = detectSurfaceChanges(["docs/readme.md", "src/utils/helpers.ts"]);

    expect(result.is_surface_change).toBe(false);
    expect(result.categories).toEqual([]);
    expect(result.matched_files).toEqual({});
  });
});
