import Link from "next/link";
import { BarChart3, LogOut, Settings } from "lucide-react";
import { BottomNav, SidebarNav } from "@/components/nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button, buttonClass } from "@/components/ui";
import { countDueFlashcards, getProfile } from "@/lib/dal";
import { signOut } from "../(auth)/actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [profile, dueCount] = await Promise.all([getProfile(), countDueFlashcards()]);
  const name = profile?.display_name ?? "Student";

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[240px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-panel px-4 py-5 md:flex">
        <Link href="/dashboard" className="mb-8 flex items-center gap-2.5 px-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" width={30} height={30} />
          <div>
            <p className="text-sm leading-tight font-semibold">Maturify</p>
            <p className="text-xs text-muted">Student workspace</p>
          </div>
        </Link>
        <SidebarNav dueCount={dueCount} />
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-4">
          <div className="min-w-0 px-2">
            <p className="truncate text-sm font-medium">{name}</p>
          </div>
          <div className="flex">
            <ThemeToggle />
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm" aria-label="Odhlásit se">
                <LogOut size={16} />
              </Button>
            </form>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-bg/90 px-4 py-3 backdrop-blur md:hidden">
        <Link href="/dashboard" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" width={26} height={26} />
          <span className="font-semibold">Maturify</span>
        </Link>
        <div className="flex">
          <ThemeToggle />
          <Link href="/stats" className={buttonClass({ variant: "ghost", size: "sm" })} aria-label="Statistiky">
            <BarChart3 size={16} />
          </Link>
          <Link href="/settings" className={buttonClass({ variant: "ghost", size: "sm" })} aria-label="Nastavení">
            <Settings size={16} />
          </Link>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm" aria-label="Odhlásit se">
              <LogOut size={16} />
            </Button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pt-6 pb-28 md:px-8 md:pt-10 md:pb-12">{children}</main>
      <BottomNav />
    </div>
  );
}
