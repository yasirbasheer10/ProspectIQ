/**
 * Demo AI Provider
 * 
 * Returns realistic-looking AI responses using pre-defined fixtures.
 * Used when DEMO_MODE=true or when no AI provider is configured.
 * NEVER fabricates real companies, people, or data — all demo content
 * is clearly marked as synthetic.
 */

import type { AIProvider, ChatMessage, ChatOptions, ChatResponse, StructuredOutputOptions } from "./provider";

export class DemoAIProvider implements AIProvider {
  readonly name = "demo";
  readonly defaultModel = "demo-v1";

  isConfigured(): boolean {
    return true; // Always available in demo mode
  }

  async chat(messages: ChatMessage[], _options?: ChatOptions): Promise<ChatResponse> {
    void _options;
    // Return a canned response based on the last user message
    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
    const prompt = lastUserMessage?.content?.toLowerCase() ?? "";

    let content = "This is a demo response. Configure an AI provider to get real AI-generated content.";

    if (prompt.includes("opportunity") || prompt.includes("problem")) {
      content = `[DEMO] Based on the evidence collected, this company shows strong signals of needing your services. 
They recently posted 3 senior sales roles and their CTO mentioned scaling challenges in a recent interview. 
This suggests they are in a growth phase where your solution could directly address revenue acceleration.`;
    } else if (prompt.includes("email") || prompt.includes("outreach")) {
      content = `[DEMO] Subject: Quick question about your Q3 growth plans

Hi {{first_name}},

I noticed {{company_name}} is expanding its sales team rapidly — congrats on the growth.

Most teams in your position hit a wall around the 50-person mark when manual outreach stops scaling. 
We help B2B companies like yours build a systematic pipeline that doesn't require 10x the headcount.

Worth a 20-minute conversation?

Best,
{{sender_name}}`;
    } else if (prompt.includes("research") || prompt.includes("company")) {
      content = `[DEMO] Company research complete. Found 4 buying signals: 
1. Series B funding announcement ($12M, 3 months ago)
2. 3 open VP Sales positions on LinkedIn
3. CEO posted about "scaling go-to-market" on LinkedIn
4. Recently adopted Salesforce (tech stack change)`;
    }

    await simulateDelay(300);
    return { content, model: this.defaultModel, finishReason: "stop" };
  }

  async structuredOutput<T>(
    messages: ChatMessage[],
    _options: StructuredOutputOptions
  ): Promise<T> {
    void messages;
    void _options;
    // Return a demo structured output shell
    await simulateDelay(200);
    return {} as T;
  }
}

/**
 * OpenAI Provider (stub — real implementation in Phase 2+)
 */
export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  readonly defaultModel = "gpt-4o";

  isConfigured(): boolean {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    if (!this.isConfigured()) throw new Error("OpenAI API key not configured");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options?.model ?? this.defaultModel,
        messages,
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 2048,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API error: ${res.status} ${err}`);
    }

    const data = await res.json();
    return {
      content: data.choices[0].message.content,
      model: data.model,
      tokensUsed: data.usage?.total_tokens,
      finishReason: data.choices[0].finish_reason,
    };
  }

  async structuredOutput<T>(
    messages: ChatMessage[],
    options: StructuredOutputOptions
  ): Promise<T> {
    const systemMessage: ChatMessage = {
      role: "system",
      content: `You must respond with valid JSON only. ${options.schemaDescription ?? ""}`,
    };

    const response = await this.chat([systemMessage, ...messages], {
      ...options,
      temperature: 0.1,
    });

    return JSON.parse(response.content) as T;
  }
}

/**
 * Factory: get the configured AI provider
 */
export function getAIProvider(): AIProvider {
  if (process.env.DEMO_MODE === "true") {
    return new DemoAIProvider();
  }

  const provider = process.env.AI_PROVIDER ?? "openai";

  switch (provider) {
    case "openai":
      return new OpenAIProvider();
    default:
      console.warn(`Unknown AI provider: ${provider}, falling back to demo`);
      return new DemoAIProvider();
  }
}

// ─── Utilities ──────────────────────────────────────────────
function simulateDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
