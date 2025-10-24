// lib/api.ts
type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

let csrfToken: string | null = null;

/**
 * Keep HTTP on same-origin (via Vercel rewrites) for cookies/CSRF.
 * Do NOT set NEXT_PUBLIC_API_BASE if it breaks login.
 */
export const API = ""; // leave empty on purpose

/** WebSocket can use a separate origin safely (no cookies needed). */
export const WS_ORIGIN = process.env.NEXT_PUBLIC_WS_ORIGIN ?? "";

/** Normalize API URLs for HTTP (still uses /api/... through Vercel). */
export function toApiUrl(path: string): string {
  const normalized = path.startsWith("/api")
    ? path
    : `/api${path.startsWith("/") ? "" : "/"}${path}`;
  return normalized; // stays relative → Vercel rewrites
}

/** Convert HTTP(S) URL to WS(S). */
export function httpToWs(url: string) {
  if (url.startsWith("wss://") || url.startsWith("ws://")) return url;
  if (url.startsWith("https://")) return url.replace("https://", "wss://");
  if (url.startsWith("http://")) return url.replace("http://", "ws://");
  return url;
}

/** Build WS URL: direct to Render when WS_ORIGIN is set, else via Vercel rewrite. */
export function buildWsUrl() {
  const base = WS_ORIGIN || window.location.origin;
  const wsPath = WS_ORIGIN ? "/ws/phone" : "/api/ws/phone";
  return httpToWs(`${base}${wsPath}`);
}

/** Simple handler for JSON + HTTP errors. */
async function handle<T>(res: Response): Promise<T> {
  if (res.status === 401) throw new Error("401_NOT_LOGGED_IN");
  if (res.status === 402) throw new Error("402_PAYMENT_REQUIRED");
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return (await res.json()) as T;
}

type MeApi = { email?: string | null; paid?: boolean; csrfToken?: string | null };

export async function refreshSession(): Promise<{ email: string | null; paid: boolean }> {
  const res = await fetch(toApiUrl("/auth/me"), { credentials: "include" });
  const data = await handle<MeApi>(res);
  csrfToken = data?.csrfToken ?? null;
  return { email: data?.email ?? null, paid: !!data?.paid };
}

export async function apiPost<T>(path: string, body?: Json): Promise<T> {
  if (!csrfToken) await refreshSession();
  const res = await fetch(toApiUrl(path), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "X-CSRF-Token": csrfToken || "",
    },
    body: JSON.stringify(body ?? {}),
  });
  return handle<T>(res);
}

export async function apiPostForm<T>(path: string, formData: FormData): Promise<T> {
  if (!csrfToken) await refreshSession();
  const res = await fetch(toApiUrl(path), {
    method: "POST",
    credentials: "include",
    headers: {
      "X-Requested-With": "XMLHttpRequest",
      "X-CSRF-Token": csrfToken || "",
    },
    body: formData,
  });
  return handle<T>(res);
}
