/**
 * Free voice features using browser Web Speech APIs.
 *
 * Zero server cost, zero API keys, no tokens:
 *   - speechToText: microphone → text (webkitSpeechRecognition / SpeechRecognition)
 *   - readAloud: text → streaming speech (speechSynthesis)
 *
 * Works on iPhone Safari, Chrome, Edge. Falls back gracefully on unsupported browsers.
 */

let recognition: any | null = null;
let isListening = false;

function getSpeechRecognition(): any {
  if (typeof window === 'undefined') return null;
  const Constructor =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!Constructor) return null;
  if (!recognition) recognition = new Constructor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-GB';
  return recognition;
}

/**
 * Start speech-to-text. Calls `onResult` with each transcript fragment and
 * `onFinal` when the user stops speaking. Returns a stop function.
 */
export function startSpeechToText(
  onResult: (text: string, isFinal: boolean) => void,
  onError?: (err: string) => void
): { stop: () => void } {
  const Recognizer = getSpeechRecognition();
  if (!Recognizer) {
    onError?.('Voice input is not supported on this browser.');
    return { stop: () => {} };
  }

  Recognizer.onresult = (event: any) => {
    let finalText = '';
    let interimText = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += transcript;
      else interimText += transcript;
    }
    if (interimText) onResult(interimText, false);
    if (finalText) onResult(finalText, true);
  };

  Recognizer.onerror = (event: any) => {
    onError?.(event.error || 'Voice input error.');
  };

  Recognizer.onend = () => {
    isListening = false;
  };

  Recognizer.start();
  isListening = true;

  return {
    stop: () => {
      try {
        Recognizer.stop();
      } catch {
        // ignore
      }
      isListening = false;
    },
  };
}

/** Is speech recognition available on this browser? */
export function isSpeechToTextAvailable(): boolean {
  return Boolean(
    typeof window !== 'undefined' &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
  );
}

/** Is speech synthesis (read aloud) available on this browser? */
export function isReadAloudAvailable(): boolean {
  return Boolean(typeof window !== 'undefined' && (window as any).speechSynthesis);
}

/**
 * Read text aloud. Streams: if a previous utterance is speaking, it is cancelled
 * first so the latest answer always wins. Calls `onEnd` when finished.
 */
export function speak(
  text: string,
  options?: {
    lang?: string;
    rate?: number;
    pitch?: number;
    onEnd?: () => void;
  }
): void {
  if (typeof window === 'undefined') return;
  const synth = (window as any).speechSynthesis;
  if (!synth) return;

  // Cancel any in-progress utterance so streaming updates don't queue up.
  synth.cancel();

  const utterance = new (window as any).SpeechSynthesisUtterance(text);
  utterance.lang = options?.lang || 'en-GB';
  utterance.rate = options?.rate ?? 1;
  utterance.pitch = options?.pitch ?? 1;
  if (options?.onEnd) utterance.onend = options.onEnd;

  synth.speak(utterance);
}

/** Stop any in-progress read-aloud. */
export function stopSpeaking(): void {
  if (typeof window === 'undefined') return;
  const synth = (window as any).speechSynthesis;
  if (synth) synth.cancel();
}
