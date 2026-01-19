import { APIError as AnthropicApiError } from "@anthropic-ai/sdk";
import type {
  Message as AnthropicMessage,
  MessageCreateParamsNonStreaming as AnthropicMessageParams,
  StopReason as AnthropicStopReason,
} from "@anthropic-ai/sdk/resources/messages/messages";
import type OpenAI from "openai";
import { APIError as OpenAiApiError } from "openai/error";
import type { Response, ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import { describe, expect, it } from "vitest";

import { AnthropicClient } from "./anthropic.js";
import { LlmError } from "./client.js";
import { OpenAiClient } from "./openai.js";

class FakeOpenAiTransport {
  lastBody?: ResponseCreateParamsNonStreaming;
  lastOptions?: OpenAI.RequestOptions;

  constructor(private readonly outcome: Response | Error) {}

  async create(
    body: ResponseCreateParamsNonStreaming,
    options?: OpenAI.RequestOptions,
  ): Promise<Response> {
    this.lastBody = body;
    this.lastOptions = options;
    if (this.outcome instanceof Error) {
      throw this.outcome;
    }
    return this.outcome;
  }
}

function makeOpenAiResponse(content: string): Response {
  return {
    id: "resp_123",
    created_at: 1,
    output_text: content,
    status: "completed",
    model: "gpt-4o-mini",
    object: "response",
    output: [],
    error: null,
    incomplete_details: null,
    instructions: null,
    metadata: null,
    parallel_tool_calls: false,
    temperature: null,
    top_p: null,
    tool_choice: "auto",
    tools: [],
  } as Response;
}

type AnthropicRequestOptions = {
  timeout?: number;
  maxRetries?: number;
};

class FakeAnthropicTransport {
  lastBody?: AnthropicMessageParams;
  lastOptions?: AnthropicRequestOptions;

  constructor(private readonly outcome: AnthropicMessage | Error) {}

  async create(
    body: AnthropicMessageParams,
    options?: AnthropicRequestOptions,
  ): Promise<AnthropicMessage> {
    this.lastBody = body;
    this.lastOptions = options;
    if (this.outcome instanceof Error) {
      throw this.outcome;
    }
    return this.outcome;
  }
}

function makeAnthropicResponse(args: {
  text?: string;
  toolInput?: Record<string, unknown>;
  stopReason?: AnthropicStopReason | null;
}): AnthropicMessage {
  const content: AnthropicMessage["content"] = [];
  if (args.text) {
    content.push({ type: "text", text: args.text, citations: null });
  }
  if (args.toolInput) {
    content.push({
      type: "tool_use",
      id: "toolu_123",
      name: "structured_output",
      input: args.toolInput,
    });
  }

  return {
    id: "msg_123",
    content,
    model: "claude-3-5-sonnet",
    role: "assistant",
    stop_reason: args.stopReason ?? "end_turn",
    stop_sequence: null,
    type: "message",
    usage: {
      cache_creation: null,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      input_tokens: 10,
      output_tokens: 5,
      server_tool_use: null,
      service_tier: null,
    },
  };
}

describe("OpenAiClient", () => {
  it("sends JSON schema, temperature, and timeout overrides", async () => {
    const schema = {
      type: "object",
      properties: { status: { type: "string" } },
      required: ["status"],
      additionalProperties: false,
    };

    const transport = new FakeOpenAiTransport(makeOpenAiResponse('{"status":"ok"}'));
    const client = new OpenAiClient({
      model: "gpt-4o-mini",
      transport,
      defaultTemperature: 0.7,
      defaultTimeoutMs: 30_000,
      defaultReasoningEffort: "high",
    });

    const result = await client.complete<{ status: string }>("Hello!", {
      schema,
      temperature: 0.1,
      timeoutMs: 1_500,
    });

    expect(transport.lastBody?.text?.format).toMatchObject({
      type: "json_schema",
      schema,
      strict: true,
    });
    expect(transport.lastBody?.temperature).toBe(0.1);
    expect(transport.lastBody?.input).toBe("Hello!");
    expect(transport.lastBody?.reasoning).toEqual({ effort: "high" });
    expect(transport.lastOptions?.timeout).toBe(1_500);

    expect(result.text).toBe('{"status":"ok"}');
    expect(result.parsed).toEqual({ status: "ok" });
    expect(result.finishReason).toBe("completed");
  });

  it("wraps OpenAI errors with actionable guidance", async () => {
    const apiError = new OpenAiApiError(
      401,
      { message: "Missing API key" } as Record<string, unknown>,
      "Unauthorized",
      new Headers(),
    );

    const transport = new FakeOpenAiTransport(apiError);
    const client = new OpenAiClient({ model: "gpt-4o-mini", transport });
    const run = client.complete("Hi there");

    await expect(run).rejects.toBeInstanceOf(LlmError);
    await expect(run).rejects.toThrow(/status 401/i);
    await expect(run).rejects.toThrow(/OPENAI_API_KEY/);
  });
});

describe("AnthropicClient", () => {
  it("sends tool schema, temperature, and timeout overrides", async () => {
    const schema = {
      type: "object",
      properties: { status: { type: "string" } },
      required: ["status"],
      additionalProperties: false,
    };

    const transport = new FakeAnthropicTransport(
      makeAnthropicResponse({ toolInput: { status: "ok" }, stopReason: "tool_use" }),
    );
    const client = new AnthropicClient({
      model: "claude-3-5-sonnet-latest",
      transport,
      defaultTemperature: 0.6,
      defaultTimeoutMs: 20_000,
      defaultMaxTokens: 2_000,
    });

    const result = await client.complete<{ status: string }>("Hello!", {
      schema,
      temperature: 0.2,
      timeoutMs: 750,
    });

    expect(transport.lastBody?.tools?.[0]).toMatchObject({
      name: "structured_output",
      input_schema: expect.objectContaining({ type: "object", properties: schema.properties }),
    });
    expect(transport.lastBody?.tool_choice).toEqual({ type: "tool", name: "structured_output" });
    expect(transport.lastBody?.temperature).toBe(0.2);
    expect(transport.lastBody?.messages?.[0]).toEqual({ role: "user", content: "Hello!" });
    expect(transport.lastBody?.max_tokens).toBe(2_000);
    expect(transport.lastOptions?.timeout).toBe(750);

    expect(result.text).toBe(JSON.stringify({ status: "ok" }));
    expect(result.parsed).toEqual({ status: "ok" });
    expect(result.finishReason).toBe("tool_use");
  });

  it("wraps Anthropic errors with actionable guidance", async () => {
    const apiError = new AnthropicApiError(
      401,
      { message: "Missing API key" } as Record<string, unknown>,
      "Unauthorized",
      new Headers(),
    );

    const transport = new FakeAnthropicTransport(apiError);
    const client = new AnthropicClient({ model: "claude-3-5-sonnet-latest", transport });
    const run = client.complete("Hi there");

    await expect(run).rejects.toBeInstanceOf(LlmError);
    await expect(run).rejects.toThrow(/status 401/i);
    await expect(run).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });
});
