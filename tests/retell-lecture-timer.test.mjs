import assert from 'node:assert/strict';
import test from 'node:test';
import { startCountdown, RETELL_LECTURE_TIMING } from '../src/features/retell-lecture/services/retellLectureTimer.ts';
function fakeClock() {
 let now=0,id=0;const jobs=new Map();return {scheduler:{now:()=>now,setTimeout:(fn,ms)=>{const key=++id;jobs.set(key,{fn,at:now+ms});return key;},clearTimeout:key=>jobs.delete(key)},advance(ms){now+=ms;for(const [key,job]of [...jobs])if(job.at<=now){jobs.delete(key);job.fn();}},jobs};
}
test('task timing stays at 10 seconds preparation and 40 seconds maximum response',()=>assert.deepEqual(RETELL_LECTURE_TIMING,{preparationMs:10_000,responseMs:40_000}));
test('deadline countdown completes once despite clock drift and cleans its timer',()=>{
 const clock=fakeClock(),ticks=[],done=[];const cleanup=startCountdown(10_000,ms=>ticks.push(ms),()=>done.push(true),clock.scheduler);
 assert.equal(ticks[0],10_000);clock.advance(10_250);assert.deepEqual(done,[true]);clock.advance(50_000);assert.deepEqual(done,[true]);assert.equal(clock.jobs.size,0);cleanup();
});
test('maximum response countdown auto-stops once at its injected 40-second deadline',()=>{
 const clock=fakeClock(),stops=[];let remaining=RETELL_LECTURE_TIMING.responseMs;const cleanup=startCountdown(RETELL_LECTURE_TIMING.responseMs,ms=>{remaining=ms;},()=>stops.push('stop'),clock.scheduler);
 clock.advance(RETELL_LECTURE_TIMING.responseMs-1);assert.equal(stops.length,0);clock.advance(1);assert.deepEqual(stops,['stop']);assert.equal(remaining,0);clock.advance(RETELL_LECTURE_TIMING.responseMs);assert.deepEqual(stops,['stop']);cleanup();
});
test('unmount cleanup cancels preparation/recording timer without firing completion',()=>{
 const clock=fakeClock(),done=[];const cleanup=startCountdown(40_000,()=>{},()=>done.push(true),clock.scheduler);assert.equal(clock.jobs.size,1);cleanup();clock.advance(50_000);assert.deepEqual(done,[]);assert.equal(clock.jobs.size,0);
});
