import { startCountdown, type TimerScheduler } from '../../../shared/speech/timing.ts';
export const RESPOND_TO_SITUATION_TIMING = Object.freeze({ preparationMs: 10_000, responseMs: 40_000 });
export function startSituationPreparation(onTick:(remaining:number)=>void,onDone:()=>void,scheduler?:TimerScheduler){return startCountdown(RESPOND_TO_SITUATION_TIMING.preparationMs,onTick,onDone,scheduler);}
export function startSituationResponse(onTick:(remaining:number)=>void,onDone:()=>void,scheduler?:TimerScheduler){return startCountdown(RESPOND_TO_SITUATION_TIMING.responseMs,onTick,onDone,scheduler);}
