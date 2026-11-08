import { normalizeShortAnswer, shortAnswerWords } from './normalize.ts';
import type { AnswerShortQuestionScore } from './types.ts';
function containsPhrase(response: readonly string[], phrase: readonly string[]) {
  return phrase.length > 0 && phrase.length <= response.length && response.some((_, index) => phrase.every((word, offset) => response[index + offset] === word));
}
export function scoreAnswerShortQuestion(transcript: string, acceptedAnswers: readonly string[]): AnswerShortQuestionScore {
  const response = normalizeShortAnswer(transcript), responseWords = shortAnswerWords(response);
  const accepted = acceptedAnswers.find(answer => normalizeShortAnswer(answer) === response)
    ?? acceptedAnswers.find(answer => containsPhrase(responseWords, shortAnswerWords(answer)));
  const correct = response.length > 0 && accepted !== undefined;
  return Object.freeze({ correct, rawScore: correct ? 1 : 0, maxScore: 1, normalizedScore: correct ? 1 : 0,
    ...(correct ? { matchedAcceptedAnswer: accepted } : {}), responseWordCount: responseWords.length, overlongResponse: responseWords.length > 12 });
}
