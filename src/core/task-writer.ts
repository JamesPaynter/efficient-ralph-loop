import path from "node:path";

import { buildTaskDirName, normalizeTaskManifest, type TaskWithSpec } from "./task-manifest.js";
import { ensureDir, isoNow, writeJsonFile, writeTextFile } from "./utils.js";

export type PlanWriteResult = {
  planIndexPath: string;
  tasks: Array<{ id: string; name: string; dir: string }>;
};

export async function writeTasksToDirectory(args: {
  tasks: TaskWithSpec[];
  outputDir: string;
  project: string;
  inputPath: string;
}): Promise<PlanWriteResult> {
  const generatedAt = isoNow();
  const outputDirAbs = path.resolve(args.outputDir);

  await ensureDir(outputDirAbs);

  const writtenTasks: PlanWriteResult["tasks"] = [];

  for (const task of args.tasks) {
    const { spec, ...manifestFields } = task;
    const manifest = normalizeTaskManifest(manifestFields);
    const taskDir = path.join(outputDirAbs, buildTaskDirName(manifest));

    await writeJsonFile(path.join(taskDir, "manifest.json"), manifest);
    await writeTextFile(path.join(taskDir, "spec.md"), formatSpec(spec));

    writtenTasks.push({ id: manifest.id, name: manifest.name, dir: taskDir });
  }

  const planIndexPath = path.join(outputDirAbs, "_plan.json");
  await writeJsonFile(planIndexPath, {
    generated_at: generatedAt,
    project: args.project,
    input: path.resolve(args.inputPath),
    output_dir: outputDirAbs,
    task_count: args.tasks.length,
    tasks: writtenTasks.map((task) => ({
      id: task.id,
      name: task.name,
      dir: path.relative(outputDirAbs, task.dir) || ".",
    })),
  });

  return { planIndexPath, tasks: writtenTasks };
}

function formatSpec(spec: string): string {
  const trimmed = spec.trimEnd();
  return trimmed.endsWith("\n") ? trimmed : `${trimmed}\n`;
}
