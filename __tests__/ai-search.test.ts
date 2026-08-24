/**
 * Tests: Serper search wrapper (`lib/ai/search.ts`)
 *
 * The retry rule here is the interesting part: a 4xx means the request itself is
 * malformed, so retrying sends the identical broken request twice more and
 * triples the latency of a guaranteed failure. Only 429s, 5xx and outright
 * network failures are worth a second attempt.
 */

import { performSearch } from "@/lib/ai/search";

const jsonResponse = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as Response;

describe("performSearch", () => {
  const originalKey = process.env.SERPER_API_KEY;
  let fetchMock: jest.Mock;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.SERPER_API_KEY = "test-key";
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    // These paths log deliberately; keep the test output readable.
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    if (originalKey === undefined) delete process.env.SERPER_API_KEY;
    else process.env.SERPER_API_KEY = originalKey;
  });

  it("returns null without calling out when no API key is configured", async () => {
    delete process.env.SERPER_API_KEY;
    await expect(performSearch("saas companies hiring")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the parsed body on success", async () => {
    const body = { organic: [{ title: "Stripe", link: "https://stripe.com", snippet: "Payments" }] };
    fetchMock.mockResolvedValue(jsonResponse(body));

    await expect(performSearch("payments companies")).resolves.toEqual(body);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends the query as a POST with the key in the header", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ organic: [] }));
    await performSearch("fintech companies uk");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://google.serper.dev/search");
    expect(init.method).toBe("POST");
    expect(init.headers["X-API-KEY"]).toBe("test-key");
    expect(JSON.parse(init.body)).toEqual({ q: "fintech companies uk" });
  });

  it("does not retry a 400 — the same bad request would fail identically", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "query too long" }, 400));

    await expect(performSearch("a".repeat(3000))).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry a 403 either", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "forbidden" }, 403));

    await expect(performSearch("anything")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 429 up to the limit, then gives up", async () => {
    jest.useFakeTimers();
    fetchMock.mockResolvedValue(jsonResponse({ message: "rate limited" }, 429));

    const promise = performSearch("saas companies");
    await jest.advanceTimersByTimeAsync(10_000);

    await expect(promise).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries a 500", async () => {
    jest.useFakeTimers();
    fetchMock.mockResolvedValue(jsonResponse({ message: "boom" }, 500));

    const promise = performSearch("saas companies");
    await jest.advanceTimersByTimeAsync(10_000);

    await expect(promise).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries a network failure that carries no status", async () => {
    jest.useFakeTimers();
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));

    const promise = performSearch("saas companies");
    await jest.advanceTimersByTimeAsync(10_000);

    await expect(promise).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("succeeds on a retry after one transient failure", async () => {
    jest.useFakeTimers();
    const body = { organic: [{ title: "Ramp", link: "https://ramp.com", snippet: "Cards" }] };
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ message: "boom" }, 503))
      .mockResolvedValueOnce(jsonResponse(body));

    const promise = performSearch("spend management");
    await jest.advanceTimersByTimeAsync(10_000);

    await expect(promise).resolves.toEqual(body);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("swallows the failure rather than throwing, so one dead query cannot kill a run", async () => {
    // Callers run several query angles concurrently and treat null as "this
    // angle found nothing". A throw here would abort the whole discovery run.
    fetchMock.mockResolvedValue(jsonResponse({}, 400));
    await expect(performSearch("q")).resolves.toBeNull();
  });
});
