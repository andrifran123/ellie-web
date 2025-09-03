// lib/api.ts
type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

let csrfToken: string | null = null;

export const API = process.env.NEXT_PUBLIC_API_URL || "";

export async function refreshSession(): Promise<{ email: string | null; paid: boolean }> {
  const r = await fetch(`${API}/api/auth/me`, { credentials: "include" });
  const data = await r.json();
  csrfToken = data?.csrfToken || null;
  return { email: data?.email ?? null, paid: !!data?.paid };
}

// --- POST (JSON) ------------------------------------------------------------
// Overloads so TS accepts 1-arg and 2-arg usages.
export async function apiPost<T>(path: string, body: Json): Promise<T>;
export async function apiPost<T>(path: string): Promise<T>;
export async function apiPost<T>(path: string, body?: Json): Promise<T> {
  if (!csrfToken) await refreshSession(); // get CSRF if missing

  const res = await fetch(`${API}${path}`, {
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

// --- POST (FormData) --------------------------------------------------------
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
  return res.json();
}
