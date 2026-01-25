/**
 * RunContext + composition root for orchestrator runs.
 * Purpose: centralize run-scoped config and injected ports to avoid globals.
 * Assumptions: ports are thin adapters over core modules and are overrideable for tests.
 * Usage: buildRunContext({ projectName, config, options, legacy }) and call runEngine.
 */

import { runWorker } from "../../../worker/loop.js";
import { buildControlPlaneModel } from "../../control-plane/model/build.js";
import type { ControlPlaneModel } from "../../control-plane/model/schema.js";
import { ControlPlaneStore } from "../../control-plane/storage.js";
import type { ProjectConfig } from "../../core/config.js";
import { JsonlLogger, logOrchestratorEvent } from "../../core/logger.js";
import { orchestratorLogPath } from "../../core/paths.js";
import { StateStore, findLatestRunId } from "../../core/state-store.js";
import { isoNow, readJsonFile } from "../../core/utils.js";
import { removeRunWorkspace, removeTaskWorkspace, prepareTaskWorkspace } from "../../core/workspaces.js";
import { buildTaskBranchName } from "../../git/branches.js";
import { listChangedFiles } from "../../git/changes.js";
import { ensureCleanWorkingTree, checkout, resolveRunBaseSha, headSha, isAncestor } from "../../git/git.js";
import { mergeTaskBranches } from "../../git/merge.js";
import { runArchitectureValidator } from "../../validators/architecture-validator.js";
import { runDoctorValidator } from "../../validators/doctor-validator.js";
import { runStyleValidator } from "../../validators/style-validator.js";
import { runTestValidator } from "../../validators/test-validator.js";

import type { OrchestratorPorts } from "./ports.js";


// =============================================================================
// TYPES
// =============================================================================

export type LegacyExecutor<RunOptions, RunResult> = {
  runProject: (projectName: string, config: ProjectConfig, options: RunOptions) => Promise<RunResult>;
};

export type RunContext<RunOptions = unknown, RunResult = unknown> = {
  projectName: string;
  config: ProjectConfig;
  options: RunOptions;
  ports: OrchestratorPorts;
  legacy: LegacyExecutor<RunOptions, RunResult>;
};

export type BuildRunContextInput<RunOptions, RunResult> = {
  projectName: string;
  config: ProjectConfig;
  options: RunOptions;
  legacy: LegacyExecutor<RunOptions, RunResult>;
  ports?: Partial<OrchestratorPorts>;
};


// =============================================================================
// DEFAULT ADAPTERS
// =============================================================================

export function createDefaultPorts(): OrchestratorPorts {
  return {
    workspaceStore: {
      prepareTaskWorkspace,
      removeTaskWorkspace,
      removeRunWorkspace,
    },
    vcs: {
      ensureCleanWorkingTree,
      checkout,
      resolveRunBaseSha,
      headSha,
      isAncestor,
      mergeTaskBranches,
      buildTaskBranchName,
      listChangedFiles,
    },
    workerRunner: {
      runWorker,
    },
    validatorRunner: {
      runDoctorValidator,
      runTestValidator,
      runStyleValidator,
      runArchitectureValidator,
    },
    stateRepository: {
      create: (projectName, runId) => new StateStore(projectName, runId),
      findLatestRunId,
    },
    logSink: {
      createOrchestratorLogger: (projectName, runId) =>
        new JsonlLogger(orchestratorLogPath(projectName, runId), { runId }),
      logOrchestratorEvent,
    },
    clock: {
      now: () => new Date(),
      isoNow,
    },
    controlPlaneClient: {
      buildModel: buildControlPlaneModel,
      loadModel: (modelPath) => readJsonFile<ControlPlaneModel>(modelPath),
      createStore: (repoPath) => new ControlPlaneStore(repoPath),
    },
  };
}


// =============================================================================
// COMPOSITION ROOT
// =============================================================================

export function buildRunContext<RunOptions, RunResult>(
  input: BuildRunContextInput<RunOptions, RunResult>,
): RunContext<RunOptions, RunResult> {
  const ports: OrchestratorPorts = {
    ...createDefaultPorts(),
    ...input.ports,
  };

  return {
    projectName: input.projectName,
    config: input.config,
    options: input.options,
    ports,
    legacy: input.legacy,
  };
}
