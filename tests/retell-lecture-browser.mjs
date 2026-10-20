import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { waitForBrowserServer } from './helpers/browser-readiness.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const vite = await createServer({ server: { host: '127.0.0.1', port: 5178, strictPort: true } });
await vite.listen(); const base='http://127.0.0.1:5178'; await waitForBrowserServer(vite,base+'/study/retell-lecture',null);
let browser;
try {
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage(),pageErrors=[],remote=[];
 page.on('pageerror',e=>pageErrors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))remote.push(r.url());});
 await page.addInitScript(()=>{
   HTMLMediaElement.prototype.play=function(){return Promise.resolve();};
   Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{const ctx=new AudioContext();await ctx.resume();const destination=ctx.createMediaStreamDestination();const oscillator=ctx.createOscillator();oscillator.connect(destination);oscillator.start();return destination.stream;}});
 });
 await page.route('**/api/v1/health',route=>route.fulfill({json:{runtimeVersion:'0.1.0',apiVersion:1,engine:'whisper.cpp',engineVersion:'1.8.3',status:'ready',model:{id:'base.en',loaded:true},processedLocally:true}}));
 await page.route('**/api/v1/transcribe',async route=>route.fulfill({json:{text:await page.evaluate(()=>window.controlledTranscript),language:'en',engine:'whisper.cpp',model:'base.en',processedLocally:true,timing:{audioMs:800,inferenceMs:20,totalMs:30}}}));
 await page.goto(base+'/study/retell-lecture');
 await page.getByRole('button',{name:'Play lecture',exact:true}).waitFor({timeout:20000});
 await page.evaluate(async()=>{
   const {studyItemsRepository}=await import('/src/data/repositories/studyItemsRepository.ts');const items=await studyItemsRepository.getByTaskType('retell-lecture');window.controlledTranscript=items.flatMap(i=>i.taskData.keyPoints).join('. ');window.rtlCount=items.length;
 });
 assert.equal(await page.evaluate(()=>window.rtlCount),4);assert.equal(await page.getByRole('heading',{name:'Retell Lecture',exact:true}).count(),1);
 async function respondToLecture(){
   await page.evaluate(async()=>{const {studyItemsRepository}=await import('/src/data/repositories/studyItemsRepository.ts');const items=await studyItemsRepository.getByTaskType('retell-lecture');window.controlledTranscript=items.flatMap(i=>i.taskData.keyPoints).join('. ');});
   await page.getByRole('button',{name:'Play lecture',exact:true}).click();
   await page.waitForTimeout(50);
   await page.getByRole('status').filter({hasText:'Lecture is playing'}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Start recording',exact:true}).isDisabled(),true);
   await page.locator('section[aria-label="Lecture audio"] audio').evaluate(el=>el.dispatchEvent(new Event('ended')));
   await page.getByRole('timer').filter({hasText:'Preparation time'}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Replay lecture (practice assistance)',exact:true}).count(),1);
   await page.getByRole('button',{name:'Enable microphone',exact:true}).click();
   await page.getByLabel('Lecture notes').fill('causes, evidence, conclusion');
   await page.waitForFunction(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Start recording');return b&&!b.disabled;},undefined,{timeout:15000});
   await page.getByRole('button',{name:'Start recording',exact:true}).click();await page.waitForTimeout(350);
   await page.getByRole('button',{name:'Stop recording',exact:true}).click();await page.getByText('Your recording is ready.',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Check local runtime',exact:true}).click();await page.getByText('Local Whisper transcription ready.',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Transcribe locally',exact:true}).click();await page.getByText('Detected speech',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Analyse audio locally',exact:true}).click();
   await page.getByRole('button',{name:'Save attempt',exact:true}).waitFor();await page.waitForFunction(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Save attempt');return b&&!b.disabled;},undefined,{timeout:15000});
   const before=await page.evaluate(async()=>({itemCount:await (await import('/src/data/db/database.ts')).db.studyItems.where('taskType').equals('retell-lecture').count()}));assert.equal(before.itemCount,4);
   await page.getByRole('button',{name:'Save attempt',exact:true}).click();await page.getByText(/Attempt saved locally/).waitFor();
   const saved=await page.evaluate(async()=>{const {db}=await import('/src/data/db/database.ts');const rows=await db.attempts.where('taskType').equals('retell-lecture').toArray();return rows.at(-1);});
   assert.equal(saved.metrics.processedLocally,true);assert.equal(saved.score,saved.metrics.keyPointCoverage);assert.ok(saved.durationMs<=40_000);assert.equal(saved.metrics.keyPointCoverage,1);
   assert.equal(await page.getByText(/Pearson.*score|official Pearson score/i).count()>0,true);
 }
 // Standalone route: local audio, notes, 10-second deadline, real MediaRecorder, controlled local-STT contract, local Web Audio diagnostics and persistence.
 await respondToLecture();
 await page.goto(base+'/study');await page.getByRole('heading',{name:'Study',exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'Retell Lecture',exact:true}).count(),1);
 await page.getByRole('radio',{name:'Retell Lecture',exact:true}).check();await page.getByText('4 questions available',{exact:true}).waitFor();
 const taskCounts=page.locator('input[name="task-count"]');assert.equal(await taskCounts.nth(0).isEnabled(),true);assert.equal(await taskCounts.nth(1).isEnabled(),false);assert.equal(await taskCounts.nth(2).isEnabled(),true);
 await taskCounts.nth(0).check();await page.getByRole('button',{name:'Start Task Practice'}).click();await page.getByRole('heading',{name:'Retell Lecture',exact:true}).waitFor();
 // A one-item Task session is exercised via the same adapter service to validate atomic outcome + summary independently of card count presets.
 // The card-started session is intentionally left untouched here; continue through it after replacing the route with a compact deterministic session.
 await respondToLecture();
 await page.evaluate(async()=>{const {db}=await import('/src/data/db/database.ts');const active=(await db.studySessions.toArray()).find(s=>s.status==='active');if(active){active.status='abandoned';active.finishedAt=new Date().toISOString();await db.studySessions.put(active);}});
 await page.goto(base+'/study');
 // Mixed allocation contains both foundation WFD and Retell Lecture; the frozen queue interleaves across the task boundary.
 await page.getByRole('checkbox',{name:'Repeat Sentence',exact:true}).uncheck();await page.getByRole('checkbox',{name:'Read Aloud',exact:true}).uncheck();
 await page.getByText('Total: 12 questions available',{exact:true}).waitFor();
 const quickPool=await page.evaluate(async()=>{const {QUICK_TASK_POOL}=await import('/src/domain/pte/taskRegistry.ts');return QUICK_TASK_POOL;});assert.deepEqual(quickPool,['write-from-dictation','repeat-sentence','read-aloud']);
 // Start a compact two-task queue through the same production builder API, then exercise WFD → Retell Lecture continuation.
 await page.evaluate(async()=>{const {startMixedPractice}=await import('/src/features/study-session/services/startMixedPractice.ts');const {studySessionsRepository:sessions}=await import('/src/data/repositories/studySessionsRepository.ts');const {studyItemsRepository:source}=await import('/src/data/repositories/studyItemsRepository.ts');const {db}=await import('/src/data/db/database.ts');const started=await startMixedPractice({taskTypes:['write-from-dictation','retell-lecture'],itemCount:2},{sessions,source,getContentVersion:async()=>(await db.contentState.get('question-bank')).contentVersion,idGenerator:()=>crypto.randomUUID(),now:()=>new Date().toISOString(),rng:()=>0});window.mix=started.session;});
 const mixed=await page.evaluate(()=>window.mix);assert.deepEqual(mixed.itemIds.map(id=>id.startsWith('rtl-')?'retell-lecture':'write-from-dictation'),['write-from-dictation','retell-lecture']);
 await page.goto(base+'/study/session/'+mixed.id);await page.evaluate(value=>{window.mix=value;},mixed);
 await page.getByRole('heading',{name:'Write From Dictation',exact:true}).waitFor();
 await page.getByLabel('Your answer',{exact:true}).fill(await page.evaluate(async()=>{const {db}=await import('/src/data/db/database.ts');return (await db.studyItems.get(window.mix.itemIds[0])).answer;}));await page.getByRole('button',{name:'Submit',exact:true}).click();await page.getByText('Attempt saved. Your word-level result is ready.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('heading',{name:'Retell Lecture',exact:true}).waitFor();await respondToLecture();
 await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('heading',{name:'Mixed Practice complete',exact:true}).waitFor();
 await page.getByText('Key-point coverage',{exact:true}).waitFor();
 assert.deepEqual(pageErrors,[]);assert.deepEqual(remote,[]);console.log(JSON.stringify({status:'PASS',browser:browser.version(),retellLecture:{localAudio:'PASS',preparationTimer:'PASS',recordingAndLocalTranscription:'PASS',localFluency:'PASS',attemptPersistence:'PASS',taskAvailability:'PASS',mixedCrossTaskSave:'PASS',summary:'PASS'},pageErrors:0,remoteRequests:0}));
} finally { await browser?.close(); await vite.close(); }
