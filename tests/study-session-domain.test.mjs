import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {resolve} from 'node:path';
import {STUDY_SESSION_MODES,STUDY_SESSION_STATUSES,isVersionedStudySession} from '../src/domain/study-session/types.ts';
import {StudySessionError} from '../src/domain/study-session/errors.ts';
import {createStudySession,parseStudySession,parseStoredStudySession,parseStudySessionConfig,recordSessionAttempt,completeStudySession,abandonStudySession} from '../src/domain/study-session/lifecycle.ts';
const startedAt='2026-10-14T01:00:00.000Z',finishedAt='2026-10-14T01:10:00.000Z';
const input=()=>({id:'session-1',mode:'mixed',startedAt,contentVersion:'sha256:'+'a'.repeat(64),taskTypes:['write-from-dictation','repeat-sentence','read-aloud'],itemIds:['wfd-001','rs-001','ra-001'],config:{itemCount:3,taskTypes:['read-aloud','repeat-sentence','write-from-dictation'],difficulties:[1,2]}});
const link=(session,index,id='attempt-'+index)=>({id,itemId:session.itemIds[index],taskType:session.itemIds[index].startsWith('wfd')?'write-from-dictation':session.itemIds[index].startsWith('rs')?'repeat-sentence':'read-aloud',sessionId:session.id});
function issue(fn,code,path){assert.throws(fn,e=>e instanceof StudySessionError&&e.code===code&&(!path||e.issues[0].path===path));}
test('frozen vocabulary and queue preserve inputs; create starts empty active progress',()=>{
 assert.deepEqual(STUDY_SESSION_MODES,['quick','task','mixed']);assert.deepEqual(STUDY_SESSION_STATUSES,['active','completed','abandoned']);
 const raw=input(),before=structuredClone(raw),session=createStudySession(raw);assert.deepEqual(raw,before);assert.equal(session.status,'active');assert.equal(session.currentIndex,0);assert.deepEqual(session.attemptIds,[]);assert.equal(session.finishedAt,undefined);
 for(const value of [session,session.itemIds,session.taskTypes,session.config,session.config.difficulties,session.config.taskTypes,session.attemptIds])assert.ok(Object.isFrozen(value));
 raw.itemIds.reverse();raw.config.difficulties.push(3);assert.deepEqual(session.itemIds,before.itemIds);assert.deepEqual(session.config.difficulties,[1,2]);
 assert.equal(isVersionedStudySession(session),true);
});
test('all modes work; selection tasks may have zero slots and do not infer item metadata',()=>{
 const raw={...input(),itemIds:['ra-000001'],config:{itemCount:1}};
 assert.equal(createStudySession({...raw,mode:'quick'}).mode,'quick');
 assert.equal(createStudySession(raw).mode,'mixed');
 assert.equal(createStudySession({...raw,mode:'task',taskTypes:['read-aloud']}).mode,'task');
});
for(const [name,change,path] of [
 ['missing mode',v=>delete v.mode,'mode'],['unknown mode',v=>v.mode='adaptive','mode'],
 ['empty queue',v=>v.itemIds=[],'itemIds'],['duplicate queue',v=>v.itemIds=['ra-001','ra-001','ra-001'],'itemIds'],
 ['unknown short ID',v=>v.itemIds[2]='ra-007','itemIds[2]'],['zero ID',v=>v.itemIds[2]='ra-000000','itemIds[2]'],
 ['wrong prefix/task',v=>{v.taskTypes=['read-aloud','repeat-sentence'];v.config.taskTypes=v.taskTypes;},'itemIds[0]'],
 ['invalid ID',v=>v.id='unsafe\nidentity','id'],['noncanonical time',v=>v.startedAt='2026-10-14','startedAt'],
 ['impossible date',v=>v.startedAt='2026-02-30T00:00:00.000Z','startedAt'],
 ['bad hash',v=>v.contentVersion='sha256:'+'A'.repeat(64),'contentVersion'],
 ['unknown field',v=>v.queueVersion=1,'session'],
])test('create rejects '+name,()=>{const raw=input();change(raw);issue(()=>createStudySession(raw),'INVALID_SESSION_STATE',path);});
for(const [value,path]of [
 [{itemCount:0},'config.itemCount'],[{itemCount:501},'config.itemCount'],[{itemCount:2.5},'config.itemCount'],[{itemCount:'2'},'config.itemCount'],[{itemCount:NaN},'config.itemCount'],[{itemCount:Infinity},'config.itemCount'],
 [{itemCount:2,difficulties:[]},'config.difficulties'],[{itemCount:2,difficulties:[2,2]},'config.difficulties'],[{itemCount:2,difficulties:[6]},'config.difficulties[0]'],[{itemCount:2,difficulties:['2']},'config.difficulties[0]'],
 [{itemCount:2,taskTypes:[]},'config.taskTypes'],[{itemCount:2,taskTypes:['retell-lecture']},'config.taskTypes[0]'],[{itemCount:2,taskTypes:['read-aloud','read-aloud']},'config.taskTypes'],[{itemCount:2,unknown:true},'config'],
])test('config rejects '+JSON.stringify(value),()=>issue(()=>parseStudySessionConfig(value),'INVALID_SESSION_CONFIG',path));
test('config count/tasks must agree with queue and mode',()=>{
 issue(()=>createStudySession({...input(),config:{itemCount:2}}),'INVALID_SESSION_CONFIG','config.itemCount');
 issue(()=>createStudySession({...input(),config:{itemCount:3,taskTypes:['read-aloud']}}),'INVALID_SESSION_CONFIG','config.taskTypes');
 issue(()=>createStudySession({...input(),mode:'task'}),'INVALID_SESSION_CONFIG','taskTypes');
 issue(()=>createStudySession({...input(),mode:'mixed',taskTypes:['read-aloud'],itemIds:['ra-001'],config:{itemCount:1}}),'INVALID_SESSION_CONFIG','taskTypes');
});
test('progress has one unique attempt per queue position; exhausted active queue completes explicitly',()=>{
 let session=createStudySession(input());const original=structuredClone(session);
 for(let i=0;i<3;i++){session=recordSessionAttempt(session,link(session,i),i);assert.equal(session.currentIndex,i+1);assert.equal(session.status,'active');assert.equal(session.finishedAt,undefined);}
 assert.deepEqual(original.attemptIds,[]);assert.deepEqual(session.itemIds,original.itemIds);assert.equal(session.contentVersion,original.contentVersion);
 const done=completeStudySession(session,finishedAt);assert.equal(done.status,'completed');assert.equal(done.finishedAt,finishedAt);assert.equal(done.currentIndex,3);
 issue(()=>completeStudySession(done,finishedAt),'SESSION_ALREADY_COMPLETED');issue(()=>abandonStudySession(done,finishedAt),'SESSION_ALREADY_COMPLETED');issue(()=>recordSessionAttempt(done,link(done,0),0),'SESSION_ALREADY_COMPLETED');
});
test('stale tab, wrong item/task/session, duplicate attempt and exhausted queue reject progress',()=>{
 const initial=createStudySession(input()),next=recordSessionAttempt(initial,link(initial,0),0),before=structuredClone(next);
 issue(()=>recordSessionAttempt(next,link(initial,0),0),'SESSION_PROGRESS_CONFLICT');
 for(const change of [{itemId:'rs-002'},{taskType:'read-aloud'},{sessionId:'another-session'},{sessionId:undefined}])issue(()=>recordSessionAttempt(next,{...link(next,1),...change},1),'SESSION_ATTEMPT_MISMATCH');
 issue(()=>recordSessionAttempt(next,link(next,1,'attempt-0'),1),'SESSION_PROGRESS_CONFLICT');
 issue(()=>recordSessionAttempt(next,link(next,1),1.5),'SESSION_PROGRESS_CONFLICT');assert.deepEqual(next,before);
 let exhausted=next;for(let i=1;i<3;i++)exhausted=recordSessionAttempt(exhausted,link(exhausted,i),i);
 issue(()=>recordSessionAttempt(exhausted,link(initial,0),3),'SESSION_PROGRESS_CONFLICT');
});
test('abandon is explicit, preserves partial progress, terminal states cannot reopen',()=>{
 const initial=createStudySession(input()),partial=recordSessionAttempt(initial,link(initial,0),0);
 issue(()=>completeStudySession(partial,finishedAt),'SESSION_PROGRESS_CONFLICT');
 const ended=abandonStudySession(partial,finishedAt);assert.equal(ended.status,'abandoned');assert.equal(ended.currentIndex,1);assert.deepEqual(ended.attemptIds,['attempt-0']);
 issue(()=>recordSessionAttempt(ended,link(ended,1),1),'SESSION_NOT_ACTIVE');issue(()=>abandonStudySession(ended,finishedAt),'SESSION_NOT_ACTIVE');
 assert.equal(abandonStudySession(initial,startedAt).currentIndex,0);
 issue(()=>abandonStudySession(initial,'2026-10-13T01:00:00.000Z'),'INVALID_SESSION_STATE','finishedAt');
});
for(const [name,change,path]of [
 ['invalid status',v=>v.status='paused','status'],['negative index',v=>v.currentIndex=-1,'currentIndex'],['fractional index',v=>v.currentIndex=.5,'currentIndex'],['overrun',v=>v.currentIndex=4,'currentIndex'],
 ['unmatched progress',v=>v.attemptIds=['a'],'attemptIds'],['duplicate attempts',v=>{v.currentIndex=2;v.attemptIds=['a','a'];},'attemptIds'],
 ['active finish',v=>v.finishedAt=finishedAt,'finishedAt'],['completed missing finish',v=>v.status='completed','finishedAt'],
 ['incomplete completed',v=>{v.status='completed';v.finishedAt=finishedAt;},'currentIndex'],
])test('stored versioned state rejects '+name,()=>{const raw=structuredClone(createStudySession(input()));change(raw);issue(()=>parseStudySession(raw),'INVALID_SESSION_STATE',path);});
test('legacy rows stay historical, unnormalized and cannot acquire fabricated resumability',()=>{
 for(const row of [{id:'old',startedAt:'2026-01-01',taskTypes:[],attemptIds:[]},{id:'old',startedAt,finishedAt,taskTypes:['read-aloud'],attemptIds:['a','a']}]){
  const before=structuredClone(row),legacy=parseStoredStudySession(row);assert.deepEqual(legacy,before);assert.deepEqual(row,before);assert.equal(isVersionedStudySession(legacy),false);assert.equal('itemIds'in legacy,false);assert.equal('status'in legacy,false);
  issue(()=>parseStudySession(row),'LEGACY_SESSION_NOT_RESUMABLE');issue(()=>abandonStudySession(row,finishedAt),'LEGACY_SESSION_NOT_RESUMABLE');
 }
 const broken={id:'old',startedAt,taskTypes:['read-aloud'],attemptIds:[],currentIndex:0};issue(()=>parseStoredStudySession(broken),'INVALID_SESSION_STATE','mode');
});
test('malformed objects and sparse/getter arrays fail without mutating or invoking accessors',()=>{
 for(const raw of [null,[],1,'session',Object.create({id:'inherited'})])issue(()=>parseStoredStudySession(raw),'INVALID_SESSION_STATE');
 let accessed=false;const bad=input();Object.defineProperty(bad,'mode',{enumerable:true,get(){accessed=true;return 'mixed';}});issue(()=>createStudySession(bad),'INVALID_SESSION_STATE');assert.equal(accessed,false);
 const sparse=input();sparse.itemIds=Array(3);issue(()=>createStudySession(sparse),'INVALID_SESSION_STATE','itemIds');
});
test('TypeScript separates historical rows, readonly sessions and optional Attempt linkage',()=>{
 const file=resolve('tests/fixtures/study-session-contract.ts');const source=`
import type { StudySession, LegacyStudySession, StoredStudySession, Attempt } from '../../src/domain/pte/types';
import { createStudySession } from '../../src/domain/study-session/lifecycle';
const legacy: LegacyStudySession = {id:'old',startedAt:'old-date',taskTypes:[],attemptIds:[]};
const stored: StoredStudySession = legacy;
const session: StudySession = createStudySession({id:'s',mode:'task',startedAt:'2026-10-14T01:00:00.000Z',taskTypes:['read-aloud'],itemIds:['ra-001'],config:{itemCount:1}});
const oldAttempt: Attempt = {id:'a',itemId:'ra-001',taskType:'read-aloud',createdAt:'old-date'};
const linked: Attempt = {...oldAttempt,sessionId:session.id};
// @ts-expect-error old rows do not have a resumable queue
const invented: StudySession = legacy;
// @ts-expect-error queues are immutable
session.itemIds.push('ra-002');
// @ts-expect-error progress is immutable
session.currentIndex = 1;
// @ts-expect-error source schema has no pause lifecycle
const paused: StudySession = {...session,status:'paused'};
// @ts-expect-error legacy Attempt linkage remains string-valued
const invalid: Attempt = {...oldAttempt,sessionId:1};
`;
 const options={noEmit:true,strict:true,skipLibCheck:true,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,allowImportingTsExtensions:true,target:ts.ScriptTarget.ES2023};const host=ts.createCompilerHost(options),read=host.readFile.bind(host),exists=host.fileExists.bind(host);host.readFile=p=>p===file?source:read(p);host.fileExists=p=>p===file||exists(p);
 assert.deepEqual(ts.getPreEmitDiagnostics(ts.createProgram([file],options,host)).map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')),[]);
});
