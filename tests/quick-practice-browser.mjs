// Actual application routes, StrictMode, IndexedDB, MediaRecorder and Web Audio.
// Only STT HTTP is controlled; this is not physical-microphone or human-quality evidence.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 5181, strictPort: true } });
await server.listen(); let browser;
const base='http://127.0.0.1:5181';
try {
 browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 const context=await browser.newContext();await context.addInitScript(()=>{Math.random=()=>0;});
 const pageErrors=[],outbound=[];
 context.on('page',p=>{p.on('pageerror',e=>pageErrors.push(e.message));p.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))outbound.push(r.url());});});
 const page=await context.newPage();
 await context.route('**/api/v1/health',route=>route.fulfill({json:{runtimeVersion:'0.1.0',apiVersion:1,engine:'whisper.cpp',engineVersion:'1.8.3',status:'ready',model:{id:'base.en',loaded:true},processedLocally:true}}));
 await context.route('**/api/v1/transcribe',async route=>{
  const text=await current(page).then(v=>v.item.answer);
  await route.fulfill({json:{text,language:'en',engine:'whisper.cpp',model:'base.en',processedLocally:true,timing:{audioMs:350,inferenceMs:1,totalMs:2}}});
 });
 async function current(p){return p.evaluate(async()=>{const {db}=await import('/src/data/db/database.ts');const rows=await db.studySessions.toArray(),s=rows.find(s=>s.status==='active')??rows.at(-1);return {session:s,item:await db.studyItems.get(s.itemIds[Math.min(s.currentIndex,s.itemIds.length-1)]),sessions:rows.length,attempts:await db.attempts.count(),version:db.verno};});}
 async function loaded(p,index,total=5){await p.getByRole('status').filter({hasText:`Question ${index+1} of ${total}`}).waitFor();}
 async function wfd(p){await p.getByLabel('Your answer',{exact:true}).fill((await current(p)).item.answer);await p.getByRole('button',{name:'Submit',exact:true}).click();}
 async function speech(p,task){
  await p.evaluate(async()=>{
   if(!window.controlledAudio){const audio=new AudioContext();await audio.resume();const destination=audio.createMediaStreamDestination(),osc=audio.createOscillator();osc.connect(destination);osc.start();window.controlledAudio={audio,destination};}
   navigator.mediaDevices.getUserMedia=async()=>window.controlledAudio.destination.stream.clone();
  });
  if(task==='read-aloud')await p.getByRole('button',{name:"I'm ready to read"}).click();
  await p.getByRole('button',{name:'Enable microphone',exact:true}).click();await p.getByRole('button',{name:'Start recording',exact:true}).click();await p.waitForTimeout(350);
  await p.getByRole('button',{name:'Stop recording',exact:true}).click();await p.getByText('Your recording is ready.',{exact:true}).waitFor();
  await p.getByRole('button',{name:'Check local runtime',exact:true}).click();await p.getByText('Local Whisper transcription ready.',{exact:true}).waitFor();
  await p.getByRole('button',{name:'Transcribe locally',exact:true}).click();await p.getByRole('heading',{name:'Content result',exact:true}).waitFor();
  if(task==='read-aloud'){await p.getByRole('button',{name:'Analyse audio locally'}).click();await p.waitForFunction(()=>!document.querySelector('.ra-attempt-save button').disabled);}
  await p.getByRole('button',{name:'Save attempt',exact:true}).click();
 }
 await page.goto(base+'/study');await page.getByRole('button',{name:'Start Quick Practice',exact:true}).waitFor();
 // No creation from StrictMode mount effects.
 assert.equal(await page.evaluate(async()=>{const {db}=await import('/src/data/db/database.ts');return db.studySessions.count();}),0);
 await page.getByRole('button',{name:'Start Quick Practice',exact:true}).evaluate(b=>{b.click();b.click();});await page.waitForURL('**/study/session/*');await loaded(page,0);
 const first=await current(page),url=page.url();assert.equal(first.sessions,1);assert.equal(first.session.mode,'quick');assert.equal(first.session.itemIds.length,5);assert.equal(first.version,3);
 assert.equal(first.session.contentVersion,await page.evaluate(async()=>{const {db}=await import('/src/data/db/database.ts');return (await db.contentState.get('question-bank')).contentVersion;}));
 await page.reload();await loaded(page,0);assert.equal((await current(page)).item.id,first.session.itemIds[0]);
 await wfd(page);await page.getByRole('button',{name:'Continue',exact:true}).waitFor();assert.equal((await current(page)).session.currentIndex,1);await loaded(page,0); // Feedback remains at presented item.
 await page.getByRole('button',{name:'Continue',exact:true}).click();await loaded(page,1);
 await page.reload();await loaded(page,1);
 await page.getByRole('link',{name:'Study',exact:true}).click();await page.getByRole('button',{name:'Resume current session',exact:true}).waitFor();assert.equal((await current(page)).sessions,1);
 await page.goBack();await loaded(page,1);assert.equal((await current(page)).session.status,'active');
 await page.getByRole('link',{name:'Back to Study',exact:true}).click();await page.getByRole('button',{name:'Resume current session',exact:true}).click();await loaded(page,1);
 await speech(page,'repeat-sentence');await page.getByRole('button',{name:'Continue',exact:true}).click();await loaded(page,2);
 await page.reload();await loaded(page,2);assert.equal((await current(page)).item.id,first.session.itemIds[2]);
 await speech(page,'read-aloud');await page.getByRole('button',{name:'Continue',exact:true}).waitFor();await loaded(page,2);assert.equal((await current(page)).session.currentIndex,3);
 await page.reload();await loaded(page,3);assert.equal((await current(page)).item.id,first.session.itemIds[3]);assert.equal(await page.getByRole('button',{name:'Continue',exact:true}).count(),0);
 await wfd(page);await page.getByRole('button',{name:'Continue',exact:true}).click();await loaded(page,4);await speech(page,'repeat-sentence');
 await page.getByRole('button',{name:'Continue',exact:true}).waitFor();assert.equal((await current(page)).session.status,'completed');await loaded(page,4);
 await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('heading',{name:'Quick Practice complete',exact:true}).waitFor();await page.getByRole('status').filter({hasText:'5 questions completed'}).waitFor();
 await page.reload();await page.getByRole('heading',{name:'Quick Practice complete',exact:true}).waitFor();assert.equal(page.url(),url);
 // A second Study page has stale discovery; it must present Resume on creation conflict.
 await page.getByRole('link',{name:'Back to Study',exact:true}).click();const staleStudy=await context.newPage();await staleStudy.goto(base+'/study');await staleStudy.getByRole('button',{name:'Start Quick Practice',exact:true}).waitFor();
 await page.getByRole('button',{name:'Start Quick Practice',exact:true}).click();await loaded(page,0);const secondUrl=page.url();
 await staleStudy.getByRole('button',{name:'Start Quick Practice',exact:true}).click();await staleStudy.getByRole('button',{name:'Resume current session',exact:true}).waitFor();assert.equal(staleStudy.url(),base+'/study');assert.equal((await current(page)).sessions,2);
 await staleStudy.getByRole('button',{name:'Resume current session',exact:true}).click();await loaded(staleStudy,0);
 await wfd(staleStudy);await staleStudy.getByRole('button',{name:'Continue',exact:true}).waitFor();await wfd(page);
 await page.getByRole('alert').filter({hasText:'This session changed in another tab.'}).waitFor();assert.equal(await page.getByRole('button',{name:'Continue',exact:true}).count(),0);
 assert.equal((await current(page)).attempts,6);await page.getByRole('button',{name:'Reload session',exact:true}).click();await loaded(page,1);assert.equal(page.url(),secondUrl);
 // No unsafe database detail for invalid/not-found route IDs.
 await page.goto(base+'/study/session/not-found');await page.getByRole('alert').filter({hasText:'This study session could not be found.'}).waitFor();
 await page.goto(base+'/study');await page.getByRole('button',{name:'Resume current session',exact:true}).waitFor();
 assert.deepEqual(pageErrors,[]);assert.deepEqual(outbound,[]);
 const report={status:'PASS',browser:browser.version(),scope:'Linux host Chrome; real app routes/StrictMode/IndexedDB/MediaRecorder/Web Audio; controlled STT HTTP, no physical microphone or packaged-platform certification',quickStart:'PASS',doubleClick:'PASS',fiveQuestionQueue:'PASS',feedbackContinue:'PASS',refreshBeforeSave:'PASS',refreshAfterSaveBeforeContinue:'PASS',browserBackResume:'PASS',fiveItemCompletion:'PASS',completedRouteReload:'PASS',activeCreationRace:'PASS',staleSaveConflictReload:'PASS',missingRoute:'PASS',dbVersion:3,pageErrors:0,remoteRequests:0};
 await mkdir('audits',{recursive:true});await writeFile('audits/session-07.05-browser.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
} finally {await browser?.close();await server.close();}
