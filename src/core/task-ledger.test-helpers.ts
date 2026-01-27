import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach } from "vitest";

const temporaryDirectories: string[] = [];

export function registerTaskLedgerTempCleanup(): void {
  afterEach(() => {
    for (const directoryPath of temporaryDirectories) {
      fs.rmSync(directoryPath, { recursive: true, force: true });
    }
    temporaryDirectories.length = 0;
  });
}

export function makeTemporaryDirectory(prefix: string): string {
  const directoryPath = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directoryPath);
  return directoryPath;
}
