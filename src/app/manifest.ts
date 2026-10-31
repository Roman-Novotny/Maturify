import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/dashboard",
    name: "Maturify",
    short_name: "Maturify",
    description: "Osobní maturitní operační centrum – plán, témata, kartičky, testy a AI tutor.",
    lang: "cs",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#101218",
    theme_color: "#101218",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcuts: [
      { name: "Opakování kartiček", url: "/review", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Dnešní plán", url: "/plan", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "AI Tutor", url: "/tutor", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
