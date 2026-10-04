import { studyItemsRepository } from '../repositories/studyItemsRepository';
import { repeatSentenceQuestions } from './repeat-sentence';
import { readAloudQuestions } from './read-aloud';
import { writeFromDictationQuestions } from './write-from-dictation';

const questionBank = [...writeFromDictationQuestions, ...repeatSentenceQuestions, ...readAloudQuestions];

export async function seedQuestionBank() {
  for (const item of questionBank) {
    await studyItemsRepository.upsert(item);
  }
}
