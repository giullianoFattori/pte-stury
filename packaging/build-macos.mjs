import { spawnSync } from 'node:child_process';
if(process.platform!=='darwin'||!['x64','arm64'].includes(process.arch))throw new Error('Matching macOS runner required');
// Xcode/SDK/native acquisition is a release gate; stage requires exact provenance.
for(const args of [['run','runtime:test'],['test'],['run','lint'],['run','build'],['run','package:test']]){const r=spawnSync(process.execPath,[process.env.npm_execpath,...args],{stdio:'inherit',shell:false});if(r.status!==0)throw new Error('macOS validation failed');}
const result=spawnSync(process.execPath,['packaging/stage.mjs',`macos-${process.arch}`],{stdio:'inherit',shell:false});if(result.status!==0)throw new Error('macOS staging incomplete; supply reviewed pinned native inputs per README');
