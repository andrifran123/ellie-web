"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { refreshSession } from "@/lib/api";

/**
 * Runs once on mount and whenever the path changes.
 * - If logged out: never redirect.
 * - If logged in but unpaid: redirect ONLY when trying to use protected pages (/chat, /call).
 */
export default function AuthBoot() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { email, paid } = await refreshSession();
        if (cancelled) return;

        if (!email) return; // not logged in -> allow all public pages

        const protectedRoutes = ["/chat", "/call"];
        const onProtected = protectedRoutes.some((p) => pathname.startsWith(p));

        if (onProtected && !paid) {
          router.replace("/pricing?reason=subscribe");
        }
      } catch {
        // ignore boot errors; never hard-fail the page
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return null;
}
