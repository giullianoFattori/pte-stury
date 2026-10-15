// Isolated React adapter regression: actual IndexedDB/MediaRecorder/Web Audio; controlled HTTP STT fixture.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const vite = await createServer({ configFile: false, appType: 'custom', plugins: [react()], server: { host: '127.0.0.1', port: 5177, strictPort: true } });
vite.middlewares.use(async(req,res,next)=>{
 if(req.url==='/favicon.ico'){res.statusCode=204;res.end();return;}
 if(req.url==='/exercise-harness'){res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url, '<!doctype html><title>Exercise adapter regression</title><div id="root"></div>'));return;}next();
});
await vite.listen();let browser;
try {
 browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage();const errors=[];const remote=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('request',req=>{if(!/^(http:\/\/127\.0\.0\.1:5177|blob:|data:)/.test(req.url()))remote.push(req.url());});
 await page.goto('http://127.0.0.1:5177/exercise-harness');
 await page.evaluate(async()=>{
  const reactModule=await import('/node_modules/.vite/deps/react.js'),client=await import('/node_modules/.vite/deps/react-dom_client.js');
  const React=reactModule.default??reactModule,createRoot=client.createRoot??client.default.createRoot;
  const {StudyItemExercise}=await import('/src/features/study-session/components/StudyItemExercise.tsx');
  const {bootstrapApp}=await import('/src/app/bootstrap.ts'),{db}=await import('/src/data/db/database.ts');await bootstrapApp();
  const {studyItemsRepository:source}=await import('/src/data/repositories/studyItemsRepository.ts');
  const {studySessionsRepository:sessions}=await import('/src/data/repositories/studySessionsRepository.ts');
  const {studyOutcomeRepository:outcomes}=await import('/src/data/repositories/studyOutcomeRepository.ts');
  const {startStudySession}=await import('/src/application/study-session/startStudySession.ts');
  const {StudySessionError}=await import('/src/domain/study-session/errors.ts');
  const root=createRoot(document.getElementById('root'));window.h={db,source,sessions,outcomes};window.completions=[];window.next=0;window.calls=0;
  const original=outcomes.createStudyOutcome.bind(outcomes);
  outcomes.createStudyOutcome=async input=>{window.calls++;if(window.fail){window.fail=false;throw new StudySessionError({path:'currentIndex',code:'SESSION_PROGRESS_CONFLICT',message:'Private internal exception'});}if(window.delay)await new Promise(resolve=>window.release=resolve);return original(input);};
  window.prepare=async(task,kind='session')=>{
   window.kind=kind;window.completions=[];window.calls=0;window.next=0;
   if(kind==='session')window.session=await startStudySession({mode:'task',taskTypes:[task],itemCount:2},{sessions,source,contentVersion:(await db.contentState.get('question-bank')).contentVersion,idGenerator:()=>crypto.randomUUID(),now:()=>new Date().toISOString(),rng:()=>0});
   const item=kind==='session'?await source.getById(window.session.itemIds[0]):(await source.getByTaskType(task))[0];await window.renderItem(item,0);
  };
  window.renderItem=async(item,index)=>{window.current=item;window.transcript=item.answer;const mode=window.kind==='session'?{kind:'session',sessionId:window.session.id,expectedIndex:index,expectedItemId:item.id,isFinalItem:index===1}:{kind:'standalone'};root.render(React.createElement(React.StrictMode,null,React.createElement(StudyItemExercise,{item,mode,onNext:()=>window.next++,onCompleted:value=>{window.completions.push(value);}})));};
  const audio=new AudioContext();await audio.resume();const dest=audio.createMediaStreamDestination(),osc=audio.createOscillator();osc.connect(dest);osc.start();navigator.mediaDevices.getUserMedia=async()=>dest.stream.clone();
 });
 await page.route('**/api/v1/health',route=>route.fulfill({json:{runtimeVersion:'0.1.0',apiVersion:1,engine:'whisper.cpp',engineVersion:'1.8.3',status:'ready',model:{id:'base.en',loaded:true},processedLocally:true}}));
 await page.route('**/api/v1/transcribe',async route=>route.fulfill({json:{text:await page.evaluate(()=>window.transcript),language:'en',engine:'whisper.cpp',model:'base.en',processedLocally:true,timing:{audioMs:300,inferenceMs:10,totalMs:20}}}));
 async function ready(task){
  await page.getByRole('heading',{name:task==='read-aloud'?'Read Aloud':task==='repeat-sentence'?'Repeat Sentence':'Write From Dictation',exact:true}).waitFor();
  if(task==='write-from-dictation'){await page.getByLabel('Your answer',{exact:true}).fill(await page.evaluate(()=>window.current.answer));return;}
  if(task==='read-aloud')await page.getByRole('button',{name:"I'm ready to read"}).click();
  await page.getByRole('button',{name:'Enable microphone',exact:true}).click();await page.getByRole('button',{name:'Start recording',exact:true}).click();
  await page.waitForTimeout(350);await page.getByRole('button',{name:'Stop recording',exact:true}).click();await page.getByText('Your recording is ready.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Check local runtime',exact:true}).click();await page.getByText('Local Whisper transcription ready.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Transcribe locally',exact:true}).click();await page.getByRole('heading',{name:'Content result',exact:true}).waitFor();
  // Pre-save recording retry remains supported.
  assert.equal(await page.getByRole('button',{name:'Record again',exact:true}).isEnabled(),true);
  if(task==='read-aloud'){await page.getByRole('button',{name:'Analyse audio locally'}).click();await page.getByRole('button',{name:'Save attempt',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('.ra-attempt-save button').disabled);}
 }
 async function doubleSave(task){await page.evaluate(task=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===(task==='write-from-dictation'?'Submit':'Save attempt'));button.click();button.click();},task);}
 const results={};
 for(const task of ['write-from-dictation','repeat-sentence','read-aloud']){
  await page.evaluate(task=>window.prepare(task),task);await ready(task);
  await page.evaluate(()=>window.fail=true);await doubleSave(task);
  await page.getByRole('alert').filter({hasText:'Session progress changed.'}).waitFor();assert.equal(await page.evaluate(()=>window.completions.length),0);
  assert.equal(await page.evaluate(async()=> (await window.h.sessions.getById(window.session.id)).currentIndex),0);
  await page.evaluate(()=>window.delay=true);await doubleSave(task);await page.waitForFunction(()=>typeof window.release==='function');
  assert.equal(await page.evaluate(()=>window.calls),2);await page.evaluate(()=>{window.delay=false;window.release();});
  await page.waitForFunction(()=>window.completions.length===1);
  const partial=await page.evaluate(async()=>{const session=await window.h.sessions.getById(window.session.id);return {index:session.currentIndex,attempt:await window.h.db.attempts.get(session.attemptIds[0]),completion:window.completions[0]};});assert.equal(partial.index,1);assert.equal(partial.attempt.sessionId,partial.completion.session.id);assert.equal(partial.attempt.itemRevision,1);
  assert.equal(await page.getByRole('button',{name:/Next question|Next passage|Retry same/}).count(),0);
  if(task!=='write-from-dictation'){assert.equal(await page.getByRole('button',{name:'Record again',exact:true}).isDisabled(),true);assert.equal(await page.getByRole('button',{name:'Transcribe locally',exact:true}).isDisabled(),true);}
  await page.evaluate(async()=>window.renderItem(await window.h.source.getById(window.session.itemIds[1]),1));await ready(task);await doubleSave(task);await page.waitForFunction(()=>window.completions.length===2);
  const final=await page.evaluate(async()=>window.h.sessions.getById(window.session.id));assert.equal(final.status,'completed');assert.equal(final.attemptIds.length,2);assert.ok(final.finishedAt);
  results[task]={sessionAtomicSave:'PASS',failureRetry:'PASS',doubleClickGuard:'PASS',completionOnce:'PASS',postSaveLocked:'PASS',finalCompletion:'PASS',itemStateReset:'PASS'};
  // Standalone save/next and speech retry are preserved using the same renderer.
  await page.evaluate(task=>window.prepare(task,'standalone'),task);await ready(task);await doubleSave(task);await page.waitForFunction(()=>window.completions.length===1);
  assert.equal(await page.evaluate(async()=> (await window.h.db.attempts.get(window.completions[0].attemptId)).sessionId),undefined);
  await page.getByRole('button',{name:task==='read-aloud'?'Next passage':'Next question',exact:true}).click();assert.equal(await page.evaluate(()=>window.next),1);
  results[task].standalone='PASS';
 }
 assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
 const report={status:'PASS',browser:browser.version(),scope:'Isolated React StrictMode/actual IndexedDB, actual MediaRecorder and Web Audio; deterministic HTTP STT fixture, not native inference or human quality validation',tasks:results,pageErrors:0,remoteRequests:0};
 await mkdir('audits',{recursive:true});await writeFile('audits/session-07.04-browser.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser?.close();await vite.close();}
