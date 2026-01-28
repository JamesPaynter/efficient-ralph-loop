import { describe, expect, it } from "vitest";

import { createAnsiFormatter, formatErrorLines, resolveColorEnabled } from "./error-format.js";
import { USER_FACING_ERROR_CODES, UserFacingError } from "./errors.js";

describe("formatErrorLines", () => {
  it("formats user-facing errors in short mode", () => {
    const error = new UserFacingError({
      code: USER_FACING_ERROR_CODES.config,
      title: "Config error",
      message: "Missing config value",
      hint: "Run mycelium init",
      next: "Edit .mycelium/config.yaml",
    });

    const lines = formatErrorLines(error);

    expect(lines.map((line) => line.kind)).toEqual(["title", "message", "hint", "next"]);
    expect(lines[0]?.text).toBe("Config error");
    expect(lines[1]?.text).toBe("Missing config value");
  });

  it("includes debug details when requested", () => {
    const error = new UserFacingError({
      code: USER_FACING_ERROR_CODES.task,
      title: "Task failed",
      message: "Worker stopped",
      cause: new Error("boom"),
    });

    const lines = formatErrorLines(error, { mode: "debug" });

    expect(lines.some((line) => line.kind === "code" && line.text === "TASK_ERROR")).toBe(true);
    expect(lines.some((line) => line.kind === "name" && line.text === "UserFacingError")).toBe(
      true,
    );
    expect(lines.some((line) => line.kind === "cause" && line.text === "boom")).toBe(true);

    const stack = lines.find((line) => line.kind === "stack");
    expect(stack?.text).toContain("UserFacingError");
  });

  it("defaults unknown inputs to an unexpected error title", () => {
    const lines = formatErrorLines("boom");

    expect(lines[0]?.text).toBe("Unexpected error");
    expect(lines[1]?.text).toBe("boom");
  });
});

describe("resolveColorEnabled", () => {
  it("disables color for non-TTY streams", () => {
    expect(resolveColorEnabled({ stream: { isTTY: false } })).toBe(false);
    expect(resolveColorEnabled({ stream: { isTTY: true } })).toBe(true);
  });

  it("respects explicit useColor flags", () => {
    expect(resolveColorEnabled({ stream: { isTTY: true }, useColor: false })).toBe(false);
    expect(resolveColorEnabled({ stream: { isTTY: true }, useColor: true })).toBe(true);
  });
});

describe("createAnsiFormatter", () => {
  it("returns input unchanged when disabled", () => {
    const format = createAnsiFormatter(false);
    expect(format("plain", ["red"])).toBe("plain");
  });

  it("wraps output with ANSI codes when enabled", () => {
    const format = createAnsiFormatter(true);
    const result = format("alert", ["red"]);
    expect(result).toContain("\x1b[");
    expect(result).toContain("alert");
  });
});
