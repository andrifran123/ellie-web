// /lib/api.ts

// A minimal JSON type for typed request bodies (no `any`)
type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

// CSRF token cached in-memory
let csrfToken: string | null = null;

export const API = process.env.NEXT_PUBLIC_API_URL || "";

export async function refreshSession(): Promise<{ email: string | null; paid: boolean }> {
  const r = await fetch(`${API}/api/auth/me`, { credentials: "include" });
  const data = await r.json().catch(() => ({} as Record<string, unknown>));
  csrfToken = (data as { csrfToken?: string }).csrfToken ?? null;
  return {
    email: (data as { email?: string | null }).email ?? null,
    paid: Boolean((data as { paid?: boolean }).paid),
  };
}

export async function apiPost<T, B extends Json | undefined = undefined>(
  path: string,
  body?: B
): Promise<T> {
  if (!csrfToken) await refreshSession(); // get token if missing

  const payload: Json = (body === undefined ? {} : body) as Json;

  const res = await fetch(`${API}${path}`, {
    method: "POST",
    credentials: "include", // send httpOnly cookie
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "X-CSRF-Token": csrfToken || "",
    },
    body: JSON.stringify(payload),
  });

  if (res.status === 401) throw new Error("401_NOT_LOGGED_IN");
  if (res.status === 402) throw new Error("402_PAYMENT_REQUIRED");
  if (!res.ok) throw new Error(`HTTP_${res.status}`);

  return (await res.json()) as T;
}

export async function apiPostForm<T>(path: string, formData: FormData): Promise<T> {
  if (!csrfToken) await refreshSession();

  const res = await fetch(`${API}${path}`, {
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

  return (await res.json()) as T;
}
