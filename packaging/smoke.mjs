import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { once } from 'node:events';
import { performance } from 'node:perf_hooks';
import { createServer } from 'node:net';
import { verifyPackage } from './inventory.mjs';
const target=process.platform==='linux'?'linux-x64':process.platform==='win32'?'windows-x64':`macos-${process.arch}`;
const root=resolve(`packaging/out/${target}/PTE-Study`),exe=join(root,`launcher${process.platform==='win32'?'.exe':''}`);
const started=performance.now();const manifest=await verifyPackage(root);const verificationMs=Math.round(performance.now()-started);
async function launch(args){const child=spawn(exe,args,{env:{...process.env,PATH:'/nonexistent',NODE_OPTIONS:'--invalid-host-option',LD_LIBRARY_PATH:'/nonexistent'},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',c=>{output+=c});let error='';child.stderr.on('data',c=>{error+=c});return {child,output:()=>output,error:()=>error,exited:once(child,'close')};}
async function waitReady(p){const end=Date.now()+110000;while(!p.output().includes('"event":"ready"')){if(p.child.exitCode!==null)throw new Error('Packaged startup failed: '+p.error());if(Date.now()>end)throw new Error('Startup deadline');await new Promise(r=>setTimeout(r,100));}}
const p=await launch(['--no-browser']);
try{
 await waitReady(p);const readyMs=Math.round(performance.now()-started);
 assert.equal((await fetch('http://127.0.0.1:8765/')).status,200);
 const page=await fetch('http://127.0.0.1:8765/study/read-aloud');assert.match(page.headers.get('content-security-policy'),/script-src 'self'/);assert.equal(page.status,200);
 const describeImage=await fetch('http://127.0.0.1:8765/study/describe-image');assert.equal(describeImage.status,200);
 const describeImageSession=await fetch('http://127.0.0.1:8765/study/session/123e4567-e89b-42d3-a456-426614174000');assert.equal(describeImageSession.status,200);
 const summarizeWrittenText=await fetch('http://127.0.0.1:8765/study/summarize-written-text');assert.equal(summarizeWrittenText.status,200);
 const summarizeWrittenTextSession=await fetch('http://127.0.0.1:8765/study/session/123e4567-e89b-42d3-a456-426614174001');assert.equal(summarizeWrittenTextSession.status,200);
 const summarizeSpokenText=await fetch('http://127.0.0.1:8765/study/summarize-spoken-text');assert.equal(summarizeSpokenText.status,200);
 const summarizeSpokenTextSession=await fetch('http://127.0.0.1:8765/study/session/123e4567-e89b-42d3-a456-426614174002');assert.equal(summarizeSpokenTextSession.status,200);
 const highlightIncorrectWords=await fetch('http://127.0.0.1:8765/study/highlight-incorrect-words');assert.equal(highlightIncorrectWords.status,200);
 const highlightIncorrectWordsSession=await fetch('http://127.0.0.1:8765/study/session/123e4567-e89b-42d3-a456-426614174003');assert.equal(highlightIncorrectWordsSession.status,200);
 const packagedContent=await fetch('http://127.0.0.1:8765/content/question-bank.json').then(r=>r.json());const swtItems=packagedContent.items.filter(item=>item.taskType==='summarize-written-text'&&item.status==='active');assert.equal(swtItems.length,4);assert.ok(swtItems.every(item=>item.taskData.passage.length>0&&item.taskData.keyPoints.length>=3));
 const sstItems=packagedContent.items.filter(item=>item.taskType==='summarize-spoken-text'&&item.status==='active');assert.equal(sstItems.length,4);assert.ok(sstItems.every(item=>item.taskData.transcript.length>0&&item.taskData.keyPoints.length>=3&&item.taskData.audio.durationMs>=60000&&item.taskData.audio.durationMs<=90000));
 const sstAudio=await fetch('http://127.0.0.1:8765'+sstItems[0].taskData.audio.path);assert.equal(sstAudio.status,200);assert.match(sstAudio.headers.get('content-type'),/^audio\/mpeg/);assert.ok((await sstAudio.arrayBuffer()).byteLength>0);
 const hiwItems=packagedContent.items.filter(item=>item.taskType==='highlight-incorrect-words'&&item.status==='active');assert.equal(hiwItems.length,5);assert.ok(hiwItems.every(item=>item.taskData.displayedTokens.some(token=>token.incorrect)));
 const hiwAudio=await fetch('http://127.0.0.1:8765'+hiwItems[0].taskData.audio.path);assert.equal(hiwAudio.status,200);assert.match(hiwAudio.headers.get('content-type'),/^audio\/mpeg/);assert.ok((await hiwAudio.arrayBuffer()).byteLength>0);
 const bank=await (await fetch('http://127.0.0.1:8765/content/question-bank.json')).json(),item=bank.items.find(value=>value.id==='di-000001');assert.ok(item?.taskData?.image?.path?.startsWith('/images/'));
 const image=await fetch('http://127.0.0.1:8765'+item.taskData.image.path);assert.equal(image.status,200);assert.match(image.headers.get('content-type'),/^image\/jpeg/);const imageBytes=Buffer.from(await image.arrayBuffer());assert.equal(imageBytes.length,item.taskData.image.bytes);assert.equal(createHash('sha256').update(imageBytes).digest('hex'),item.taskData.image.sha256);
 assert.equal((await fetch('http://127.0.0.1:8765/api/unknown')).status,404);
 const audio=await readFile('tools/local-stt/tmp/controlled/RA-1.wav');const form=new FormData();form.append('audio',new Blob([audio],{type:'audio/wav'}),'ignored-name.wav');form.append('language','en');
 const inferenceStart=performance.now();const r=await fetch('http://127.0.0.1:8765/api/v1/transcribe',{method:'POST',headers:{Origin:'http://127.0.0.1:8765'},body:form});const result=await r.json();assert.equal(r.status,200,JSON.stringify(result));assert.ok(result.text?.length>0);
 const firstTranscriptionMs=Math.round(performance.now()-inferenceStart);
 const duplicate=await launch(['--no-browser']);assert.equal((await duplicate.exited)[0],0);assert.equal(duplicate.output(),'');
 let shutdownDuringInference=false,noOrphanNativeProcesses=null;
 if(process.platform==='linux'){
  const longForm=new FormData();longForm.append('audio',new Blob([await readFile('tools/local-stt/tmp/controlled/RA-3.wav')],{type:'audio/wav'}),'fixture.wav');longForm.append('language','en');
  const pending=fetch('http://127.0.0.1:8765/api/v1/transcribe',{method:'POST',headers:{Origin:'http://127.0.0.1:8765'},body:longForm}).then(r=>r.status,()=>0);
  const tracked=[];const end=Date.now()+15000;let active=false;
  while(Date.now()<end&&!active){for(const id of (await readdir('/proc')).filter(n=>/^\d+$/.test(n))){try{const command=await readFile('/proc/'+id+'/cmdline','utf8');if(command.startsWith(join(root,'native/whisper-cli')+'\0')){tracked.push(id);active=true;}}catch{}}if(!active)await new Promise(r=>setTimeout(r,20));}
  assert.ok(active,'Whisper did not start');const q=await launch(['--quit']);await q.exited;await p.exited;assert.notEqual(await pending,200);
  for(const id of tracked){try{await readFile('/proc/'+id+'/status');assert.fail('Native child survived Quit');}catch(e){if(e.code!=='ENOENT')throw e;}}
  shutdownDuringInference=true;noOrphanNativeProcesses=true;
 }
 const quit=await launch(['--quit']);if(!shutdownDuringInference){assert.equal((await quit.exited)[0],0);assert.equal((await p.exited)[0],0);}else await quit.exited;
 const listener=createServer();await new Promise((res,rej)=>{listener.once('error',rej);listener.listen(8765,'127.0.0.1',res)});await new Promise(res=>listener.close(res));
 const again=await launch(['--no-browser']);await waitReady(again);const quitAgain=await launch(['--quit']);await quitAgain.exited;await again.exited;
 const collision=createServer();await new Promise(res=>collision.listen(8765,'127.0.0.1',res));try{const occupied=await launch(['--no-browser']);assert.equal((await occupied.exited)[0],1);assert.match(occupied.error(),/port 8765 is occupied/);}finally{await new Promise(res=>collision.close(res));}
 const report={target,validation:'internal host smoke; not a clean-machine or Windows/macOS certification',artifacts:manifest.artifacts.length,verificationMs,readyMs,firstTranscriptionMs,describeImageStandaloneRoute:true,describeImageSessionRoute:true,localImagePathAndIntegrity:true,summarizeWrittenTextStandaloneRoute:true,summarizeWrittenTextSessionRoute:true,summarizeWrittenTextContentCount:swtItems.length,summarizeSpokenTextStandaloneRoute:true,summarizeSpokenTextSessionRoute:true,summarizeSpokenTextContentCount:sstItems.length,summarizeSpokenTextLocalAudio:true,highlightIncorrectWordsStandaloneRoute:true,highlightIncorrectWordsSessionRoute:true,highlightIncorrectWordsContentCount:hiwItems.length,highlightIncorrectWordsLocalAudio:true,hostNodeRequired:false,hostFFmpegRequired:false,ambientLoaderOverridesIgnored:true,singleInstance:true,portCollision:true,restart:true,quit:true,shutdownDuringInference,noOrphanNativeProcesses};
 await writeFile(`packaging/out/${target}/smoke-report.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{if(p.child.exitCode===null){const q=await launch(['--quit']);await q.exited;await p.exited;}}
