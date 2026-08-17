const { Groq } = require('groq-sdk');
require('dotenv').config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function main() {
  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: 'Explain importance of low latency LLMs' }],
      model: 'groq/compound-mini',
    });
    console.log("Response:", chatCompletion.choices[0].message.content);
  } catch (error) {
    console.error("Error:", error);
  }
}
main();
