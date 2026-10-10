import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { parseQuestionBankItem, safeParseQuestionBankItem, parseQuestionBankItemJson, validateQuestionBankItems } from '../src/domain/content/validation.ts';
import { ContentValidationError } from '../src/domain/content/validationTypes.ts';
import { CONTENT_LIMITS, LEGACY_QUESTION_IDS } from '../src/domain/content/validationPolicy.ts';
import { schemaBytes } from '../tools/content/schema.mjs';
const fixture = async name => JSON.parse(await readFile(new URL(`./fixtures/content/${name}.json`, import.meta.url), 'utf8'));
const ra = await fixture('valid-ra'), rs = await fixture('valid-rs'), wfd = await fixture('valid-wfd'), draft = await fixture('incomplete-draft');
function fails(input, path, code) {
  const result = safeParseQuestionBankItem(input);
  assert.equal(result.success, false);
  assert.ok(result.errors.some(e => e.path === path && e.code === code), JSON.stringify(result.errors));
  assert.throws(() => parseQuestionBankItem(input), ContentValidationError);
}
for (const [task, value] of [['RA', ra], ['RS', rs], ['WFD', wfd]]) {
  test(`${task} complete active/retired fixture is accepted`, () => {
    assert.deepEqual(parseQuestionBankItem(value), value);
    assert.equal(parseQuestionBankItem({ ...value, status: 'retired' }).status, 'retired');
  });
}
test('draft can omit task fields/skills; publication requires them for every task', () => {
  assert.deepEqual(parseQuestionBankItem(draft), draft);
  const minimal={...draft};delete minimal.skills;delete minimal.tags;assert.equal(parseQuestionBankItem(minimal).status,'draft');fails({...draft,skills:undefined},'skills','INVALID_ARRAY');
});
// Each invalid rule has a separate named case/path assertion.
const bad = [
  ['taskType', 'retell-lecture', 'INVALID_TASK_TYPE'], ['taskType', 'Read-Aloud', 'INVALID_TASK_TYPE'],
  ['difficulty', 0, 'INVALID_DIFFICULTY'], ['difficulty', 6, 'INVALID_DIFFICULTY'],
  ['difficulty', 2.5, 'INVALID_DIFFICULTY'], ['difficulty', '2', 'INVALID_DIFFICULTY'],
  ['difficulty', NaN, 'INVALID_DIFFICULTY'], ['difficulty', Infinity, 'INVALID_DIFFICULTY'],
  ['difficulty', true, 'INVALID_DIFFICULTY'],
  ['revision', 0, 'INVALID_REVISION'], ['revision', -1, 'INVALID_REVISION'],
  ['revision', 1.5, 'INVALID_REVISION'], ['revision', '1', 'INVALID_REVISION'],
  ['revision', NaN, 'INVALID_REVISION'], ['revision', Infinity, 'INVALID_REVISION'],
  ['revision', Number.MAX_SAFE_INTEGER + 1, 'INVALID_REVISION'],
  ['status', 'published', 'INVALID_STATUS'], ['status', 'inactive', 'INVALID_STATUS'], ['status', 'Active', 'INVALID_STATUS'],
  ['source', 'commercial', 'INVALID_SOURCE'], ['source', 'Internal', 'INVALID_SOURCE'],
  ['prompt', '', 'INVALID_TEXT'], ['prompt', ' \n\t', 'INVALID_TEXT'], ['prompt', 2, 'INVALID_TEXT'],
  ['prompt', 'x'.repeat(10001), 'INVALID_TEXT'], ['answer', 'x'.repeat(10001), 'INVALID_TEXT'],
  ['transcript', 'x'.repeat(10001), 'INVALID_TEXT'], ['topic', '', 'INVALID_TEXT'], ['topic', 'x'.repeat(201), 'INVALID_TEXT'],
  ['estimatedSeconds', 0, 'INVALID_DURATION'], ['estimatedSeconds', -1, 'INVALID_DURATION'],
  ['estimatedSeconds', Infinity, 'INVALID_DURATION'], ['estimatedSeconds', NaN, 'INVALID_DURATION'], ['estimatedSeconds', '10', 'INVALID_DURATION'],
  ['tags', null, 'INVALID_ARRAY'], ['tags', ['x','x'], 'DUPLICATE_VALUE', 'tags[1]'],
  ['tags', [' '], 'INVALID_TEXT', 'tags[0]'], ['tags', [2], 'INVALID_TEXT', 'tags[0]'],
  ['tags', ['x'.repeat(101)], 'INVALID_TEXT', 'tags[0]'], ['tags', Array.from({length:51},(_,i)=>String(i)), 'INVALID_ARRAY'],
  ['skills', [], 'INVALID_ARRAY'], ['skills', ['math'], 'INVALID_SKILL', 'skills[0]'],
  ['skills', ['Reading'], 'INVALID_SKILL', 'skills[0]'], ['skills', ['reading','reading'], 'DUPLICATE_VALUE', 'skills[1]'],
  ['skills', ['reading','speaking','listening','writing','reading'], 'INVALID_ARRAY'],
  ['chunks', [], 'INVALID_ARRAY'], ['chunks', [''], 'INVALID_TEXT', 'chunks[0]'],
  ['phraseGroups', [], 'INVALID_ARRAY'], ['phraseGroups', [' '], 'INVALID_TEXT', 'phraseGroups[0]'],
  ['stressWords', [], 'INVALID_ARRAY'], ['stressWords', ['Research','Research'], 'DUPLICATE_VALUE', 'stressWords[1]'],
  ['stressWords', [2], 'INVALID_TEXT', 'stressWords[0]'],
];
for (const [field, value, code, path] of bad) test(`${field} rejects ${(typeof value==='string'?JSON.stringify(value.slice(0,30))+' length '+value.length:Array.isArray(value)?'array length '+value.length:String(value))} (${code})`, () => fails({ ...ra, [field]: value }, path ?? field, code));
for (const field of ['prompt','id']) test(`required base ${field}`, () => { const value={...draft};delete value[field];fails(value,field,'REQUIRED_FIELD'); });
for (const [field, code] of [['revision','INVALID_REVISION'],['status','INVALID_STATUS'],['source','INVALID_SOURCE'],['difficulty','INVALID_DIFFICULTY'],['taskType','INVALID_TASK_TYPE']]) test(`required base ${field}`, () => { const value={...draft};delete value[field];fails(value,field,code); });
for (const field of ['audioUrl','createdAt','dificulty','__proto__','constructor']) test(`unknown author field ${field}`, () => fails(JSON.parse(JSON.stringify(ra).replace(/}$/,`,"${field}":"bad"}`)),field,'UNKNOWN_FIELD'));
for (const id of ['rs-000000','rs-00001','rs-0000001','RS-000001','rs-007','ra-007','wfd-006','rs-000001\n',' ra-000001']) test(`invalid ID ${JSON.stringify(id)}`, () => fails({...rs,id},'id','INVALID_ID'));
test('ID prefix must match task, including legacy IDs', () => { fails({...rs,id:'ra-000001'},'id','ID_TASK_MISMATCH');fails({...rs,id:'wfd-001'},'id','ID_TASK_MISMATCH'); });
test('all seventeen exact historical identities validate without production migration', () => {
  const templates={'read-aloud':ra,'repeat-sentence':rs,'write-from-dictation':wfd};
  let count=0;for(const [task,ids] of Object.entries(LEGACY_QUESTION_IDS))for(const id of ids){assert.equal(parseQuestionBankItem({...templates[task],id}).id,id);count++;}assert.equal(count,17);
});
for (const [task, template, required] of [['WFD',wfd,['answer','transcript','audio','skills']],['RS',rs,['answer','transcript','audio','chunks','skills']],['RA',ra,['answer','transcript','skills']]]) {
  for(const field of required)for(const status of ['active','retired'])test(`${task} ${status} requires ${field}`,()=>{const value={...template,status};delete value[field];fails(value,field,'REQUIRED_FIELD');});
  test(`${task} draft can be incomplete but not malformed`,()=>{const value={...template,status:'draft'};for(const field of required)delete value[field];assert.equal(parseQuestionBankItem(value).status,'draft');fails({...template,status:'draft',answer:'different'},'answer','ANSWER_TRANSCRIPT_MISMATCH');});
}
for(const path of ['C:\\audio\\file.mp3','/home/me/file.mp3','https://example.com/a.mp3','//example.com/a.mp3','/audio/../secret','/audio/./a.mp3','/audio//a.mp3','/audio/a.mp3?x=1','/audio/a.mp3#x','/audio/%2e%2e/a.mp3','/audio/a\\b.mp3','/audio/a.mp3\n','/audio/a file.mp3','/audio/.secret','/audio/','/audio/'+ 'a'.repeat(513)])test(`reject audio path ${JSON.stringify(path.slice(0,80))}`,()=>fails({...rs,audio:{path}},'audio.path','INVALID_AUDIO_PATH'));
for(const [field,value,code]of [['sha256','A'.repeat(64),'INVALID_AUDIO_SHA256'],['sha256','a'.repeat(63),'INVALID_AUDIO_SHA256'],['sha256','a'.repeat(64)+'\n','INVALID_AUDIO_SHA256'],['sha256',4,'INVALID_AUDIO_SHA256'],['durationMs',0,'INVALID_DURATION'],['durationMs',1.5,'INVALID_DURATION'],['durationMs',Infinity,'INVALID_DURATION'],['durationMs',Number.MAX_SAFE_INTEGER+1,'INVALID_DURATION'],['durationMs','20','INVALID_DURATION'],['mimeType','video/mp4','INVALID_AUDIO_MIME'],['mimeType','','INVALID_AUDIO_MIME'],['mimeType','audio/mpeg\n','INVALID_AUDIO_MIME'],['mimeType','audio/webm;codecs=opus','INVALID_AUDIO_MIME'],['mimeType',4,'INVALID_AUDIO_MIME']])test(`audio.${field} rejects ${JSON.stringify(value)}`,()=>fails({...rs,audio:{path:'/audio/rs/a.mp3',[field]:value}},'audio.'+field,code));
test('audio object and unknown nested fields are strict',()=>{for(const audio of [null,[],true,'/audio/a.mp3'])fails({...rs,audio},'audio','INVALID_AUDIO_OBJECT');fails({...rs,audio:{}},'audio.path','REQUIRED_FIELD');fails({...rs,audio:{path:'/audio/rs/a.mp3',url:'bad'}},'audio.url','UNKNOWN_FIELD');});
test('whitespace, case, Unicode and order remain unchanged; result is detached/frozen',()=>{
  const value={...ra,prompt:'  Read Ω 📚.\n',answer:' Colour is useful. ',transcript:' Colour is useful. ',tags:['Academic','academic'],stressWords:['Colour','colour'],skills:['speaking','reading']};const before=structuredClone(value),parsed=parseQuestionBankItem(value);assert.deepEqual(value,before);assert.deepEqual(parsed,value);assert.notEqual(parsed.tags,value.tags);assert.ok(Object.isFrozen(parsed)&&Object.isFrozen(parsed.tags));value.tags.push('later');assert.deepEqual(parsed.tags,['Academic','academic']);assert.equal(parsed.prompt,before.prompt);
  assert.equal(parseQuestionBankItem({...draft,prompt:'📚'.repeat(10000)}).prompt.length,20000);
});
test('unknown/object/sparse/getter inputs fail without invoking accessors',()=>{
  for(const value of [null,[],true,1,'item',new Date()])fails(value,'$','INVALID_ITEM');
  const getter={...ra};Object.defineProperty(getter,'answer',{enumerable:true,get(){throw new Error('must not execute');}});fails(getter,'$','INVALID_ITEM');
  const sparse=[];sparse.length=2;fails({...ra,tags:sparse},'tags','INVALID_ARRAY');
  const tagged=['one'];tagged.extra='unknown';fails({...ra,tags:tagged},'tags','INVALID_ARRAY');
  fails({...ra,topic:undefined},'topic','INVALID_TEXT');
});
test('malformed JSON differs from schema errors and JSON budget is bounded',async()=>{
  assert.throws(()=>parseQuestionBankItemJson('{'),e=>e.issues[0].code==='INVALID_JSON');
  assert.throws(()=>parseQuestionBankItemJson(ra),e=>e.issues[0].code==='INVALID_JSON');
  assert.throws(()=>parseQuestionBankItemJson(' '.repeat(CONTENT_LIMITS.jsonCodeUnits+1)),e=>e.issues[0].code==='JSON_TOO_LARGE');
  assert.throws(()=>parseQuestionBankItemJson('{}'),e=>e.issues.some(i=>i.code==='REQUIRED_FIELD'));
  assert.deepEqual(parseQuestionBankItemJson(JSON.stringify(rs)),rs);
  const malformed=await readFile(new URL('./fixtures/content/malformed.json',import.meta.url),'utf8');assert.throws(()=>parseQuestionBankItemJson(malformed),e=>e.issues[0].code==='INVALID_JSON');
});
test('batch duplicates fail across revisions/lifecycles, aggregate paths, and never expose partial items',async()=>{
  const duplicate=validateQuestionBankItems(await fixture('duplicate-id'));assert.equal(duplicate.success,false);assert.ok(duplicate.errors.some(e=>e.code==='DUPLICATE_ID'&&e.path==='items[1].id'));assert.equal('items' in duplicate,false);
  const mixed=validateQuestionBankItems([ra,{...rs,difficulty:0},{...wfd,revision:0}]);assert.equal(mixed.success,false);assert.ok(mixed.errors.some(e=>e.path==='items[1].difficulty'));assert.ok(mixed.errors.some(e=>e.path==='items[2].revision'));assert.equal('items' in mixed,false);
  assert.equal(validateQuestionBankItems(null).errors[0].code,'INVALID_BATCH');assert.equal(validateQuestionBankItems(Array(10001)).errors[0].code,'INVALID_BATCH');assert.equal(validateQuestionBankItems([]).success,true);
});
test('same task exact prompt/content and active shared audio warn without failing',()=>{
  const result=validateQuestionBankItems([rs,{...rs,id:'rs-000003'}]);assert.equal(result.success,true);assert.deepEqual(result.errors,[]);assert.deepEqual(result.warnings.map(e=>e.code),['DUPLICATE_PROMPT','DUPLICATE_ANSWER','DUPLICATE_TRANSCRIPT','DUPLICATE_AUDIO_PATH']);assert.equal(result.warnings[0].path,'items[1].prompt');
  const draftShared=validateQuestionBankItems([{...rs,status:'draft'},{...rs,id:'rs-000003',status:'draft'}]);assert.ok(!draftShared.warnings.some(e=>e.code==='DUPLICATE_AUDIO_PATH'));
  const different=validateQuestionBankItems([rs,{...rs,id:'rs-000003',prompt:rs.prompt+' ',answer:rs.answer.toUpperCase(),transcript:rs.transcript.toUpperCase(),audio:{path:'/audio/other.mp3'}}]);assert.deepEqual(different.warnings,[]);
});
test('named invalid fixtures report their field-specific issue',async()=>{
  for(const [name,path,code]of [['invalid-short-id','id','INVALID_ID'],['prefix-mismatch','id','ID_TASK_MISMATCH'],['bad-revision','revision','INVALID_REVISION'],['bad-difficulty','difficulty','INVALID_DIFFICULTY'],['bad-audio-path','audio.path','INVALID_AUDIO_PATH'],['unknown-field','dificulty','UNKNOWN_FIELD'],['active-rs-missing-chunks','chunks','REQUIRED_FIELD'],['ra-answer-mismatch','answer','ANSWER_TRANSCRIPT_MISMATCH']])fails(await fixture(name),path,code);
});
test('committed schema is generated from the runtime policy and declares runtime equality',async()=>{
  assert.equal(await readFile('content/schemas/question-bank.schema.json','utf8'),schemaBytes());const schema=JSON.parse(schemaBytes());assert.equal(schema.additionalProperties,false);assert.equal(schema['x-pte-schemaVersion'],1);assert.equal(schema['x-pte-semanticRules'][0].code,'ANSWER_TRANSCRIPT_MISMATCH');assert.deepEqual(Object.keys(schema.properties).sort(),['id','taskType','difficulty','prompt','answer','transcript','audio','chunks','phraseGroups','stressWords','revision','status','source','tags','skills','topic','estimatedSeconds'].sort());
});
test('validation-only CLI accepts examples and fails on invalid/syntax input',()=>{
  for(const args of [[],['tests/fixtures/content/bad-revision.json'],['tests/fixtures/content/malformed.json']]){const r=spawnSync(process.execPath,['tools/content/validate.mjs',...args],{encoding:'utf8'});assert.equal(r.status,args.length?1:0);const report=JSON.parse(r.stdout);assert.equal(report.success,!args.length);if(args.length)assert.ok(report.errors.length);}
});

test('JSON repeated keys, including escaped and nested keys, reject instead of last-value override',()=>{
  for(const [json,path]of [['{"id":"ra-000001","id":"ra-000002"}','id'],['{"id":"ra-000001","\\u0069d":"ra-000001"}','id'],['{"audio":{"path":"/audio/a.mp3","path":"/audio/b.mp3"}}','audio.path']])assert.throws(()=>parseQuestionBankItemJson(json),e=>e.issues[0].code==='DUPLICATE_JSON_KEY'&&e.issues[0].path===path);
  assert.throws(()=>parseQuestionBankItemJson('['.repeat(65)+'0'+']'.repeat(65)),e=>e.issues[0].code==='JSON_TOO_DEEP');
  const tricky={...ra,prompt:'A quote: "id" and punctuation {,}: with a backslash \\.'};assert.deepEqual(parseQuestionBankItemJson(JSON.stringify(tricky)),tricky);
});
test('entry count/length budgets, mismatches and combined diagnostics remain precise',()=>{
  for(const field of ['chunks','phraseGroups','stressWords']){fails({...ra,[field]:Array.from({length:201},(_,i)=>String(i))},field,'INVALID_ARRAY');fails({...ra,[field]:['x'.repeat(1001)]},field+'[0]','INVALID_TEXT');}
  for(const item of [ra,rs,wfd])fails({...item,answer:item.answer+' '},'answer','ANSWER_TRANSCRIPT_MISMATCH');
  const result=safeParseQuestionBankItem({...ra,skills:[null,'math']});assert.equal(result.success,false);assert.ok(result.errors.some(e=>e.path==='skills[0]'&&e.code==='INVALID_TEXT'));assert.ok(result.errors.some(e=>e.path==='skills[1]'&&e.code==='INVALID_SKILL'));
  const input=[ra,rs,wfd],before=structuredClone(input);assert.equal(validateQuestionBankItems(input).success,true);assert.deepEqual(input,before);
});

test('CLI rejects invalid UTF-8 and nonregular source input without silent replacement',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'pte-content-'));
  try {const file=join(directory,'bad.json');await writeFile(file,Buffer.from([0x7b,0x22,0x61,0x22,0x3a,0x22,0xff,0x22,0x7d]));
    for(const [path,code]of [[file,'INVALID_JSON'],[directory,'READ_FAILED']]){const r=spawnSync(process.execPath,['tools/content/validate.mjs',path],{encoding:'utf8'});assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).errors[0].code,code);}
  }finally{await rm(directory,{recursive:true,force:true});}
});
