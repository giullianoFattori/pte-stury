import { studyItemsRepository } from '../repositories/studyItemsRepository';
import { writeFromDictationQuestions } from './write-from-dictation';

export async function seedQuestionBank() {
  for (const item of writeFromDictationQuestions) {
    await studyItemsRepository.upsert(item);
  }
}
