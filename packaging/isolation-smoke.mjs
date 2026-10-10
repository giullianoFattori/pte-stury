// Linux-only filesystem isolation smoke; not a substitute for an actual clean OS.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { once } from 'node:events';
import assert from 'node:assert/strict';
if(process.platform!=='linux'||process.arch!=='x64')throw new Error('Linux x64 only');
const homeFixture=await mkdtemp(join(tmpdir(),'pte-package-home-'));
const root=resolve('packaging/out/linux-x64/PTE-Study');
const mounts=['--die-with-parent','--new-session','--unshare-all','--share-net','--ro-bind',root,'/app','--bind',homeFixture,homedir(),'--proc','/proc','--dev','/dev','--tmpfs','/tmp'];
for(const name of ['libc.so.6','libm.so.6','libdl.so.2','libpthread.so.0','librt.so.1'])mounts.push('--ro-bind',`/lib/x86_64-linux-gnu/${name}`,`/lib/x86_64-linux-gnu/${name}`);
mounts.push('--ro-bind','/lib64/ld-linux-x86-64.so.2','/lib64/ld-linux-x86-64.so.2','--setenv','PATH','/nonexistent');
const child=spawn('/usr/bin/bwrap',[...mounts,'/app/launcher','--no-browser'],{stdio:['ignore','pipe','pipe']});const exited=once(child,'close');let output='';child.stdout.on('data',c=>output+=c);let error='';child.stderr.on('data',c=>error+=c);
try{
 const end=Date.now()+110000;while(!output.includes('"event":"ready"')){if(child.exitCode!==null)throw new Error('Filesystem isolation unavailable or packaged startup failed: '+error.slice(0,200));if(Date.now()>end)throw new Error('Isolation readiness timeout');await new Promise(r=>setTimeout(r,100));}
 assert.equal((await fetch('http://127.0.0.1:8765/study/read-aloud')).status,200);
 const form=new FormData();form.append('audio',new Blob([await readFile('tools/local-stt/tmp/controlled/RA-1.wav')],{type:'audio/wav'}),'fixture.wav');form.append('language','en');
 assert.equal((await fetch('http://127.0.0.1:8765/api/v1/transcribe',{method:'POST',headers:{Origin:'http://127.0.0.1:8765'},body:form})).status,200);
 child.kill('SIGTERM');await exited;
 const report={target:'linux-x64',filesystemIsolation:true,exposedResources:['package','private temporary home','proc/dev/tmp','glibc/OS loader'],hostNodeExposed:false,hostFFmpegExposed:false,hostDevelopmentToolsExposed:false,realControlledTranscription:true,cleanMachineCertified:false};await writeFile('packaging/out/linux-x64/isolation-smoke-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{if(child.exitCode===null){child.kill('SIGTERM');await exited;}await rm(homeFixture,{recursive:true,force:true});}
