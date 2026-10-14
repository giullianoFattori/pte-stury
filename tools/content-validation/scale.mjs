// Synthetic test-only banks; never write production content or the learner database.
import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {discover} from '../content/discover.mjs';
import {readSource} from '../content/read-source.mjs';
import {parseQuestionBankItemJson,validateQuestionBankItems} from '../../src/domain/content/validation.ts';
import {canonicalBundle,jsonBytes} from '../content/canonicalize.mjs';
import {manifestFor} from '../content/manifest.mjs';
import {buildBank} from '../content/build.mjs';
import {verifyGenerated} from '../content/verify.mjs';
import {PteDatabase} from '../../src/data/db/database.ts';
import {syncQuestionBank} from '../../src/data/question-bank/syncQuestionBank.ts';
import {createStudyItemsRepository} from '../../src/data/repositories/studyItemsRepository.ts';
import {sampleStudyItems} from '../../src/domain/content/sampling.ts';
const measurements=[];
for(const size of [1000,5000,10000]){
 const root=await mkdtemp(join(tmpdir(),'pte-content-scale-')), sourceRoot=join(root,'source'),outputRoot=join(root,'generated');
 const db=new PteDatabase('scale-'+crypto.randomUUID());const ms={};
 async function timed(name,fn){const start=performance.now();const result=await fn();ms[name]=+(performance.now()-start).toFixed(3);return result;}
 try{
  for(const task of ['write-from-dictation','repeat-sentence','read-aloud'])await mkdir(join(sourceRoot,task),{recursive:true});
  for(let i=1;i<=size;i++){const id='ra-'+String(i).padStart(6,'0');await writeFile(join(sourceRoot,'read-aloud',id+'.json'),JSON.stringify({id,taskType:'read-aloud',difficulty:i%5+1,prompt:'Synthetic prompt '+i,answer:'Synthetic sentence '+i,transcript:'Synthetic sentence '+i,revision:1,status:'active',source:'internal',skills:['reading','speaking'],tags:i%2?['academic']:['general'],topic:'scale'}));}
  const files=await timed('discovery',()=>discover(sourceRoot));
  const items=await timed('readAndParse',async()=>{const out=[];for(const f of files)out.push(parseQuestionBankItemJson(await readSource(f.path)));return out;});
  await timed('batchValidation',()=>{assert.ok(validateQuestionBankItems(items).success);});
  const bundle=await timed('canonicalization',()=>canonicalBundle(items));
  const bytes=await timed('serialization',()=>jsonBytes(bundle));const manifest=manifestFor(bundle,bytes);
  await timed('fullBuild',()=>buildBank({sourceRoot,outputRoot,enforceRegistry:false,audioOptions:{reportOrphans:false}}));
  await timed('verification',()=>verifyGenerated(outputRoot));
  await db.open();const repo=createStudyItemsRepository(db);let tx=0;const original=db.transaction.bind(db);db.transaction=(...args)=>{tx++;return original(...args);};
  await db.attempts.add({id:'historical',itemId:'ra-000001',taskType:'read-aloud',createdAt:'2026-01-01',score:1});const before=await db.attempts.toArray();
  await timed('freshSync',()=>syncQuestionBank(bundle,manifest,db));assert.equal(tx,1);
  assert.equal((await timed('repeatNoop',()=>syncQuestionBank(bundle,manifest,db))).status,'unchanged');assert.equal(tx,2);
  const next=canonicalBundle(items.map((i,n)=>n%10===0?{...i,revision:2,prompt:i.prompt+' updated'}:i));
  await timed('subsetUpdate',()=>syncQuestionBank(next,manifestFor(next,jsonBytes(next)),db));assert.equal(tx,3);
  const subset=canonicalBundle(next.items.filter((_,n)=>n%10!==1));
  await timed('availabilityUpdate',()=>syncQuestionBank(subset,manifestFor(subset,jsonBytes(subset)),db));assert.equal(tx,4);
  assert.deepEqual(await db.attempts.toArray(),before);assert.equal(await db.studyItems.count(),size);
  const candidates=await timed('taskQuery',()=>repo.queryPracticeItems({taskTypes:['read-aloud'],limit:500}));
  await timed('difficultyQuery',()=>repo.queryPracticeItems({difficulties:[2,3],limit:500}));
  const query={taskTypes:['read-aloud'],difficulties:[2,3],tags:['academic'],skills:['reading','speaking'],matchSkills:'all',topic:'scale',limit:100};
  const matches=await timed('metadataQuery',()=>repo.queryPracticeItems(query));const count=await timed('count',()=>repo.countPracticeItems(query));assert.equal(matches.length,Math.min(100,count));
  await timed('sampling',()=>sampleStudyItems(candidates,20,()=>.25));
  measurements.push({size,status:'PASS',bundleBytes:Buffer.byteLength(bytes),transactions:tx,timingsMs:ms});console.log(JSON.stringify(measurements.at(-1)));
 }finally{await db.delete();await rm(root,{recursive:true,force:true});}
}
await mkdir('audits',{recursive:true});await writeFile('audits/content-06.08-scale.json',JSON.stringify({status:'PASS',environment:'Node; fake-indexeddb timings are not browser performance evidence',measurements},null,2)+'\n');
