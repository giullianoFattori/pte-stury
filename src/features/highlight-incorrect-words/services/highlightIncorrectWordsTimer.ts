import{SPOKEN_RESPONSE_PREPARATION_MS,startCountdown,type TimerScheduler}from'../../../shared/speech/timing.ts';
export const HIW_PREVIEW_MS=SPOKEN_RESPONSE_PREPARATION_MS;
export function startHiwPreview(onTick:(remaining:number)=>void,onDone:()=>void,scheduler?:TimerScheduler){return startCountdown(HIW_PREVIEW_MS,onTick,onDone,scheduler);}
