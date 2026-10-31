import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

/** Content-Security-Policy s jednorázovou noncí – Next ji sám přidá ke svým skriptům. */
function contentSecurityPolicy(nonce: string) {
  const isDev = process.env.NODE_ENV === "development";
  const supabaseWs = SUPABASE.replace(/^https:/, "wss:");
  return `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""};
    style-src 'self' 'nonce-${nonce}';
    style-src-attr 'unsafe-inline';
    img-src 'self' blob: data: ${SUPABASE};
    font-src 'self';
    connect-src 'self' ${SUPABASE} ${supabaseWs}${isDev ? " ws://localhost:* http://localhost:*" : ""};
    media-src 'self' blob:;
    worker-src 'self';
    manifest-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    ${isDev ? "" : "upgrade-insecure-requests;"}
  `
    .replace(/\s{2,}/g, " ")
    .trim();
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = await updateSession(request, requestHeaders);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Statické soubory, service worker a statická offline stránka (bez nonce) se vynechávají.
      source:
        "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline|icons/|icon.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    },
  ],
};
