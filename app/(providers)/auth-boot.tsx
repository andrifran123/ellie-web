// app/(providers)/auth-boot.tsx
"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { refreshSession } from "@/lib/api";

/**
 * AuthBoot
 * - Dev/testing: set NEXT_PUBLIC_DISABLE_PAYWALL="1" to make this a no-op.
 * - Otherwise: if logged in but unpaid, and trying /chat or /call, redirect to /pricing.
 */
export default function AuthBoot() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Dev: disable gating entirely
    if (process.env.NEXT_PUBLIC_DISABLE_PAYWALL === "1") return;

    let cancelled = false;

    (async () => {
      try {
        const { email, paid } = await refreshSession();
        if (cancelled) return;

        // Not logged in → allow public pages
        if (!email) return;

        const protectedRoutes = ["/chat", "/call"];
        const onProtected = protectedRoutes.some((p) => pathname.startsWith(p));

        if (onProtected && !paid) {
          router.replace(
            `/pricing?reason=subscribe&redirect=${encodeURIComponent(pathname)}`
          );
        }
      } catch {
        // never hard-fail the page
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return null;
}
