import type { ProjectConfig } from "../core/config.js";
import { runProject, type RunOptions } from "../core/executor.js";
import { loadRunStateForProject } from "../core/state-store.js";
import { createRunStopSignalHandler } from "./signal-handlers.js";

type ResumeOptions = Pick<
  RunOptions,
  "maxParallel" | "dryRun" | "buildImage" | "useDocker" | "stopContainersOnExit"
> & {
  runId?: string;
};

export async function resumeCommand(
  projectName: string,
  config: ProjectConfig,
  opts: ResumeOptions,
): Promise<void> {
  const resolved = await loadRunStateForProject(projectName, opts.runId);
  if (!resolved) {
    const notFound = opts.runId
      ? `Run ${opts.runId} not found for project ${projectName}.`
      : `No runs found for project ${projectName}.`;
    console.log(notFound);
    return;
  }

  const stopHandler = createRunStopSignalHandler({
    onSignal: (signal) => {
      const containerNote = opts.stopContainersOnExit
        ? "Stopping task containers before exit."
        : "Leaving task containers running for resume.";
      console.log(
        `Received ${signal}. Stopping resume for run ${resolved.runId}. ${containerNote} Resume with: mycelium resume --project ${projectName} --run-id ${resolved.runId}`,
      );
    },
  });

  let res: Awaited<ReturnType<typeof runProject>>;
  try {
    res = await runProject(projectName, config, {
      runId: resolved.runId,
      maxParallel: opts.maxParallel,
      dryRun: opts.dryRun,
      buildImage: opts.buildImage,
      useDocker: opts.useDocker,
      stopContainersOnExit: opts.stopContainersOnExit,
      stopSignal: stopHandler.signal,
      resume: true,
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

  console.log(`Run ${res.runId} resumed with status: ${res.state.status}`);
}
