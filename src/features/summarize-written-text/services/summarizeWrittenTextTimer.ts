import { startCountdown,type TimerScheduler } from '../../../shared/speech/timing.ts';
export const SWT_TIMING=Object.freeze({taskMs:600_000});
export function startSwtTimer(onTick:(remainingMs:number)=>void,onDone:()=>void,scheduler?:TimerScheduler){return startCountdown(SWT_TIMING.taskMs,onTick,onDone,scheduler);}
