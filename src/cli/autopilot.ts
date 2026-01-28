import type { AppContext } from "../app/context.js";
import { writeAutopilotTranscript } from "../core/autopilot.js";
import type { ProjectConfig } from "../core/config.js";
import { formatErrorMessage } from "../core/error-format.js";
import { UserFacingError, USER_FACING_ERROR_CODES } from "../core/errors.js";

import {
  buildAutopilotRuntime,
  buildTranscriptContext,
  resolveAutopilotPaths,
  runExecutionStage,
  runPlanningStage,
  type AutopilotOptions,
  type AutopilotTranscriptState,
} from "./autopilot-flow.js";

// =============================================================================
// ERROR NORMALIZATION
// =============================================================================

type AutopilotFailureStage = "planning" | "run";

const AUTOPILOT_PLAN_INPUT_HINT =
  "Check the plan input path (--plan-input) or create the implementation plan file.";

function normalizeAutopilotFailure(error: unknown, stage: AutopilotFailureStage): UserFacingError {
  if (error instanceof UserFacingError) {
    if (stage === "planning" && shouldReplacePlanInputHint(error)) {
      return new UserFacingError({
        code: error.code,
        title: error.title,
        message: error.message,
        hint: AUTOPILOT_PLAN_INPUT_HINT,
        next: error.next,
        cause: error.cause ?? error,
      });
    }

    return error;
  }

  const title = stage === "planning" ? "Autopilot planning failed." : "Autopilot run failed.";
  const hint = stage === "planning" ? AUTOPILOT_PLAN_INPUT_HINT : undefined;

  return new UserFacingError({
    code: USER_FACING_ERROR_CODES.task,
    title,
    message: title,
    hint,
    cause: error,
  });
}

function shouldReplacePlanInputHint(error: UserFacingError): boolean {
  return Boolean(error.hint?.includes("--input"));
}

// =============================================================================
// CLI ENTRYPOINT
// =============================================================================

export async function autopilotCommand(
  projectName: string,
  config: ProjectConfig,
  opts: AutopilotOptions,
  appContext?: AppContext,
): Promise<void> {
  const autopilotPaths = resolveAutopilotPaths(config, opts, appContext);
  const context = buildTranscriptContext(projectName, config, autopilotPaths);
  const runtime = buildAutopilotRuntime(
    projectName,
    config,
    opts,
    autopilotPaths.paths,
    autopilotPaths.sessionId,
  );
  const transcriptData: AutopilotTranscriptState = { turns: [] };

  try {
    runtime.io.note(
      `Autopilot ${autopilotPaths.sessionId} starting. I will ask a few questions, draft planning files, plan tasks, then run.`,
    );

    await runPlanningStage({
      projectName,
      config,
      opts,
      autopilotPaths,
      io: runtime.io,
      client: runtime.client,
      transcriptData,
      appContext,
    });

    await runExecutionStage({
      projectName,
      config,
      opts,
      autopilotPaths,
      runtime,
      transcriptData,
    });
  } catch (err) {
    const stage: AutopilotFailureStage = transcriptData.plan ? "run" : "planning";
    const normalizedError = normalizeAutopilotFailure(err, stage);
    const message = formatErrorMessage(normalizedError);
    if (stage === "planning") {
      transcriptData.planError = message;
    } else {
      transcriptData.runError = message;
    }
    throw normalizedError;
  } finally {
    runtime.io.close();
    runtime.stopHandler.cleanup();
    await writeAutopilotTranscript({
      transcriptPath: autopilotPaths.transcriptPath,
      context,
      data: transcriptData,
    });
    runtime.io.note(`Transcript saved to ${autopilotPaths.transcriptPath}`);
  }
}
