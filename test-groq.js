const { Groq } = require('groq-sdk');
require('dotenv').config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function main() {
  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: 'Explain importance of low latency LLMs' }],
      model: 'llama-3.1-8b-instant',
    });
    console.log("Success with llama-3.1-8b-instant");
  } catch (error) {
    console.error("Error with llama-3.1-8b-instant:", error.status, error.error?.error?.message);
  }

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: 'Explain importance of low latency LLMs' }],
      model: 'llama3-8b-8192',
    });
    console.log("Success with llama3-8b-8192");
  } catch (error) {
    console.error("Error with llama3-8b-8192:", error.status, error.error?.error?.message);
  }
}
main();
