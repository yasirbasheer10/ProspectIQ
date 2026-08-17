import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY || "dummy_key_to_prevent_build_crash";

const genai = new GoogleGenAI({ apiKey });

// ─────────────────────────────────────────────────────────────
// GEMINI WRAPPER — OpenAI-compatible interface
// The rest of the codebase calls `ai.chat.completions.create()`
// This wrapper translates those calls into the @google/genai SDK format.
// ─────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

interface CompletionParams {
  model: string;
  messages: Message[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: string };
}

interface CompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

async function createChatCompletion(params: CompletionParams): Promise<CompletionResponse> {
  const { model, messages, temperature, response_format } = params;

  // Merge system message into user prompt if present (Gemini doesn't use system role in same way)
  const systemMsg = messages.find(m => m.role === "system")?.content || "";
  const userMessages = messages.filter(m => m.role !== "system");

  // Build the full prompt
  const fullPrompt = systemMsg
    ? `${systemMsg}\n\n${userMessages.map(m => m.content).join("\n\n")}`
    : userMessages.map(m => m.content).join("\n\n");

  const config: Record<string, unknown> = {
    temperature: temperature ?? 0.2,
  };

  // If JSON output is requested, use Gemini's native JSON mode
  if (response_format?.type === "json_object") {
    config.responseMimeType = "application/json";
  }

  const result = await genai.models.generateContent({
    model,
    contents: fullPrompt,
    config,
  });

  return {
    choices: [
      {
        message: {
          content: result.text ?? "",
        },
      },
    ],
  };
}

// Export an object that matches the interface expected by the rest of the app
export const ai = {
  chat: {
    completions: {
      create: createChatCompletion,
    },
  },
};

// Export model name constants for easy updates in one place
export const GEMINI_FLASH = "gemini-3.6-flash";   // Fast: discovery, conversations
// NOTE: gemini-3.1-pro-preview has 0 free-tier quota as of 2026 (Pro models require
// billing enabled). Pointed at Flash until billing is turned on — swap back to
// "gemini-3.1-pro-preview" then, for higher-quality research/outreach reasoning.
export const GEMINI_PRO   = "gemini-3.6-flash";
