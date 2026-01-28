import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fse from "fs-extra";
import Handlebars from "handlebars";

import { UserFacingError, USER_FACING_ERROR_CODES } from "./errors.js";

// =============================================================================
// TYPES
// =============================================================================

export type PromptTemplateName =
  | "planner"
  | "test-validator"
  | "style-validator"
  | "architecture-validator"
  | "doctor-validator";

export type PromptTemplateValues = Record<string, string>;

// =============================================================================
// PUBLIC API
// =============================================================================

export async function renderPromptTemplate(
  name: PromptTemplateName,
  values: PromptTemplateValues,
): Promise<string> {
  const template = await loadTemplate(name);
  let output: string;

  try {
    output = template(values).trim();
  } catch (err) {
    if (err instanceof UserFacingError) {
      throw err;
    }
    throw createPromptTemplateRenderError(name, err);
  }

  if (/\{\{[^}]+\}\}/.test(output)) {
    throw createPromptTemplatePlaceholderError(name);
  }

  return output;
}

// =============================================================================
// INTERNALS
// =============================================================================

const TEMPLATE_CACHE = new Map<PromptTemplateName, Handlebars.TemplateDelegate>();
const PROMPT_ERROR_CODE = USER_FACING_ERROR_CODES.task;
const PROMPT_READ_HINT = "Check that the prompt template file is readable.";
const PROMPT_RENDER_HINT = "Provide values for all required template placeholders.";
const PROMPT_ROOT_HINT = "Ensure the repository root and templates directory are available.";
const PROMPT_TEMPLATE_HINT = "Ensure the template exists under templates/prompts.";
const PROMPT_TEMPLATE_SYNTAX_HINT = "Check the template syntax for errors.";

function createPromptTemplateNotFoundError(
  name: PromptTemplateName,
  templatePath: string,
): UserFacingError {
  return new UserFacingError({
    code: PROMPT_ERROR_CODE,
    title: "Prompt template missing.",
    message: `Prompt template "${name}" not found at ${templatePath}.`,
    hint: PROMPT_TEMPLATE_HINT,
  });
}

function createPromptTemplateReadError(
  name: PromptTemplateName,
  templatePath: string,
  cause: unknown,
): UserFacingError {
  return new UserFacingError({
    code: PROMPT_ERROR_CODE,
    title: "Prompt template unreadable.",
    message: `Failed to read prompt template "${name}" at ${templatePath}.`,
    hint: PROMPT_READ_HINT,
    cause,
  });
}

function createPromptTemplateCompileError(
  name: PromptTemplateName,
  templatePath: string,
  cause: unknown,
): UserFacingError {
  return new UserFacingError({
    code: PROMPT_ERROR_CODE,
    title: "Prompt template invalid.",
    message: `Prompt template "${name}" failed to compile.`,
    hint: PROMPT_TEMPLATE_SYNTAX_HINT,
    cause,
  });
}

function createPromptTemplateRenderError(
  name: PromptTemplateName,
  cause: unknown,
): UserFacingError {
  return new UserFacingError({
    code: PROMPT_ERROR_CODE,
    title: "Prompt template failed to render.",
    message: `Prompt template "${name}" could not be rendered.`,
    hint: PROMPT_RENDER_HINT,
    cause,
  });
}

function createPromptTemplatePlaceholderError(name: PromptTemplateName): UserFacingError {
  const cause = new Error(`Unresolved placeholder(s) remain in ${name} prompt output`);
  return new UserFacingError({
    code: PROMPT_ERROR_CODE,
    title: "Prompt template placeholders unresolved.",
    message: `Prompt template "${name}" still has unresolved placeholders.`,
    hint: PROMPT_RENDER_HINT,
    cause,
  });
}

function createPromptRootError(startDir: string): UserFacingError {
  return new UserFacingError({
    code: PROMPT_ERROR_CODE,
    title: "Prompt templates unavailable.",
    message: `package.json not found while resolving prompts directory from ${startDir}.`,
    hint: PROMPT_ROOT_HINT,
  });
}

async function loadTemplate(name: PromptTemplateName): Promise<Handlebars.TemplateDelegate> {
  const cached = TEMPLATE_CACHE.get(name);
  if (cached) return cached;

  const templatePath = await resolveTemplatePath(name);
  let raw: string;

  try {
    raw = await fse.readFile(templatePath, "utf8");
  } catch (err) {
    throw createPromptTemplateReadError(name, templatePath, err);
  }

  let compiled: Handlebars.TemplateDelegate;

  try {
    compiled = Handlebars.compile(raw, { noEscape: true, strict: true });
  } catch (err) {
    throw createPromptTemplateCompileError(name, templatePath, err);
  }

  TEMPLATE_CACHE.set(name, compiled);
  return compiled;
}

async function resolveTemplatePath(name: PromptTemplateName): Promise<string> {
  const promptsDir = await resolvePromptsDir();
  const templatePath = path.join(promptsDir, `${name}.md`);
  const exists = await fse.pathExists(templatePath);
  if (!exists) {
    throw createPromptTemplateNotFoundError(name, templatePath);
  }
  return templatePath;
}

async function resolvePromptsDir(): Promise<string> {
  const packageRoot = findPackageRoot(fileURLToPath(new URL(".", import.meta.url)));
  return path.join(packageRoot, "templates", "prompts");
}

// Walk upward until we find the repo root so compiled builds resolve templates correctly.
function findPackageRoot(startDir: string): string {
  let current = startDir;

  while (true) {
    const candidate = path.join(current, "package.json");
    if (fs.existsSync(candidate)) return current;

    const parent = path.dirname(current);
    if (parent === current) break;

    current = parent;
  }

  throw createPromptRootError(startDir);
}
