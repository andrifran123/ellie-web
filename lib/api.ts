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
 * Normalizes a path to always begin with /api
 */
function toApiPath(path: string): string {
  return path.startsWith("/api")
    ? path
    : `/api${path.startsWith("/") ? "" : "/"}${path}`;
}

/**
 * Refresh the current session and grab csrfToken + subscription state
 */
export async function refreshSession(): Promise<{ email: string | null; paid: boolean }> {
  const r = await fetch(toApiPath("/auth/me"), { credentials: "include" });
  const data = await r.json();
  csrfToken = data?.csrfToken || null;
  return { email: data?.email ?? null, paid: !!data?.paid };
}

/**
 * POST JSON
 */
export async function apiPost<T>(path: string, body?: Json): Promise<T> {
  if (!csrfToken) await refreshSession(); // ensure csrf token

  const res = await fetch(toApiPath(path), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "X-CSRF-Token": csrfToken || "",
    },
    body: JSON.stringify(body ?? {}),
  });

  if (res.status === 401) throw new Error("401_NOT_LOGGED_IN");
  if (res.status === 402) throw new Error("402_PAYMENT_REQUIRED");
  if (!res.ok) throw new Error(`HTTP_${res.status}`);

  return res.json();
}

/**
 * POST FormData
 */
export async function apiPostForm<T>(path: string, formData: FormData): Promise<T> {
  if (!csrfToken) await refreshSession();

  const res = await fetch(toApiPath(path), {
    method: "POST",
    credentials: "include",
    headers: {
      "X-Requested-With": "XMLHttpRequest",
      "X-CSRF-Token": csrfToken || "",
    },
    body: formData,
  });

  if (res.status === 401) throw new Error("401_NOT_LOGGED_IN");
  if (res.status === 402) throw new Error("402_PAYMENT_REQUIRED");
  if (!res.ok) throw new Error(`HTTP_${res.status}`);

  return res.json();
}
