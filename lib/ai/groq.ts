import Groq from "groq-sdk";

const apiKey = process.env.GROQ_API_KEY || "dummy_key_to_prevent_build_crash";

export const ai = new Groq({ apiKey });
