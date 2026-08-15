import { performSearch } from "./lib/ai/search";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function test() {
  console.log("Key:", process.env.SERPER_API_KEY ? "Loaded" : "Missing");
  const query = `"Acme Corp" acme.com recent news OR site:linkedin.com/in/ "Acme Corp" (CEO OR Founder OR VP OR Director)`;
  console.log("Query:", query);
  
  try {
    const res = await performSearch(query);
    console.log("Result:", res ? "Success" : "Null");
    if (res) {
      console.log(JSON.stringify(res).substring(0, 500));
    }
  } catch (e) {
    console.error("Failed:", e);
  }
}

test();
