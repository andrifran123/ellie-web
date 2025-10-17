// middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Edge gate for protected pages.
 * - If not logged in (401/me)  → /login?redirect=<original>
 * - If logged in but unpaid    → /pricing?redirect=<original>
 * - Else                       → allow
 *
 * Security is still enforced by your API; this is fast UX.
 */
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  const isProtected =
    pathname.startsWith("/chat") || pathname.startsWith("/call");

  if (!isProtected) return NextResponse.next();

  // Call our own API with the user's cookies so it can read the httpOnly session
  const meUrl = new URL("/api/auth/me", req.url);

  let res: Response;
  try {
    res = await fetch(meUrl, {
      headers: {
        // forward cookies to the API route
        cookie: req.headers.get("cookie") ?? "",
      },
    });
  } catch {
    // If API is down, fail closed to login
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?redirect=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  // Not logged in
  if (res.status === 401) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?redirect=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  // Logged in → check body
  try {
    const me = (await res.json()) as { email: string | null; paid: boolean };

    if (!me?.email) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?redirect=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }

    if (!me.paid) {
      const url = req.nextUrl.clone();
      url.pathname = "/pricing";
      url.search = `?redirect=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
  } catch {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?redirect=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/chat/:path*", "/call/:path*"],
};
