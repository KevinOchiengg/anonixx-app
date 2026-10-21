import { NextResponse, type NextRequest } from "next/server";

// Only the one publicly-reachable legacy host — not a wildcard on *.vercel.app, which
// would also catch per-branch preview deployment URLs and make them unreachable for
// testing. The project's new team-scoped alias (anonixx-anonixx1.vercel.app) sits behind
// Vercel's own SSO gate and isn't publicly reachable, so it needs no redirect here.
// anonixx.vercel.app (bare, no team suffix) belongs to an unrelated third-party project —
// renaming this project did not grant us that name.
const LEGACY_HOSTS = new Set(["anonixx-app.vercel.app"]);
const CANONICAL_HOST = "anonixx.com";

// The visitor's country (Vercel geolocates every request) goes into a cookie the browser
// sends to the API as X-Country, so the feed can put local confessions first.
const COUNTRY_COOKIE = "anx_cc";   // read back in lib/api.ts (viewerCountry)

export function middleware(req: NextRequest) {
  if (LEGACY_HOSTS.has(req.nextUrl.hostname)) {
    const url = new URL(req.nextUrl.pathname + req.nextUrl.search, `https://${CANONICAL_HOST}`);
    return NextResponse.redirect(url, 308);
  }
  const res = NextResponse.next();
  const country = req.headers.get("x-vercel-ip-country");
  if (country && /^[A-Z]{2}$/.test(country) && req.cookies.get(COUNTRY_COOKIE)?.value !== country) {
    res.cookies.set(COUNTRY_COOKIE, country, { path: "/", maxAge: 60 * 60 * 24 * 7, sameSite: "lax" });
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
