/**
 * AI Provider Abstraction Layer
 * 
 * Switch between OpenAI, Anthropic, Gemini, or any other LLM
 * by changing the AI_PROVIDER environment variable.
 * 
 * IMPORTANT: This layer ensures the rest of the app never depends
 * on a specific AI provider implementation.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface ChatResponse {
  content: string;
  model: string;
  tokensUsed?: number;
  finishReason?: string;
}

export interface StructuredOutputOptions extends ChatOptions {
  schema: Record<string, unknown>;
  schemaDescription?: string;
}

/**
 * Core AI provider interface.
 * All provider implementations must satisfy this contract.
 */
export interface AIProvider {
  readonly name: string;
  readonly defaultModel: string;

  /**
   * Send a chat completion request.
   */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;

  /**
   * Generate a structured JSON response conforming to a schema.
   */
  structuredOutput<T>(
    messages: ChatMessage[],
    options: StructuredOutputOptions
  ): Promise<T>;

  /**
   * Check if this provider is properly configured (API keys present).
   */
  isConfigured(): boolean;
}
