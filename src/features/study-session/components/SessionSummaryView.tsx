import { Link } from 'react-router-dom';
import type { StudySession } from '../../../domain/study-session/types';
import type { SessionSummary, TaskSessionSummary } from '../../../domain/study-session/summary';
import { formatSessionDuration } from '../../../domain/study-session/summary';
import { SESSION_TASK_LABELS, sessionModeLabel } from '../services/sessionPresentation';
import { useSessionSummary } from '../hooks/useSessionSummary';

export function CompletedSessionSummary({ session }: { session: StudySession }) {
  const { state, retry } = useSessionSummary(session.id);
  return <section className="practice-card" aria-busy={state.kind === 'loading'}>
    <h2>{sessionModeLabel(session)} complete</h2>
    {state.kind === 'loading' && <p role="status">Loading session results…</p>}
    {state.kind === 'error' && <><p role="alert">This session is complete, but its detailed results could not be loaded safely.</p>
      <button type="button" onClick={retry}>Retry</button></>}
    {state.kind === 'ready' && <SessionSummaryView summary={state.summary} />}
    <p><Link className="study-exercise-link" to="/study">Back to Study</Link></p>
  </section>;
}
export function SessionSummaryView({ summary }: { summary: SessionSummary }) {
  return <div className="session-summary">
    <p role="status">{summary.completedCount} questions completed · {formatSessionDuration(summary.durationMs)}</p>
    {Object.values(summary.byTask).map(task => <TaskResults key={task.taskType} task={task} />)}
    <p>These are practice metrics from this app, not an official PTE score.</p>
  </div>;
}
function TaskResults({ task }: { task: TaskSessionSummary }) {
  if(task.taskType==='describe-image')return <section aria-label={SESSION_TASK_LABELS[task.taskType]} className="session-task-summary"><h3>{SESSION_TASK_LABELS[task.taskType]}</h3><p>{task.questionCount} questions</p><dl><dt>Key-feature coverage</dt><dd>{Math.round(task.averageFeatureCoveragePercent)}%</dd><dt>Matched features</dt><dd>{task.matchedFeatures} of {task.totalFeatures}</dd><dt>Speech ratio</dt><dd>{Math.round(task.averageSpeechRatioPercent)}%</dd><dt>Long pauses</dt><dd>{task.averageLongPauseCount.toFixed(1)} avg</dd>{task.averageSpeechRateWpm!==undefined&&<><dt>Speech rate</dt><dd>{Math.round(task.averageSpeechRateWpm)} wpm</dd></>}</dl></section>;
  if (task.taskType === 'retell-lecture') return <section aria-label={SESSION_TASK_LABELS[task.taskType]} className="session-task-summary">
    <h3>{SESSION_TASK_LABELS[task.taskType]}</h3><p>{task.questionCount} questions</p><dl>
      <dt>Key-point coverage</dt><dd>{Math.round(task.averageKeyPointCoveragePercent)}%</dd>
      <dt>Matched key points</dt><dd>{task.matchedKeyPoints} of {task.totalKeyPoints}</dd>
      <dt>Speech ratio</dt><dd>{Math.round(task.averageSpeechRatioPercent)}% average</dd>
      <dt>Long pauses</dt><dd>{task.averageLongPauseCount.toFixed(1)} average</dd>
      <dt>Response latency</dt><dd>{Math.round(task.averageResponseLatencyMs)} ms average</dd>
      {task.averageSpeechRateWpm !== undefined && <><dt>Speech rate</dt><dd>{Math.round(task.averageSpeechRateWpm)} wpm · {task.speechRateResponses} measured responses</dd></>}
    </dl></section>;
  if (task.taskType === 'summarize-group-discussion') return <section aria-label={SESSION_TASK_LABELS[task.taskType]} className="session-task-summary">
    <h3>{SESSION_TASK_LABELS[task.taskType]}</h3><p>{task.questionCount} questions</p><dl>
      <dt>Main-point coverage</dt><dd>{Math.round(task.averageKeyPointCoveragePercent)}% · {task.matchedKeyPoints} of {task.totalKeyPoints}</dd>
      <dt>Speaker coverage</dt><dd>{Math.round(task.averageSpeakerCoveragePercent)}% · {task.representedSpeakers} of {task.totalSpeakerSlots}</dd>
      {task.averageRelationshipCoveragePercent !== undefined && <><dt>Relationships</dt><dd>{Math.round(task.averageRelationshipCoveragePercent)}% · {task.matchedRelationships} of {task.totalRelationships}</dd></>}
      <dt>Speech ratio</dt><dd>{Math.round(task.averageSpeechRatioPercent)}% average</dd>
      <dt>Long pauses</dt><dd>{task.averageLongPauseCount.toFixed(1)} average</dd>
      <dt>Response latency</dt><dd>{Math.round(task.averageResponseLatencyMs)} ms average</dd>
      {task.averageSpeechRateWpm !== undefined && <><dt>Speech rate</dt><dd>{Math.round(task.averageSpeechRateWpm)} wpm · {task.speechRateResponses} measured responses</dd></>}
    </dl></section>;
  const wfd = task.taskType === 'write-from-dictation', rs = task.taskType === 'repeat-sentence';
  return <section aria-label={SESSION_TASK_LABELS[task.taskType]} className="session-task-summary">
    <h3>{SESSION_TASK_LABELS[task.taskType]}</h3>
    <p>{task.questionCount} questions</p>
    <dl>
      <dt>{wfd ? 'Word accuracy' : rs ? 'Content recall' : 'Text coverage'}</dt><dd>{Math.round(task.accuracyPercent)}%</dd>
      <dt>Correct words</dt><dd>{task.correctWords} of {task.expectedWords}</dd>
      <dt>Total errors</dt><dd>{task.totalErrors}</dd>
      <dt>{wfd ? 'Exact matches' : rs ? 'Exact content matches' : 'Exact text matches'}</dt><dd>{task.exactCount} of {task.questionCount} exact</dd>
      {task.sequenceAccuracyPercent !== undefined && <><dt>Sequence accuracy</dt><dd>{Math.round(task.sequenceAccuracyPercent)}%</dd></>}
      {task.chunkRetentionPercent !== undefined && <><dt>Chunk retention</dt><dd>{Math.round(task.chunkRetentionPercent)}% · {task.analyzedChunkResponses} analyzed responses</dd></>}
      {task.speechRatioPercent !== undefined && <><dt>Speech ratio</dt><dd>{Math.round(task.speechRatioPercent)}% average</dd></>}
      {task.longPauseCount !== undefined && <><dt>Long pauses</dt><dd>{task.longPauseCount.toFixed(1)} average per response</dd></>}
      {task.responseLatencyMs !== undefined && <><dt>Response latency</dt><dd>{Math.round(task.responseLatencyMs)} ms average</dd></>}
      {task.speechRateWpm !== undefined && <><dt>Speech rate</dt><dd>{Math.round(task.speechRateWpm)} wpm · {task.speechRateResponses} measured responses</dd></>}
    </dl>
  </section>;
}
