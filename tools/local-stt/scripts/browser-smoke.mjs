// Optional developer tool; no Playwright dependency is added to the app.
const { chromium } = await import(process.env.PTE_POC_PLAYWRIGHT_MODULE ?? 'playwright');
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');
const browser = await chromium.launch({executablePath:process.env.PTE_POC_CHROME ?? '/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
try {
 const page = await browser.newPage();
 const errors = [];
 page.on('pageerror', error=>errors.push(error.message));
 page.on('request', request=>{const url=new URL(request.url()); if(['http:','https:'].includes(url.protocol)) assert.equal(url.hostname,'127.0.0.1');});
 await page.goto('http://127.0.0.1:5178/tools/local-stt/index.html');
 await page.getByRole('heading',{name:'Local Whisper POC — Activity 04.9'}).waitFor();
 const rows = [];
 for(const [index,id] of ['RA-1','RA-2','RS-1','RS-2','RS-3'].entries()) {
  await page.locator('select').selectOption(String(index));
  const reference = (await readFile(`${root}/tools/local-stt/tmp/controlled/${id}.txt`,'utf8')).trim();
  if(index>=2) assert.equal((await page.locator('body').innerText()).includes(reference),false,'RS answer leakage');
  const source = [...await readFile(`${root}/tools/local-stt/tmp/controlled/${id}.wav`)];
  const recorded = await page.evaluate(async bytes=>{
    const context=new AudioContext();
    await context.resume();
    const buffer=await context.decodeAudioData(new Uint8Array(bytes).buffer);
    const player=context.createBufferSource(); player.buffer=buffer;
    const destination=context.createMediaStreamDestination(); player.connect(destination);
    const recorder=new MediaRecorder(destination.stream,{mimeType:'audio/webm;codecs=opus'});
    const chunks=[];
    recorder.ondataavailable=event=>chunks.push(event.data);
    const finished=new Promise(resolve=>recorder.onstop=resolve);
    recorder.start(); player.start();
    await new Promise(resolve=>player.onended=resolve);
    await new Promise(resolve=>setTimeout(resolve,100));
    recorder.stop(); await finished;
    const blob=new Blob(chunks,{type:recorder.mimeType});
    const transfer=new DataTransfer(); transfer.items.add(new File([blob],'controlled.webm',{type:blob.type}));
    const input=document.querySelector('input[type=file]'); input.files=transfer.files; input.dispatchEvent(new Event('change',{bubbles:true}));
    const meta={mime:blob.type,bytes:blob.size,sourceSeconds:buffer.duration};
    destination.stream.getTracks().forEach(track=>track.stop()); await context.close(); return meta;
  },source);
  const responsePromise=page.waitForResponse(response=>response.url().endsWith('/__local-stt/transcribe'),{timeout:210000});
  await page.getByRole('button',{name:'Transcribe locally',exact:true}).click();
  const response=await responsePromise;
  assert.equal(response.status(),200,await response.text());
  const result=await response.json();
  await page.getByRole('heading',{name:'Raw transcript',exact:true}).waitFor();
  await page.locator('textarea').fill(reference);
  await page.getByRole('button',{name:'Measure STT WER'}).click();
  const evaluation=await page.evaluate(async ({reference,text,index})=>{
    const {measureWordErrors,comparePocResponse}=await import('/src/infrastructure/speech/whisperPocEvaluation.ts');
    const {readAloudQuestions}=await import('/src/data/question-bank/read-aloud.ts');
    const {repeatSentenceQuestions}=await import('/src/data/question-bank/repeat-sentence.ts');
    const item=[readAloudQuestions[0],readAloudQuestions[4],repeatSentenceQuestions[0],repeatSentenceQuestions[2],repeatSentenceQuestions[4]][index];
    return {...measureWordErrors(reference,text),pte:comparePocResponse(index<2?'ra':'rs',item.transcript,text,item.chunks)};
  },{reference,text:result.text,index});
  const row={id,provenance:'synthetic flite slt through actual Chrome MediaRecorder',reference,model:'base.en',...recorded,...result,...evaluation};
  rows.push(row);
  console.log(JSON.stringify({id,text:row.text,words:row.words,S:row.S,D:row.D,I:row.I,wer:row.wer,audioSeconds:row.audioSeconds,inferenceSeconds:row.inferenceSeconds,realTimeFactor:row.realTimeFactor}));
 }
 assert.deepEqual(errors,[]);
 await writeFile(`${root}/tools/local-stt/tmp/browser-controlled-results.json`,JSON.stringify(rows,null,2));
 console.log('Five controlled MediaRecorder -> local bridge -> whisper-server -> RA/RS cases passed; no external page requests.');
} finally {await browser.close();}
