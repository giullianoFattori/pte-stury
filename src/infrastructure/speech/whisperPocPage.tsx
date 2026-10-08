import { useEffect, useRef, useState } from 'react';
import { readAloudQuestions } from '../../data/question-bank/read-aloud.ts';
import { repeatSentenceQuestions } from '../../data/question-bank/repeat-sentence.ts';
import { WhisperCppPocSpeechToTextAdapter, type WhisperCppPocResult } from './WhisperCppPocSpeechToTextAdapter.ts';
import { comparePocResponse, measureWordErrors } from './whisperPocEvaluation.ts';

const cases = [
  { label: 'RA-1 — easy', task: 'ra', item: readAloudQuestions[0] },
  { label: 'RA-2 — academic', task: 'ra', item: readAloudQuestions[4] },
  { label: 'RS-1 — short', task: 'rs', item: repeatSentenceQuestions[0] },
  { label: 'RS-2 — medium', task: 'rs', item: repeatSentenceQuestions[2] },
  { label: 'RS-3 — long', task: 'rs', item: repeatSentenceQuestions[4] },
] as const;

export function PocPage() {
  const [selected, setSelected] = useState(0);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [audio, setAudio] = useState<Blob>();
  const [result, setResult] = useState<WhisperCppPocResult>();
  const [reference, setReference] = useState('');
  const [evaluation, setEvaluation] = useState<ReturnType<typeof measureWordErrors>>();
  const [error, setError] = useState('');
  const recorder = useRef<MediaRecorder>(null);
  const audioPlayer = useRef<HTMLAudioElement>(null);
  const stream = useRef<MediaStream>(null);
  const controller = useRef<AbortController>(null);
  const recordingTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const current = cases[selected];
  useEffect(() => {
    if (!audio) { audioPlayer.current?.removeAttribute('src'); return; }
    const url = URL.createObjectURL(audio);
    if (audioPlayer.current) audioPlayer.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [audio]);
  useEffect(() => () => {
    controller.current?.abort();
    if (recordingTimer.current) clearTimeout(recordingTimer.current);
    if (recorder.current) { recorder.current.onstop = null; recorder.current.ondataavailable = null; }
    stream.current?.getTracks().forEach(track => track.stop());
  }, []);

  function reset() { setAudio(undefined); setResult(undefined); setReference(''); setEvaluation(undefined); setError(''); }
  async function startRecording() {
    reset(); setBusy(true);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
      const instance = new MediaRecorder(stream.current, mimeType ? { mimeType } : undefined);
      recorder.current = instance;
      const chunks: Blob[] = [];
      instance.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      instance.onstop = () => {
        if (recordingTimer.current) clearTimeout(recordingTimer.current);
        setAudio(new Blob(chunks, { type: instance.mimeType }));
        stream.current?.getTracks().forEach(track => track.stop());
        setRecording(false);
      };
      instance.onerror = () => {
        setError('Recording failed.'); stream.current?.getTracks().forEach(track => track.stop()); setRecording(false);
      };
      instance.start(); setRecording(true);
      recordingTimer.current = setTimeout(() => { if (instance.state === 'recording') instance.stop(); }, 179000);
    } catch (failure) {
      stream.current?.getTracks().forEach(track => track.stop());
      setError(failure instanceof Error ? failure.message : 'Microphone unavailable.');
    } finally { setBusy(false); }
  }
  async function transcribe() {
    if (!audio) return;
    setBusy(true); setError(''); setResult(undefined); setEvaluation(undefined);
    controller.current = new AbortController();
    try { setResult(await new WhisperCppPocSpeechToTextAdapter().transcribe(audio, { signal: controller.current.signal })); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Transcription failed.'); }
    finally { setBusy(false); }
  }
  function evaluate() {
    if (!result) return;
    try { setEvaluation(measureWordErrors(reference, result.text)); setError(''); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Invalid reference.'); }
  }
  const comparison = result ? comparePocResponse(current.task, current.item.transcript ?? '', result.text, current.item.chunks) : undefined;
  return <main style={{ maxWidth: 900, margin: '2rem auto', fontFamily: 'system-ui', padding: 24 }}>
    <h1>Local Whisper POC — Activity 04.9</h1>
    <p>Development test. Audio is sent to this machine only. Start whisper-server and the local audio bridge first.</p>
    <label>Recording case <select value={selected} disabled={recording || busy} onChange={event => { setSelected(Number(event.target.value)); reset(); }}>
      {cases.map((entry, index) => <option key={entry.label} value={index}>{entry.label}</option>)}
    </select></label>
    {current.task === 'ra' ? <p>{current.item.transcript}</p> : <p><audio key={selected} controls src={current.item.audioUrl} /> Listen, then repeat. The source transcript appears after transcription.</p>}
    <p><button disabled={busy || recording} onClick={startRecording}>Record learner</button>{' '}
      <button disabled={!recording} onClick={() => recorder.current?.stop()}>Stop</button>{' '}
      <label>Or select an app recording <input type="file" accept="audio/*,.webm,.ogg,.mp4" disabled={recording || busy} onChange={event => { reset(); setAudio(event.target.files?.[0]); event.target.value = ''; }} /></label></p>
    <audio hidden={!audio} controls ref={audioPlayer} />
    <p><button disabled={!audio || recording || busy} onClick={transcribe}>{busy ? 'Working locally…' : 'Transcribe locally'}</button>{' '}
      {busy && <button onClick={() => controller.current?.abort()}>Cancel transcription</button>}{' '}
      <button disabled={recording || busy} onClick={reset}>Discard audio and result</button></p>
    {error && <p role="alert">{error}</p>}
    {result && <>
      <h2>Raw transcript</h2><p>{result.text}</p>
      <p>Audio: {result.audioSeconds.toFixed(2)} s · Inference: {result.inferenceSeconds.toFixed(2)} s · RTF: {result.realTimeFactor.toFixed(3)} · Total: {result.totalSeconds.toFixed(2)} s</p>
      <details><summary>Existing PTE comparison and metrics</summary><p>Expected: {current.item.transcript}</p><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(comparison, null, 2)}</pre></details>
      <p>Listen to the learner recording and enter exactly what was spoken to measure STT accuracy. The PTE passage measures learner content; it is not a verified STT reference.</p>
      <label>Manually verified learner transcript<br /><textarea rows={4} style={{ width: '100%' }} value={reference} onChange={event => { setReference(event.target.value); setEvaluation(undefined); }} /></label>
      <button onClick={evaluate}>Measure STT WER</button>
      {evaluation && <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify({ recording: current.label, model: 'confirm server launch model', reference, ...result, ...evaluation }, null, 2)}</pre>}
    </>}
  </main>;
}
