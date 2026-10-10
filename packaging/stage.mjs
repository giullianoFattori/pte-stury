import { cp, copyFile, mkdir, readFile, writeFile, lstat, realpath, rm } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { generateManifest, verifyPackage, listFiles, TARGETS } from './inventory.mjs';
import { stageGeneratedContent } from './content.mjs';
const target = process.argv[2];
if (!TARGETS[target] || TARGETS[target][0] !== process.platform || TARGETS[target][1] !== process.arch) throw new Error('Stage on the matching native target; cross-compilation alone is not validation');
const locks = JSON.parse(await readFile('packaging/sources.lock.json', 'utf8'));
const input = resolve(`.local-packaging/inputs/${target}`), output = resolve(`packaging/out/${target}/PTE-Study`);
try { const previous = await lstat(output); if (!previous.isDirectory() || previous.isSymbolicLink() || await realpath(output) !== output) throw new Error('Unsafe output'); await rm(output, { recursive: true }); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const build = JSON.parse(await readFile(join(input,'build.json'),'utf8'));
if (build.whisperRevision !== locks.whisper.revision || build.ffmpegSourceSHA256 !== locks.ffmpeg.sha256 || build.nodeVersion !== locks.node.version
  || !build.compiler || !build.cmake || !Array.isArray(build.ffmpegFlags) || !build.ffmpegFlags.includes('--disable-gpl') || !build.ffmpegFlags.includes('--disable-network')) throw new Error('Missing pinned native provenance');
for (const directory of ['native','web','runtime','models','manifest','licenses']) await mkdir(join(output,directory),{recursive:true});
await cp(join(input,'native'),join(output,'native'),{recursive:true, dereference:false});
await copyFile(`.local-packaging/launchers/${target}/launcher${process.platform==='win32'?'.exe':''}`,join(output,`launcher${process.platform==='win32'?'.exe':''}`));
for (const name of await listFiles('runtime/src')) if(name.endsWith('.mjs')) await copyFile(join('runtime/src',name),join(output,'runtime',name));
await cp('dist',join(output,'web'),{recursive:true});
await stageGeneratedContent(output);
await copyFile('.local-runtime/models/ggml-base.en.bin',join(output,'models/ggml-base.en.bin'));
await copyFile(join(input,'whisper-config.cmake'),join(output,'manifest/whisper-config.cmake'));
await copyFile(join(input,'build.json'),join(output,'manifest/build.json'));
await cp(join(input,'licenses'),join(output,'licenses'),{recursive:true});
const npm = JSON.parse(await readFile('package-lock.json','utf8'));
const components=[];
for(const [path,entry] of Object.entries(npm.packages)) {
 if (!path || entry.dev) continue;
 const name=path.split('node_modules/').at(-1), root=resolve(path);
 const license=(await listFiles(root)).find(path=>/^LICENSE(?:\.md|\.txt)?$/i.test(path));
 if(!license) throw new Error(`Missing production dependency license: ${name}`);
 await copyFile(join(root,license),join(output,'licenses',name.replaceAll('/','-')+'.txt'));
 components.push({type:'library',name,version:entry.version,purl:`pkg:npm/${name.replace('@','%40')}@${entry.version}`,licenses:entry.license?[{license:{id:entry.license}}]:[]});
}
components.push({type:'application',name:'Node.js',version:locks.node.version},{type:'application',name:'whisper.cpp/ggml',version:locks.whisper.version},
 {type:'application',name:'FFmpeg',version:locks.ffmpeg.version,licenses:[{license:{id:'LGPL-2.1-or-later'}}]},
 {type:'data',name:'Whisper base.en',version:locks.model.sha256,hashes:[{alg:'SHA-256',content:locks.model.sha256}]},
 {type:'application',name:'PTE Study launcher (Go standard library)',version:locks.go.version});
for(const path of (await listFiles(join(output,'native'))).filter(path=>/\.(so(\.\d+)*|dylib|dll)$/.test(path))) components.push({type:'library',name:basename(path),version:build.nativeLibraryVersions?.[basename(path)]??'see artifact inventory'});
await writeFile(join(output,'manifest/sbom.cdx.json'),JSON.stringify({bomFormat:'CycloneDX',specVersion:'1.6',version:1,metadata:{component:{type:'application',name:'PTE Study',version:'0.1.0'}},components},null,2)+'\n');
await writeFile(join(output,'licenses/NOTICE.txt'), 'PTE Study 0.1.0 internal unsigned package.\nModel choice is pending human speech evidence.\nThird-party complete notices are included alongside this file.\nFFmpeg is a shared LGPL build without GPL/nonfree components or external codec libraries.\nCorresponding pinned source and build instructions accompany the distribution archive.\nNo telemetry, transcript or audio logs.\n');
const manifest=await generateManifest(output,target);await verifyPackage(output);
const sizes={};for(const entry of manifest.artifacts){const category=entry.path.split('/')[0];sizes[category]=(sizes[category]??0)+entry.size;}
await writeFile(`packaging/out/${target}/size-report.json`,JSON.stringify({target,bytes:sizes,totalBytes:manifest.artifacts.reduce((n,a)=>n+a.size,0)},null,2)+'\n');
console.log(JSON.stringify({event:'package staged',target,artifacts:manifest.artifacts.length}));
