// Control plane model schema definitions.
// Purpose: define the JSON shape and schema version for persisted models.
// Assumes higher-level builders supply data for components/ownership/dependencies/symbols.

export const MODEL_SCHEMA_VERSION = 2;



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

export type ControlPlaneModel = {
  components: ControlPlaneComponent[];
  ownership: ControlPlaneOwnership;
  dependencies: unknown[];
  symbols: unknown[];
};



// =============================================================================
// MODEL INITIALIZERS
// =============================================================================

export function createEmptyModel(): ControlPlaneModel {
  return {
    components: [],
    ownership: { roots: [] },
    dependencies: [],
    symbols: [],
  };
}
