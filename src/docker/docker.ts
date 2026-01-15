import path from "node:path";

import Docker from "dockerode";

import { DockerError } from "../core/errors.js";

export const DEFAULT_CPU_PERIOD = 100_000;

export type ContainerSpec = {
  name: string;
  image: string;
  env: Record<string, string | undefined>;
  binds: Array<{ hostPath: string; containerPath: string; mode: "rw" | "ro" }>;
  workdir: string;
  labels?: Record<string, string>;
  // Optional: override command
  cmd?: string[];
  user?: string;
  networkMode?: "bridge" | "none";
  resources?: {
    memoryBytes?: number;
    cpuQuota?: number;
    cpuPeriod?: number;
    pidsLimit?: number;
  };
};

export type ContainerWaitResult = { exitCode: number; status: string };

export function dockerClient(): Docker {
  return new Docker();
}

export async function imageExists(docker: Docker, imageName: string): Promise<boolean> {
  try {
    await docker.getImage(imageName).inspect();
    return true;
  } catch {
    return false;
  }
}

export async function createContainer(
  docker: Docker,
  spec: ContainerSpec,
): Promise<Docker.Container> {
  try {
    const Env = Object.entries(spec.env)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${v}`);

    const Binds = spec.binds.map((b) => `${path.resolve(b.hostPath)}:${b.containerPath}:${b.mode}`);

    const hostConfig: Docker.ContainerCreateOptions["HostConfig"] = {
      Binds,
      NetworkMode: spec.networkMode ?? "bridge",
      AutoRemove: false,
    };

    if (spec.resources?.memoryBytes !== undefined) {
      hostConfig.Memory = spec.resources.memoryBytes;
    }
    if (spec.resources?.cpuQuota !== undefined) {
      hostConfig.CpuQuota = spec.resources.cpuQuota;
      hostConfig.CpuPeriod = spec.resources.cpuPeriod ?? DEFAULT_CPU_PERIOD;
    }
    if (spec.resources?.pidsLimit !== undefined) {
      hostConfig.PidsLimit = spec.resources.pidsLimit;
    }

    const container = await docker.createContainer({
      Image: spec.image,
      name: spec.name,
      Env,
      WorkingDir: spec.workdir,
      Cmd: spec.cmd,
      Labels: spec.labels,
      User: spec.user,
      HostConfig: hostConfig,
    });

    return container;
  } catch (err: any) {
    throw new DockerError(
      `Failed to create container ${spec.name}: ${err?.message ?? String(err)}`,
    );
  }
}

export async function startContainer(container: Docker.Container): Promise<void> {
  try {
    await container.start();
  } catch (err: any) {
    throw new DockerError(`Failed to start container: ${err?.message ?? String(err)}`);
  }
}

export async function waitContainer(container: Docker.Container): Promise<ContainerWaitResult> {
  const res = await container.wait();
  // dockerode returns { StatusCode: number }
  const exitCode = (res as any).StatusCode ?? -1;
  return { exitCode, status: exitCode === 0 ? "exited:0" : `exited:${exitCode}` };
}

export async function removeContainer(container: Docker.Container): Promise<void> {
  try {
    await container.remove({ force: true });
  } catch {
    // ignore
  }
}

export async function findContainerByName(
  docker: Docker,
  name: string,
): Promise<Docker.Container | null> {
  const containers = await docker.listContainers({ all: true });
  const match = containers.find((c) => (c.Names ?? []).includes(`/${name}`));
  if (!match) return null;
  return docker.getContainer(match.Id);
}
