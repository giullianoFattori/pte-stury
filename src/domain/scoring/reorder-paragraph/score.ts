export type ReorderParagraphScore = Readonly<{
  rawScore: number; maxScore: number; accuracy: number; accuracyPercent: number;
  correctAdjacentPairs: number; totalAdjacentPairs: number; exactOrder: boolean;
  firstBlockCorrect: boolean;
  pairResults: readonly Readonly<{ leftId: string; rightId: string; correct: boolean }>[];
}>;

export function scoreReorderParagraph(correctOrder: readonly string[], responseOrder: readonly string[]): ReorderParagraphScore {
  if (!Array.isArray(correctOrder) || correctOrder.length < 3 || !Array.isArray(responseOrder)
    || responseOrder.length !== correctOrder.length || correctOrder.some(id => typeof id !== 'string' || !id.trim())
    || new Set(correctOrder).size !== correctOrder.length || responseOrder.some(id => typeof id !== 'string' || !id.trim())
    || new Set(responseOrder).size !== responseOrder.length || responseOrder.some(id => !correctOrder.includes(id))) {
    throw new Error('Reorder Paragraph response must contain every authored block ID exactly once.');
  }
  const correctPairs = new Set(correctOrder.slice(1).map((right, index) => `${correctOrder[index]}\u0000${right}`));
  const pairResults = responseOrder.slice(1).map((right, index) => Object.freeze({ leftId: responseOrder[index], rightId: right, correct: correctPairs.has(`${responseOrder[index]}\u0000${right}`) }));
  const correctAdjacentPairs = pairResults.filter(pair => pair.correct).length, maxScore = correctOrder.length - 1;
  const exactOrder = correctOrder.every((id, index) => responseOrder[index] === id), accuracy = correctAdjacentPairs / maxScore;
  return Object.freeze({ rawScore: correctAdjacentPairs, maxScore, accuracy, accuracyPercent: accuracy * 100, correctAdjacentPairs, totalAdjacentPairs: maxScore, exactOrder, firstBlockCorrect: responseOrder[0] === correctOrder[0], pairResults: Object.freeze(pairResults) });
}
