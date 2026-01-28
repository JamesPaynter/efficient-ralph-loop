/*
Purpose: normalize errors into user-facing lines and provide ANSI styling helpers.
Assumptions: debug mode may include stack traces; non-TTY output should disable color.
Usage: formatErrorLines(err, { mode: "debug" }); createAnsiFormatter(resolveColorEnabled({ stream })).
*/

import {
  USER_FACING_ERROR_CODES,
  UserFacingError,
  type UserFacingErrorCode,
  type UserFacingErrorInput,
} from "./errors.js";

// =============================================================================
// TYPES
// =============================================================================

export type ErrorFormatMode = "short" | "debug";

export type ErrorFormatOptions = {
  mode?: ErrorFormatMode;
};

export type ErrorFormatLineKind =
  | "title"
  | "message"
  | "hint"
  | "next"
  | "code"
  | "name"
  | "cause"
  | "stack";

export type ErrorFormatLine = {
  kind: ErrorFormatLineKind;
  text: string;
};

export type AnsiStyle = "bold" | "dim" | "red" | "yellow" | "cyan";

export type AnsiFormatter = (value: string, styles?: AnsiStyle[]) => string;

export type AnsiColorOptions = {
  stream?: { isTTY?: boolean };
  useColor?: boolean;
};

// =============================================================================
// ANSI COLOR HELPERS
// =============================================================================

const ANSI_RESET = "\x1b[0m";

const ANSI_STYLES: Record<AnsiStyle, string> = {
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

export function createAnsiFormatter(enabled: boolean): AnsiFormatter {
  return (value: string, styles: AnsiStyle[] = []): string => {
    if (!enabled || styles.length === 0) {
      return value;
    }

    const prefix = styles.map((style) => ANSI_STYLES[style]).join("");
    return `${prefix}${value}${ANSI_RESET}`;
  };
}

export function resolveColorEnabled(options: AnsiColorOptions = {}): boolean {
  const stream = options.stream ?? process.stderr;
  const isTty = Boolean(stream?.isTTY);

  if (options.useColor === undefined) {
    return isTty;
  }

  return options.useColor && isTty;
}

// =============================================================================
// ERROR FORMATTING
// =============================================================================

export function formatErrorLines(
  error: unknown,
  options: ErrorFormatOptions = {},
): ErrorFormatLine[] {
  const mode = options.mode ?? "short";
  const normalized = normalizeUserFacingError(error);
  const lines: ErrorFormatLine[] = [];

  lines.push({ kind: "title", text: normalized.title });

  if (shouldIncludeMessage(normalized.message, normalized.title)) {
    lines.push({ kind: "message", text: normalized.message });
  }

  if (normalized.hint) {
    lines.push({ kind: "hint", text: normalized.hint });
  }

  if (normalized.next) {
    lines.push({ kind: "next", text: normalized.next });
  }

  if (mode === "debug") {
    lines.push({ kind: "code", text: normalized.code });

    const name = resolveDebugName(error, normalized.cause);
    if (name) {
      lines.push({ kind: "name", text: name });
    }

    const cause = resolveCauseMessage(normalized.cause, normalized.message);
    if (cause) {
      lines.push({ kind: "cause", text: cause });
    }

    const stack = resolveDebugStack(error, normalized.cause);
    if (stack) {
      lines.push({ kind: "stack", text: stack });
    }
  }

  return lines;
}

export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = normalizeOptionalText(error.message);
    if (message) {
      return message;
    }

    const name = normalizeOptionalText(error.name);
    if (name) {
      return name;
    }
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && "message" in error) {
    const value = error as { message?: unknown };
    if (typeof value.message === "string" && value.message.trim()) {
      return value.message.trim();
    }
  }

  return String(error);
}

// =============================================================================
// INTERNALS
// =============================================================================

const DEFAULT_ERROR_TITLE = "Unexpected error";
const DEFAULT_ERROR_MESSAGE = "An unexpected error occurred.";

const USER_FACING_CODES = new Set<string>(Object.values(USER_FACING_ERROR_CODES));

function normalizeUserFacingError(error: unknown): UserFacingErrorInput {
  if (error instanceof UserFacingError) {
    return {
      code: error.code,
      title: normalizeRequiredText(error.title, DEFAULT_ERROR_TITLE),
      message: normalizeRequiredText(error.message, DEFAULT_ERROR_MESSAGE),
      hint: normalizeOptionalText(error.hint),
      next: normalizeOptionalText(error.next),
      cause: error.cause,
    };
  }

  if (isUserFacingErrorInput(error)) {
    return {
      code: error.code,
      title: normalizeRequiredText(error.title, DEFAULT_ERROR_TITLE),
      message: normalizeRequiredText(error.message, DEFAULT_ERROR_MESSAGE),
      hint: normalizeOptionalText(error.hint),
      next: normalizeOptionalText(error.next),
      cause: error.cause,
    };
  }

  if (error instanceof Error) {
    return {
      code: USER_FACING_ERROR_CODES.unknown,
      title: DEFAULT_ERROR_TITLE,
      message: normalizeRequiredText(formatErrorMessage(error), DEFAULT_ERROR_MESSAGE),
      cause: resolveErrorCause(error),
    };
  }

  return {
    code: USER_FACING_ERROR_CODES.unknown,
    title: DEFAULT_ERROR_TITLE,
    message: normalizeRequiredText(resolveFallbackMessage(error), DEFAULT_ERROR_MESSAGE),
  };
}

function isUserFacingErrorInput(value: unknown): value is UserFacingErrorInput {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (!isUserFacingErrorCode(record.code)) {
    return false;
  }

  return typeof record.title === "string" && typeof record.message === "string";
}

function isUserFacingErrorCode(value: unknown): value is UserFacingErrorCode {
  return typeof value === "string" && USER_FACING_CODES.has(value);
}

function normalizeRequiredText(value: string | undefined, fallback: string): string {
  const normalized = normalizeOptionalText(value);
  return normalized ?? fallback;
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveFallbackMessage(error: unknown): string {
  if (error === null || error === undefined) {
    return DEFAULT_ERROR_MESSAGE;
  }

  const message = formatErrorMessage(error);
  return normalizeRequiredText(message, DEFAULT_ERROR_MESSAGE);
}

function shouldIncludeMessage(message: string, title: string): boolean {
  return message.trim() !== title.trim();
}

function resolveErrorCause(error: Error): unknown {
  if ("cause" in error) {
    return error.cause;
  }

  return undefined;
}

function resolveDebugName(error: unknown, cause?: unknown): string | undefined {
  if (error instanceof Error) {
    return normalizeOptionalText(error.name);
  }

  if (cause instanceof Error) {
    return normalizeOptionalText(cause.name);
  }

  return undefined;
}

function resolveCauseMessage(cause: unknown, message: string): string | undefined {
  if (cause === undefined || cause === null) {
    return undefined;
  }

  const resolved = normalizeOptionalText(formatErrorMessage(cause));
  if (!resolved || resolved === message) {
    return undefined;
  }

  return resolved;
}

function resolveDebugStack(error: unknown, cause?: unknown): string | undefined {
  if (error instanceof Error && error.stack) {
    return error.stack;
  }

  if (cause instanceof Error && cause.stack) {
    return cause.stack;
  }

  return undefined;
}
