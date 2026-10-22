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
  images: {
    remotePatterns: [
      ...(MEDIA_HOST ? [{ protocol: "https", hostname: MEDIA_HOST }] : []),
      { protocol: "https", hostname: "**.r2.dev" },
      { protocol: "https", hostname: "**.cloudflarestream.com" },
      { protocol: "https", hostname: "**.tenor.com" },
    ],
  },
};

export default nextConfig;
