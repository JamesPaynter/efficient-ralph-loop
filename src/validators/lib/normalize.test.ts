import path from "node:path";

import fse from "fs-extra";
import { describe, expect, it } from "vitest";
import { z } from "zod";

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
});
