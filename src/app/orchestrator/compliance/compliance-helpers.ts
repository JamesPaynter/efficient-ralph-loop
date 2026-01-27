import type { PolicyDecision } from "../../../control-plane/policy/types.js";
import type { ControlPlaneScopeMode, ManifestEnforcementPolicy } from "../../../core/config.js";
import { JsonlLogger, logOrchestratorEvent } from "../../../core/logger.js";
import type { ManifestComplianceResult } from "../../../core/manifest-compliance.js";
import {
  computeRescopeFromCompliance,
  describeManifestViolations,
  type RescopeComputation,
} from "../../../core/manifest-rescope.js";
import type { TaskManifest } from "../../../core/task-manifest.js";

// =============================================================================
// POLICY RESOLUTION
// =============================================================================

export function resolveCompliancePolicyForTier(input: {
  basePolicy: ManifestEnforcementPolicy;
  tier?: PolicyDecision["tier"];
}): ManifestEnforcementPolicy {
  if (input.basePolicy === "off" || input.basePolicy === "block") {
    return input.basePolicy;
  }

  return (input.tier ?? 0) >= 2 ? "block" : "warn";
}

export function resolveCompliancePolicyForScope(input: {
  scopeMode: ControlPlaneScopeMode;
  manifestPolicy: ManifestEnforcementPolicy;
}): ManifestEnforcementPolicy {
  return input.scopeMode === "off" ? "off" : input.manifestPolicy;
}

// =============================================================================
// RESCOPE PLANNING
// =============================================================================

export type ComplianceRescopePlan =
  | { status: "skipped"; reason: string }
  | { status: "required"; rescopeReason: string; rescope: RescopeComputation };

export function buildComplianceRescopePlan(input: {
  compliance: ManifestComplianceResult;
  manifest: TaskManifest;
  shouldEnforce: boolean;
}): ComplianceRescopePlan {
  if (input.compliance.violations.length === 0) {
    return { status: "skipped", reason: "No compliance violations to rescope" };
  }

  if (!input.shouldEnforce) {
    return { status: "skipped", reason: "Compliance enforcement disabled" };
  }

  const rescopeReason = `Rescope required: ${describeManifestViolations(input.compliance)}`;
  const rescope = computeRescopeFromCompliance(input.manifest, input.compliance);

  return { status: "required", rescopeReason, rescope };
}

// =============================================================================
// LOGGING + COUNTS
// =============================================================================

export type ComplianceScopeViolations = {
  warnCount: number;
  blockCount: number;
};

export function countScopeViolations(result: ManifestComplianceResult): ComplianceScopeViolations {
  if (result.violations.length === 0) return { warnCount: 0, blockCount: 0 };
  if (result.status === "warn") {
    return { warnCount: result.violations.length, blockCount: 0 };
  }
  if (result.status === "block") {
    return { warnCount: 0, blockCount: result.violations.length };
  }
  return { warnCount: 0, blockCount: 0 };
}

export function logComplianceEvents(input: {
  orchestratorLog: JsonlLogger;
  taskId: string;
  taskSlug: string;
  policy: ManifestEnforcementPolicy;
  scopeMode: ControlPlaneScopeMode;
  reportPath: string;
  result: ManifestComplianceResult;
}): void {
  const basePayload = {
    task_slug: input.taskSlug,
    policy: input.policy,
    scope_mode: input.scopeMode,
    status: input.result.status,
    report_path: input.reportPath,
    changed_files: input.result.changedFiles.length,
    violations: input.result.violations.length,
  };

  const eventType = resolveComplianceEventType(input.result);
  logOrchestratorEvent(input.orchestratorLog, eventType, { taskId: input.taskId, ...basePayload });

  if (input.result.violations.length === 0) return;

  for (const violation of input.result.violations) {
    logOrchestratorEvent(input.orchestratorLog, "access.requested", {
      taskId: input.taskId,
      task_slug: input.taskSlug,
      file: violation.path,
      resources: violation.resources,
      reasons: violation.reasons,
      ...(violation.component_owners ? { component_owners: violation.component_owners } : {}),
      ...(violation.guidance ? { guidance: violation.guidance } : {}),
      policy: input.policy,
      enforcement: input.result.status,
      report_path: input.reportPath,
    });
  }
}

function resolveComplianceEventType(
  result: ManifestComplianceResult,
):
  | "manifest.compliance.skip"
  | "manifest.compliance.pass"
  | "manifest.compliance.block"
  | "manifest.compliance.warn" {
  if (result.status === "skipped") return "manifest.compliance.skip";
  if (result.violations.length === 0) return "manifest.compliance.pass";
  return result.status === "block" ? "manifest.compliance.block" : "manifest.compliance.warn";
}
