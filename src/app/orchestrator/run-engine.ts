/**
 * RunEngine is the orchestrator entrypoint.
 * Purpose: route runs through the extracted run engine.
 * Assumptions: run engine logic lives under run/ and uses RunContext.
 * Usage: runEngine(context) from executor.
 */

export {
  runEngine,
  runLegacyEngine,
  type BatchPlanEntry,
  type RunOptions,
  type RunResult,
} from "./run/run-engine.js";
