// app/(providers)/auth-boot.tsx
"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { refreshSession } from "@/lib/api";

/**
 * Only guards real PROTECTED pages (/chat, /call).
 * - If logged out or unpaid AND trying to open a protected page → send to /pricing
 * - Never blocks public pages.
 */
export default function AuthBoot() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { email, paid } = await refreshSession();
        if (cancelled) return;

        const protectedRoutes = ["/chat", "/call"];
        const onProtected = protectedRoutes.some((p) => pathname?.startsWith(p));

        if (onProtected) {
          // not logged in → pricing
          if (!email) {
            router.replace(`/pricing?redirect=${encodeURIComponent(pathname || "/chat")}`);
            return;
          }
          // logged in but unpaid → pricing
          if (!paid) {
            router.replace(`/pricing?redirect=${encodeURIComponent(pathname || "/chat")}`);
            return;
          }
        }
      } catch {
        // don’t crash page if /api/auth/me fails
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return null;
}
