import type { ProjectConfig } from "../../../core/config.js";
import type { JsonlLogger } from "../../../core/logger.js";
import type { PathsContext } from "../../../core/paths.js";
import type { TaskSpec } from "../../../core/task-manifest.js";
import type {
  DoctorCanaryResult,
  DoctorValidatorTrigger,
} from "../../../validators/doctor-validator.js";
import type { ValidatorRunner } from "../ports.js";
import type { RunValidatorConfig } from "../run-context.js";

import type { ValidationBlock, ValidationResult } from "./types.js";

export type ValidationRunnerValidators = {
  test: RunValidatorConfig<ProjectConfig["test_validator"]>;
  style: RunValidatorConfig<ProjectConfig["style_validator"]>;
  architecture: RunValidatorConfig<ProjectConfig["architecture_validator"]>;
  doctor: RunValidatorConfig<ProjectConfig["doctor_validator"]>;
  doctorCanary: ProjectConfig["doctor_canary"];
};

export type ValidationRunnerContext = {
  projectName: string;
  repoPath: string;
  runId: string;
  tasksRoot: string;
  mainBranch: string;
  paths?: PathsContext;
  validators: ValidationRunnerValidators;
  orchestratorLog: JsonlLogger;
  runner: ValidatorRunner;
  loggers: {
    test?: JsonlLogger;
    style?: JsonlLogger;
    architecture?: JsonlLogger;
    doctor?: JsonlLogger;
  };
  onChecksetDuration?: (durationMs: number) => void;
  onDoctorDuration?: (durationMs: number) => void;
};

export type ValidationTaskContext = {
  task: TaskSpec;
  workspacePath: string;
  logsDir: string;
};

export type DoctorValidationContext = {
  doctorCommand: string;
  trigger: DoctorValidatorTrigger;
  triggerNotes?: string;
  integrationDoctorOutput?: string;
  doctorCanary?: DoctorCanaryResult;
};

export type ValidationStepOutcome = {
  result: ValidationResult;
  blocked: ValidationBlock | null;
};
