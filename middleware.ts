// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED = [/^\/chat(?:\/|$)/, /^\/call(?:\/|$)/];

export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();
  const needsAuth = PROTECTED.some((re) => re.test(url.pathname));
  if (!needsAuth) return NextResponse.next();

  const session = req.cookies.get("session")?.value;
  const paid = req.cookies.get("paid")?.value;

  if (!session) {
    url.pathname = "/login";
    url.searchParams.set("redirect", url.pathname);
    return NextResponse.redirect(url);
  }
  if (paid !== "1") {
    url.pathname = "/pricing";
    url.searchParams.set("redirect", url.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/chat/:path*", "/call/:path*"] };
