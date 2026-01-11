import { z, type ZodIssue } from "zod";

import { slugify } from "./utils.js";

export const LocksSchema = z
  .object({
    reads: z.array(z.string()).default([]),
    writes: z.array(z.string()).default([]),
  })
  .strict();

export const FilesSchema = z
  .object({
    reads: z.array(z.string()).default([]),
    writes: z.array(z.string()).default([]),
  })
  .strict();

export const VerifySchema = z
  .object({
    doctor: z.string().min(1),
    fast: z.string().optional(),
  })
  .strict();

export const TaskManifestSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    estimated_minutes: z.number().int().positive(),
    dependencies: z.array(z.string()).optional(),
    locks: LocksSchema.default({ reads: [], writes: [] }),
    files: FilesSchema.default({ reads: [], writes: [] }),
    affected_tests: z.array(z.string()).default([]),
    verify: VerifySchema,
  })
  .strict();

export type TaskManifest = z.infer<typeof TaskManifestSchema>;

export type TaskSpec = {
  manifest: TaskManifest;
  taskDir: string; // absolute path to the task directory containing manifest/spec
  manifestPath: string;
  specPath: string;
  slug: string;
};

export type TaskWithSpec = TaskManifest & { spec: string };

export type NormalizedLocks = {
  reads: string[];
  writes: string[];
};

export type NormalizedFiles = {
  reads: string[];
  writes: string[];
};

export function formatManifestIssues(issues: ZodIssue[]): string[] {
  return issues.map((issue) => {
    const location = issue.path.length > 0 ? issue.path.join(".") : "<root>";

    if (issue.code === "invalid_type") {
      return `${location}: Expected ${issue.expected}, received ${issue.received}`;
    }
    if (issue.code === "invalid_enum_value") {
      const options = issue.options.map((o) => JSON.stringify(o)).join(", ");
      return `${location}: Expected one of ${options}, received ${JSON.stringify(issue.received)}`;
    }
    if (issue.code === "unrecognized_keys") {
      return `${location}: Unrecognized keys: ${issue.keys.join(", ")}`;
    }

    return `${location}: ${issue.message}`;
  });
}

export function validateResourceLocks(manifest: TaskManifest, resources: string[]): string[] {
  if (resources.length === 0) return [];
  const known = new Set(resources);
  const issues: string[] = [];

  for (const res of manifest.locks.reads ?? []) {
    if (!known.has(res)) {
      issues.push(`locks.reads references unknown resource "${res}"`);
    }
  }
  for (const res of manifest.locks.writes ?? []) {
    if (!known.has(res)) {
      issues.push(`locks.writes references unknown resource "${res}"`);
    }
  }

  return issues;
}

export function normalizeLocks(locks?: TaskManifest["locks"]): NormalizedLocks {
  return {
    reads: normalizeStringList(locks?.reads),
    writes: normalizeStringList(locks?.writes),
  };
}

export function normalizeFiles(files?: TaskManifest["files"]): NormalizedFiles {
  return {
    reads: normalizeStringList(files?.reads),
    writes: normalizeStringList(files?.writes),
  };
}

export function locksConflict(a: NormalizedLocks, b: NormalizedLocks): boolean {
  const bReads = new Set(b.reads);
  const bWrites = new Set(b.writes);

  for (const res of a.writes) {
    if (bWrites.has(res) || bReads.has(res)) {
      return true;
    }
  }
  for (const res of a.reads) {
    if (bWrites.has(res)) {
      return true;
    }
  }

  return false;
}

export function normalizeTaskId(id: string): string {
  return id.trim();
}

export function normalizeTaskName(name: string): string {
  return name.trim();
}

export function buildTaskSlug(name: string): string {
  const slug = slugify(normalizeTaskName(name));
  return slug.length > 0 ? slug : "task";
}

export function buildTaskDirName(task: Pick<TaskManifest, "id" | "name">): string {
  return `${normalizeTaskId(task.id)}-${buildTaskSlug(task.name)}`;
}

export function normalizeTaskManifest(manifest: TaskManifest): TaskManifest {
  const dependencies = normalizeStringList(manifest.dependencies);
  const locks = normalizeLocks(manifest.locks);
  const files = normalizeFiles(manifest.files);
  const affectedTests = normalizeStringList(manifest.affected_tests);

  const doctor = manifest.verify.doctor.trim();
  const fast = manifest.verify.fast?.trim();

  return {
    ...manifest,
    id: normalizeTaskId(manifest.id),
    name: normalizeTaskName(manifest.name),
    dependencies: dependencies.length > 0 ? dependencies : undefined,
    locks,
    files,
    affected_tests: affectedTests,
    verify: fast ? { doctor, fast } : { doctor },
  };
}

function normalizeStringList(values?: string[]): string[] {
  return Array.from(
    new Set((values ?? []).map((v) => v.trim()).filter((v) => v.length > 0)),
  ).sort();
}
