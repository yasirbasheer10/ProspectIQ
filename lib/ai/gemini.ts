import Groq from "groq-sdk";

const apiKey = process.env.GROQ_API_KEY || "dummy_key_to_prevent_build_crash";

const groq = new Groq({ apiKey });

// ─────────────────────────────────────────────────────────────
// GROQ WRAPPER — OpenAI-compatible interface
// All AI files call `ai.chat.completions.create()`.
// This file is the single place where the provider/model is set.
// Switching models = change the MODEL constant below only.
// ─────────────────────────────────────────────────────────────

// ✅ Active model: GPT-OSS 120B on Groq
// Groq ID:  openai/gpt-oss-120b
// Cost:     $0.15/MTok input  |  $0.60/MTok output
// Quality:  GPT-4 class (120B parameters)
// Speed:    Groq LPU — extremely fast inference
export const MODEL = "openai/gpt-oss-120b";

// Re-export the Groq client under the same `ai` name every file expects.
// Groq's SDK is fully OpenAI-compatible so chat.completions.create() works identically.
export const ai = groq;

// Convenience aliases — kept for any future per-task model overrides
export const FAST_MODEL = "openai/gpt-oss-120b";
export const SMART_MODEL = "openai/gpt-oss-120b";
