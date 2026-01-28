import path from "node:path";

import fse from "fs-extra";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { UserFacingError } from "../../core/errors.js";
import type { LlmCompletionResult } from "../../llm/client.js";

import { normalizeCompletion } from "./normalize.js";

const FIXTURE_DIR = path.join(process.cwd(), "test", "fixtures", "validator-normalize");

const StyleValidationSchema = z
  .object({
    pass: z.boolean(),
    summary: z.string(),
    concerns: z
      .array(
        z
          .object({
            file: z.string(),
            line: z.number().int().nonnegative().optional(),
            issue: z.string(),
            severity: z.enum(["high", "medium", "low"]),
            suggested_fix: z.string().optional(),
          })
          .strict(),
      )
      .default([]),
    confidence: z.enum(["high", "medium", "low"]).default("medium"),
  })
  .strict();

type StyleValidationReport = z.infer<typeof StyleValidationSchema>;

describe("normalizeCompletion", () => {
  it("applies schema defaults for the style fixture output", async () => {
    const raw = await fse.readFile(path.join(FIXTURE_DIR, "style-output.json"), "utf8");
    const expected = (await fse.readJson(
      path.join(FIXTURE_DIR, "style-normalized.json"),
    )) as StyleValidationReport;

    const completion: LlmCompletionResult<StyleValidationReport> = {
      text: raw,
      finishReason: "stop",
    };

    const result = normalizeCompletion(completion, StyleValidationSchema, "Style");
    expect(result).toEqual(expected);
  });

  it("throws a user-facing error for invalid JSON", () => {
    const completion: LlmCompletionResult<StyleValidationReport> = {
      text: "{not-json",
      finishReason: "stop",
    };

    let error: unknown = null;
    try {
      normalizeCompletion(completion, StyleValidationSchema, "Style");
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(UserFacingError);
    const userError = error as UserFacingError;
    expect(userError.message).toBe(
      "Style validator returned invalid JSON. Check the validator config or run with --debug.",
    );
    expect(userError.hint).toBe("Check the validator config or run with --debug.");
    expect(userError.cause).toBeInstanceOf(Error);
  });

  it("throws a user-facing error for schema mismatches", () => {
    const completion: LlmCompletionResult<StyleValidationReport> = {
      text: JSON.stringify({ pass: true }),
      finishReason: "stop",
    };

    let error: unknown = null;
    try {
      normalizeCompletion(completion, StyleValidationSchema, "Style");
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(UserFacingError);
    const userError = error as UserFacingError;
    expect(userError.message).toBe(
      "Style validator output did not match the expected schema. Check the validator config or run with --debug.",
    );
    expect(userError.hint).toBe("Check the validator config or run with --debug.");
    expect(userError.cause).toBeInstanceOf(Error);
  });
});
