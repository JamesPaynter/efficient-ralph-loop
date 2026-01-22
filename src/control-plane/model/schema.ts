// Control plane model schema definitions.
// Purpose: define the JSON shape and schema version for persisted models.
// Assumes higher-level builders supply data for components/dependencies/symbols later.

export const MODEL_SCHEMA_VERSION = 1;

export type ControlPlaneModel = {
  components: unknown[];
  dependencies: unknown[];
  symbols: unknown[];
};



// =============================================================================
// MODEL INITIALIZERS
// =============================================================================

export function createEmptyModel(): ControlPlaneModel {
  return {
    components: [],
    dependencies: [],
    symbols: [],
  };
}
