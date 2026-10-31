"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";

type Theme = "dark" | "light";

export function applyTheme(theme: Theme | "system") {
  const resolved = theme === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : theme;
  document.documentElement.dataset.theme = resolved;
  try {
    localStorage.setItem("maturify-theme", theme);
  } catch {}
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- téma je známé až v prohlížeči
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);

  const next = theme === "light" ? "dark" : "light";
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={`Přepnout na ${next === "light" ? "světlý" : "tmavý"} režim`}
      onClick={() => {
        applyTheme(next);
        setTheme(next);
      }}
    >
      {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
    </Button>
  );
}
