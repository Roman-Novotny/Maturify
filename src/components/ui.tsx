import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn, pct } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-border bg-panel p-5 shadow-sm", className)} {...props} />;
}

export function CardTitle({ children, action, icon }: { children: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-muted uppercase">
        {icon}
        {children}
      </h2>
      {action}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export function buttonClass({ variant = "primary", size = "md" }: Pick<ButtonProps, "variant" | "size"> = {}) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-50",
    size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4 text-sm",
    variant === "primary" && "bg-primary text-primary-fg hover:brightness-110",
    variant === "secondary" && "border border-border bg-panel-2 text-text hover:border-primary/60",
    variant === "ghost" && "text-muted hover:bg-panel-2 hover:text-text",
    variant === "danger" && "text-danger hover:bg-danger/10",
  );
}

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonClass({ variant, size }), className)} {...props} />;
}

const fieldClass =
  "rounded-xl border border-border bg-panel-2 px-3 py-2 text-sm text-text placeholder:text-muted/70 outline-none transition-colors focus:border-primary";

// Bez tailwind-merge: výchozí w-full jen když volající nenastavil vlastní šířku.
const width = (className?: string) => (/(^|\s)(w-|max-w-)/.test(className ?? "") ? "" : "w-full");

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClass, width(className), "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldClass, width(className), "min-h-20", className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldClass, width(className), "h-10", className)} {...props} />;
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-text">
      {children}
    </label>
  );
}

export function ProgressBar({ value, color = "var(--primary)" }: { value: number; color?: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-panel-2" role="progressbar" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${v * 100}%`, background: color }} />
    </div>
  );
}

export function ProgressRing({ value, size = 120, stroke = 10, color = "var(--primary)", children }: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
}) {
  const v = Math.max(0, Math.min(1, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--panel-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/** Štítek: barvu nese tečka a podklad, text zůstává v textové barvě (čitelnost ve světlém režimu). */
export function Badge({ children, color }: { children: ReactNode; color?: string }) {
  const c = color ?? "var(--primary)";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium text-text"
      style={{ background: `color-mix(in srgb, ${c} 16%, transparent)` }}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: c }} aria-hidden />
      {children}
    </span>
  );
}

export function SubjectIcon({ short, color, size = 40 }: { short: string; color: string; size?: number }) {
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-xl border-2 font-bold text-text"
      style={{ width: size, height: size, fontSize: size * 0.36, background: `color-mix(in srgb, ${color} 18%, transparent)`, borderColor: color }}
    >
      {short}
    </span>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function ScoreText({ score, className }: { score: number; className?: string }) {
  return (
    <span
      className={cn(
        "w-14 shrink-0 text-right font-medium whitespace-nowrap tabular-nums",
        score >= 0.7 ? "text-success" : score >= 0.4 ? "text-warning" : "text-danger",
        className,
      )}
    >
      {pct(score)}
    </span>
  );
}
