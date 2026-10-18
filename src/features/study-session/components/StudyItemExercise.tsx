import { isPracticeReadyTask, isKnownTaskType, TASK_LABELS } from '../../../domain/pte/taskRegistry';
import { WriteFromDictationExercise } from '../../write-from-dictation/WriteFromDictationExercise';
import { RepeatSentenceExercise } from '../../repeat-sentence/RepeatSentenceExercise';
import { ReadAloudExercise } from '../../read-aloud/ReadAloudExercise';
import type { ExerciseProps } from '../types';

const exercises = {
  'write-from-dictation': WriteFromDictationExercise,
  'repeat-sentence': RepeatSentenceExercise,
  'read-aloud': ReadAloudExercise,
} satisfies Partial<Record<import('../../../domain/pte/types').PteTaskType, (props: ExerciseProps) => React.JSX.Element>>;
/** Task dispatch only. Enabling a task also requires an explicit exercise mapping. */
export function StudyItemExercise(props: ExerciseProps) {
  const task = props.item.taskType;
  if (!isKnownTaskType(task)) return <p role="alert">This exercise is unavailable.</p>;
  const Exercise = exercises[task as keyof typeof exercises];
  return isPracticeReadyTask(task) && Exercise ? <Exercise {...props} /> : <p role="alert">{TASK_LABELS[task]} is not available yet.</p>;
}
