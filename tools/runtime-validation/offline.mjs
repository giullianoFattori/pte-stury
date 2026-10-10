import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root, persist } from './common.mjs';
const home=await mkdtemp('/tmp/pte-0510-offline-');
const args=['--die-with-parent','--new-session','--unshare-all','--ro-bind',root,'/app','--bind',home,'/home/tester','--proc','/proc','--dev','/dev','--tmpfs','/tmp','--ro-bind',resolve('tools/runtime-validation/offline-probe.mjs'),'/probe.mjs'];
for(const [source,dest]of [['RA-1','ra'],['RS-1','rs']])args.push('--ro-bind',resolve(`tools/local-stt/tmp/controlled/${source}.wav`),`/${dest}.wav`);
for(const name of ['libc.so.6','libm.so.6','libdl.so.2','libpthread.so.0','librt.so.1'])args.push('--ro-bind',`/lib/x86_64-linux-gnu/${name}`,`/lib/x86_64-linux-gnu/${name}`);
args.push('--ro-bind','/lib64/ld-linux-x86-64.so.2','/lib64/ld-linux-x86-64.so.2','--clearenv','--setenv','HOME','/home/tester','--setenv','PATH','/nonexistent','--setenv','LD_LIBRARY_PATH','/app/native','/app/native/node','/probe.mjs');
try{const p=spawn('/usr/bin/bwrap',args,{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';p.stdout.on('data',c=>stdout+=c);p.stderr.on('data',c=>stderr+=c);const[code]=await once(p,'close');if(code!==0)throw new Error('Offline isolation failed: '+stderr.slice(0,300));const result=JSON.parse(stdout.trim());await persist('linux-offline.json',{...result,scope:'Filesystem and network isolation on existing Linux kernel; not a clean VM or physical internet-disconnect/browser test'});console.log(stdout.trim());}finally{await rm(home,{recursive:true,force:true});}
