export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(closest-side, var(--primary), transparent), radial-gradient(closest-side, var(--secondary), transparent)" }}
      />
      <div className="animate-in relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" width={48} height={48} className="mb-3" />
          <h1 className="text-2xl font-semibold tracking-tight">Maturify</h1>
          <p className="mt-1 text-sm text-muted">Tvoje maturitní operační centrum</p>
        </div>
        <div className="rounded-2xl border border-border bg-panel p-6 shadow-xl">{children}</div>
      </div>
    </main>
  );
}
