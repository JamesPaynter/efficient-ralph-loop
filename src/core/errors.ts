/*
Purpose: core error types used across orchestration and CLI output.
Assumptions: UserFacingError instances are safe to display to end users.
Usage: throw new ConfigError("..."); throw new UserFacingError({ code, title, message, hint, next, cause }).
*/

// =============================================================================
// CORE ERRORS
// =============================================================================

export class OrchestratorError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "OrchestratorError";
  }
}

export class ConfigError extends OrchestratorError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "ConfigError";
  }
}

export class TaskError extends OrchestratorError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "TaskError";
  }
}

export class DockerError extends OrchestratorError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "DockerError";
  }
}

export class GitError extends OrchestratorError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "GitError";
  }
}

// =============================================================================
// USER-FACING ERRORS
// =============================================================================

export const USER_FACING_ERROR_CODES = {
  unknown: "UNKNOWN",
  config: "CONFIG_ERROR",
  task: "TASK_ERROR",
  docker: "DOCKER_ERROR",
  git: "GIT_ERROR",
} as const;

export type UserFacingErrorCode =
  (typeof USER_FACING_ERROR_CODES)[keyof typeof USER_FACING_ERROR_CODES];

export type UserFacingErrorInput = {
  code: UserFacingErrorCode;
  title: string;
  message: string;
  hint?: string;
  next?: string;
  cause?: unknown;
};

export class UserFacingError extends Error {
  public readonly code: UserFacingErrorCode;
  public readonly title: string;
  public readonly hint?: string;
  public readonly next?: string;
  public readonly cause?: unknown;

  constructor(input: UserFacingErrorInput) {
    super(input.message);
    this.name = "UserFacingError";
    this.code = input.code;
    this.title = input.title;
    this.hint = input.hint;
    this.next = input.next;
    this.cause = input.cause;
  }
}
