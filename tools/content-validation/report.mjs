// Assemble only measured, anonymized audit metadata. Missing evidence fails closed.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {cpus,totalmem,platform,arch,release} from 'node:os';
import {prepareBank} from '../content/pipeline.mjs';
import {identity,archive} from '../runtime-validation/common.mjs';
const bank=await prepareBank();
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const browser=await read('audits/content-06.08-browser.json'),persistence=await read('audits/content-06.08-browser-persistence.json'),offline=await read('audits/content-06.08-offline.json');
for(const result of [browser,persistence,offline]){assert.equal(result.status,'PASS');assert.deepEqual(result.identity,browser.identity);}
assert.equal(bank.manifest.contentVersion,browser.catalog.contentVersion);
const scale=await read('audits/content-06.08-scale.json'),browserScale=await read('audits/content-06.08-browser-scale.json');
assert.equal(scale.status,'PASS');assert.equal(browserScale.status,'PASS');assert.deepEqual(scale.measurements.map(r=>r.size),[1000,5000,10000]);assert.deepEqual(browserScale.results.map(r=>r.size),[1000,5000]);assert.ok([...scale.measurements,...browserScale.results].every(r=>r.status==='PASS'));assert.equal(bank.audio.errors.length,0);assert.equal(bank.bundle.items.length,17);
const sourceBytes=(await Promise.all(bank.bundle.items.map(i=>stat(`content/${i.taskType}/${i.id}.json`)))).reduce((n,s)=>n+s.size,0);
const previous=await read('runtime/docs/audits/05.10/linux-integrity.json');
const packageBytes=(await stat(archive)).size;
const report={activity:6,step:8,status:'COMPLETE',createdAt:new Date().toISOString(),catalog:bank.manifest,lifecycle:bank.stats.lifecycle,semanticParity:'PASS; exact comparison against frozen historical 17-item test baseline',metadata:{skills:17,tags:0,topic:0,provenance:'internal; retained repository-authored content, no external question bank imported',revision:'first canonical published revision 1; historical attempts remain unknown'},audio:bank.audio,validationWarnings:bank.warnings,
 sizesBytes:{canonicalSources:sourceBytes,bundle:Buffer.byteLength(bank.bundleBytes),manifest:Buffer.byteLength(bank.manifestBytes),audio:bank.audio.stats.totalBytes,internalPackageArchive:packageBytes,historical0510Archive:previous.inventory.archiveBytes,deltaFromHistorical0510:packageBytes-previous.inventory.archiveBytes,comparisonScope:'Historical 05.10 package; delta is not an isolated content-only measurement'},
 packageIdentity:await identity(),packageSmoke:await read('packaging/out/linux-x64/smoke-report.json'),hardware:{cpu:cpus()[0]?.model,logicalCores:cpus().length,ramBytes:totalmem(),os:platform(),release:release(),arch:arch(),auditNode:process.version},
 scale,browserScale,indexDecision:{schemaVersion:3,status:'retained',reason:'Measured Chrome 1k/5k queries do not demonstrate a need for new indexes; 17-item live bank; revisit using study-session workload and additional hardware evidence'},
 evidence:{browser:'audits/content-06.08-browser.json',diskPersistence:'audits/content-06.08-browser-persistence.json',offline:'audits/content-06.08-offline.json'},
 remainingActivity05Gates:{humanModelBenchmark:'PENDING',cleanMachine:'PENDING',windows:'PENDING',macos:'PENDING',signing:'PENDING',physicalMicrophone:'PENDING'},limits:['Controlled TTS/Web Audio validates the packaged pipeline, not human STT accuracy.','Profile upgrade/history fixtures are synthetic; no private learner data was read or archived.','Browser measurements are one Linux headless Chrome run, not a cross-platform performance guarantee.','Approximate JS heap is not peak RSS or leak proof.','Item revision references do not archive every previous wording/audio.','Verified package was built from the recorded parent Git commit plus a dirty working tree; exact archive/manifest hashes identify it.']};
await mkdir('audits',{recursive:true});await writeFile('audits/content-06.08.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,contentVersion:bank.manifest.contentVersion,sizesBytes:report.sizesBytes}));
