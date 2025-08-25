// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PAYWALLED = ["/chat", "/call"];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Bypass: static / api / auth pages
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/og") ||
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/pricing")
  ) {
    return NextResponse.next();
  }

  // FE hints (httpOnly cookie is on backend domain; we can't read it here)
  const hasSession = req.cookies.get("fe_session")?.value === "1";
  const isPaid = req.cookies.get("fe_paid")?.value === "1";

  // Gate protected pages
  if (PAYWALLED.some((p) => pathname.startsWith(p))) {
    if (!hasSession) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?redirect=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
    if (!isPaid) {
      const url = req.nextUrl.clone();
      url.pathname = "/pricing";
      url.search = `?redirect=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!.*\\.).*)"], // all routes except files
};
