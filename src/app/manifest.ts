import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Maturify",
    short_name: "Maturify",
    description: "Osobní maturitní operační centrum",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#101218",
    theme_color: "#101218",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
