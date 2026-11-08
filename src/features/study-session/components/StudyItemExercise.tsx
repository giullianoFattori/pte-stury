import { isPracticeReadyTask, isKnownTaskType, TASK_LABELS } from '../../../domain/pte/taskRegistry';
import { WriteFromDictationExercise } from '../../write-from-dictation/WriteFromDictationExercise';
import { RepeatSentenceExercise } from '../../repeat-sentence/RepeatSentenceExercise';
import { ReadAloudExercise } from '../../read-aloud/ReadAloudExercise';
import { RetellLectureExercise } from '../../retell-lecture/RetellLectureExercise';
import { SummarizeGroupDiscussionExercise } from '../../summarize-group-discussion/SummarizeGroupDiscussionExercise';
import { DescribeImageExercise } from '../../describe-image/DescribeImageExercise';
import { SummarizeWrittenTextExercise } from '../../summarize-written-text/SummarizeWrittenTextExercise';
import { SummarizeSpokenTextExercise } from '../../summarize-spoken-text/SummarizeSpokenTextExercise';
import { HighlightIncorrectWordsExercise } from '../../highlight-incorrect-words/HighlightIncorrectWordsExercise';
import { ListeningFillBlanksTypeInExercise } from '../../listening-fill-blanks/ListeningFillBlanksTypeInExercise';
import { ReadingFillBlanksDropdownExercise } from '../../reading-fill-blanks-dropdown/ReadingFillBlanksDropdownExercise';
import { ReadingFillBlanksDragDropExercise } from '../../reading-fill-blanks-drag-drop/ReadingFillBlanksDragDropExercise';
import { ReorderParagraphExercise } from '../../reorder-paragraph/ReorderParagraphExercise';
import { RespondToSituationExercise } from '../../respond-to-a-situation/RespondToSituationExercise';
import { WriteEssayExercise } from '../../write-essay/WriteEssayExercise';
import { AnswerShortQuestionExercise } from '../../answer-short-question/AnswerShortQuestionExercise';
import type { ExerciseProps } from '../types';

const exercises = {
  'write-from-dictation': WriteFromDictationExercise,
  'repeat-sentence': RepeatSentenceExercise,
  'read-aloud': ReadAloudExercise,
  'retell-lecture': RetellLectureExercise,
  'summarize-group-discussion': SummarizeGroupDiscussionExercise,
  'describe-image': DescribeImageExercise,
  'summarize-written-text': SummarizeWrittenTextExercise,
  'summarize-spoken-text': SummarizeSpokenTextExercise,
  'highlight-incorrect-words': HighlightIncorrectWordsExercise,
  'listening-fill-blanks-type-in': ListeningFillBlanksTypeInExercise,
  'reading-fill-blanks-dropdown': ReadingFillBlanksDropdownExercise,
  'reading-fill-blanks-drag-drop': ReadingFillBlanksDragDropExercise,
  'reorder-paragraph': ReorderParagraphExercise,
  'respond-to-a-situation': RespondToSituationExercise,
  'write-essay': WriteEssayExercise,
  'answer-short-question': AnswerShortQuestionExercise,
} satisfies Partial<Record<import('../../../domain/pte/types').PteTaskType, (props: ExerciseProps) => React.JSX.Element>>;
/** Task dispatch only. Enabling a task also requires an explicit exercise mapping. */
export function StudyItemExercise(props: ExerciseProps) {
  const task = props.item.taskType;
  if (!isKnownTaskType(task)) return <p role="alert">This exercise is unavailable.</p>;
  const Exercise = exercises[task as keyof typeof exercises];
  return isPracticeReadyTask(task) && Exercise ? <Exercise {...props} /> : <p role="alert">{TASK_LABELS[task]} is not available yet.</p>;
}
