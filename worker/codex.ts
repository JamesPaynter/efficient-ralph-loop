import {
  Codex,
  type ApprovalMode,
  type SandboxMode,
  type Thread,
  type ThreadEvent,
  type ThreadOptions,
} from "@openai/codex-sdk";

export type CodexRunnerOptions = {
  codexHome: string;
  model?: string;
  workingDirectory: string;
  sandboxMode?: SandboxMode;
  approvalPolicy?: ApprovalMode;
};

export class CodexRunner {
  private thread: Thread;

  constructor(opts: CodexRunnerOptions) {
    const env = opts.codexHome ? { CODEX_HOME: opts.codexHome } : undefined;

    const codex = new Codex({ env });
    const threadOptions: ThreadOptions = {
      workingDirectory: opts.workingDirectory,
      sandboxMode: opts.sandboxMode ?? "danger-full-access",
      approvalPolicy: opts.approvalPolicy ?? "never",
    };

    if (opts.model) {
      threadOptions.model = opts.model;
    }

    this.thread = codex.startThread(threadOptions);
  }

  async streamPrompt(input: string, onEvent: (event: ThreadEvent) => void): Promise<void> {
    const { events } = await this.thread.runStreamed(input);
    for await (const event of events) {
      onEvent(event);
    }
  }
}
