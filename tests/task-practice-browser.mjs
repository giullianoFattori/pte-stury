import { waitForBrowserServer } from './helpers/browser-readiness.mjs';
// Real application routes/StrictMode/IndexedDB. WFD-only completion needs no microphone/STT.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
const { chromium }=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const server=await createServer({server:{host:'127.0.0.1',port:5182,strictPort:true}});
await server.listen();await waitForBrowserServer(server,'http://127.0.0.1:5182/study');let browser;
const base='http://127.0.0.1:5182';
try {
 browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext();const errors=[],remote=[],speechRequests=[];
 context.on('page',p=>{p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))remote.push(r.url());if(r.url().includes('/api/v1/'))speechRequests.push(r.url());});});
 const page=await context.newPage();const card=()=>page.getByRole('region',{name:'Task Practice',exact:true});
 const radio=name=>card().getByRole('radio',{name,exact:true});const start=()=>card().getByRole('button',{name:'Start Task Practice',exact:true});
 async function state(p=page){return p.evaluate(async()=>{const {db}=await import('/src/data/db/database.ts');const all=await db.studySessions.toArray(),session=all.find(s=>s.status==='active')??all.at(-1);return{session,items:session?await db.studyItems.bulkGet(session.itemIds):[],count:all.length,attempts:await db.attempts.count(),version:db.verno};});}
 async function availability(n){await card().getByRole('status').filter({hasText:`${n} questions available`}).waitFor();}
 async function progress(i,n){await page.getByRole('status').filter({hasText:`Question ${i+1} of ${n}`}).waitFor();}
 async function save(){const value=await state();await page.getByLabel('Your answer',{exact:true}).fill(value.items[value.session.currentIndex].answer);await page.getByRole('button',{name:'Submit',exact:true}).click();await page.getByRole('button',{name:'Continue',exact:true}).waitFor();}
 await page.goto(base+'/study');await availability(5);assert.equal(await radio('5').isChecked(),true);assert.equal(await state().then(s=>s.count),0);
 for(const [difficulty,count] of [[1,2],[2,2],[3,1]]){
  await radio('Difficulty '+difficulty).check();await availability(count);assert.equal(await radio('3').isDisabled(),true);assert.equal(await radio('5').isDisabled(),true);assert.equal(await radio('Max').isChecked(),true);assert.equal(await start().isEnabled(),true);
 }
 // Temporary local catalog availability fixture, never committed production content.
 await page.evaluate(async()=>{const {db}=await import('/src/data/db/database.ts');window.unavailable=await db.studyItems.where('taskType').equals('write-from-dictation').filter(i=>i.difficulty===3).toArray();await db.studyItems.bulkPut(window.unavailable.map(i=>({...i,catalogAvailable:false})));});
 await radio('Any').check();await availability(4);await radio('Difficulty 3').check();await card().getByRole('status').filter({hasText:'No questions available for this filter.'}).waitFor();assert.equal(await start().isDisabled(),true);
 await page.evaluate(async()=>{const {db}=await import('/src/data/db/database.ts');await db.studyItems.bulkPut(window.unavailable);});await radio('Any').check();await availability(5);
 // Real capacity change after display: preserve failed requested count and require a new choice.
 await radio('3').check();await page.evaluate(async()=>{const {db}=await import('/src/data/db/database.ts');window.changed=await db.studyItems.where('taskType').equals('write-from-dictation').toArray();await db.studyItems.bulkPut(window.changed.slice(0,3).map(i=>({...i,catalogAvailable:false})));});
 await start().click();await page.getByRole('alert').filter({hasText:'not enough questions'}).waitFor();await availability(2);assert.equal(await start().isDisabled(),true);assert.equal(await radio('Max').isChecked(),false);assert.equal((await state()).count,0);
 await page.evaluate(async()=>{const {db}=await import('/src/data/db/database.ts');await db.studyItems.bulkPut(window.changed);});await radio('Difficulty 1').check();await availability(2);await radio('Any').check();await availability(5);await radio('3').check();
 await start().evaluate(b=>{b.click();b.click();});await page.waitForURL('**/study/session/*');await progress(0,3);
 const first=await state(),url=page.url();assert.equal(first.count,1);assert.equal(first.session.mode,'task');assert.equal(first.session.itemIds.length,3);assert.ok(first.items.every(i=>i.taskType==='write-from-dictation'));assert.equal(first.version,3);
 await page.reload();await progress(0,3);assert.deepEqual((await state()).session.itemIds,first.session.itemIds);
 await save();await progress(0,3);assert.equal((await state()).session.currentIndex,1);await page.reload();await progress(1,3);assert.equal(await page.getByRole('button',{name:'Continue',exact:true}).count(),0);
 await page.getByRole('link',{name:'Back to Study',exact:true}).click();await page.getByRole('button',{name:'Resume current session',exact:true}).waitFor();assert.equal(await start().isDisabled(),true);await page.getByRole('button',{name:'Resume current session',exact:true}).click();await progress(1,3);assert.equal(page.url(),url);
 await save();await page.getByRole('button',{name:'Continue',exact:true}).click();await progress(2,3);await save();await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('heading',{name:'Task Practice complete',exact:true}).waitFor();await page.getByRole('status').filter({hasText:'3 questions completed'}).waitFor();
 await page.reload();await page.getByRole('heading',{name:'Task Practice complete',exact:true}).waitFor();
 // Max is resolved to the filtered explicit capacity (2), not a string or zero.
 await page.getByRole('link',{name:'Back to Study',exact:true}).click();await availability(5);await radio('Difficulty 1').check();await availability(2);await radio('Max').check();await start().click();await progress(0,2);
 const max=await state();assert.equal(max.session.config.itemCount,2);assert.deepEqual(max.session.config.difficulties,[1]);assert.ok(max.items.every(i=>i.taskType==='write-from-dictation'&&i.difficulty===1));
 await save();await page.getByRole('button',{name:'Continue',exact:true}).click();await progress(1,2);await save();await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('heading',{name:'Task Practice complete',exact:true}).waitFor();
 await page.getByRole('link',{name:'Back to Study',exact:true}).click();await availability(5);
 const stale=await context.newPage();await stale.goto(base+'/study');const staleCard=stale.getByRole('region',{name:'Task Practice',exact:true});await staleCard.getByRole('status').filter({hasText:'5 questions available'}).waitFor();
 // RS Task creates offline without speech preflight, then another Study tab must offer Resume.
 await radio('Repeat Sentence').check();await availability(6);await radio('Max').check();await start().click();await progress(0,6);await page.getByRole('heading',{name:'Repeat Sentence',exact:true}).waitFor();const rs=await state();assert.ok(rs.items.every(i=>i.taskType==='repeat-sentence'));assert.equal(rs.session.config.itemCount,6);
 await staleCard.getByRole('button',{name:'Start Task Practice',exact:true}).click();await stale.getByRole('button',{name:'Resume current session',exact:true}).waitFor();assert.equal(stale.url(),base+'/study');assert.equal(await staleCard.getByRole('button',{name:'Start Task Practice',exact:true}).isDisabled(),true);assert.equal((await state()).count,3);
 await stale.getByRole('button',{name:'Resume current session',exact:true}).click();await stale.getByRole('heading',{name:'Repeat Sentence',exact:true}).waitFor();
 assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);assert.deepEqual(speechRequests,[]);
 const report={status:'PASS',browser:browser.version(),scope:'Linux host Chrome, actual app/StrictMode/IndexedDB, WFD completion; RS route creation only; no physical microphone or packaged-platform claim',selectedTask:'write-from-dictation',requestedCount:3,queueTaskPurity:'PASS',capacityByDifficulty:'PASS',countPresets:'PASS',zeroCapacity:'PASS',maxFilteredCount:2,capacityChangeRejectedWithoutShrink:'PASS',doubleClick:'PASS',refreshBeforeSave:'PASS',refreshAfterSaveBeforeContinue:'PASS',backResume:'PASS',taskCompletion:'PASS',repeatSentenceMaxCreation:'PASS',activeCreationRaceResume:'PASS',dbVersion:3,pageErrors:0,unexpectedNetworkRequests:0,speechPreflightRequests:0};
 await mkdir('audits',{recursive:true});await writeFile('audits/session-07.06-browser.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser?.close();await server.close();}
