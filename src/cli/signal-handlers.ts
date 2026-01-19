export type RunStopSignalHandler = {
  signal: AbortSignal;
  cleanup: () => void;
  isStopped: () => boolean;
};

export function createRunStopSignalHandler(
  opts: { onSignal?: (signal: NodeJS.Signals) => void } = {},
): RunStopSignalHandler {
  const controller = new AbortController();
  let cleaned = false;

  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
  };

  const handleSignal = (signal: NodeJS.Signals): void => {
    try {
      opts.onSignal?.(signal);
    } finally {
      if (!controller.signal.aborted) {
        controller.abort(signal);
      }
      cleanup();
    }
  };

  const onSigint = (): void => handleSignal("SIGINT");
  const onSigterm = (): void => handleSignal("SIGTERM");

  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);

  return {
    signal: controller.signal,
    cleanup,
    isStopped: () => controller.signal.aborted,
  };
}
