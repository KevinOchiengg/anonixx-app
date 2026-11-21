// Hosts next/image may load uploaded media from. Anything not listed is refused (HTTP 400
// from /_next/image), which shows as a blank frame where the photo should be.
//  - NEXT_PUBLIC_MEDIA_HOST: a custom domain on the R2 bucket, if one is connected later
//    (must match the backend's R2_PUBLIC_URL host).
//  - *.r2.dev: the bucket's public r2.dev address, which R2_PUBLIC_URL uses today.
//  - *.cloudflarestream.com: Stream thumbnails, used as video covers once Stream is on.
const MEDIA_HOST = process.env.NEXT_PUBLIC_MEDIA_HOST;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Admin pages merged into others; old links (alerts, bookmarks) still land.
  async redirects() {
    return [
      { source: "/admin/kanban", destination: "/admin/refunds?tab=board", permanent: false },
      { source: "/admin/deception-reports", destination: "/admin/moderation?tab=deception", permanent: false },
      { source: "/admin/health", destination: "/admin/alerts?tab=health", permanent: false },
      { source: "/admin/calendar", destination: "/admin/post", permanent: false },
    ];
  },
  images: {
    // Serve media straight from R2/Stream. Uploads are already compressed, and Vercel's image
    // optimizer has a monthly quota; once it runs out every <Image> returns 402 and shows blank.
    unoptimized: true,
    remotePatterns: [
      ...(MEDIA_HOST ? [{ protocol: "https", hostname: MEDIA_HOST }] : []),
      { protocol: "https", hostname: "**.r2.dev" },
      { protocol: "https", hostname: "**.cloudflarestream.com" },
      { protocol: "https", hostname: "**.tenor.com" },
    ],
  },
};

export default nextConfig;
