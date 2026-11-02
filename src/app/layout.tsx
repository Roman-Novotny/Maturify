import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { ServiceWorkerRegister } from "@/components/pwa";
import "katex/dist/katex.min.css";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin", "latin-ext"] });

export const metadata: Metadata = {
  title: { default: "Maturify", template: "%s · Maturify" },
  description: "Osobní maturitní operační centrum – plán, témata, procvičování a pokrok.",
  applicationName: "Maturify",
  appleWebApp: { capable: true, title: "Maturify", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#101218",
};

// Nastaví téma před vykreslením, aby neproblikl špatný režim.
const themeScript = `try{var t=localStorage.getItem('maturify-theme')||'dark';if(t==='system')t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="cs" data-theme="dark" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full font-sans">
        {children}
        <ServiceWorkerRegister />
        {/* beforeInteractive: spustí se před hydratací, takže téma nebliká. */}
        <Script id="theme" strategy="beforeInteractive">
          {themeScript}
        </Script>
      </body>
    </html>
  );
}
