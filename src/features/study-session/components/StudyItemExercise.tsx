import { WriteFromDictationExercise } from '../../write-from-dictation/WriteFromDictationExercise';
import { RepeatSentenceExercise } from '../../repeat-sentence/RepeatSentenceExercise';
import { ReadAloudExercise } from '../../read-aloud/ReadAloudExercise';
import type { ExerciseProps } from '../types';

/** Task dispatch only. No scoring, persistence, or navigation lives here. */
export function StudyItemExercise(props: ExerciseProps) {
  switch (props.item.taskType) {
    case 'write-from-dictation': return <WriteFromDictationExercise {...props} />;
    case 'repeat-sentence': return <RepeatSentenceExercise {...props} />;
    case 'read-aloud': return <ReadAloudExercise {...props} />;
    default: return <p role="alert">This exercise is unavailable.</p>;
  }
}
