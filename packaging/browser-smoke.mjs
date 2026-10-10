// Optional controlled real browser smoke against the actual packaged origin.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { once } from 'node:events';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const exe=resolve('packaging/out/linux-x64/PTE-Study/launcher');
function launch(args){const child=spawn(exe,args,{stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',()=>{});return{child,output:()=>output,exited:once(child,'close')};}
async function start(){const p=launch(['--no-browser']);const end=Date.now()+110000;while(!p.output().includes('"event":"ready"')){if(p.child.exitCode!==null||Date.now()>end)throw new Error('Packaged startup failed');await new Promise(r=>setTimeout(r,100));}return p;}
let runtime=await start();const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const context=await browser.newContext();const page=await context.newPage();const errors=[],violations=[],outbound=[];page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{if(/^https?:/.test(r.url())&&new URL(r.url()).origin!=='http://127.0.0.1:8765')outbound.push(r.url());});
await page.addInitScript(()=>{window.cspViolations=[];document.addEventListener('securitypolicyviolation',e=>window.cspViolations.push(e.violatedDirective));});
const button=name=>page.getByRole('button',{name,exact:true});
async function record(fixture,ra){
 await page.route('**/controlled.wav',async route=>route.fulfill({body:await readFile(`tools/local-stt/tmp/controlled/${fixture}.wav`),contentType:'audio/wav'}));
 await page.evaluate(async()=>{const c=new AudioContext();await c.resume();const buffer=await c.decodeAudioData(await(await fetch('/controlled.wav')).arrayBuffer());const dest=c.createMediaStreamDestination();navigator.mediaDevices.getUserMedia=async()=>dest.stream;window.playControlled=()=>{const src=c.createBufferSource();src.buffer=buffer;src.connect(dest);const done=new Promise(r=>src.onended=r);src.start();return done;};});
 await button('Enable microphone').waitFor();
 if(ra)await button("I'm ready to read").click();
 await button('Enable microphone').click();if(!ra){await button('Play sentence').click();await button('Replay sentence').waitFor();}await button('Start recording').click();await page.evaluate(()=>window.playControlled());await button('Stop recording').click();
 if(await button('Check local runtime').count())await button('Check local runtime').click();await page.getByText('Local Whisper transcription ready.',{exact:true}).waitFor();
 const response=page.waitForResponse(r=>r.url().endsWith('/api/v1/transcribe'));await button('Transcribe locally').click();assert.equal((await response).status(),200);await page.getByText('Detected speech',{exact:true}).waitFor();if(ra)await button('Analyse audio locally').click();await button('Save attempt').click();await page.getByText('Attempt saved locally.',{exact:true}).waitFor();violations.push(...await page.evaluate(()=>window.cspViolations));await page.unroute('**/controlled.wav');
}
async function counts(){return page.evaluate(async()=>{const names=await indexedDB.databases();const name=names.find(v=>v.name)?.name;if(!name)throw new Error('Missing study database');const db=await new Promise((res,rej)=>{const r=indexedDB.open(name);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});const result={};for(const store of ['attempts','errors','reviews']){if(!db.objectStoreNames.contains(store))continue;result[store]=await new Promise((res,rej)=>{const r=db.transaction(store).objectStore(store).count();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}db.close();return result;});}
try{
 await page.goto('http://127.0.0.1:8765/study/read-aloud');await record('RA-1',true);
 await page.goto('http://127.0.0.1:8765/study/repeat-sentence');await record('RS-1',false);
 const before=await counts();assert.equal(before.attempts,2);const q=launch(['--quit']);await q.exited;await runtime.exited;
 runtime=await start();await page.reload();const after=await counts();assert.deepEqual(after,before);
 violations.push(...await page.evaluate(()=>window.cspViolations));assert.deepEqual(violations,[]);assert.deepEqual(errors,[]);assert.deepEqual(outbound,[]);
 const report={target:'linux-x64',browser:'Chrome',sameOrigin:true,cspViolations:0,pageErrors:0,outboundRequests:0,realMediaRecorder:true,realPackagedDecoder:true,realWhisper:true,raSaved:true,rsSaved:true,indexedDBPersistsAcrossRuntimeRestart:true,controlledTTS:true,humanBenchmarkSatisfied:false};
 await writeFile('packaging/out/linux-x64/browser-smoke-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();if(runtime.child.exitCode===null){const q=launch(['--quit']);await q.exited;await runtime.exited;}}
