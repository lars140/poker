import type { NextConfig } from "next";

const [repositoryOwner, repositoryName] = process.env.GITHUB_REPOSITORY?.split("/") ?? [];
const isUserOrOrganizationSite = repositoryName?.toLowerCase() === `${repositoryOwner?.toLowerCase()}.github.io`;
// PAGES_BASE_PATH is set by `npm run build:docs` for branch-based Pages deployments.
const basePath = process.env.PAGES_BASE_PATH
  ?? (process.env.GITHUB_ACTIONS === "true" && repositoryName && !isUserOrOrganizationSite
    ? `/${repositoryName}`
    : "");

const nextConfig: NextConfig = {
  output: "export",
  basePath,
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
