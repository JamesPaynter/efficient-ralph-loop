import { describe, expect, it } from "vitest";

import { summarizeEventMessage } from "../list.js";

describe("summarizeEventMessage", () => {
  it("shows the command for codex item command events", () => {
    const command = '/bin/bash -lc "rg \\"cli\\" src/cli -g \'*.test.ts\'"';
    const event = {
      type: "codex.event",
      payload: {
        event: {
          type: "item.started",
          item: {
            id: "item_30",
            type: "command_execution",
            command,
            aggregated_output: "",
            exit_code: null,
            status: "in_progress",
          },
        },
      },
    };

    const summary = summarizeEventMessage(event);

    expect(summary).toBe(command);
  });

  it("summarizes tool events with args", () => {
    const event = {
      type: "codex.event",
      payload: {
        event: {
          type: "tool_call",
          tool_name: "npm",
          args: ["test"],
        },
      },
    };

    const summary = summarizeEventMessage(event);

    expect(summary).toBe('tool: npm ["test"]');
  });
});
