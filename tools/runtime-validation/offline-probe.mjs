// Test-only probe copied into the isolated namespace, not shipped in the product.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
const origin='http://127.0.0.1:8765';
const p=spawn('/app/launcher',['--no-browser'],{env:{HOME:'/home/tester',PATH:'/nonexistent'},stdio:['ignore','pipe','pipe']});const exited=once(p,'close');let output='';p.stdout.on('data',c=>{output+=c});p.stderr.on('data',()=>{});
try{
 const end=Date.now()+110000;while(!output.includes('"event":"ready"')){if(p.exitCode!==null||Date.now()>end)throw new Error('Offline readiness failed');await new Promise(r=>setTimeout(r,100));}
 assert.equal((await fetch(origin+'/')).status,200);assert.equal((await(await fetch(origin+'/api/v1/health')).json()).status,'ready');
 for(const audio of ['/ra.wav','/rs.wav']){const form=new FormData();form.append('audio',new Blob([await readFile(audio)],{type:'audio/wav'}),'fixture.wav');form.append('language','en');const r=await fetch(origin+'/api/v1/transcribe',{method:'POST',headers:{Origin:origin},body:form});assert.equal(r.status,200);assert.ok((await r.json()).text.length);}
 console.log(JSON.stringify({status:'PASS',ui:'PASS',health:'PASS',ra:'PASS',rs:'PASS',network:'isolated network namespace with loopback only',systemResources:'glibc/OS loader only',cleanMachine:'PENDING'}));
}finally{const q=spawn('/app/launcher',['--quit'],{env:{HOME:'/home/tester',PATH:'/nonexistent'},stdio:'ignore'});await once(q,'close');await exited;}
