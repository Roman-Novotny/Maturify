"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, CalendarCheck, LayoutDashboard, Settings, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Přehled", icon: LayoutDashboard },
  { href: "/subjects", label: "Předměty", icon: BookOpen },
  { href: "/plan", label: "Plán", icon: CalendarCheck },
  { href: "/tutor", label: "AI Tutor", icon: Sparkles },
  { href: "/settings", label: "Nastavení", icon: Settings },
] as const;

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav() {
  const isActive = useIsActive();
  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
            isActive(href) ? "bg-primary/15 text-primary" : "text-muted hover:bg-panel-2 hover:text-text",
          )}
        >
          <Icon size={18} />
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav() {
  const isActive = useIsActive();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="grid grid-cols-5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className={cn(
                "flex flex-col items-center gap-1 py-2 text-[11px] font-medium",
                isActive(href) ? "text-primary" : "text-muted",
              )}
            >
              <Icon size={20} />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
