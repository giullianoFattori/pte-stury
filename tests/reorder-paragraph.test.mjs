import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { scoreReorderParagraph, shuffleParagraphIds } from '../src/domain/scoring/reorder-paragraph/index.ts';
import { readTaskData } from '../src/domain/content/taskDataValidation.ts';
import { buildReorderParagraphAttempt } from '../src/features/reorder-paragraph/services/buildReorderParagraphAttempt.ts';
import { buildReorderParagraphErrorRecords } from '../src/features/reorder-paragraph/services/buildReorderParagraphErrorRecords.ts';
import { buildReorderParagraphReviewItems } from '../src/features/reorder-paragraph/services/buildReorderParagraphReviewItems.ts';

const correct = ['A','B','C','D'];
test('scores authored adjacent pairs, not position or edit distance', () => {
  for (const [response, score] of [[['A','B','D','C'],1],[['B','C','D','A'],2],[['D','C','B','A'],0],[correct,3]]) {
    const result = scoreReorderParagraph(correct, response); assert.equal(result.rawScore, score); assert.equal(result.maxScore, 3); assert.equal(result.accuracy, score / 3);
  }
});
test('rejects duplicate, missing, unknown, and undersized orders', () => {
  for (const response of [['A','A','C','D'],['A','B','C'],['A','B','C','X'],['A','B']]) assert.throws(() => scoreReorderParagraph(correct,response));
  assert.throws(() => scoreReorderParagraph(['A','A','C'],['A','C','A']));
});
test('seeded shuffle is stable, complete and never initially solved', () => {
  const a=shuffleParagraphIds(correct,correct,'item:attempt-1'), b=shuffleParagraphIds(correct,correct,'item:attempt-1');
  assert.deepEqual(a,b); assert.notDeepEqual(a,correct); assert.deepEqual([...a].sort(),correct);
  assert.notDeepEqual(shuffleParagraphIds(correct,correct,'item:attempt-2'),correct);
});
test('five published items satisfy structural and 110-word contracts', async () => {
  for (let n=1;n<=5;n++) {
    const item=JSON.parse(await readFile(`content/reorder-paragraph/rop-${String(n).padStart(6,'0')}.json`,'utf8'));
    const data=readTaskData(item,'reorder-paragraph'); assert.ok(data.blocks.length>=3); assert.equal(new Set(data.blocks.map(b=>b.id)).size,data.blocks.length);
    assert.equal(new Set(data.correctOrder).size,data.blocks.length); assert.deepEqual([...data.correctOrder].sort(),data.blocks.map(b=>b.id).sort());
    assert.ok(data.blocks.every(block=>block.text.trim()));
    const words=data.correctOrder.map(id=>data.blocks.find(b=>b.id===id).text).join(' ').trim().split(/\s+/u).length; assert.ok(words<=110);
  }
});
test('published text boundary accepts exactly 110 words and rejects 111', async () => {
  const source=JSON.parse(await readFile('content/reorder-paragraph/rop-000001.json','utf8'));
  const { parseQuestionBankItem }=await import('../src/domain/content/validation.ts');
  const counted=count=>{const item=structuredClone(source),base=Math.floor(count/item.taskData.blocks.length),extra=count%item.taskData.blocks.length;item.taskData.blocks.forEach((block,index)=>{block.text=Array(base+(index<extra?1:0)).fill('word').join(' ');});return item;};
  assert.doesNotThrow(()=>parseQuestionBankItem(counted(110)));
  assert.throws(()=>parseQuestionBankItem(counted(111)));
});
test('attempt preserves ordered IDs, revision, normalized score and deterministic diagnostics', async () => {
  const item=JSON.parse(await readFile('content/reorder-paragraph/rop-000001.json','utf8')); const data=readTaskData(item,'reorder-paragraph');
  const attempt=buildReorderParagraphAttempt({question:item,responseOrder:[...data.correctOrder].reverse(),durationMs:1234});
  assert.equal(attempt.taskType,'reorder-paragraph'); assert.equal(attempt.itemRevision,item.revision); assert.equal(attempt.durationMs,1234); assert.equal(attempt.responseData.kind,'ordered-blocks'); assert.deepEqual(attempt.responseData.blockIds,[...data.correctOrder].reverse()); assert.equal(attempt.score,attempt.metrics.accuracy);
  const errors=buildReorderParagraphErrorRecords(item,attempt),reviews=buildReorderParagraphReviewItems(item,attempt,errors); assert.ok(errors.length<=4); assert.ok(reviews.length<=3); assert.ok(reviews.every(review=>review.prompt.includes('come directly after')));
  assert.throws(()=>buildReorderParagraphAttempt({question:{...item,taskType:'write-essay'},responseOrder:data.correctOrder,durationMs:1}));
  assert.throws(()=>buildReorderParagraphAttempt({question:item,responseOrder:data.correctOrder,durationMs:Infinity}));
});
