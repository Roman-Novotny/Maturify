"use client";

import { useEffect, useState, useTransition } from "react";
import { Pause, Play, Square } from "lucide-react";
import { Button } from "@/components/ui";
import { finishTimedTask } from "../actions";

type TimerState = { elapsedMs: number; runningSince: number | null };

const key = (taskId: string) => `maturify-timer-${taskId}`;

function load(taskId: string): TimerState {
  try {
    const raw = localStorage.getItem(key(taskId));
    if (raw) return JSON.parse(raw) as TimerState;
  } catch {}
  return { elapsedMs: 0, runningSince: null };
}

function save(taskId: string, state: TimerState | null) {
  try {
    if (state) localStorage.setItem(key(taskId), JSON.stringify(state));
    else localStorage.removeItem(key(taskId));
  } catch {}
}

/** Časovač soustředění u úkolu. Stav přežije obnovení stránky (localStorage), na konci zapíše skutečné minuty. */
export function TaskTimer({ taskId, plannedMinutes }: { taskId: string; plannedMinutes: number }) {
  const [state, setState] = useState<TimerState>({ elapsedMs: 0, runningSince: null });
  const [now, setNow] = useState(0);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const s = load(taskId);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- stav časovače je známý až v prohlížeči
    setState(s);
    setOpen(s.elapsedMs > 0 || s.runningSince !== null);
    setNow(Date.now());
  }, [taskId]);

  useEffect(() => {
    if (!state.runningSince) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [state.runningSince]);

  const update = (s: TimerState) => {
    setState(s);
    save(taskId, s);
  };
  const elapsed = state.elapsedMs + (state.runningSince ? Math.max(0, now - state.runningSince) : 0);
  const mm = Math.floor(elapsed / 60000);
  const ss = Math.floor((elapsed % 60000) / 1000);
  const overtime = mm >= plannedMinutes;

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        aria-label="Spustit časovač"
        title="Spustit časovač"
        onClick={() => {
          setOpen(true);
          setNow(Date.now());
          update({ elapsedMs: 0, runningSince: Date.now() });
        }}
      >
        <Play size={14} />
      </Button>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <span className={`w-12 text-right text-xs font-medium tabular-nums ${overtime ? "text-success" : "text-primary"}`} role="timer">
        {mm}:{String(ss).padStart(2, "0")}
      </span>
      {state.runningSince ? (
        <Button variant="ghost" size="sm" aria-label="Pozastavit" onClick={() => update({ elapsedMs: elapsed, runningSince: null })}>
          <Pause size={14} />
        </Button>
      ) : (
        <Button variant="ghost" size="sm" aria-label="Pokračovat" onClick={() => update({ elapsedMs: state.elapsedMs, runningSince: Date.now() })}>
          <Play size={14} />
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        aria-label="Ukončit a zapsat čas"
        title="Hotovo – zapíše odučený čas"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await finishTimedTask(taskId, Math.max(1, Math.round(elapsed / 60000)));
            save(taskId, null);
            setOpen(false);
          })
        }
      >
        <Square size={14} />
      </Button>
    </span>
  );
}
