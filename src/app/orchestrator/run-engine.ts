/**
 * RunEngine is the orchestrator entrypoint.
 * Purpose: route a run through injected ports without reaching for globals.
 * Assumptions: legacy executor remains the backing implementation for now.
 * Usage: runEngine(context) from executor until modules are strangled out.
 */

import type { RunContext } from "./run-context.js";


// =============================================================================
// PUBLIC API
// =============================================================================

export async function runEngine<RunOptions, RunResult>(
  context: RunContext<RunOptions, RunResult>,
): Promise<RunResult> {
  return context.legacy.runProject(context.projectName, context.config, context.options);
}
