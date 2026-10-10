import { spawnSync } from 'node:child_process';
if(process.platform!=='win32'||process.arch!=='x64')throw new Error('Windows x64 runner required; platform validation cannot be substituted by cross-compilation');
// Native acquisition/build is gated on a reviewed, pinned MSVC/FFmpeg toolchain.
// stage.mjs refuses missing provenance or binaries. No system ffmpeg/PATH fallback.
for(const args of [['run','runtime:test'],['test'],['run','lint'],['run','build'],['run','package:test']]){const r=spawnSync(process.execPath,[process.env.npm_execpath,...args],{stdio:'inherit',shell:false});if(r.status!==0)throw new Error('Windows validation failed');}
const result=spawnSync(process.execPath,['packaging/stage.mjs','windows-x64'],{stdio:'inherit',shell:false});if(result.status!==0)throw new Error('Windows staging incomplete; supply reviewed pinned native inputs per README');
