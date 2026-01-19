import { initRepoConfig } from "../core/config-discovery.js";

export async function initCommand(opts: { force?: boolean }): Promise<void> {
  try {
    const result = initRepoConfig({ cwd: process.cwd(), force: opts.force });

    if (result.status === "created") {
      console.log(`Created Mycelium config at ${result.configPath}`);
      console.log(`Edit ${result.configPath} to set doctor, resources, and models.`);
      return;
    }

    if (result.status === "overwritten") {
      console.log(`Overwrote Mycelium config at ${result.configPath}`);
      console.log(`Review ${result.configPath} for your project settings.`);
      return;
    }

    console.log(`Config already exists at ${result.configPath}`);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`Init failed: ${detail}`);
    process.exitCode = 1;
  }
}
