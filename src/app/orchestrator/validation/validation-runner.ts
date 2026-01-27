import { runArchitectureValidator } from "../../../validators/architecture-validator.js";
import { runDoctorValidator } from "../../../validators/doctor-validator.js";
import { runStyleValidator } from "../../../validators/style-validator.js";
import { runTestValidator } from "../../../validators/test-validator.js";
import type { ValidatorRunner } from "../ports.js";

export { runDoctorValidation } from "./validation-doctor-runner.js";
export { runTaskValidation } from "./validation-task-runner.js";
export type {
  DoctorValidationContext,
  ValidationRunnerContext,
  ValidationRunnerValidators,
  ValidationStepOutcome,
  ValidationTaskContext,
} from "./validation-runner-types.js";

export const DEFAULT_RUNNER: ValidatorRunner = {
  runDoctorValidator,
  runTestValidator,
  runStyleValidator,
  runArchitectureValidator,
};
