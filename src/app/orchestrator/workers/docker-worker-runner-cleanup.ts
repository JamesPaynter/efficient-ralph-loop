import { logOrchestratorEvent, type JsonObject, type JsonlLogger } from "../../../core/logger.js";
import type { DockerManager } from "../../../docker/manager.js";
import { formatErrorMessage } from "../helpers/errors.js";

import {
  containerLabel,
  findTaskContainer,
  firstContainerName,
  listRunContainers,
} from "./docker-worker-helpers.js";
import type { WorkerStopResult } from "./worker-runner.js";

export async function stopRunContainers(input: {
  docker: DockerManager;
  projectName: string;
  runId: string;
  stopContainersOnExit: boolean;
  orchestratorLogger: JsonlLogger;
}): Promise<WorkerStopResult | null> {
  if (!input.stopContainersOnExit) {
    return null;
  }

  const containers = await listRunContainers(input.docker, input.projectName, input.runId);
  let stopped = 0;
  let errors = 0;

  for (const c of containers) {
    const containerName = firstContainerName(c.names);
    const taskId = containerLabel(c.labels, "task_id");

    try {
      const container = input.docker.getContainer(c.id);
      await input.docker.stopContainer(container);
      await input.docker.removeContainer(container);
      stopped += 1;
      const payload: JsonObject & { taskId?: string } = {
        container_id: c.id,
        ...(containerName ? { name: containerName } : {}),
      };
      if (taskId) payload.taskId = taskId;
      logOrchestratorEvent(input.orchestratorLogger, "container.stop", payload);
    } catch (err) {
      errors += 1;
      const payload: JsonObject & { taskId?: string } = {
        container_id: c.id,
        ...(containerName ? { name: containerName } : {}),
        message: formatErrorMessage(err),
      };
      if (taskId) payload.taskId = taskId;
      logOrchestratorEvent(input.orchestratorLogger, "container.stop_failed", payload);
    }
  }

  return { stopped, errors };
}

export async function cleanupTaskContainer(input: {
  docker: DockerManager;
  projectName: string;
  runId: string;
  taskId: string;
  containerIdHint?: string;
  orchestratorLogger: JsonlLogger;
}): Promise<void> {
  const containerInfo = await findTaskContainer(
    input.docker,
    input.projectName,
    input.runId,
    input.taskId,
    input.containerIdHint,
  );
  if (!containerInfo) return;

  const container = input.docker.getContainer(containerInfo.id);
  await input.docker.removeContainer(container);
  logOrchestratorEvent(input.orchestratorLogger, "container.cleanup", {
    taskId: input.taskId,
    container_id: containerInfo.id,
    ...(containerInfo.name ? { name: containerInfo.name } : {}),
  });
}
