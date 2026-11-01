import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { waitForBrowserServer } from './helpers/browser-readiness.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 5203, strictPort: true } });
await server.listen(); const base='http://127.0.0.1:5203'; await waitForBrowserServer(server,base+'/study/reorder-paragraph',null); let browser;
try {
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
  const context=await browser.newContext(),errors=[],remote=[];
  context.on('page',page=>{page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(!request.url().startsWith(base)&&!request.url().startsWith('blob:')&&!request.url().startsWith('data:'))remote.push(request.url());});});
  const page=await context.newPage();
  const order=()=>page.getByRole('list',{name:'Current paragraph order'}).getByRole('listitem');
  const current=()=>page.evaluate(async()=>{const{db}=await import('/src/data/db/database.ts');const rows=await db.studyItems.where('taskType').equals('reorder-paragraph').toArray();return{items:rows,attempts:await db.attempts.where('taskType').equals('reorder-paragraph').toArray(),version:db.verno};});
  await page.goto(base+'/study/reorder-paragraph'); await page.getByRole('heading',{name:'Reorder Paragraph',exact:true}).waitFor();
  const initial=await order().allTextContents(); assert.ok(initial.length>=3);
  const rows=await current(),item=rows.items.find(candidate=>candidate.taskData.blocks.every(block=>initial.some(text=>text.includes(block.text)))); assert.ok(item);
  const visibleIds=initial.map(text=>item.taskData.blocks.find(block=>text.includes(block.text))?.id);assert.ok(visibleIds.every(Boolean));assert.notDeepEqual(visibleIds,item.taskData.correctOrder);
  const moveDown=page.getByRole('button',{name:'Move block 1 down',exact:true});await moveDown.focus();await page.keyboard.press('Enter');
  const moveUp=page.getByRole('button',{name:'Move block 2 up',exact:true});await moveUp.focus();await page.keyboard.press('Space');
  await page.getByRole('button',{name:'Submit response',exact:true}).click(); await page.getByRole('heading',{name:'Score',exact:true}).waitFor();
  const partial=await page.evaluate(()=>document.querySelector('[aria-label="Reorder results"]')?.innerText);assert.match(partial,/adjacent pairs/u);
  await page.getByRole('button',{name:'Save attempt',exact:true}).click();await page.getByText('Saved locally.',{exact:true}).waitFor();
  let saved=await current();assert.equal(saved.version,3);assert.equal(saved.attempts.length,1);assert.equal(saved.attempts[0].responseData.kind,'ordered-blocks');assert.equal(saved.attempts[0].responseData.blockIds.length,item.taskData.blocks.length);

  await page.goto(base+'/study'); const task=page.getByRole('region',{name:'Task Practice',exact:true});
  await task.getByRole('radio',{name:'Reorder Paragraph',exact:true}).check(); await task.getByText('5 questions available',{exact:true}).waitFor();
  await task.getByRole('radio',{name:'5',exact:true}).check();await task.getByRole('button',{name:'Start Task Practice',exact:true}).click();await page.waitForURL('**/study/session/*');
  for(let index=0;index<5;index++){
    await page.getByRole('heading',{name:'Reorder Paragraph',exact:true}).waitFor();
    await page.getByRole('button',{name:'Submit response',exact:true}).click();
    await page.getByRole('button',{name:'Save attempt',exact:true}).click();await page.getByRole('button',{name:'Continue',exact:true}).click();
  }
  await page.getByRole('heading',{name:'Task Practice complete',exact:true}).waitFor();
  const summary=page.getByRole('region',{name:'Reorder Paragraph',exact:true});await summary.getByText('5 questions',{exact:true}).waitFor();await summary.getByText('Adjacent-pair accuracy',{exact:true}).waitFor();
  saved=await current();assert.equal(saved.attempts.length,6);assert.ok(saved.attempts.every(attempt=>attempt.metrics.totalAdjacentPairs===attempt.metrics.maxScore));
  await page.getByRole('link',{name:'Back to Study',exact:true}).click();const mixed=page.getByRole('region',{name:'Mixed Practice',exact:true});
  const chosen=['Reading: Fill in the Blanks — Dropdown','Reading: Fill in the Blanks — Drag and Drop','Reorder Paragraph'];
  const allTasks=['Write From Dictation','Repeat Sentence','Read Aloud','Retell Lecture','Summarize Group Discussion','Describe Image','Summarize Written Text','Summarize Spoken Text','Highlight Incorrect Words','Listening: Fill in the Blanks — Type In',...chosen];
  for(const label of allTasks){const checkbox=mixed.getByRole('checkbox',{name:label,exact:true}),shouldSelect=chosen.includes(label);if(shouldSelect&&!await checkbox.isChecked())await checkbox.check();if(!shouldSelect&&await checkbox.isChecked())await checkbox.uncheck();}
  await mixed.getByRole('radio',{name:'5',exact:true}).check();await mixed.getByRole('button',{name:'Start Mixed Practice',exact:true}).click();await page.waitForURL('**/study/session/*');
  const expected=['Reading: Fill in the Blanks — Dropdown','Reading: Fill in the Blanks — Drag and Drop','Reorder Paragraph','Reading: Fill in the Blanks — Dropdown','Reading: Fill in the Blanks — Drag and Drop'];
  for(const title of expected){await page.getByRole('heading',{name:title,exact:true}).waitFor();await page.getByRole('button',{name:'Submit response',exact:true}).click();await page.getByRole('button',{name:'Save attempt',exact:true}).click();await page.getByRole('button',{name:'Continue',exact:true}).click();}
  await page.getByRole('heading',{name:'Mixed Practice complete',exact:true}).waitFor();await page.getByRole('region',{name:'Reorder Paragraph',exact:true}).getByText('1 questions',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
  console.log(JSON.stringify({status:'PASS',browser:browser.version(),standaloneReorderAndPersistence:'PASS',keyboardMoveControls:'PASS',taskPracticeFiveSummary:'PASS',mixedDropdownToDragDropToReorder:'PASS',attemptResponseData:'ordered-blocks',dbVersion:saved.version,pageErrors:errors.length,unexpectedRemoteRequests:remote.length}));
} finally { await browser?.close(); await server.close(); }
