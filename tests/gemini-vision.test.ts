import { afterEach, describe, expect, it, vi } from "vitest";
import { GeminiVisionAdapter } from "../lib/infra/gemini-vision";

const IMG = Buffer.from("fake-png-bytes");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function successBody(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    candidates: [
      {
        content: {
          parts: [
            {
              text: JSON.stringify({
                narration: "GFT-A3-1001",
                amountNaira: "1500",
                senderName: "AMARA OKONKWO",
                date: "2026-08-15 09:30",
                isSuccessful: true,
                confidence: 0.95,
                errorReason: null,
                ...overrides,
              }),
            },
          ],
        },
      },
    ],
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GeminiVisionAdapter", () => {
  it("extracts a receipt from valid JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(successBody())));
    const adapter = new GeminiVisionAdapter("test-key", "gemini-3.7-flash");

    const receipt = await adapter.extractReceipt(IMG);

    expect(receipt).toMatchObject({
      narration: "GFT-A3-1001",
      amountKobo: 150_000,
      senderName: "AMARA OKONKWO",
      isSuccessful: true,
      confidence: 0.95,
      errorReason: null,
    });
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string);
    expect(body.contents[0].parts[1].inlineData.data).toBe(IMG.toString("base64"));
  });

  it("strips markdown fences before parsing", async () => {
    const text = "```json\n" + JSON.stringify({ narration: "GFT-A3-1001", amountNaira: "500", isSuccessful: true, confidence: 0.9 }) + "\n```";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ candidates: [{ content: { parts: [{ text }] } }] })));

    const receipt = await new GeminiVisionAdapter("test-key").extractReceipt(IMG);

    expect(receipt.amountKobo).toBe(50_000);
    expect(receipt.narration).toBe("GFT-A3-1001");
  });

  it("does not mark successful when confidence is low", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(successBody({ isSuccessful: true, confidence: 0.3 }))));

    const receipt = await new GeminiVisionAdapter("test-key").extractReceipt(IMG);

    expect(receipt.isSuccessful).toBe(false);
  });

  it("honors the retryDelay hint on transient 429 then succeeds", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          { error: { status: "RESOURCE_EXHAUSTED", details: [{ "@type": "google.rpc.RetryInfo", retryDelay: "2.5s" }] } },
          429,
        ),
      )
      .mockResolvedValueOnce(jsonResponse(successBody()));
    vi.stubGlobal("fetch", fetchMock);
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    const promise = new GeminiVisionAdapter("test-key").extractReceipt(IMG);
    await vi.runAllTimersAsync();
    const receipt = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(receipt.narration).toBe("GFT-A3-1001");
    const delay = setTimeoutSpy.mock.calls[0]?.[1] as number | undefined;
    expect(delay).toBe(2_500);
  });

  it("fails fast on daily quota exhaustion without retrying", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: 429, message: "Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20" } }, 429),
    );
    vi.stubGlobal("fetch", fetchMock);

    const receipt = await new GeminiVisionAdapter("test-key").extractReceipt(IMG);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(receipt.isSuccessful).toBe(false);
    expect(receipt.errorReason).toMatch(/quota/i);
  });

  it("returns an errorReason after exhausting retries on garbage output", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ candidates: [{ content: { parts: [{ text: "not json at all" }] } }] }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = new GeminiVisionAdapter("test-key").extractReceipt(IMG);
    await vi.runAllTimersAsync();
    const receipt = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(receipt.isSuccessful).toBe(false);
    expect(receipt.errorReason).toBeTruthy();
  });
});
