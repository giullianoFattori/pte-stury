import type { Attempt, ErrorRecord, StudyItem } from '../../../domain/pte/types.ts';
import { readTaskData } from '../../../domain/content/taskDataValidation.ts';
import { scoreReorderParagraph } from '../../../domain/scoring/reorder-paragraph/index.ts';

export function buildReorderParagraphErrorRecords(question: StudyItem, attempt: Attempt): ErrorRecord[] {
  if (question.taskType !== 'reorder-paragraph' || attempt.taskType !== question.taskType || attempt.itemId !== question.id || attempt.responseData?.kind !== 'ordered-blocks') throw new Error('Reorder Paragraph errors must link to the correct ordered-blocks Attempt.');
  const data = readTaskData(question, 'reorder-paragraph'), score = scoreReorderParagraph(data.correctOrder, attempt.responseData.blockIds), text = new Map(data.blocks.map(block => [block.id, block.text]));
  return score.pairResults.filter(pair => !pair.correct).slice(0, 4).map(pair => {
    const leftIndex = data.correctOrder.indexOf(pair.leftId), expectedId = data.correctOrder[leftIndex + 1];
    return { id: crypto.randomUUID(), attemptId: attempt.id, itemId: question.id, taskType: question.taskType, skills: ['reading'], category: 'word-order', token: text.get(pair.leftId), expected: expectedId ? text.get(expectedId) : 'End of paragraph', actual: text.get(pair.rightId), expectedIndex: leftIndex, actualIndex: data.correctOrder.indexOf(pair.rightId), explanation: 'These two sentences do not form an authored adjacent pair in this order.', severity: 2, createdAt: attempt.createdAt };
  });
}
