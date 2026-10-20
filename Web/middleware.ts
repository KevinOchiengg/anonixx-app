import { NextResponse, type NextRequest } from "next/server";

// Only the one publicly-reachable legacy host — not a wildcard on *.vercel.app, which
// would also catch per-branch preview deployment URLs and make them unreachable for
// testing. The project's new team-scoped alias (anonixx-anonixx1.vercel.app) sits behind
// Vercel's own SSO gate and isn't publicly reachable, so it needs no redirect here.
// anonixx.vercel.app (bare, no team suffix) belongs to an unrelated third-party project —
// renaming this project did not grant us that name.
const LEGACY_HOSTS = new Set(["anonixx-app.vercel.app"]);
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
