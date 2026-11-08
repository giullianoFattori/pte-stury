export const ANSWER_SHORT_QUESTION_RESPONSE_MS = 10_000;
export function startAnswerShortQuestionTimer(onTick: (remainingMs: number) => void, onComplete: () => void) {
  const started = performance.now(); let stopped = false; let timer = 0;
  const tick = () => { if (stopped) return; const remaining = Math.max(0, ANSWER_SHORT_QUESTION_RESPONSE_MS - (performance.now() - started)); onTick(remaining); if (remaining <= 0) { stopped = true; onComplete(); } else timer = window.setTimeout(tick, Math.min(100, remaining)); };
  timer = window.setTimeout(tick, 25);
  return () => { stopped = true; window.clearTimeout(timer); };
}
