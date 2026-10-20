// Hostname (no protocol/path) that serves uploaded media (avatars, drop photos/videos) —
// must match the backend's R2_PUBLIC_URL domain. Placeholder until R2 is set up; set
// NEXT_PUBLIC_MEDIA_HOST once it is, or next/image will refuse to load real media.
const MEDIA_HOST = process.env.NEXT_PUBLIC_MEDIA_HOST || "media.anonixx.com";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: MEDIA_HOST },
      { protocol: "https", hostname: "**.tenor.com" },
    ],
  },
};

export default nextConfig;
