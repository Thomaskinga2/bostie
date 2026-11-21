import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // TQuest is a local-first client app: every screen reads the player's progress from
  // the browser, so there is no server-rendered content for Cache Components / partial
  // prefetching to cache. Both are left off.
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
