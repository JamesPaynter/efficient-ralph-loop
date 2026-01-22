// Control plane model schema definitions.
// Purpose: define the JSON shape and schema version for persisted models.
// Assumes higher-level builders supply data for components/ownership/deps/symbols.

export const MODEL_SCHEMA_VERSION = 3;



// =============================================================================
// MODEL TYPES
// =============================================================================

export type ComponentKind = "app" | "lib" | "infra" | "unknown";

export type ControlPlaneComponent = {
  id: string;
  name: string;
  roots: string[];
  kind: ComponentKind;
  language_hints?: string[];
};

export type ControlPlaneOwnershipRoot = {
  component_id: string;
  root: string;
};

export type ControlPlaneOwnership = {
  roots: ControlPlaneOwnershipRoot[];
};

export type ControlPlaneDependencyKind = "workspace-package" | "ts-import";

export type ControlPlaneDependencyConfidence = "high" | "medium" | "low";

export type ControlPlaneDependencyEdge = {
  from_component: string;
  to_component: string;
  kind: ControlPlaneDependencyKind;
  confidence: ControlPlaneDependencyConfidence;
  evidence?: Record<string, string>;
};

export type ControlPlaneDependencies = {
  edges: ControlPlaneDependencyEdge[];
};

export type ControlPlaneModel = {
  components: ControlPlaneComponent[];
  ownership: ControlPlaneOwnership;
  deps: ControlPlaneDependencies;
  symbols: unknown[];
};



// =============================================================================
// MODEL INITIALIZERS
// =============================================================================

export function createEmptyModel(): ControlPlaneModel {
  return {
    components: [],
    ownership: { roots: [] },
    deps: { edges: [] },
    symbols: [],
  };
}
