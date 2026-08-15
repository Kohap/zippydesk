import type { VisionExtractor, VisionReceipt } from "../ports/vision";

const EXTRACT_PROMPT =
  "You extract data from Nigerian bank transfer receipts. " +
  "Read EVERY text field on the receipt, including the rows below the horizontal divider " +
  "(Narration, Amount, Date). narration is the transfer narration line exactly as shown " +
  "(often an alphanumeric code like 'GFT-A3-1001'). " +
  "amountNaira is the transfer amount as a plain number string WITHOUT symbols or decimals (e.g. '1500' for N1,500). " +
  "isSuccessful is true only when the receipt clearly shows a completed debit or credit. " +
  "If the image is not a receipt, set isSuccessful=false and explain in errorReason. " +
  "Return ONLY a JSON object with keys: narration, amountNaira, senderName, date, isSuccessful, confidence, errorReason.";

const RESPONSE_SCHEMA = undefined;

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

export class GeminiVisionAdapter implements VisionExtractor {
  constructor(
    private apiKey: string,
    private model = "gemini-3.7-flash",
  ) {}

  async extractReceipt(imageBytes: Buffer): Promise<VisionReceipt> {
    const MAX_ATTEMPTS = 3;
    const MAX_BACKOFF_MS = 60_000;
    let lastError: Error | null = null;
    let retryHintMs: number | null = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        const delay = retryHintMs ?? 2 ** attempt * 1_000;
        await new Promise((r) => setTimeout(r, Math.min(delay, MAX_BACKOFF_MS)));
      }
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { text: EXTRACT_PROMPT },
                    { inlineData: { mimeType: "image/png", data: imageBytes.toString("base64") } },
                  ] as GeminiPart[],
                },
              ],
              generationConfig: {
                responseMimeType: "application/json",
                responseSchema: RESPONSE_SCHEMA,
                temperature: 0,
              },
            }),
          },
        );
        if (res.status === 429 || res.status === 503 || res.status >= 500) {
          const body = await res.text();
          if (isDailyQuotaExhausted(body)) {
            lastError = new Error(`Gemini daily quota exhausted (no retries): ${firstLine(body)}`);
            break;
          }
          lastError = new Error(`Gemini API error ${res.status}: ${firstLine(body)}`);
          retryHintMs = parseRetryDelay(body);
          continue;
        }
        if (!res.ok) {
          throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
        }
        const data = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        const json = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
        const parsed = JSON.parse(json) as {
          narration?: string | null;
          amountNaira?: string | null;
          senderName?: string | null;
          date?: string | null;
          isSuccessful?: boolean;
          confidence?: number;
          errorReason?: string | null;
        };
        const amountNaira = parsed.amountNaira?.replace(/[^0-9.]/g, "");
        const amountKobo = amountNaira ? Math.round(parseFloat(amountNaira) * 100) : null;
        return {
          narration: parsed.narration ?? null,
          amountKobo,
          senderName: parsed.senderName ?? null,
          isSuccessful: parsed.isSuccessful === true && (parsed.confidence ?? 0) >= 0.5,
          confidence: parsed.confidence ?? 0,
          errorReason: parsed.errorReason ?? null,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        continue;
      }
    }
    return {
      narration: null,
      amountKobo: null,
      senderName: null,
      isSuccessful: false,
      confidence: 0,
      errorReason: lastError?.message ?? "Gemini API unreachable",
    };
  }
}

function firstLine(body: string): string {
  return body.split("\n")[0]?.slice(0, 200) ?? body;
}

function isDailyQuotaExhausted(body: string): boolean {
  return /Quota exceeded|generate_content_free_tier_requests/i.test(body);
}

function parseRetryDelay(body: string): number | null {
  const m = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(body);
  return m?.[1] ? Math.max(0, parseFloat(m[1])) * 1_000 : null;
}