import { startCountdown,type TimerScheduler } from '../../../shared/speech/timing.ts';
export const SST_TIMING=Object.freeze({taskMs:600_000});
export function startSstTimer(onTick:(remainingMs:number)=>void,onDone:()=>void,scheduler?:TimerScheduler){return startCountdown(SST_TIMING.taskMs,onTick,onDone,scheduler);}
