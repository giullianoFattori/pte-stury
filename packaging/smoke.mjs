import assert from 'node:assert/strict';
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
 const report={target,validation:'internal host smoke; not a clean-machine or Windows/macOS certification',artifacts:manifest.artifacts.length,verificationMs,readyMs,firstTranscriptionMs,hostNodeRequired:false,hostFFmpegRequired:false,ambientLoaderOverridesIgnored:true,singleInstance:true,portCollision:true,restart:true,quit:true,shutdownDuringInference,noOrphanNativeProcesses};
 await writeFile(`packaging/out/${target}/smoke-report.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{if(p.child.exitCode===null){const q=await launch(['--quit']);await q.exited;await p.exited;}}
