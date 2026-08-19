const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

export function checkRateLimit(key: string, maxRequests = MAX_REQUESTS_PER_WINDOW): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }

  entry.count += 1;
  return { allowed: true };
}

export function rateLimitMiddleware(key: string, maxRequests?: number): Response | null {
  const result = checkRateLimit(key, maxRequests);
  if (!result.allowed) {
    return new Response(JSON.stringify({ error: "rate limit exceeded", retryAfter: result.retryAfter }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": String(result.retryAfter) },
    });
  }
  return null;
}
