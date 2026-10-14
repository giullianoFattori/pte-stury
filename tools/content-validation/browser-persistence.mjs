// Real disk-backed browser profile upgrade and full browser/runtime restart.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {root,origin,launch,ready,quit,identity,tempEntries} from '../runtime-validation/common.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const profile=await mkdtemp(join(tmpdir(),'pte-content-profile-'));
const options={executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']};
let context,runtime;
async function open(){context=await chromium.launchPersistentContext(profile,options);return context.pages()[0]??await context.newPage();}
async function snapshot(page){return page.evaluate(async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open('pte-study-db');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});const out={};for(const name of ['studyItems','contentState','attempts','errors','reviews','studySessions'])out[name]=await new Promise((res,rej)=>{const r=db.transaction(name).objectStore(name).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});db.close();return out;});}
let evidence;
try{
 runtime=launch();await ready(runtime);let page=await open();
 await page.route('**/*',r=>r.fulfill({body:'<!doctype html><title>Historical profile fixture</title>',contentType:'text/html'}));await page.goto(origin);
 const legacy=JSON.parse(await readFile('tests/fixtures/content-migration/legacy-bank.json','utf8'));
 const {history}=await import('../../tests/helpers/content-db.mjs');
 await page.evaluate(async({legacy,history})=>{
  const db=await new Promise((res,rej)=>{const r=indexedDB.open('pte-study-db',20);r.onupgradeneeded=()=>{const fields={settings:[],studyItems:['taskType','difficulty'],attempts:['itemId','taskType','createdAt'],errors:['attemptId','itemId','taskType','category','createdAt'],reviews:['sourceAttemptId','sourceErrorId','dueAt'],studySessions:['startedAt']};for(const [name,indexes]of Object.entries(fields)){const store=r.result.createObjectStore(name,{keyPath:name==='settings'?'key':'id'});for(const key of indexes)store.createIndex(key,key);}};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
  await new Promise((res,rej)=>{const tx=db.transaction(['studyItems',...Object.keys(history)],'readwrite');for(const row of legacy)tx.objectStore('studyItems').add(row);for(const [name,rows]of Object.entries(history))for(const row of rows)tx.objectStore(name).add(row);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});db.close();
 },{legacy,history});await context.close();context=undefined;
 page=await open();await page.goto(origin);await page.getByRole('link',{name:'Study',exact:true}).waitFor();
 const adopted=await snapshot(page);assert.equal(adopted.studyItems.length,17);
 for(const old of legacy){const row=adopted.studyItems.find(i=>i.id===old.id);assert.equal(row.createdAt,old.createdAt);assert.equal(row.revision,1);}
 for(const [name,rows]of Object.entries(history))assert.deepEqual(adopted[name],rows);
 await page.goto(origin+'/study/write-from-dictation');await page.getByRole('button',{name:'Play audio',exact:true}).click();await page.getByRole('button',{name:'Replay audio',exact:true}).waitFor();
 const item=adopted.studyItems.find(i=>i.id==='wfd-001');await page.getByLabel('Your answer').fill(item.answer.split(' ').slice(1).join(' '));await page.getByRole('button',{name:'Submit',exact:true}).click();await page.getByText('Attempt saved. Your word-level result is ready.',{exact:true}).waitFor();
 const saved=await snapshot(page),attempt=saved.attempts.find(a=>a.id!=='a-old');assert.equal(attempt.itemRevision,1);assert.ok(attempt.score<1);assert.ok(saved.errors.some(e=>e.attemptId===attempt.id));assert.ok(saved.reviews.some(r=>r.sourceAttemptId===attempt.id));assert.equal(saved.attempts.find(a=>a.id==='a-old').itemRevision,undefined);
 await context.close();context=undefined;await quit(runtime);runtime=launch();await ready(runtime);page=await open();await page.goto(origin);await page.getByRole('link',{name:'Study',exact:true}).waitFor();assert.deepEqual(await snapshot(page),saved);
 evidence={identity:await identity(),status:'PASS',browser:context.browser().version(),profile:'temporary disk-backed persistent profile; deleted after audit',v2UpgradeAfterBrowserRestart:'PASS',browserAndRuntimeProcessRestart:'PASS',oldHistoryPreserved:'PASS',oldAttemptRevision:'unknown',newAttemptRevision:1,wfdErrorAndReviewCreation:'PASS',eligibleItems:17,stableOrigin:origin};
}finally{await context?.close();if(runtime)await quit(runtime,root);await rm(profile,{recursive:true,force:true});}
assert.deepEqual(await tempEntries(),[]);evidence.tempCleanup='PASS';await mkdir('audits',{recursive:true});await writeFile('audits/content-06.08-browser-persistence.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({status:'PASS',diskBackedBrowserRestart:true,wfdErrorAndReviewCreation:true}));
