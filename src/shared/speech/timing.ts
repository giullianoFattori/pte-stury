export type TimerScheduler = { now: () => number; setTimeout: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>; clearTimeout: (id: ReturnType<typeof setTimeout>) => void };
export const SPOKEN_RESPONSE_PREPARATION_MS = 10_000;
const systemScheduler: TimerScheduler = { now: () => performance.now(), setTimeout: (callback, ms) => setTimeout(callback, ms), clearTimeout: id => clearTimeout(id) };

/** Deadline-based countdown: callback fires once even when the event loop drifts. */
export function startCountdown(durationMs: number, onTick: (remainingMs: number) => void, onDone: () => void, scheduler: TimerScheduler = systemScheduler) {
  if (!Number.isFinite(durationMs) || durationMs < 0) throw new RangeError('Countdown duration must be finite and nonnegative.');
  const deadline = scheduler.now() + durationMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    const remaining = Math.max(0, deadline - scheduler.now()); onTick(remaining);
    if (remaining === 0) { stopped = true; onDone(); return; }
    timer = scheduler.setTimeout(tick, Math.min(100, remaining));
  };
  tick();
  return () => { stopped = true; if (timer !== undefined) scheduler.clearTimeout(timer); };
}
