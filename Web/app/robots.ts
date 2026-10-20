import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/api";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/dashboard",
          "/chat",
          "/chat-setup",
          "/inbox",
          "/saved",
          "/settings",
          "/change-password",
          "/forgot-password",
          "/delete-account",
          "/profile",
          "/blocked",
          "/location",
          "/moderation",
          "/referrals",
          "/search",
          "/compose",
          "/ads",
          "/market",
          "/vibe",
          "/coins",
          "/premium",
          "/whatsapp",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
