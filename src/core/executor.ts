import type { ProjectConfig } from "./config.js";

import { buildRunContext } from "../app/orchestrator/run-context-builder.js";
import { runEngine, runLegacyEngine } from "../app/orchestrator/run-engine.js";
import type { RunOptions, RunResult } from "../app/orchestrator/run/run-engine.js";

export { checkpointListsEqual, mergeCheckpointCommits } from "../app/orchestrator/run/task-engine.js";
export type { BatchPlanEntry, RunOptions, RunResult } from "../app/orchestrator/run/run-engine.js";


// =============================================================================
// PUBLIC API
// =============================================================================

export async function runProject(
  projectName: string,
  config: ProjectConfig,
  opts: RunOptions,
): Promise<RunResult> {
  const context = await buildRunContext({
    projectName,
    config,
    options: opts,
    legacy: { runProject: runProjectLegacy },
  });

  return runEngine(context);
}


// =============================================================================
// LEGACY FALLBACK
// =============================================================================

async function runProjectLegacy(
  projectName: string,
  config: ProjectConfig,
  opts: RunOptions,
): Promise<RunResult> {
  const context = await buildRunContext({
    projectName,
    config,
    options: opts,
    legacy: { runProject: runProjectLegacy },
  });

  return runLegacyEngine(context);
}
