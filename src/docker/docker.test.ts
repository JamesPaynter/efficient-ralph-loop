import { describe, expect, it } from "vitest";

import { DEFAULT_CPU_PERIOD, createContainer } from "./docker.js";

class RecordingDocker {
  readonly calls: any[] = [];
  readonly container: any;

  constructor(container: any = {}) {
    this.container = container;
  }

  async createContainer(opts: any): Promise<any> {
    this.calls.push(opts);
    return this.container;
  }
}

describe("createContainer", () => {
  it("applies network and resource limits when provided", async () => {
    const docker = new RecordingDocker({ id: "abc" });

    const container = await createContainer(docker as any, {
      name: "ct-1",
      image: "worker:latest",
      user: "worker",
      env: { KEEP: "1", DROP: undefined },
      binds: [{ hostPath: "/tmp/work", containerPath: "/workspace", mode: "rw" }],
      workdir: "/workspace",
      networkMode: "none",
      resources: { memoryBytes: 256 * 1024 * 1024, cpuQuota: 50_000, pidsLimit: 256 },
    });

    expect(container).toBe(docker.container);
    expect(docker.calls).toHaveLength(1);

    const opts = docker.calls[0];
    expect(opts.User).toBe("worker");
    expect(opts.Env).toEqual(["KEEP=1"]);
    expect(opts.HostConfig?.NetworkMode).toBe("none");
    expect(opts.HostConfig?.Memory).toBe(256 * 1024 * 1024);
    expect(opts.HostConfig?.CpuQuota).toBe(50_000);
    expect(opts.HostConfig?.CpuPeriod).toBe(DEFAULT_CPU_PERIOD);
    expect(opts.HostConfig?.PidsLimit).toBe(256);
    expect(opts.HostConfig?.Binds).toEqual(["/tmp/work:/workspace:rw"]);
  });

  it("defaults to bridge networking when not specified", async () => {
    const docker = new RecordingDocker();

    await createContainer(docker as any, {
      name: "ct-2",
      image: "worker:latest",
      env: {},
      binds: [],
      workdir: "/workspace",
    });

    const opts = docker.calls[0];
    expect(opts.HostConfig?.NetworkMode).toBe("bridge");
    expect(opts.User).toBeUndefined();
  });
});
