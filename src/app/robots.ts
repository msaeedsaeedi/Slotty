import type { MetadataRoute } from "next";

/** Only the public pages are for search engines; everything else needs an account. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: ["/$", "/privacy"], disallow: "/" } };
}
