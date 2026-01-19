import type { ProjectConfig } from "../core/config.js";
import { runProject, type BatchPlanEntry, type RunOptions } from "../core/executor.js";
import { defaultRunId } from "../core/utils.js";
import { createRunStopSignalHandler } from "./signal-handlers.js";

export async function runCommand(
  projectName: string,
  config: ProjectConfig,
  opts: RunOptions,
): Promise<void> {
  const runId = opts.runId ?? defaultRunId();
  const stopHandler = createRunStopSignalHandler({
    onSignal: (signal) => {
      const containerNote = opts.stopContainersOnExit
        ? "Stopping task containers before exit."
        : "Leaving task containers running so you can resume.";
      console.log(
        `Received ${signal}. Stopping run ${runId}. ${containerNote} Resume with: mycelium resume --project ${projectName} --run-id ${runId}`,
      );
    },
  });

  let res: Awaited<ReturnType<typeof runProject>>;
  try {
    res = await runProject(projectName, config, {
      ...opts,
      runId,
      stopSignal: stopHandler.signal,
    });
  } finally {
    stopHandler.cleanup();
  }

  if (res.stopped) {
    const signalLabel = res.stopped.signal ? ` (${res.stopped.signal})` : "";
    const containerLabel =
      res.stopped.containers === "stopped" ? "stopped" : "left running for resume";
    console.log(`Run ${res.runId} stopped by signal${signalLabel}; containers ${containerLabel}.`);
    console.log(`Resume with: mycelium resume --project ${projectName} --run-id ${res.runId}`);
    return;
  }

  if (opts.dryRun) {
    printDryRunPlan(res.runId, res.plan);
    return;
  }

  console.log(`Run ${res.runId} finished with status: ${res.state.status}`);
}

function printDryRunPlan(runId: string, plan: BatchPlanEntry[]): void {
  if (plan.length === 0) {
    console.log(`Dry run ${runId}: no pending tasks.`);
    return;
  }

  console.log(`Dry run ${runId}: ${plan.length} batch(es) planned.`);
  for (const batch of plan) {
    const lockText = formatLocks(batch.locks);
    const locksSuffix = lockText ? ` [locks: ${lockText}]` : "";
    console.log(`- Batch ${batch.batchId}: ${batch.taskIds.join(", ")}${locksSuffix}`);
  }
}

function formatLocks(locks: BatchPlanEntry["locks"]): string {
  const reads = locks.reads ?? [];
  const writes = locks.writes ?? [];

  const parts = [];
  if (reads.length > 0) parts.push(`reads=${reads.join(",")}`);
  if (writes.length > 0) parts.push(`writes=${writes.join(",")}`);

  return parts.join("; ");
}
