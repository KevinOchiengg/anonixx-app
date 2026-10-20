import { NextResponse, type NextRequest } from "next/server";

// Only the production system domains — not a wildcard on *.vercel.app, which would also
// catch per-branch preview deployment URLs and make them unreachable for testing.
// Both the pre- and post-rename aliases are listed so old links/bookmarks still redirect.
const LEGACY_HOSTS = new Set(["anonixx-app.vercel.app", "anonixx.vercel.app"]);
const CANONICAL_HOST = "anonixx.com";

export function middleware(req: NextRequest) {
  if (LEGACY_HOSTS.has(req.nextUrl.hostname)) {
    const url = new URL(req.nextUrl.pathname + req.nextUrl.search, `https://${CANONICAL_HOST}`);
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
