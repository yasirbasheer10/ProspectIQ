const { Groq } = require('groq-sdk');
require('dotenv').config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function main() {
  try {
    const models = await groq.models.list();
    console.log("Available models:");
    models.data.forEach(m => console.log(m.id));
  } catch (error) {
    console.error("Error:", error);
  }
}
main();
