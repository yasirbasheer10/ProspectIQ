export async function performSearch(query: string) {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    console.warn("No Serper API key found, skipping real search.");
    return null;
  }

  try {
    let response;
    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
      try {
        response = await fetch("https://google.serper.dev/search", {
          method: "POST",
          headers: {
            "X-API-KEY": apiKey,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            q: query
          })
        });

        if (!response.ok) {
          throw new Error(`Serper API error: ${response.statusText}`);
        }
        
        break; // Success
      } catch (err) {
        retries++;
        console.warn(`Serper API attempt ${retries} failed:`, err);
        if (retries >= maxRetries) throw err;
        await new Promise(resolve => setTimeout(resolve, retries * 1000));
      }
    }

    if (!response) throw new Error("Search completely failed");
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Search failed:", error);
    return null;
  }
}
