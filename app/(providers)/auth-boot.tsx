// app/(providers)/auth-boot.tsx
"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const toApi = (path: string) =>
  path.startsWith("/api") ? path : `/api${path.startsWith("/") ? "" : "/"}${path}`;

type MeResponse = { email: string | null; paid: boolean };

export default function AuthBoot() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const guard = async () => {
      try {
        const protectedRoutes = ["/chat", "/call"];
        const onProtected = protectedRoutes.some((p) => pathname?.startsWith(p));

        if (!onProtected) return; // public page → do nothing

        const here = `${pathname || "/chat"}`;
        const toLogin = `/login?redirect=${encodeURIComponent(here)}`;
        const toPricing = `/pricing?redirect=${encodeURIComponent(here)}`;

        const r = await fetch(toApi("/auth/me"), { credentials: "include" });

        // Not logged in
        if (r.status === 401) {
          if (!cancelled) router.replace(toLogin);
          return;
        }

        const me = (await r.json()) as MeResponse;

        // Missing email → treat as logged out
        if (!me?.email) {
          if (!cancelled) router.replace(toLogin);
          return;
        }

        // Logged in but unpaid → pricing
        if (!me.paid) {
          if (!cancelled) router.replace(toPricing);
          return;
        }

        // else: logged in + paid → allow render
      } catch {
        // Fail soft: don't crash the page. If you prefer, you can send to /login here.
      }
    };

    guard();
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return null;
}
