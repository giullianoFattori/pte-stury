import { useEffect, useRef, useState } from 'react';
import { PRACTICE_TASK_ORDER as TASK_ORDER, TASK_LABELS as labels } from '../../domain/pte/taskRegistry';
import type { Difficulty, PteTaskType } from '../../domain/pte/types';
import { MAX_SESSION_ITEMS } from '../../domain/study-session/types';
import { StudySessionError } from '../../domain/study-session/errors';
import type { ActiveStudySessionController } from './hooks/useActiveStudySession';
import { startMixedPractice } from './services/startMixedPractice';
import { mixedPracticeCapacity, mixedPracticeCount, type MixedCountChoice } from './services/mixedPracticeCapacity';


type Capacity = Awaited<ReturnType<typeof mixedPracticeCapacity>>;
export function MixedPracticeCard({ controller }: { controller: ActiveStudySessionController }) {
  const [tasks, setTasks] = useState<readonly PteTaskType[]>(TASK_ORDER);
  const [difficulty, setDifficulty] = useState<Difficulty>();
  const [choice, setChoice] = useState<MixedCountChoice>('default');
  const [retry, setRetry] = useState(0);
  const [capacityState, setCapacityState] = useState<{ key: string; value?: Capacity; error?: string }>();
  const mounted = useRef(false);
  const key = JSON.stringify([tasks, difficulty, retry]);
  const capacity = capacityState?.key === key ? capacityState.value : undefined;
  const capacityError = capacityState?.key === key ? capacityState.error : undefined;
  const loading = capacity === undefined && !capacityError;
  const count = capacity ? mixedPracticeCount(choice, capacity.total) : undefined;
  const emptyTasks = capacity ? tasks.filter(task => capacity.byTask[task] === 0) : [];
  const blocked = !controller.known || controller.checking || controller.starting || !!controller.active;
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    void mixedPracticeCapacity(tasks, difficulty).then(value => {
      if (!cancelled) setCapacityState({ key, value });
    }).catch(() => {
      if (!cancelled) setCapacityState({ key, error: 'Question availability could not be loaded. Please try again.' });
    });
    return () => { cancelled = true; mounted.current = false; };
  }, [tasks, difficulty, key]);
  function changeTasks(task: PteTaskType) {
    setTasks(TASK_ORDER.filter(value => value === task ? !tasks.includes(value) : tasks.includes(value)));
    setChoice('default'); controller.clearError();
  }
  function changeDifficulty(value?: Difficulty) { setDifficulty(value); setChoice('default'); controller.clearError(); }
  async function start() {
    if (blocked || loading || count === undefined || tasks.length < 2 || emptyTasks.length) return;
    const error = await controller.start(() => startMixedPractice({ taskTypes: tasks, itemCount: count,
      ...(difficulty === undefined ? {} : { difficulty }) }));
    if (mounted.current && error instanceof StudySessionError
      && ['INSUFFICIENT_CONTENT', 'SESSION_ITEM_UNAVAILABLE'].includes(error.code)) {
      setChoice(undefined); setRetry(value => value + 1);
    }
  }
  const selected = choice === 'default' ? capacity && capacity.total >= 10 ? 10 : capacity && capacity.total >= 5 ? 5 : 'max' : choice;
  return (
    <section className="mixed-practice" aria-labelledby="mixed-practice-title" aria-busy={loading || controller.starting}>
      <h3 id="mixed-practice-title">Mixed Practice</h3>
      <fieldset disabled={blocked}>
        <legend>Choose at least two tasks</legend>
        {TASK_ORDER.map(task => <label key={task}><input type="checkbox" checked={tasks.includes(task)}
          onChange={() => changeTasks(task)} />{labels[task]}</label>)}
      </fieldset>
      <fieldset disabled={blocked}>
        <legend>Difficulty</legend>
        <label><input type="radio" name="mixed-difficulty" checked={difficulty === undefined} onChange={() => changeDifficulty()} />Any</label>
        {([1, 2, 3] as const).map(value => <label key={value}><input type="radio" name="mixed-difficulty" checked={difficulty === value}
          onChange={() => changeDifficulty(value)} />Difficulty {value}</label>)}
      </fieldset>
      {tasks.length < 2 && <p role="status">Choose at least two tasks to start Mixed Practice.</p>}
      {loading ? <p role="status">Loading availability…</p> : capacityError ? <><p role="alert">{capacityError}</p>
        <button type="button" onClick={() => setRetry(value => value + 1)} disabled={blocked}>Retry mixed availability</button></>
        : capacity && <div role="status">{tasks.map(task => <p key={task}>{labels[task]}: {capacity.byTask[task]}</p>)}<p>Total: {capacity.total} questions available</p></div>}
      {emptyTasks.length > 0 && <p role="alert">No questions available for {emptyTasks.map(task => labels[task]).join(', ')}. Deselect these tasks or change difficulty.</p>}
      <fieldset disabled={blocked || loading || !!capacityError}>
        <legend>Questions</legend>
        {([5, 10] as const).map(value => <label key={value}><input type="radio" name="mixed-count" checked={selected === value}
          disabled={!capacity || capacity.total < value} onChange={() => { setChoice(value); controller.clearError(); }} />{value}</label>)}
        <label><input type="radio" name="mixed-count" checked={selected === 'max'} disabled={!capacity?.total || capacity.total > MAX_SESSION_ITEMS}
          onChange={() => { setChoice('max'); controller.clearError(); }} />Max</label>
      </fieldset>
      {capacity && capacity.total > MAX_SESSION_ITEMS && <p>Sessions support up to {MAX_SESSION_ITEMS} questions. Choose 5 or 10.</p>}
      {choice === undefined && !!capacity?.total && <p role="status">Choose a question count for the updated availability.</p>}
      <button type="button" onClick={() => void start()}
        disabled={blocked || loading || count === undefined || tasks.length < 2 || emptyTasks.length > 0 || !!capacityError}>
        {controller.starting ? 'Starting…' : 'Start Mixed Practice'}
      </button>
    </section>
  );
}
