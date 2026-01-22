import { Command } from "commander";

import { registerControlPlaneFlags, resolveControlPlaneFlags } from "../control-plane/cli/flags.js";
import type {
  ControlPlaneJsonError,
  ControlPlaneOutputOptions,
} from "../control-plane/cli/output.js";
import {
  CONTROL_PLANE_ERROR_CODES,
  emitControlPlaneError,
  emitControlPlaneResult,
  emitModelNotBuiltError,
  emitNotImplementedError,
} from "../control-plane/cli/output.js";
import { buildControlPlaneModel, getControlPlaneModelInfo } from "../control-plane/model/build.js";
import { ControlPlaneBuildLockError } from "../control-plane/storage.js";

const MODEL_NOT_BUILT_MESSAGE =
  "Control plane model not built. Run `mycelium cp build` to generate it.";
const NOT_IMPLEMENTED_MESSAGE = "Control plane command not implemented yet.";



// =============================================================================
// COMMAND REGISTRATION
// =============================================================================

export function registerControlPlaneCommand(program: Command): void {
  const controlPlane = program
    .command("control-plane")
    .alias("cp")
    .description("Repository navigation surface for agents");

  registerControlPlaneFlags(controlPlane);

  controlPlane
    .command("build")
    .description("Build the repository navigation model")
    .option("--force", "Rebuild the navigation model even if cached", false)
    .action(async (opts, command) => {
      await handleControlPlaneBuild(opts, command);
    });

  controlPlane
    .command("info")
    .description("Show navigation model metadata")
    .action(async (_opts, command) => {
      await handleControlPlaneInfo(command);
    });

  const components = controlPlane
    .command("components")
    .description("Component catalog queries");

  components
    .command("list")
    .description("List known components")
    .action(createModelNotBuiltAction());

  components
    .command("show")
    .description("Show component details")
    .argument("<id>", "Component id")
    .action(createModelNotBuiltAction());

  controlPlane
    .command("owner")
    .description("Show owning component for a path")
    .argument("<path>", "Path to inspect")
    .action(createModelNotBuiltAction());

  controlPlane
    .command("deps")
    .description("Show dependencies for a component")
    .argument("<component>", "Component id")
    .action(createModelNotBuiltAction());

  controlPlane
    .command("rdeps")
    .description("Show reverse dependencies for a component")
    .argument("<component>", "Component id")
    .action(createModelNotBuiltAction());

  controlPlane
    .command("blast")
    .description("Estimate blast radius for a change")
    .argument("[targets...]", "Paths or components to evaluate")
    .action(createModelNotBuiltAction());

  const symbols = controlPlane
    .command("symbols")
    .description("Symbol navigation queries");

  symbols
    .command("find")
    .description("Search for symbols")
    .argument("[query...]", "Search terms")
    .action(createModelNotBuiltAction());

  symbols
    .command("def")
    .description("Show symbol definitions")
    .argument("[query...]", "Search terms")
    .action(createModelNotBuiltAction());

  symbols
    .command("refs")
    .description("Show symbol references")
    .argument("[query...]", "Search terms")
    .action(createModelNotBuiltAction());
}



// =============================================================================
// STUB HELPERS
// =============================================================================

function createModelNotBuiltAction(
  message: string = MODEL_NOT_BUILT_MESSAGE,
): (...args: unknown[]) => void {
  return createErrorAction((output) => emitModelNotBuiltError(message, output));
}

function createNotImplementedAction(
  message: string = NOT_IMPLEMENTED_MESSAGE,
): (...args: unknown[]) => void {
  return createErrorAction((output) => emitNotImplementedError(message, output));
}

function createErrorAction(
  emit: (output: ControlPlaneOutputOptions) => void,
): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    const command = args[args.length - 1] as Command;
    const output = resolveOutputOptions(command);
    emit(output);
  };
}

function resolveOutputOptions(command: Command): ControlPlaneOutputOptions {
  const flags = resolveControlPlaneFlags(command);
  return { useJson: flags.useJson, prettyJson: flags.prettyJson };
}



// =============================================================================
// BUILD + INFO ACTIONS
// =============================================================================

async function handleControlPlaneBuild(
  opts: { force?: boolean },
  command: Command,
): Promise<void> {
  const output = resolveOutputOptions(command);
  const flags = resolveControlPlaneFlags(command);

  try {
    const result = await buildControlPlaneModel({
      repoRoot: flags.repoPath,
      baseSha: flags.revision.baseSha,
      ref: flags.revision.ref,
      force: opts.force ?? false,
    });
    emitControlPlaneResult(result, output);
  } catch (error) {
    emitControlPlaneError(resolveModelStoreError(error), output);
  }
}

async function handleControlPlaneInfo(command: Command): Promise<void> {
  const output = resolveOutputOptions(command);
  const flags = resolveControlPlaneFlags(command);

  try {
    const result = await getControlPlaneModelInfo({
      repoRoot: flags.repoPath,
      baseSha: flags.revision.baseSha,
      ref: flags.revision.ref,
    });
    emitControlPlaneResult(result, output);
  } catch (error) {
    emitControlPlaneError(resolveModelStoreError(error), output);
  }
}

function resolveModelStoreError(error: unknown): ControlPlaneJsonError {
  if (error instanceof ControlPlaneBuildLockError) {
    return {
      code: CONTROL_PLANE_ERROR_CODES.modelStoreError,
      message: error.message,
      details: { lock_path: error.lockPath },
    };
  }

  if (error instanceof Error) {
    return {
      code: CONTROL_PLANE_ERROR_CODES.modelStoreError,
      message: error.message,
      details: { name: error.name },
    };
  }

  return {
    code: CONTROL_PLANE_ERROR_CODES.modelStoreError,
    message: "Control plane command failed.",
    details: null,
  };
}
