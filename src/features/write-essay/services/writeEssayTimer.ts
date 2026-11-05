import { startCountdown, type TimerScheduler } from '../../../shared/speech/timing.ts';
export const WRITE_ESSAY_TIMING = Object.freeze({ taskMs: 20 * 60 * 1000 });
export function startWriteEssayTimer(onTick:(remainingMs:number)=>void,onDone:()=>void,scheduler?:TimerScheduler){return startCountdown(WRITE_ESSAY_TIMING.taskMs,onTick,onDone,scheduler);}
