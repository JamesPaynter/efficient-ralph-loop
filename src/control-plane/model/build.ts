// Control plane model build orchestration.
// Purpose: resolve revisions, coordinate locks, and populate the file-backed cache.
// Assumes extractor outputs are currently empty stubs.

import crypto from "node:crypto";
import path from "node:path";

import {
  createControlPlaneMetadata,
  isMetadataCompatible,
  type ControlPlaneExtractorVersions,
  type ControlPlaneModelMetadata,
} from "../metadata.js";
import { ControlPlaneStore } from "../storage.js";
import { resolveBaseSha } from "../git.js";
import { createEmptyModel, MODEL_SCHEMA_VERSION, type ControlPlaneModel } from "./schema.js";

export type ControlPlaneBuildOptions = {
  repoRoot: string;
  baseSha?: string | null;
  ref?: string | null;
  force?: boolean;
};

export type ControlPlaneBuildResult = {
  base_sha: string;
  cache_dir: string;
  metadata: ControlPlaneModelMetadata;
  reused: boolean;
};

export type ControlPlaneModelInfo = {
  base_sha: string;
  cache_dir: string;
  exists: boolean;
  metadata: ControlPlaneModelMetadata | null;
};

const EXTRACTOR_VERSIONS: ControlPlaneExtractorVersions = {
  components: "stub",
  deps: "stub",
  symbols: "stub",
};



// =============================================================================
// BUILD ORCHESTRATION
// =============================================================================

export async function buildControlPlaneModel(
  options: ControlPlaneBuildOptions,
): Promise<ControlPlaneBuildResult> {
  const repoRoot = path.resolve(options.repoRoot);
  const baseSha = await resolveBaseSha({
    repoRoot,
    baseSha: options.baseSha ?? null,
    ref: options.ref ?? null,
  });

  const store = new ControlPlaneStore(repoRoot);
  const lock = await store.acquireBuildLock(baseSha);

  try {
    const [existingMetadata, modelFileExists] = await Promise.all([
      store.readMetadata(baseSha),
      store.hasModelFile(baseSha),
    ]);

    const canReuse =
      !options.force &&
      existingMetadata !== null &&
      modelFileExists &&
      isMetadataCompatible(existingMetadata, {
        schemaVersion: MODEL_SCHEMA_VERSION,
        extractorVersions: EXTRACTOR_VERSIONS,
      });

    if (canReuse && existingMetadata) {
      return {
        base_sha: baseSha,
        cache_dir: store.getModelDir(baseSha),
        metadata: existingMetadata,
        reused: true,
      };
    }

    const model = createEmptyModel();
    const modelHash = hashModel(model);
    const metadata = createControlPlaneMetadata({
      baseSha,
      repoRoot,
      schemaVersion: MODEL_SCHEMA_VERSION,
      extractorVersions: EXTRACTOR_VERSIONS,
      modelHash,
    });

    await store.writeModel(baseSha, model, metadata);

    return {
      base_sha: baseSha,
      cache_dir: store.getModelDir(baseSha),
      metadata,
      reused: false,
    };
  } finally {
    await lock.release();
  }
}

export async function getControlPlaneModelInfo(
  options: Omit<ControlPlaneBuildOptions, "force">,
): Promise<ControlPlaneModelInfo> {
  const repoRoot = path.resolve(options.repoRoot);
  const baseSha = await resolveBaseSha({
    repoRoot,
    baseSha: options.baseSha ?? null,
    ref: options.ref ?? null,
  });

  const store = new ControlPlaneStore(repoRoot);
  const [metadata, modelFileExists] = await Promise.all([
    store.readMetadata(baseSha),
    store.hasModelFile(baseSha),
  ]);

  const exists = metadata !== null && modelFileExists;

  return {
    base_sha: baseSha,
    cache_dir: store.getModelDir(baseSha),
    exists,
    metadata: exists ? metadata : null,
  };
}



// =============================================================================
// INTERNAL HELPERS
// =============================================================================

function hashModel(model: ControlPlaneModel): string {
  const payload = JSON.stringify(model, null, 2) + "\n";
  return crypto.createHash("sha256").update(payload).digest("hex");
}
