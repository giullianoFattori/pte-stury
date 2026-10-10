import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { homedir } from 'node:os';
import { verifyPackage } from '../../packaging/inventory.mjs';
export const origin='http://127.0.0.1:8765';
export const archive=resolve('packaging/out/PTE-Study-0.1.0-linux-x64-internal.tar.xz');
export const root=resolve('.local-packaging/validation-05.10/PTE-Study');
export const audit=resolve('runtime/docs/audits/05.10');
export const pause=ms=>new Promise(r=>setTimeout(r,ms));
export async function hash(path){return createHash('sha256').update(await readFile(path)).digest('hex');}
export async function identity(){
 const m=await verifyPackage(root),build=JSON.parse(await readFile(join(root,'manifest/build.json'),'utf8'));
 if(!build.buildTimestamp)throw new Error('Package build timestamp missing');
 return {appVersion:m.appVersion,runtimeVersion:m.runtimeVersion,apiVersion:m.apiVersion,engineVersion:m.engineVersion,modelId:m.modelId,target:m.target,
 packageSHA256:await hash(archive),manifestSHA256:await hash(join(root,'manifest/package.json')),gitCommit:build.gitCommit,buildTimestamp:build.buildTimestamp,buildDirty:build.gitDirty};
}
export function launch(args=['--no-browser'],packageRoot=root,trace){
 const executable=join(packageRoot,'launcher');
 const child=spawn(trace?'/usr/bin/strace':executable,trace?['-ff','-s','128','-e','trace=connect','-o',trace,executable,...args]:args,
 {env:{...process.env,PATH:'/nonexistent',NODE_OPTIONS:'--invalid-host-option',LD_LIBRARY_PATH:'/nonexistent'},stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='';child.stdout.on('data',c=>{stdout=(stdout+c).slice(-65536)});child.stderr.on('data',c=>{stderr=(stderr+c).slice(-65536)});
 return {child,exited:once(child,'close'),output:()=>stdout,error:()=>stderr};
}
export async function ready(p){const end=Date.now()+110000;while(!p.output().includes('"event":"ready"')){if(p.child.exitCode!==null)throw new Error('Launcher exited before readiness');if(Date.now()>end)throw new Error('Readiness deadline');await pause(50);}}
export async function quit(p,packageRoot=root){if(p.child.exitCode===null){const q=launch(['--quit'],packageRoot);await q.exited;await p.exited;}}
export async function upload(file='RA-1',signal){const form=new FormData();form.append('audio',new Blob([await readFile(`tools/local-stt/tmp/controlled/${file}.wav`)],{type:'audio/wav'}),'private-validation-filename.wav');form.append('language','en');return fetch(origin+'/api/v1/transcribe',{method:'POST',headers:{Origin:origin},body:form,signal});}
export const tempRoot=join(homedir(),'.local/share/PTE Study',`pte-study-runtime-${process.getuid?.()??'user'}`,'port-8765');
export async function tempEntries(){try{return(await readdir(tempRoot)).filter(n=>n.startsWith('request-'));}catch(e){if(e.code==='ENOENT')return[];throw e;}}
export async function childPids(parent){
 const parents=new Map();for(const name of(await readdir('/proc')).filter(n=>/^\d+$/.test(n))){try{const s=await readFile(`/proc/${name}/status`,'utf8');parents.set(Number(name),Number(s.match(/^PPid:\s*(\d+)/m)?.[1]));}catch{}}
 const result=[];let queue=[parent];while(queue.length){const p=queue.shift();for(const[pid,ppid]of parents)if(ppid===p){result.push(pid);queue.push(pid);}}return result;
}
export async function nativePid(parent){const end=Date.now()+15000;while(Date.now()<end){for(const pid of await childPids(parent)){try{const cmd=await readFile(`/proc/${pid}/cmdline`,'utf8');if(cmd.startsWith(join(root,'native/whisper-cli')+'\0'))return pid;}catch{}}await pause(20);}throw new Error('Native inference did not start');}
export async function persist(name,data){await mkdir(audit,{recursive:true});await writeFile(join(audit,name),JSON.stringify({identity:await identity(),createdAt:new Date().toISOString(),...data},null,2)+'\n');}
