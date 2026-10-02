import { studyItemsRepository } from '../repositories/studyItemsRepository';
import { repeatSentenceQuestions } from './repeat-sentence';
import { writeFromDictationQuestions } from './write-from-dictation';

const questionBank = [...writeFromDictationQuestions, ...repeatSentenceQuestions];

export async function seedQuestionBank() {
  for (const item of questionBank) {
    await studyItemsRepository.upsert(item);
  }
}
