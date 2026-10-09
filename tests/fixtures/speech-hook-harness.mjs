  import React from 'react';
  import ReactDOMClient from 'react-dom/client';
  const { createRoot } = ReactDOMClient;
  import { useSpeechTranscription } from '../../src/shared/speech/hooks/useSpeechTranscription.ts';
  import { TranscriptionPanel } from '../../src/shared/speech/components/TranscriptionPanel.tsx';
  import { SpeechToTextError } from '../../src/domain/speech/types.ts';
  window.SpeechToTextError = SpeechToTextError;
  let root;
  window.mountHook = kind => {
   root?.unmount();
   let installed = false;
   const adapter = {
    provider: { kind, label: 'Test provider', supportsLanguageInstall: kind === 'browser-on-device' },
    checkAvailability({ signal }) {
     window.healthSignal = signal;
     if (kind === 'browser-on-device') return Promise.resolve(installed ? 'available' : 'downloadable');
     return new Promise(resolve => { window.resolveHealth = resolve; });
    },
    async installLanguage() { installed = true; return true; },
    transcribe(audio, { signal }) {
     window.transcriptionSignal = signal;
     return new Promise((resolve, reject) => {
      window.resolveTranscript = resolve; window.rejectTranscript = reject;
     });
    },
   };
   function Harness() {
    const hook = useSpeechTranscription({ adapter });
    React.useEffect(() => { window.hook = hook; });
    return React.createElement(TranscriptionPanel, {
     ...hook, hasRecording: true, disabled: false, onLanguageChange: hook.changeLanguage,
     onCheck: hook.checkAvailability, onInstall: hook.installLanguage,
     onTranscribe: () => hook.transcribe(new Blob(['controlled'])),
    });
   }
   root = createRoot(document.getElementById('root'));
   root.render(React.createElement(Harness));
  };
  window.unmountHook = () => root.unmount();
  window.mountHook('local-runtime');
