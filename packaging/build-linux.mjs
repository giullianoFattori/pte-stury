import { spawnSync } from 'node:child_process';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
if(process.platform!=='linux'||process.arch!=='x64')throw new Error('Linux x64 build host required');
const locks=JSON.parse(await readFile('packaging/sources.lock.json','utf8'));
const cache=resolve('.local-packaging');await mkdir(`${cache}/downloads`,{recursive:true});
function run(tool,args,options={}){const r=spawnSync(tool,args,{stdio:'inherit',shell:false,...options});if(r.status!==0)throw new Error('Build command failed');}
async function acquire(url,path,hash){try{await stat(path)}catch{run('curl',['-fL','--proto','=https','--tlsv1.2','--max-time','180',url,'-o',path]);}const bytes=await readFile(path);if(createHash('sha256').update(bytes).digest('hex')!==hash)throw new Error('Source checksum mismatch');}
await acquire(locks.model.license.url,`${cache}/downloads/Whisper-model-LICENSE.txt`,locks.model.license.sha256);
await acquire(locks.go.url,`${cache}/downloads/go.tar.gz`,locks.go.sha256);
await acquire(locks.node.urlBase+locks.node.archives['linux-x64'].file,`${cache}/downloads/node.tar.xz`,locks.node.archives['linux-x64'].sha256);
await acquire(locks.ffmpeg.url,`${cache}/downloads/ffmpeg.tar.xz`,locks.ffmpeg.sha256);
run('tar',['-xzf',`${cache}/downloads/go.tar.gz`,'-C',cache]);run('tar',['-xJf',`${cache}/downloads/node.tar.xz`,'-C',cache]);run('tar',['-xJf',`${cache}/downloads/ffmpeg.tar.xz`,'-C',cache]);
const node=`${cache}/node-v${locks.node.version}-linux-x64/bin/node`,npm=`${cache}/node-v${locks.node.version}-linux-x64/lib/node_modules/npm/bin/npm-cli.js`;
const buildEnv={...process.env,PATH:`${cache}/node-v${locks.node.version}-linux-x64/bin:${process.env.PATH}`};
for(const args of [['ci'],['run','runtime:test'],['test'],['run','lint'],['run','build'],['run','package:test']])run(node,[npm,...args],{env:buildEnv});
run(node,['packaging/build-launchers.mjs']);
run(`${cache}/go/bin/go`,['test','./...'],{cwd:'packaging/launcher',env:{...buildEnv,GOCACHE:cache+'/go-cache',GOTOOLCHAIN:'local'}});
// Fetch only the pinned repository/revision into an isolated build checkout.
const whisper=`${cache}/whisper-source`;try{await stat(whisper)}catch{run('git',['clone','--no-checkout',locks.whisper.repository,whisper]);}
run('git',['-C',whisper,'checkout','--detach',locks.whisper.revision]);
const revision=spawnSync('git',['-C',whisper,'rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim();if(revision!==locks.whisper.revision)throw new Error('Wrong engine revision');
const cmake=resolve('.local-runtime/cmake-package/cmake/data/bin/cmake');
run(cmake,['-S',whisper,'-B',cache+'/whisper-build-clean','-DCMAKE_BUILD_TYPE=Release','-DBUILD_SHARED_LIBS=OFF','-DGGML_NATIVE=OFF','-DGGML_OPENMP=OFF','-DGGML_BLAS=OFF','-DGGML_CUDA=OFF','-DGGML_VULKAN=OFF','-DGGML_METAL=OFF','-DWHISPER_BUILD_SERVER=OFF','-DWHISPER_BUILD_TESTS=OFF','-DCMAKE_EXE_LINKER_FLAGS=-static-libgcc -static-libstdc++']);
run(cmake,['--build',cache+'/whisper-build-clean','--target','whisper-cli','-j4']);
run('./configure',JSON.parse(await readFile('packaging/ffmpeg-flags.json','utf8')),{cwd:cache+'/ffmpeg-'+locks.ffmpeg.version});
run('make',['-j4'],{cwd:cache+'/ffmpeg-'+locks.ffmpeg.version});
run(node,['packaging/prepare-linux.mjs']);run(node,['packaging/stage.mjs','linux-x64']);run(node,['packaging/smoke.mjs']);
run('tar',['-I','xz -1 -T2','-cf','packaging/out/PTE-Study-0.1.0-linux-x64-internal.tar.xz','-C','packaging/out/linux-x64','PTE-Study']);
console.log('Internal unsigned Linux archive built. External release requires signing and clean-machine validation.');
