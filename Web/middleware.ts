import { NextResponse, type NextRequest } from "next/server";

// Only the production system domain — not a wildcard on *.vercel.app, which would also
// catch per-branch preview deployment URLs and make them unreachable for testing.
const LEGACY_HOST = "anonixx-app.vercel.app";
const CANONICAL_HOST = "anonixx.com";

export function middleware(req: NextRequest) {
  if (req.nextUrl.hostname === LEGACY_HOST) {
    const url = new URL(req.nextUrl.pathname + req.nextUrl.search, `https://${CANONICAL_HOST}`);
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
