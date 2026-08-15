import Groq from "groq-sdk";

const apiKey = process.env.GROQ_API_KEY;

export const ai = new Groq(apiKey ? { apiKey } : {});
