// Browser IndexedDB profiling of isolated synthetic databases; no learner data.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const server=await createServer({configFile:false,server:{host:'127.0.0.1',port:5177,strictPort:true}});
server.middlewares.use((req,res,next)=>{if(req.url==='/content-scale-harness'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Isolated content scale harness</title>');}else next();});
await server.listen();
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-precise-memory-info']});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5177/content-scale-harness');
 const results=await page.evaluate(async()=>{
  const {PteDatabase}=await import('/src/data/db/database.ts');
  const {syncQuestionBank}=await import('/src/data/question-bank/syncQuestionBank.ts');
  const {canonicalBundle}=await import('/src/domain/content/canonical.ts');
  const {createStudyItemsRepository}=await import('/src/data/repositories/studyItemsRepository.ts');
  const {sampleStudyItems}=await import('/src/domain/content/sampling.ts');
  async function catalog(items){const bundle=canonicalBundle(items);const bytes=new TextEncoder().encode(JSON.stringify(bundle,null,2)+'\n');const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');return {bundle,manifest:{schemaVersion:1,contentVersion:'sha256:'+hash,itemCount:items.length,countsByTaskType:{'write-from-dictation':0,'repeat-sentence':0,'read-aloud':items.length},audioAssetCount:0}};}
  const results=[];
  for(const size of [1000,5000]){
   const db=new PteDatabase('content-scale-'+crypto.randomUUID());await db.open();const repo=createStudyItemsRepository(db);const ms={};
   async function measure(name,fn){const t=performance.now();const value=await fn();ms[name]=+(performance.now()-t).toFixed(3);return value;}
   const heapBefore=performance.memory?.usedJSHeapSize;
   try{
    const items=Array.from({length:size},(_,i)=>({id:'ra-'+String(i+1).padStart(6,'0'),taskType:'read-aloud',difficulty:i%5+1,prompt:'Synthetic fixture '+i,answer:'Synthetic sentence '+i,transcript:'Synthetic sentence '+i,revision:1,status:'active',source:'internal',skills:['reading','speaking'],tags:i%2?['academic']:['general'],topic:'scale'}));
    const initial=await catalog(items);
    const first=await measure('freshSync',()=>syncQuestionBank(initial.bundle,initial.manifest,db));if(first.status!=='installed')throw Error('Fresh install');
    const state=await db.contentState.get('question-bank');
    const second=await measure('repeatNoop',()=>syncQuestionBank(initial.bundle,initial.manifest,db));if(second.status!=='unchanged')throw Error('No-op');
    if(JSON.stringify(state)!==JSON.stringify(await db.contentState.get('question-bank')))throw Error('State changed on no-op');
    const task=await measure('taskQuery',()=>repo.queryPracticeItems({taskTypes:['read-aloud'],limit:500}));
    await measure('difficultyQuery',()=>repo.queryPracticeItems({difficulties:[2,3],limit:500}));
    const query={taskTypes:['read-aloud'],difficulties:[2,3],skills:['reading','speaking'],matchSkills:'all',tags:['academic'],topic:'scale',limit:100};
    const matches=await measure('metadataQuery',()=>repo.queryPracticeItems(query));const count=await measure('count',()=>repo.countPracticeItems(query));
    const sample=await measure('sampling',()=>sampleStudyItems(task,20,()=>.25));
    if(matches.length!==Math.min(count,100)||sample.length!==20||await repo.countPracticeItems()!==size)throw Error('Query/count invariant');
    results.push({size,status:'PASS',dbVersion:db.verno,matches:count,timingsMs:ms,heapBytes:{before:heapBefore,after:performance.memory?.usedJSHeapSize,scope:'Approximate main-page JS heap; no forced GC, includes modules and catalog; not an RSS/leak measurement'}});
   }finally{await db.delete();}
  }
  return results;
 });
 assert.equal(results.length,2);await mkdir('audits',{recursive:true});await writeFile('audits/content-06.08-browser-scale.json',JSON.stringify({status:'PASS',browser:browser.version(),environment:'Linux x64 headless Chrome; real IndexedDB; source modules served only by test harness, not a production frontend',results},null,2)+'\n');console.log(JSON.stringify(results,null,2));
}finally{await browser.close();await server.close();}
