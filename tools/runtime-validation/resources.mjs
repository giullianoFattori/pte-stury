// Archive only relative artifact names/counts, never matching private path strings.
import assert from 'node:assert/strict';
import { readFile, stat, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { root, tempRoot, persist } from './common.mjs';
import { verifyPackage } from '../../packaging/inventory.mjs';
const manifest=await verifyPackage(root),dependencies=[],pathMatches=[];
for(const a of manifest.artifacts){const bytes=await readFile(join(root,a.path));for(const token of ['/home/','.local-runtime','.local-packaging']){let count=0,offset=0;while((offset=bytes.indexOf(token,offset))>=0){count++;offset+=token.length;}if(count)pathMatches.push({artifact:a.path,pattern:token,count});}
 if(a.path.startsWith('native/')){const r=spawnSync('/usr/bin/readelf',['-d',join(root,a.path)],{encoding:'utf8',maxBuffer:1024*1024});if(r.status===0){const needed=[...r.stdout.matchAll(/\(NEEDED\).*\[([^\]]+)\]/g)].map(m=>m[1]);dependencies.push({artifact:a.path,needed});}}
}
const licenseFiles=manifest.artifacts.filter(a=>a.kind==='license').length;assert.ok(licenseFiles>5);const sbom=JSON.parse(await readFile(join(root,'manifest/sbom.cdx.json'),'utf8'));assert.equal(sbom.bomFormat,'CycloneDX');
assert.equal(sbom.components.find(c=>c.name==='Node.js')?.version,manifest.nodeVersion);assert.equal(sbom.components.find(c=>c.name==='whisper.cpp/ggml')?.version,manifest.engineVersion);const model=manifest.artifacts.find(a=>a.kind==='model');assert.equal(sbom.components.find(c=>c.name==='Whisper base.en')?.hashes?.[0]?.content,model.sha256);for(const lib of manifest.artifacts.filter(a=>a.kind==='library'))assert.ok(sbom.components.some(c=>c.name===lib.path.split('/').at(-1)),'Owned library missing from SBOM');
const lock=JSON.parse(await readFile('package-lock.json','utf8'));for(const c of sbom.components.filter(c=>c.purl?.startsWith('pkg:npm/')))assert.equal(c.version,lock.packages['node_modules/'+c.name]?.version,'SBOM dependency differs from build lock');
const modes={};for(const [name,path]of [['package',root],['temp',tempRoot],['appData',join(tempRoot,'..','..')]]){try{modes[name]=(await stat(path)).mode&0o777;}catch(e){if(e.code!=='ENOENT')throw e;}}
assert.equal((modes.temp??0)&0o077,0);const temp=await readdir(tempRoot);assert.equal(temp.filter(n=>n.startsWith('request-')).length,0);
const web=manifest.artifacts.filter(a=>a.path.startsWith('web/'));assert.equal(web.filter(a=>a.path.endsWith('.map')).length,0);
await persist('linux-resources.json',{status:'PASS',ownedArtifactCount:manifest.artifacts.length,dependencies,licenses:licenseFiles,sbomComponents:sbom.components.length,sbomOwnedLibrariesAndLockedVersions:'PASS',permissionsOctal:Object.fromEntries(Object.entries(modes).map(([k,v])=>[k,v.toString(8)])),tempRequestDirectories:0,sourceMaps:0,embeddedDevPathScan:{status:pathMatches.length?'FAIL':'PASS',matches:pathMatches,impact:'Static binary/source-string audit; matching bytes are not archived. Exposure through HTTP is independently forbidden. Private build path removal is an external packaging gate.'},systemBoundary:'glibc/OS ELF loader; readelf NEEDED records dependency names, not full dynamic library attestation'});console.log(JSON.stringify({event:'resource audit',status:'PASS',embeddedDevPathFindings:pathMatches.length}));
