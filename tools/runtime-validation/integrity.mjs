import assert from 'node:assert/strict';
import { cp, readFile, writeFile, rm, symlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { root, launch, persist } from './common.mjs';
import { verifyPackage } from '../../packaging/inventory.mjs';
const copy=join(root,'..','tamper-fixture');await cp(root,copy,{recursive:true});
const manifest=await verifyPackage(copy),checks=[];
async function rejected(name,mutate,restore){try{await mutate();await assert.rejects(verifyPackage(copy));const p=launch(['--verify'],copy);assert.equal((await p.exited)[0],1);assert.ok(!p.output().includes('ready'));assert.ok(!p.error().includes(copy));checks.push({name,status:'PASS',verifierRejected:true,launcherRejected:true});}finally{await restore();}}
try{
 for(const path of [manifest.artifacts.find(a=>a.path.startsWith('web/')&&a.path.endsWith('.js')).path,'native/whisper-cli','models/ggml-base.en.bin','native/ffmpeg']){const file=join(copy,path),bytes=await readFile(file);await rejected('corrupt '+path,()=>writeFile(file,bytes.subarray(0,bytes.length-1)),()=>writeFile(file,bytes));}
 const file=join(copy,'native/ffprobe'),bytes=await readFile(file);await rejected('missing artifact',()=>rm(file),()=>writeFile(file,bytes,{mode:0o755}));
 const extra=join(copy,'unlisted.txt');await rejected('unlisted artifact',()=>writeFile(extra,'test'),()=>rm(extra));
 const frontend=manifest.artifacts.find(a=>a.path.startsWith('web/')&&a.path.endsWith('.js')).path,target=join(copy,frontend),backup=await readFile(target);
 await rejected('symlink resource',async()=>{await rm(target);await symlink(join(root,frontend),target);},async()=>{await rm(target);await writeFile(target,backup);});
 const mf=join(copy,'manifest/package.json'),original=await readFile(mf);const changed=JSON.parse(original);changed.artifacts[0].path='../outside';await rejected('manifest traversal',()=>writeFile(mf,JSON.stringify(changed)),()=>writeFile(mf,original));
 await verifyPackage(copy);
 const inventory={artifacts:manifest.artifacts.length,unpackedBytes:manifest.artifacts.reduce((n,a)=>n+a.size,0),archiveBytes:(await stat('packaging/out/PTE-Study-0.1.0-linux-x64-internal.tar.xz')).size,componentBytes:{}};
 for(const a of manifest.artifacts){const category=a.path.startsWith('models/')?'model':a.path==='native/node'?'node':a.path==='native/whisper-cli'?'whisper':a.path.startsWith('native/')?'decoderAndLibraries':a.path.split('/')[0];inventory.componentBytes[category]=(inventory.componentBytes[category]??0)+a.size;}
 assert.ok(manifest.artifacts.some(a=>a.path==='manifest/sbom.cdx.json'));assert.ok(manifest.artifacts.some(a=>a.path.startsWith('licenses/')));
 await persist('linux-integrity.json',{status:'PASS',inventory,checks,sbom:'PASS',licenses:'PASS',authenticity:'PENDING',label:'INTERNAL/UNSIGNED',limitations:'Hash validation detects corruption; authenticity requires signed distribution. Tamper cases run --verify and cannot start inference.'});console.log(JSON.stringify({event:'integrity validation',status:'PASS',cases:checks.length}));
}finally{await rm(copy,{recursive:true,force:true});}
