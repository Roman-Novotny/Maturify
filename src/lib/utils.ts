export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function pct(value: number) {
  return `${Math.round(value * 100)} %`;
}

/** Datum v Praze jako YYYY-MM-DD (pro „dnešní" plán). */
export function todayISO(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(now);
}

export function daysUntil(iso: string, now = new Date()) {
  const ms = new Date(iso).getTime() - now.getTime();
  return Math.ceil(ms / 86_400_000);
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat("cs-CZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Prague",
  }).format(new Date(iso));
}

/** České skloňování: plural(3, ["den", "dny", "dní"]) → "dny". */
export function plural(n: number, [one, few, many]: [string, string, string]) {
  const abs = Math.abs(n);
  if (abs === 1) return one;
  if (abs >= 2 && abs <= 4) return few;
  return many;
}
