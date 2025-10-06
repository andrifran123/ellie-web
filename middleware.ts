// middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * UX-only guard: if user is not "authed" (hint cookie),
 * redirect to /login?redirect=<original>
 * Security is enforced by your API, not this middleware.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Only guard these page routes
  const isProtected =
    pathname.startsWith("/chat") || pathname.startsWith("/call");

  if (!isProtected) return NextResponse.next();

  // Tiny hint cookie set by login/signup (NOT security)
  const authed = req.cookies.get("ellie_authed")?.value === "1";
  if (!authed) {
    const dest = encodeURIComponent(`${pathname}${search}`);
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?redirect=${dest}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/chat/:path*", "/call/:path*"],
};
