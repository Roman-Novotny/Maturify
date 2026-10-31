"use client";

import { Select } from "@/components/ui";
import { applyTheme } from "@/components/theme-toggle";

export function ThemeSelect({ defaultValue }: { defaultValue: "dark" | "light" | "system" }) {
  return (
    <Select
      id="theme"
      name="theme"
      defaultValue={defaultValue}
      onChange={(e) => applyTheme(e.target.value as "dark" | "light" | "system")}
    >
      <option value="dark">Tmavý</option>
      <option value="light">Světlý</option>
      <option value="system">Podle systému</option>
    </Select>
  );
}
