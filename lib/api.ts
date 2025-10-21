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
 * If NEXT_PUBLIC_API_BASE is unset, we use relative /api/* paths.
 * That makes requests go through Vercel's rewrite → first-party cookies.
 * Only set NEXT_PUBLIC_API_BASE if you intentionally want to bypass the rewrite.
 */
export const API = process.env.NEXT_PUBLIC_API_BASE ?? "";

/** Normalize a path to begin with /api, and only prefix with API if you’ve opted out of the rewrite. */
export function toApiUrl(path: string): string {
  const normalized = path.startsWith("/api")
    ? path
    : `/api${path.startsWith("/") ? "" : "/"}${path}`;
  return API ? `${API}${normalized}` : normalized;
}

/** Internal response handler: throws on 401/402/!ok; tolerates non-JSON empty bodies. */
async function handle<T>(res: Response): Promise<T> {
  if (res.status === 401) throw new Error("401_NOT_LOGGED_IN");
  if (res.status === 402) throw new Error("402_PAYMENT_REQUIRED");
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `HTTP_${res.status}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    // @ts-expect-error – allow void/undefined on endpoints that return no JSON
    return undefined;
  }
  return (await res.json()) as T;
}

/** GET helper (credentials included). */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(toApiUrl(path), { credentials: "include" });
  return handle<T>(res);
}

/** Refresh session & store csrfToken + paid flag (used by auth-boot/pricing). */
export async function refreshSession(): Promise<{ email: string | null; paid: boolean; csrfToken?: string | null }> {
  const res = await fetch(toApiUrl("/auth/me"), { credentials: "include" });
  const data = await handle<any>(res);
  csrfToken = data?.csrfToken || null;
  return { email: data?.email ?? null, paid: !!data?.paid, csrfToken };
}

/** POST JSON (includes CSRF header when available). */
export async function apiPost<T>(path: string, body?: Json): Promise<T> {
  if (!csrfToken) {
    // Soft prime; ignore errors so first POST can still work.
    try { await refreshSession(); } catch {}
  }
  const res = await fetch(toApiUrl(path), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      // These two are allowed by your backend’s CORS config
      "X-Requested-With": "XMLHttpRequest",
      "X-CSRF-Token": csrfToken || "",
    },
    body: JSON.stringify(body ?? {}),
  });
  return handle<T>(res);
}

/** POST multipart/form-data (voice uploads). */
export async function apiPostForm<T>(path: string, formData: FormData): Promise<T> {
  if (!csrfToken) {
    try { await refreshSession(); } catch {}
  }
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
