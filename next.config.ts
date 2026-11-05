import type { NextConfig } from "next";

// The site is exported as static files and served by the Cloudflare Worker (see worker/wrangler.toml),
// which lives on the same origin as the API, so no base path is needed.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
