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
            q: query,
            num: 20
          })
        });

        if (!response.ok) {
          const err = new Error(`Serper API error: ${response.statusText}`) as Error & { status?: number };
          err.status = response.status;
          throw err;
        }
        
        break; // Success
      } catch (err) {
        retries++;
        console.warn(`Serper API attempt ${retries} failed:`, err);
        // A 4xx means the request itself is invalid — retrying sends the
        // exact same broken request again and will fail identically every
        // time. Only retry on things that can plausibly succeed on a second
        // try: rate limits (429), server errors (5xx), or network failures
        // (no status at all, e.g. a timeout).
        const status = (err as Error & { status?: number }).status;
        const isRetryable = !status || status === 429 || status >= 500;
        if (!isRetryable || retries >= maxRetries) throw err;
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
