import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateManifest, verifyPackage, validatePackageManifest } from '../inventory.mjs';
import { createStaticServer, PACKAGED_CSP } from '../../runtime/src/static.mjs';
import { startRuntime } from '../../runtime/src/server.mjs';
import { freePort } from '../../runtime/tests/helpers.mjs';
async function fixture(t) {
 const root=await mkdtemp(join(tmpdir(),'pte-package-'));t.after(()=>rm(root,{recursive:true,force:true}));
 for(const path of ['launcher','native/node','native/whisper-cli','native/ffmpeg','native/ffprobe','runtime/packaged.mjs','runtime/main.mjs','web/index.html','web/assets/app-abcdefgh.js','models/ggml-base.en.bin','manifest/whisper-config.cmake','manifest/build.json','manifest/sbom.cdx.json','licenses/NOTICE.txt',...['libstdc++.so.6','libgcc_s.so.1','libavcodec.so.62','libavdevice.so.62','libavfilter.so.11','libavformat.so.62','libavutil.so.60','libswresample.so.6','libswscale.so.9'].map(n=>'native/'+n)]){
  await mkdir(join(root,path,'..'),{recursive:true});await writeFile(join(root,path),'fixture');
 }
 return root;
}
test('complete package inventory verifies; corrupted and extra files fail',async t=>{
 const root=await fixture(t);const m=await generateManifest(root,'linux-x64');assert.equal(m.artifacts.length,23);await verifyPackage(root);
 await writeFile(join(root,'web/index.html'),'corrupt');await assert.rejects(verifyPackage(root));await writeFile(join(root,'web/index.html'),'fixture');
 await writeFile(join(root,'private'),'extra');await assert.rejects(verifyPackage(root));
});
test('missing artifacts and symlink parents fail closed',async t=>{
 const root=await fixture(t);await generateManifest(root,'linux-x64');await rm(join(root,'native/node'));await assert.rejects(verifyPackage(root));
 await symlink('/usr/bin/node',join(root,'native/node'));await assert.rejects(verifyPackage(root));
});
test('manifest rejects traversal, duplicate paths and unsupported targets',async t=>{
 const root=await fixture(t);await assert.rejects(generateManifest(root,'unknown'));const manifest=await generateManifest(root,'linux-x64');
 for(const path of ['../outside','/absolute','native/../node','native\\node','native//node']){const changed=structuredClone(manifest);changed.artifacts[0].path=path;assert.throws(()=>validatePackageManifest(changed));}
 const duplicate=structuredClone(manifest);duplicate.artifacts[1].path=duplicate.artifacts[0].path;assert.throws(()=>validatePackageManifest(duplicate));
 const wrong=structuredClone(manifest);wrong.platform='darwin';assert.throws(()=>validatePackageManifest(wrong));
 await rm(join(root,'launcher'));await assert.rejects(generateManifest(root,'linux-x64'));
});
test('same-origin static serving, CSP, SPA and API isolation',async t=>{
 const root=await fixture(t);const manifest=await generateManifest(root,'linux-x64');const serveStatic=await createStaticServer(join(root,'web'),manifest.artifacts);
 const port=await freePort();const runtime=await startRuntime({apiVersion:1,host:'127.0.0.1',port,model:'base.en',maxUploadBytes:12582912,maxAudioSeconds:180,inferenceTimeoutMs:60000,maxConcurrentTranscriptions:1},{serveStatic, initializeEngine:async()=>({transcribeNormalizedAudio:async()=>({text:'fixture'})})});t.after(()=>runtime.close());
 const base=`http://127.0.0.1:${port}`;
 for(const route of ['/','/study/read-aloud','/study/repeat-sentence']){const r=await fetch(base+route);assert.equal(r.status,200);assert.equal(r.headers.get('content-security-policy'),PACKAGED_CSP);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(await r.text(),'fixture');}
 const asset=await fetch(base+'/assets/app-abcdefgh.js');assert.equal(asset.headers.get('cache-control'),'public, max-age=31536000, immutable');
 for(const route of ['/api/no-such-route','/api/v1/health?x=1','/assets/missing.js','/web/index.html','/%2e%2e/runtime/main.mjs','//index.html','/native/node']){const r=await fetch(base+route);assert.equal(r.status,404,route);assert.match(r.headers.get('content-type'),/json/);}
 for(const method of ['POST','HEAD','OPTIONS','PUT'])assert.equal((await fetch(base+'/',{method})).status,404);
 assert.equal((await fetch(base+'/api/v1/health')).status,200);
 await writeFile(join(root,'web/index.html'),'corrupt');assert.equal((await fetch(base+'/')).status,500);
});
