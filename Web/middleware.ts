import { NextResponse, type NextRequest } from "next/server";

// Redirect only the old public host. Not *.vercel.app, which would break preview deployments.
const LEGACY_HOSTS = new Set(["anonixx-app.vercel.app"]);
const CANONICAL_HOST = "anonixx.com";

// Vercel geolocates every request. Country goes into a cookie the browser sends to the API as
// X-Country (local confessions first); region and city ride along with visit analytics.
const COUNTRY_COOKIE = "anx_cc";   // read back in lib/api.ts (viewerCountry)
const PLACE_COOKIE = "anx_geo";    // read back in lib/api.ts (viewerPlace)
const COOKIE_OPTIONS = { path: "/", maxAge: 60 * 60 * 24 * 7, sameSite: "lax" } as const;

function placeOf(req: NextRequest): string | null {
  const region = req.headers.get("x-vercel-ip-country-region") || "";
  let city = req.headers.get("x-vercel-ip-city") || "";
  try { city = decodeURIComponent(city); } catch { city = ""; }
  return region || city ? `${region}|${city}` : null;
}

export function middleware(req: NextRequest) {
  if (LEGACY_HOSTS.has(req.nextUrl.hostname)) {
    const url = new URL(req.nextUrl.pathname + req.nextUrl.search, `https://${CANONICAL_HOST}`);
    return NextResponse.redirect(url, 308);
  }
  const res = NextResponse.next();
  const country = req.headers.get("x-vercel-ip-country");
  if (country && /^[A-Z]{2}$/.test(country) && req.cookies.get(COUNTRY_COOKIE)?.value !== country) {
    res.cookies.set(COUNTRY_COOKIE, country, COOKIE_OPTIONS);
  }
  const place = placeOf(req);
  if (place && req.cookies.get(PLACE_COOKIE)?.value !== place) {
    res.cookies.set(PLACE_COOKIE, place, COOKIE_OPTIONS);
  }
  return res;
}

// Page visits only: no files, share images, sitemap or link prefetches.
export const config = {
  matcher: [
    {
      source: "/((?!_next/|og(?:/|$)|sounds/|sitemap.xml|robots.txt|sw.js|favicon.ico|.*\\.(?:png|jpe?g|svg|webp|gif|ico|mp3|mp4|js|css|txt|xml|json|woff2?)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
