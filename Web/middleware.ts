import { NextResponse, type NextRequest } from "next/server";

// Redirect only the old public host. Not *.vercel.app, which would break preview deployments.
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
