import { useEffect, useRef, useState } from 'react';
import { PRACTICE_TASK_ORDER as TASK_ORDER, TASK_LABELS as labels } from '../../domain/pte/taskRegistry';
import type { Difficulty, PteTaskType } from '../../domain/pte/types';
import { MAX_SESSION_ITEMS } from '../../domain/study-session/types';
import { StudySessionError } from '../../domain/study-session/errors';
import { studyItemsRepository } from '../../data/repositories/studyItemsRepository';
import type { ActiveStudySessionController } from './hooks/useActiveStudySession';
import { startTaskPractice } from './services/startTaskPractice';
import { taskPracticeQuery, taskPracticeCount, type TaskCountChoice } from './services/taskPracticeCapacity';


export function TaskPracticeCard({ controller }: { controller: ActiveStudySessionController }) {
  const [taskType, setTaskType] = useState<PteTaskType>('write-from-dictation');
  const [difficulty, setDifficulty] = useState<Difficulty>();
  const [choice, setChoice] = useState<TaskCountChoice>('default');
  const [retry, setRetry] = useState(0);
  const [capacityState, setCapacityState] = useState<{ key: string; count?: number; error?: string }>();
  const mounted = useRef(false);
  const key = JSON.stringify([taskType, difficulty, retry]);
  const capacity = capacityState?.key === key ? capacityState.count : undefined;
  const capacityError = capacityState?.key === key ? capacityState.error : undefined;
  const loading = capacity === undefined && !capacityError;
  const count = capacity === undefined ? undefined : taskPracticeCount(choice, capacity);
  const blocked = !controller.known || controller.checking || controller.starting || !!controller.active;
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    void studyItemsRepository.countPracticeItems(taskPracticeQuery(taskType, difficulty)).then(count => {
      if (!cancelled) setCapacityState({ key, count });
    }).catch(() => {
      if (!cancelled) setCapacityState({ key, error: 'Question availability could not be loaded. Please try again.' });
    });
    return () => { cancelled = true; mounted.current = false; };
  }, [taskType, difficulty, key]);
  function changeFilter(task: PteTaskType, selectedDifficulty?: Difficulty) {
    setTaskType(task); setDifficulty(selectedDifficulty); setChoice('default'); controller.clearError();
  }
  async function start() {
    if (blocked || loading || count === undefined) return;
    const error = await controller.start(() => startTaskPractice({ taskType, itemCount: count,
      ...(difficulty === undefined ? {} : { difficulty }) }));
    if (mounted.current && error instanceof StudySessionError && error.code === 'INSUFFICIENT_CONTENT') {
      // Require a fresh explicit selection after a catalog race, never shrink the failed request.
      setChoice(undefined); setRetry(value => value + 1);
    }
  }
  const selected = choice === 'default' ? capacity !== undefined && capacity >= 5 ? 5 : 'max' : choice;
  return (
    <section className="task-practice" aria-labelledby="task-practice-title" aria-busy={loading || controller.starting}>
      <h3 id="task-practice-title">Task Practice</h3>
      <fieldset disabled={blocked}>
        <legend>Choose one task</legend>
        {TASK_ORDER.map(task => <label key={task}><input type="radio" name="practice-task" checked={taskType === task}
          onChange={() => changeFilter(task, difficulty)} />{labels[task]}</label>)}
      </fieldset>
      <fieldset disabled={blocked}>
        <legend>Difficulty</legend>
        <label><input type="radio" name="task-difficulty" checked={difficulty === undefined}
          onChange={() => changeFilter(taskType)} />Any</label>
        {([1, 2, 3] as const).map(value => <label key={value}><input type="radio" name="task-difficulty" checked={difficulty === value}
          onChange={() => changeFilter(taskType, value)} />Difficulty {value}</label>)}
      </fieldset>
      {loading ? <p role="status">Loading availability…</p> : capacityError ? <><p role="alert">{capacityError}</p>
        <button type="button" onClick={() => setRetry(value => value + 1)} disabled={blocked}>Retry availability</button></>
        : <p role="status">{capacity === 0 ? 'No questions available for this filter.' : `${capacity} questions available`}</p>}
      <fieldset disabled={blocked || loading || !!capacityError}>
        <legend>Questions</legend>
        {([3, 5] as const).map(value => <label key={value}><input type="radio" name="task-count" checked={selected === value}
          disabled={capacity === undefined || capacity < value} onChange={() => { setChoice(value); controller.clearError(); }} />{value}</label>)}
        <label><input type="radio" name="task-count" checked={selected === 'max'}
          disabled={!capacity || capacity > MAX_SESSION_ITEMS} onChange={() => { setChoice('max'); controller.clearError(); }} />Max</label>
      </fieldset>
      {capacity !== undefined && capacity > MAX_SESSION_ITEMS && <p>Sessions support up to {MAX_SESSION_ITEMS} questions. Choose 3 or 5.</p>}
      {choice === undefined && !!capacity && <p role="status">Choose a question count for the updated availability.</p>}
      <button type="button" onClick={() => void start()} disabled={blocked || loading || count === undefined || !!capacityError}>
        {controller.starting ? 'Starting…' : 'Start Task Practice'}
      </button>
    </section>
  );
}
