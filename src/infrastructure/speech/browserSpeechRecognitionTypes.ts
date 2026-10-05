export type LocalSpeechOptions = {
  langs: string[];
  processLocally: true;
};

export type BrowserRecognitionResult = {
  isFinal: boolean;
  0: { transcript: string; confidence: number };
};

export interface BrowserSpeechRecognition {
  processLocally: boolean;
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: { results: ArrayLike<BrowserRecognitionResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(track: MediaStreamTrack): void;
  stop(): void;
  abort(): void;
}

export interface BrowserSpeechRecognitionConstructor {
  new (): BrowserSpeechRecognition;
  available?: (options: LocalSpeechOptions) => Promise<'available' | 'downloadable' | 'downloading' | 'unavailable'>;
  install?: (options: LocalSpeechOptions) => Promise<boolean>;
}

export type SpeechWindow = Window & {
  SpeechRecognition?: BrowserSpeechRecognitionConstructor;
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
};

export type CapturableAudio = HTMLAudioElement & { captureStream?: () => MediaStream };
