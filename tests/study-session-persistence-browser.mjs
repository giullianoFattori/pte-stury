// Test-only source-module harness: real Chrome/IndexedDB, no session UI or speech fixtures.
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'vite';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const server=await createServer({configFile:false,appType:'custom',server:{host:'127.0.0.1',port:5177,strictPort:true}});
server.middlewares.use((req,res,next)=>{if(req.url==='/favicon.ico'){res.statusCode=204;res.end();return;}if(req.url==='/session-harness'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Isolated session persistence harness</title>');}else next();});
await server.listen();const profile=await mkdtemp(join(tmpdir(),'pte-session-0703-'));let context;
const launch=()=>chromium.launchPersistentContext(profile,{executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
const pageErrors=[];
async function page(tab){const page=await context.newPage();page.on('pageerror',()=>pageErrors.push('pageerror'));page.on('console',message=>{if(message.type()==='error')pageErrors.push('console-error');});await page.goto('http://127.0.0.1:5177/session-harness');await page.evaluate(async tab=>{
 const {PteDatabase}=await import('/src/data/db/database.ts'),{bootstrapApp}=await import('/src/app/bootstrap.ts');
 const {createStudySessionsRepository}=await import('/src/data/repositories/studySessionsRepository.ts'),{createStudyOutcomeRepository}=await import('/src/data/repositories/studyOutcomeRepository.ts'),{createStudyItemsRepository}=await import('/src/data/repositories/studyItemsRepository.ts');
 const {startStudySession}=await import('/src/application/study-session/startStudySession.ts');
 const db=new PteDatabase('isolated-session-0703');await db.open();if(!await db.contentState.get('question-bank'))await bootstrapApp(db);
 const sessions=createStudySessionsRepository(db),outcomes=createStudyOutcomeRepository(db),source=createStudyItemsRepository(db),state=await db.contentState.get('question-bank');
 window.harness={db,sessions,outcomes,source};window.prepared=false;
 window.start=async()=>{try{const session=await startStudySession({mode:'task',taskTypes:['read-aloud'],itemCount:2},{sessions,source:{queryPracticeItems:async q=>{const rows=await source.queryPracticeItems(q);window.prepared=true;await new Promise(r=>window.release=r);return rows;}},contentVersion:state.contentVersion,idGenerator:()=> 'browser-session-'+tab,now:()=> '2026-10-14T01:00:00.000Z',rng:()=>0});return{success:true,session};}catch(e){return{success:false,code:e.code};}};
 window.save=async(id,index)=>{try{const s=await sessions.getActiveVersioned();const itemId=s.itemIds[index],attemptId='attempt-'+tab+'-'+index;const attempt={id:attemptId,itemId,taskType:'read-aloud',sessionId:id,itemRevision:1,createdAt:'2026-10-14T01:01:00.000Z',score:.8};const errors=[{id:'error-'+attemptId,attemptId,itemId,taskType:'read-aloud',skills:['speaking'],category:'omission',severity:1,createdAt:attempt.createdAt}];const reviews=[{id:'review-'+attemptId,sourceAttemptId:attemptId,sourceErrorId:errors[0].id,itemId,taskType:'read-aloud',type:'sentence',prompt:'Synthetic fixture',answer:'Synthetic fixture',dueAt:attempt.createdAt,intervalDays:1,repetitions:0,correctStreak:0,createdAt:attempt.createdAt}];
 // Both callers must supply the same earlier presented index, not a refreshed index.
 const result=await outcomes.createStudyOutcome({attempt,errors,reviews,sessionProgress:{sessionId:id,expectedIndex:index,expectedItemId:itemId,finishedAt:'2026-10-14T01:02:00.000Z'}});return{success:true,session:result.session};}catch(e){return{success:false,code:e.code};}};
 },tab);return page;}
try{
 context=await launch();let a=await page('a'),b=await page('b');
 const starts=[a.evaluate(()=>window.start()),b.evaluate(()=>window.start())];await Promise.all([a.waitForFunction(()=>window.prepared),b.waitForFunction(()=>window.prepared)]);await Promise.all([a.evaluate(()=>window.release()),b.evaluate(()=>window.release())]);const creation=await Promise.all(starts);assert.equal(creation.filter(r=>r.success).length,1);assert.equal(creation.find(r=>!r.success).code,'ACTIVE_SESSION_EXISTS');const initial=creation.find(r=>r.success).session;
 // Capture the displayed item before either transaction can advance the stored session.
 await Promise.all([a,b].map(p=>p.evaluate(async id=>{window.displayed=await window.harness.sessions.resumeActive(id);},initial.id)));
 const writes=await Promise.all([a,b].map(p=>p.evaluate(async id=>{const s=window.displayed.session;window.harness.sessions.getActiveVersioned=async()=>s;return window.save(id,0);},initial.id)));assert.equal(writes.filter(r=>r.success).length,1);assert.equal(writes.find(r=>!r.success).code,'SESSION_PROGRESS_CONFLICT');
 await context.close();context=await launch();a=await page('a');b=await page('b');const resumed=await a.evaluate(id=>window.harness.sessions.resumeActive(id),initial.id);assert.equal(resumed.session.currentIndex,1);assert.deepEqual(resumed.session.itemIds,initial.itemIds);
 await a.evaluate(async id=>{const db=window.harness.db,s=await window.harness.sessions.getById(id);await db.studyItems.update(s.itemIds[1],{status:'retired',catalogAvailable:false});await db.contentState.update('question-bank',{contentVersion:'sha256:'+'b'.repeat(64)});},initial.id);
 const historical=await a.evaluate(id=>window.harness.sessions.resumeActive(id),initial.id);assert.equal(historical.item.status,'retired');assert.equal(historical.isCatalogCurrent,false);assert.deepEqual(historical.session.itemIds,initial.itemIds);
 await Promise.all([a,b].map(p=>p.evaluate(async id=>{window.displayed=await window.harness.sessions.resumeActive(id);},initial.id)));
 const finals=await Promise.all([a,b].map(p=>p.evaluate(async id=>{const s=window.displayed.session;window.harness.sessions.getActiveVersioned=async()=>s;return window.save(id,1);},initial.id)));assert.equal(finals.filter(r=>r.success).length,1);assert.equal(finals.find(r=>!r.success).code,'SESSION_PROGRESS_CONFLICT');
 const summary=await a.evaluate(async id=>{const h=window.harness;return{session:await h.sessions.getById(id),attempts:await h.db.attempts.count(),errors:await h.db.errors.count(),reviews:await h.db.reviews.count(),sessions:await h.db.studySessions.count(),dbVersion:h.db.verno};},initial.id);assert.equal(summary.session.status,'completed');assert.equal(summary.attempts,2);assert.equal(summary.errors,2);assert.equal(summary.reviews,2);assert.equal(summary.sessions,1);assert.equal(summary.dbVersion,3);
 assert.deepEqual(pageErrors,[]);
 const report={status:'PASS',pageErrors:0,browser:context.browser().version(),scope:'Linux headless Chrome, actual IndexedDB, two tabs and disk-backed temporary profile; test-only Vite module harness; no session UI or packaged/browser microphone certification',simultaneousStarts:'PASS',simultaneousPartialProgress:'PASS',finalItemRace:'PASS',browserProcessRestart:'PASS',frozenQueue:'PASS',historicalUnavailableResume:'PASS',catalogMismatch:'PASS',counts:{sessions:1,attempts:2,errors:2,reviews:2},dbVersion:3};await mkdir('audits',{recursive:true});await writeFile('audits/session-07.03-browser.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await context?.close();await server.close();await rm(profile,{recursive:true,force:true});}
