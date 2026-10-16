// Actual application routes, StrictMode, IndexedDB, MediaRecorder and Web Audio.
// Only STT HTTP is controlled; this is not physical-microphone or human-quality evidence.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 5183, strictPort: true } });
await server.listen(); let browser;
const base='http://127.0.0.1:5183';
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
   navigator.mediaDevices.getUserMedia=async()=>{const stream=window.controlledAudio.destination.stream.clone();window.controlledStreams??=[];window.controlledStreams.push(stream);return stream;};
  });
  assert.equal(await p.getByText('Detected speech',{exact:true}).count(),0);
  assert.equal(await p.getByText('Your recording is ready.',{exact:true}).count(),0);
  if(task==='read-aloud'){assert.equal(await p.getByRole('button',{name:'Start recording',exact:true}).isDisabled(),true);await p.getByRole('button',{name:"I'm ready to read"}).click();}
  await p.getByRole('button',{name:'Enable microphone',exact:true}).click();await p.getByRole('button',{name:'Start recording',exact:true}).click();await p.waitForTimeout(350);
  await p.getByRole('button',{name:'Stop recording',exact:true}).click();await p.getByText('Your recording is ready.',{exact:true}).waitFor();
  await p.getByRole('button',{name:'Check local runtime',exact:true}).click();await p.getByText('Local Whisper transcription ready.',{exact:true}).waitFor();
  await p.getByRole('button',{name:'Transcribe locally',exact:true}).click();await p.getByRole('heading',{name:'Content result',exact:true}).waitFor();
  if(task==='read-aloud'){await p.getByRole('button',{name:'Analyse audio locally'}).click();await p.waitForFunction(()=>!document.querySelector('.ra-attempt-save button').disabled);}
  await p.getByRole('button',{name:'Save attempt',exact:true}).click();
 }
 await page.goto(base+'/study');
 const card=page.getByRole('region',{name:'Mixed Practice',exact:true});
 const check=name=>card.getByRole('checkbox',{name,exact:true});
 const radio=name=>card.getByRole('radio',{name,exact:true});
 const start=()=>card.getByRole('button',{name:'Start Mixed Practice',exact:true});
 const total=async n=>card.getByRole('status').filter({hasText:`Total: ${n} questions available`}).waitFor();
 await total(17);assert.equal(await radio('10').isChecked(),true);assert.equal(await card.getByRole('checkbox',{checked:true}).count(),3);
 await check('Write From Dictation').uncheck();await total(12);await check('Repeat Sentence').uncheck();await total(6);assert.equal(await start().isDisabled(),true);
 await check('Write From Dictation').check();await total(11);await check('Repeat Sentence').check();await total(17);
 // Delay one old filter response, switch filters, then release it: old totals must stay ignored.
 await page.evaluate(async()=>{const {studyItemsRepository:r}=await import('/src/data/repositories/studyItemsRepository.ts');window.countOriginal=r.countPracticeItems;r.countPracticeItems=async q=>{if(q.taskTypes?.[0]==='read-aloud'&&q.difficulties?.[0]===1){window.capacityHeld=true;await new Promise(resolve=>window.releaseCapacity=resolve);return 99;}return window.countOriginal(q);};});
 await radio('Difficulty 1').check();await page.waitForFunction(()=>window.capacityHeld);await radio('Difficulty 2').check();await total(6);await page.evaluate(()=>window.releaseCapacity());await page.waitForTimeout(100);await total(6);
 await page.evaluate(async()=>{const {studyItemsRepository:r}=await import('/src/data/repositories/studyItemsRepository.ts');r.countPracticeItems=window.countOriginal;});
 await radio('Difficulty 3').check();await total(5);assert.equal(await radio('10').isDisabled(),true);assert.equal(await radio('5').isChecked(),true);
 // Zero capacity for one selected task must block Start despite other tasks having content.
 await page.evaluate(async()=>{const {db}=await import('/src/data/db/database.ts');window.zeroRows=await db.studyItems.where('taskType').equals('read-aloud').filter(i=>i.difficulty===3).toArray();await db.studyItems.bulkPut(window.zeroRows.map(i=>({...i,catalogAvailable:false})));});
 await radio('Any').check();await total(15);await radio('Difficulty 3').check();await total(3);await card.getByRole('alert').filter({hasText:'Deselect these tasks or change difficulty.'}).waitFor();assert.equal(await start().isDisabled(),true);assert.equal(await radio('5').isDisabled(),true);assert.equal(await radio('10').isDisabled(),true);
 await check('Read Aloud').uncheck();await total(3);assert.equal(await start().isEnabled(),true);assert.equal(await radio('Max').isChecked(),true);
 await page.evaluate(async()=>{const {db}=await import('/src/data/db/database.ts');await db.studyItems.bulkPut(window.zeroRows);});await radio('Any').check();await total(11);await check('Read Aloud').check();await total(17);await radio('5').check();
 assert.equal(await page.evaluate(async()=>{const {db}=await import('/src/data/db/database.ts');return db.studySessions.count();}),0);
 await start().evaluate(b=>{b.click();b.click();});await page.waitForURL('**/study/session/*');await loaded(page,0);
 const first=await current(page),url=page.url();assert.equal(first.sessions,1);assert.equal(first.session.mode,'mixed');assert.equal(first.session.itemIds.length,5);assert.equal(first.version,3);
 assert.equal(first.session.contentVersion,await page.evaluate(async()=>{const {db}=await import('/src/data/db/database.ts');return (await db.contentState.get('question-bank')).contentVersion;}));
 await page.reload();await loaded(page,0);assert.equal((await current(page)).item.id,first.session.itemIds[0]);
 await wfd(page);await page.getByRole('button',{name:'Continue',exact:true}).waitFor();assert.equal((await current(page)).session.currentIndex,1);await loaded(page,0); // Feedback remains at presented item.
 await page.reload();await loaded(page,1);
 await page.getByRole('heading',{name:'Repeat Sentence',exact:true}).waitFor();
 await page.getByRole('link',{name:'Study',exact:true}).click();await page.getByRole('button',{name:'Resume current session',exact:true}).waitFor();assert.equal((await current(page)).sessions,1);
 await page.goBack();await loaded(page,1);assert.equal((await current(page)).session.status,'active');
 await page.getByRole('link',{name:'Back to Study',exact:true}).click();await page.getByRole('button',{name:'Resume current session',exact:true}).click();await loaded(page,1);
 await speech(page,'repeat-sentence');await page.getByRole('button',{name:'Continue',exact:true}).click();await loaded(page,2);
 assert.equal(await page.evaluate(()=>window.controlledStreams.every(stream=>stream.getTracks().every(track=>track.readyState==='ended'))),true);
 await page.reload();await loaded(page,2);assert.equal((await current(page)).item.id,first.session.itemIds[2]);
 await speech(page,'read-aloud');await page.getByRole('button',{name:'Continue',exact:true}).waitFor();await loaded(page,2);assert.equal((await current(page)).session.currentIndex,3);
 await page.reload();await loaded(page,3);assert.equal((await current(page)).item.id,first.session.itemIds[3]);assert.equal(await page.getByRole('button',{name:'Continue',exact:true}).count(),0);
 await wfd(page);await page.getByRole('button',{name:'Continue',exact:true}).click();await loaded(page,4);await speech(page,'repeat-sentence');
 await page.getByRole('button',{name:'Continue',exact:true}).waitFor();assert.equal((await current(page)).session.status,'completed');await loaded(page,4);
 await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('heading',{name:'Mixed Practice complete',exact:true}).waitFor();await page.getByRole('status').filter({hasText:'5 questions completed'}).waitFor();
 await page.reload();await page.getByRole('heading',{name:'Mixed Practice complete',exact:true}).waitFor();assert.equal(page.url(),url);
 // Max resolves to all currently eligible unique rows; active Mixed disables every new mode.
 await page.getByRole('link',{name:'Back to Study',exact:true}).click();await total(17);await radio('Max').check();await start().click();await loaded(page,0,17);
 const maximum=await current(page);assert.equal(maximum.session.config.itemCount,17);assert.equal(new Set(maximum.session.itemIds).size,17);
 await page.getByRole('link',{name:'Back to Study',exact:true}).click();await page.getByRole('button',{name:'Resume current session',exact:true}).waitFor();assert.equal(await start().isDisabled(),true);assert.equal(await card.getByRole('checkbox',{name:'Write From Dictation',exact:true}).isDisabled(),true);
 // Safe missing route remains shared for every mode.
 await page.goto(base+'/study/session/not-found');await page.getByRole('alert').filter({hasText:'This study session could not be found.'}).waitFor();
 assert.deepEqual(pageErrors,[]);assert.deepEqual(outbound,[]);
 const sequence=first.session.itemIds.map(id=>id.split('-')[0]);assert.deepEqual(sequence,['wfd','rs','ra','wfd','rs']);
 const report={status:'PASS',browser:browser.version(),scope:'Linux Chrome, actual app/StrictMode/IndexedDB/MediaRecorder/Web Audio; controlled STT HTTP, no physical microphone/human-quality/package certification',selectedTasks:['write-from-dictation','repeat-sentence','read-aloud'],requestedCount:5,allocation:{'write-from-dictation':2,'repeat-sentence':2,'read-aloud':1},taskSequence:sequence,selectionCapacity:'PASS',singleTaskBlocked:'PASS',zeroSelectedCapacityBlocked:'PASS',staleCapacityIgnored:'PASS',countPresets:'PASS',maxCount:17,feedbackContinue:'PASS',refreshAcrossWfdRs:'PASS',crossTaskReset:'PASS',completion:'PASS',activeMixedResume:'PASS',dbVersion:3,pageErrors:0,unexpectedRemoteRequests:0};
 await mkdir('audits',{recursive:true});await writeFile('audits/session-07.07-browser.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
} finally {await browser?.close();await server.close();}
