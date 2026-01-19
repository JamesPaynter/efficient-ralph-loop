import type { ModelReasoningEffort } from "@openai/codex-sdk";

import type { ReasoningEffort } from "./config.js";

export function resolveCodexReasoningEffort(
  model: string,
  effort?: ReasoningEffort,
): ModelReasoningEffort | undefined {
  if (effort && effort !== "none") {
    return effort as ModelReasoningEffort;
  }

  if (!effort && model.includes("gpt-5.2")) {
    return "xhigh";
  }

  return undefined;
}
