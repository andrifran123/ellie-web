"use client";
import { useEffect } from "react";

export default function AuthBoot() {
  useEffect(() => {
    const API = process.env.NEXT_PUBLIC_API_URL || "";
    if (!API) return;
    fetch(`${API}/api/auth/me`, {
      credentials: "include",
      headers: { "X-CSRF": "1" },
    })
      .then((r) => r.json())
      .then(({ email, paid }) => {
        if (email && !paid && location.pathname !== "/pricing") {
          location.replace("/pricing");
        }
      })
      .catch(() => {});
  }, []);
  return null;
}
