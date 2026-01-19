import OpenAI from "openai";
import { APIError, OpenAIError } from "openai/error";
import type {
  Response,
  ResponseCreateParamsNonStreaming,
  ResponseTextConfig,
} from "openai/resources/responses/responses";

import {
  ensureJsonObject,
  LlmClient,
  type ReasoningEffort,
  type LlmCompletionOptions,
  type LlmCompletionResult,
  LlmError,
} from "./client.js";

type OpenAiTransport = {
  create: (
    body: ResponseCreateParamsNonStreaming,
    options?: OpenAI.RequestOptions,
  ) => Promise<Response>;
};

type OpenAiClientOptions = {
  model: string;
  apiKey?: string;
  baseURL?: string;
  defaultTemperature?: number;
  defaultTimeoutMs?: number;
  defaultReasoningEffort?: ReasoningEffort;
  maxRetries?: number;
  fetch?: typeof fetch;
  transport?: OpenAiTransport;
};

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 3;
const RETRIABLE_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

export class OpenAiClient implements LlmClient {
  private readonly model: string;
  private readonly defaultTemperature?: number;
  private readonly defaultTimeoutMs: number;
  private readonly defaultReasoningEffort?: ReasoningEffort;
  private readonly maxRetries: number;
  private readonly transport: OpenAiTransport;

  constructor(options: OpenAiClientOptions) {
    this.model = options.model;
    this.defaultTemperature = options.defaultTemperature;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.defaultReasoningEffort = options.defaultReasoningEffort;
    this.maxRetries = Math.max(1, options.maxRetries ?? DEFAULT_MAX_RETRIES);

    if (!options.transport) {
      const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new LlmError(
          "OpenAI API key is required. Set OPENAI_API_KEY or pass apiKey to OpenAiClient.",
        );
      }
      this.transport = createTransport({
        apiKey,
        baseURL: options.baseURL,
        fetch: options.fetch,
      });
    } else {
      this.transport = options.transport;
    }
  }

  async complete<TParsed = unknown>(
    prompt: string,
    options: LlmCompletionOptions = {},
  ): Promise<LlmCompletionResult<TParsed>> {
    if (options.schema !== undefined) {
      ensureJsonObject(options.schema);
    }

    const body = this.buildRequestBody(prompt, options);
    const requestOptions = this.buildRequestOptions(options.timeoutMs);

    const response = await this.runWithRetries(() => this.transport.create(body, requestOptions));

    const text = response.output_text ?? "";

    if (!text) {
      throw new LlmError("OpenAI response did not include assistant content.", response);
    }

    const parsed = options.schema ? this.parseJson<TParsed>(text) : undefined;

    return {
      text,
      parsed,
      finishReason: response.status ?? null,
    };
  }

  private buildRequestBody(
    prompt: string,
    options: LlmCompletionOptions,
  ): ResponseCreateParamsNonStreaming {
    const temperature =
      options.temperature ?? this.defaultTemperature ?? 0; // Deterministic by default for validators.
    const reasoningEffort = options.reasoningEffort ?? this.defaultReasoningEffort;

    const textConfig: ResponseTextConfig | undefined =
      options.schema !== undefined
        ? {
            format: {
              type: "json_schema",
              name: "structured_output",
              schema: options.schema,
              strict: true,
            },
          }
        : undefined;

    const body: ResponseCreateParamsNonStreaming = {
      model: this.model,
      input: prompt,
      temperature,
      text: textConfig,
      reasoning: reasoningEffort ? { effort: reasoningEffort } : undefined,
    };

    return body;
  }

  private buildRequestOptions(timeoutMs?: number): OpenAI.RequestOptions | undefined {
    const timeout = timeoutMs ?? this.defaultTimeoutMs;
    if (!timeout) return undefined;
    return { timeout };
  }

  private async runWithRetries<T>(fn: () => Promise<T>): Promise<T> {
    let attempt = 1;
    let lastError: unknown;

    while (attempt <= this.maxRetries) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        if (!this.isRetryable(err) || attempt === this.maxRetries) {
          throw this.wrapError(err);
        }
        await delay(this.retryDelayMs(attempt));
      }
      attempt += 1;
    }

    throw this.wrapError(lastError ?? new Error("Unknown OpenAI failure"));
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof APIError) {
      if (error.status === undefined) return false;
      return RETRIABLE_STATUS_CODES.has(error.status);
    }
    if (error instanceof OpenAIError) {
      return Boolean((error as { code?: string }).code === "rate_limit_exceeded");
    }
    if (error instanceof Error) {
      return error.message.toLowerCase().includes("timeout") || error.message.includes("ETIMEDOUT");
    }
    return false;
  }

  private retryDelayMs(attempt: number): number {
    const capped = Math.min(attempt, 5);
    return 250 * 2 ** (capped - 1);
  }

  private parseJson<T>(text: string): T {
    try {
      return JSON.parse(text.trim()) as T;
    } catch (err) {
      throw new LlmError("OpenAI returned invalid JSON for structured output.", err);
    }
  }

  private wrapError(error: unknown): LlmError {
    if (error instanceof APIError) {
      const status = error.status ?? "unknown";
      const detail =
        error.error && typeof error.error === "object" && "message" in error.error
          ? String((error.error as Record<string, unknown>).message)
          : error.message;
      const hint =
        status === 401 || status === 403
          ? "Check OPENAI_API_KEY and permissions."
          : status === 429
            ? "Rate limited by OpenAI."
            : null;
      const suffix = hint ? ` ${hint}` : "";
      return new LlmError(`OpenAI request failed (status ${status}): ${detail}${suffix}`, error);
    }

    if (error instanceof OpenAIError) {
      return new LlmError(`OpenAI request failed: ${error.message}`, error);
    }

    if (error instanceof Error) {
      return new LlmError(error.message, error);
    }

    return new LlmError("OpenAI request failed due to an unknown error.", error);
  }
}

function createTransport(args: {
  apiKey: string;
  baseURL?: string;
  fetch?: typeof fetch;
}): OpenAiTransport {
  const client = new OpenAI({
    apiKey: args.apiKey,
    baseURL: args.baseURL,
    fetch: args.fetch,
    maxRetries: 0, // Manual retries handled in OpenAiClient.
  });

  return {
    create: async (body, options) => {
      const response = await client.responses.create({ ...body, stream: false }, options);
      if (!("output_text" in response)) {
        throw new LlmError("Received unexpected streaming response from OpenAI.");
      }
      return response as Response;
    },
  };
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}
