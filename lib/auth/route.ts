import { verifySessionToken } from "./session";

export function parseCookies(header: string | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out.set(part.slice(0, idx).trim(), part.slice(idx + 1).trim());
  }
  return out;
}

export function getSessionMerchantId(request: Request): string | null {
  const cookies = parseCookies(request.headers.get("cookie"));
  const token = cookies.get("zd_session");
  const session = verifySessionToken(token);
  return session?.merchantId ?? null;
}
