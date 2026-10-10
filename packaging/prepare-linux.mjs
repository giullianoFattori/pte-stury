// Build-only trusted paths. Runtime never accepts these through config or HTTP.
import { mkdir, copyFile, readFile, writeFile, realpath, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
if(process.platform!=='linux'||process.arch!=='x64')throw new Error('Linux x64 builder required');
const locks=JSON.parse(await readFile('packaging/sources.lock.json','utf8'));
const base='.local-packaging/inputs/linux-x64';for(const dir of ['native','licenses'])await mkdir(join(base,dir),{recursive:true});
for(const [name,expected] of Object.entries(locks.linuxRuntimeLibraries)){const bytes=await readFile('/lib/x86_64-linux-gnu/'+name);if(bytes.length!==expected.size||createHash('sha256').update(bytes).digest('hex')!==expected.sha256)throw new Error('Unreviewed OS runtime library');await writeFile(join(base,'native',name),bytes,{mode:0o755});}
const ff='.local-packaging/ffmpeg-8.0.3';
for(const tool of ['ffmpeg','ffprobe'])await copyFile(join(ff,tool),join(base,'native',tool));
for(const dir of ['libavcodec','libavdevice','libavfilter','libavformat','libavutil','libswresample','libswscale']){
 for(const name of await readdir(join(ff,dir)))if(/\.so\.\d+$/.test(name))await copyFile(await realpath(join(ff,dir,name)),join(base,'native',name));
}
await copyFile('.local-packaging/node-v24.21.0-linux-x64/bin/node',join(base,'native/node'));
await copyFile('.local-packaging/whisper-build-clean/bin/whisper-cli',join(base,'native/whisper-cli'));
await copyFile('.local-packaging/whisper-build-clean/whisper-config.cmake',join(base,'whisper-config.cmake'));
for(const [source,name] of [['.local-packaging/node-v24.21.0-linux-x64/LICENSE','Node.txt'],['.local-packaging/go/LICENSE','Go.txt'],['.local-packaging/whisper-source/LICENSE','whisper-ggml.txt'],[join(ff,'COPYING.LGPLv2.1'),'FFmpeg-LGPL.txt']])await copyFile(source,join(base,'licenses',name));
await copyFile('.local-packaging/downloads/Whisper-model-LICENSE.txt',join(base,'licenses/Whisper-model-MIT.txt'));
await copyFile('.local-packaging/downloads/ffmpeg.tar.xz',join(base,'licenses/FFmpeg-corresponding-source.tar.xz'));
await copyFile('packaging/ffmpeg-flags.json',join(base,'licenses/FFmpeg-build-flags.json'));
await copyFile('/usr/share/doc/libgcc-s1/copyright',join(base,'licenses/GCC-runtime.txt'));
const flags=JSON.parse(await readFile('packaging/ffmpeg-flags.json','utf8'));
const output=(tool,args)=>{const r=spawnSync(tool,args,{encoding:'utf8',maxBuffer:1024*1024});if(r.status!==0)throw new Error('Build metadata failed');return r.stdout.trim();};
const commit=output('git',['rev-parse','HEAD']);
await writeFile(join(base,'build.json'),JSON.stringify({target:'linux-x64',gitCommit:commit,gitDirty:!!output('git',['status','--porcelain']),
 nodeVersion:locks.node.version,whisperRevision:locks.whisper.revision,ffmpegSourceSHA256:locks.ffmpeg.sha256,
 compiler:output('cc',['--version']).split('\n')[0],cmake:output('.local-runtime/cmake-package/cmake/data/bin/cmake',['--version']).split('\n')[0],go:locks.go.version,ffmpegFlags:flags,
 whisperFlags:['Release','BUILD_SHARED_LIBS=OFF','GGML_NATIVE=OFF','GGML_OPENMP=OFF','CPU','AVX/AVX2/FMA/F16C required for this internal x64 build','static-libgcc','static-libstdc++'],
 nativeLibraryVersions:{...Object.fromEntries((await readdir(join(base,'native'))).filter(n=>n.includes('.so.')).map(n=>[n,'FFmpeg 8.0.3'])),...Object.fromEntries(Object.entries(locks.linuxRuntimeLibraries).map(([n,v])=>[n,v.source]))},
 systemDependencies:['glibc >= 2.38 (internal Ubuntu 24.04 build)','AVX2/FMA/F16C-capable x64 CPU','OS ELF loader','system default browser','xdg-open'],
 reproducibility:'Pinned inputs and build metadata; byte-for-byte builds across different compilers are not claimed.'},null,2)+'\n');
