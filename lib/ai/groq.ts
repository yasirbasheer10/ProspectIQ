import Groq from "groq-sdk";

// ─────────────────────────────────────────────────────────────
// GROQ WRAPPER — OpenAI-compatible interface
//
// Every AI engine imports `ai` and `MODEL` from here, so this file is the
// single place the provider and model are chosen. Switching models means
// editing MODEL below and nothing else.
//
// Named `gemini.ts` until 2026-08-24, which was left over from an earlier
// provider and actively misleading — there is no Gemini here.
// ─────────────────────────────────────────────────────────────

const apiKey = process.env.GROQ_API_KEY || "dummy_key_to_prevent_build_crash";

const groq = new Groq({ apiKey });

/**
 * Active model: GPT-OSS 120B on Groq.
 *   Cost:    $0.15/MTok input | $0.60/MTok output
 *   Quality: GPT-4 class (120B parameters)
 *   Speed:   Groq LPU, extremely fast inference
 */
export const MODEL = "openai/gpt-oss-120b";

/**
 * Re-export of the Groq client under the `ai` name the engines expect.
 * Groq's SDK is OpenAI-compatible, so `chat.completions.create()` is identical.
 */
export const ai = groq;
