import { describe, expect, it } from "vitest";

import { buildOwnershipIndex } from "../control-plane/extract/ownership.js";
import { buildTaskChangeManifest } from "../control-plane/integration/change-manifest.js";
import type {
  ControlPlaneComponent,
  ControlPlaneDependencyEdge,
  ControlPlaneModel,
} from "../control-plane/model/schema.js";
import type { TaskManifest } from "../core/task-manifest.js";

// =============================================================================
// HELPERS
// =============================================================================

function createManifest(): TaskManifest {
  return {
    id: "401",
    name: "Change Manifest",
    description: "Test manifest for change-manifest output.",
    estimated_minutes: 15,
    dependencies: [],
    locks: { reads: [], writes: [] },
    files: { reads: [], writes: [] },
    affected_tests: [],
    test_paths: [],
    tdd_mode: "off",
    verify: { doctor: "npm test" },
  };
}

function createComponents(): ControlPlaneComponent[] {
  return [
    {
      id: "component-a",
      name: "Component A",
      roots: ["apps/component-a"],
      kind: "app",
    },
    {
      id: "component-b",
      name: "Component B",
      roots: ["packages/component-b"],
      kind: "lib",
    },
    {
      id: "component-c",
      name: "Component C",
      roots: ["packages/component-c"],
      kind: "lib",
    },
  ];
}

function createDependency(
  fromComponent: string,
  toComponent: string,
  confidence: ControlPlaneDependencyEdge["confidence"],
): ControlPlaneDependencyEdge {
  return {
    from_component: fromComponent,
    to_component: toComponent,
    kind: "workspace-package",
    confidence,
  };
}

function createModel(edges: ControlPlaneDependencyEdge[]): ControlPlaneModel {
  const components = createComponents();
  const ownership = buildOwnershipIndex(components);

  return {
    components,
    ownership,
    deps: { edges },
    symbols: [],
    symbols_ts: { definitions: [] },
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe("control-plane change manifest", () => {
  it("derives touched/impacted components and surface categories", () => {
    const model = createModel([
      createDependency("component-b", "component-a", "high"),
      createDependency("component-c", "component-b", "high"),
    ]);

    const manifest = buildTaskChangeManifest({
      task: createManifest(),
      baseSha: "base-sha",
      headSha: "head-sha",
      changedFiles: ["packages/component-b/src/index.ts", "apps/component-a/src/index.ts"],
      model,
    });

    expect(manifest.changed_files).toEqual([
      "apps/component-a/src/index.ts",
      "packages/component-b/src/index.ts",
    ]);
    expect(manifest.touched_components).toEqual(["component-a", "component-b"]);
    expect(manifest.impacted_components).toEqual(["component-a", "component-b", "component-c"]);
    expect(manifest.surface_change.is_surface_change).toBe(true);
    expect(manifest.surface_change.categories).toEqual(["public-entrypoint"]);
  });

  it("notes when changed files lack component owners", () => {
    const model = createModel([]);

    const manifest = buildTaskChangeManifest({
      task: createManifest(),
      baseSha: "base-sha",
      headSha: "head-sha",
      changedFiles: ["docs/README.md"],
      model,
    });

    expect(manifest.touched_components).toEqual([]);
    expect(manifest.notes).toEqual(["No component owners resolved for changed files."]);
    expect(manifest.surface_change.is_surface_change).toBe(false);
  });
});
