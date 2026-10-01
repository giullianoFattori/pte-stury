import { seedQuestionBank } from '../data/question-bank/seedQuestionBank';

export async function bootstrapApp() {
  await seedQuestionBank();
}
