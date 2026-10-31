import type { NextConfig } from "next";

// Cache Components jsou vypnuté: skoro celá appka je per-uživatel (Supabase session v cookies).
const nextConfig: NextConfig = {
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
