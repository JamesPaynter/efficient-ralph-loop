// Validators shared normalization helpers.
// Purpose: keep validator data shaping consistent (LLM output, file samples, and errors).
// Assumes validators emit JSON reports and use markdown-ready prompt formatting.

import path from "node:path";

import type { output, ZodTypeAny } from "zod";

import { UserFacingError, USER_FACING_ERROR_CODES } from "../../core/errors.js";
import { LlmError, type LlmCompletionResult } from "../../llm/client.js";

import type { FileSample, TruncateResult } from "./types.js";

// =============================================================================
// ERROR NORMALIZATION
// =============================================================================

const VALIDATOR_ERROR_HINT = "Check the validator config or run with --debug.";

function withValidatorHint(message: string): string {
  return `${message} ${VALIDATOR_ERROR_HINT}`;
}

function createValidatorSchemaError(validatorLabel: string, cause: Error): UserFacingError {
  return new UserFacingError({
    code: USER_FACING_ERROR_CODES.task,
    title: `${validatorLabel} validator output invalid.`,
    message: withValidatorHint(
      `${validatorLabel} validator output did not match the expected schema.`,
    ),
    hint: VALIDATOR_ERROR_HINT,
    cause,
  });
}

function createValidatorJsonError(validatorLabel: string, cause: unknown): UserFacingError {
  return new UserFacingError({
    code: USER_FACING_ERROR_CODES.task,
    title: `${validatorLabel} validator output invalid.`,
    message: withValidatorHint(`${validatorLabel} validator returned invalid JSON.`),
    hint: VALIDATOR_ERROR_HINT,
    cause,
  });
}

function createValidatorFailureError(validatorLabel: string, cause: unknown): UserFacingError {
  return new UserFacingError({
    code: USER_FACING_ERROR_CODES.task,
    title: `${validatorLabel} validator failed.`,
    message: withValidatorHint(`${validatorLabel} validator failed.`),
    hint: VALIDATOR_ERROR_HINT,
    cause,
  });
}

export function normalizeValidatorError(error: unknown, validatorLabel: string): UserFacingError {
  if (error instanceof UserFacingError) {
    return error;
  }

  return createValidatorFailureError(validatorLabel, error);
}

// =============================================================================
// COMPLETION NORMALIZATION
// =============================================================================

export function normalizeCompletion<TSchema extends ZodTypeAny>(
  completion: LlmCompletionResult<output<TSchema>>,
  schema: TSchema,
  validatorLabel: string,
): output<TSchema> {
  const raw = completion.parsed ?? parseJson(completion.text, validatorLabel);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw createValidatorSchemaError(validatorLabel, parsed.error);
  }
  return parsed.data;
}

export function parseJson(raw: string, validatorLabel?: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (err) {
    if (validatorLabel) {
      throw createValidatorJsonError(validatorLabel, err);
    }
    throw new LlmError("Validator returned invalid JSON.", err);
  }
}

export function safeParseJson(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

// =============================================================================
// TEXT NORMALIZATION
// =============================================================================

export function truncate(text: string, limit: number): TruncateResult {
  if (text.length <= limit) {
    return { text, truncated: false };
  }
  return { text: `${text.slice(0, limit)}\n... [truncated]`, truncated: true };
}

export function uniq(values: string[]): string[] {
  return Array.from(new Set(values)).filter((value) => value.length > 0);
}

export function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

export function secondsToMs(value?: number): number | undefined {
  if (value === undefined) return undefined;
  return value * 1000;
}

// =============================================================================
// FORMAT HELPERS
// =============================================================================

export function formatFilesForPrompt(files: FileSample[]): string {
  if (files.length === 0) {
    return "None";
  }

  return files
    .map((file) => {
      const suffix = file.truncated ? "\n[truncated]" : "";
      return `### ${file.path}\n\`\`\`\n${file.content}\n\`\`\`${suffix}`;
    })
    .join("\n\n");
}

// =============================================================================
// ERROR HANDLING
// =============================================================================

export function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
