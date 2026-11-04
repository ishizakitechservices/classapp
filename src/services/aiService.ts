/**
 * Client-side Adom AI transport.
 *
 * DeepSeek is the ONLY cloud AI provider. When the server or DeepSeek is unavailable this
 * module does NOT invent study content: it reports the failure so the UI can show an honest,
 * clearly labelled "AI unavailable" state with a retry action.
 *
 * The previous implementation returned canned sample quizzes, sample flashcards and generic
 * filler paragraphs that looked like AI output. That is removed deliberately — see ADR-001
 * in the ClassApp Master Plan ("Honest AI", "No fake implementation").
 */

import { ChatMessage, QuizQuestion, Flashcard } from '../types';
import { batchesFor, clampStudyCount } from '../shared/studyLimits';
import { type ChartSpec } from '../shared/mathCharts';

export interface HealthCheckResult {
  isServerReachable: boolean;
  hasDeepSeekKey: boolean;
  model: string;
  modelValid: boolean;
}

export interface ImageResult {
  title: string;
  image_url: string;
  thumbnail: string;
  source_url: string;
}

export interface ChatResponseResult {
  text: string;
  mode: 'chat' | 'quiz' | 'flashcards' | 'notes' | 'explain';
  engine: 'deepseek';
  /** Short conversation title supplied by the model (first answer only). */
  title?: string;
  /** Server's name for the same title (kept for compatibility with older responses). */
  nudge?: string;
  /** True when the stream ended before the server's authoritative final event. */
  partial?: boolean;
  interactiveData?: ChatMessage['interactiveData'];
  /** Real web images fetched server-side when DeepSeek decided an image helps. */
  images?: ImageResult[];
  /** Chart spec rendered client-side (zero tokens spent on drawing). */
  chart?: ChartSpec;
  /** True when teacher/Socratic mode was active for this turn. */
  teacherMode?: boolean;
}

/** Fetch real web images for a query (server proxy, SafeSearch enforced). */
export async function fetchImages(query: string): Promise<ImageResult[]> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return [];
  }
  try {
    const res = await fetch(`/api/ai/images?q=${encodeURIComponent(query)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.images) ? data.images : [];
  } catch {
    return [];
  }
}

export interface QuizGenerationResult {
  questions: QuizQuestion[];
  quizTitle: string;
  engine: 'deepseek';
  /** Size the set was asked for (before any shortfall). */
  requested?: number;
}

export interface FlashcardsGenerationResult {
  flashcards: Flashcard[];
  topic: string;
  engine: 'deepseek';
  /** Size the deck was asked for (before any shortfall). */
  requested?: number;
}

export interface SummaryGenerationResult {
  summary: string;
  engine: 'deepseek';
}

/** Thrown when a live AI result cannot be produced. UI must show this honestly. */
export class AiUnavailableError extends Error {
  readonly reason: 'offline' | 'not_configured' | 'rate_limited' | 'timeout' | 'provider' | 'invalid_response';

  constructor(reason: AiUnavailableError['reason'], message: string) {
    super(message);
    this.name = 'AiUnavailableError';
    this.reason = reason;
  }
}

const NOT_CONFIGURED_MESSAGE =
  'Adom AI is not available right now. The server has no DeepSeek key configured, so no live answer can be produced.';

/** Map an HTTP failure from our own API into an honest, user-safe error. */
async function toAiError(res: Response): Promise<AiUnavailableError> {
  let detail = '';
  try {
    const body = await res.json();
    if (body && typeof body.error === 'string') detail = body.error;
  } catch {
    detail = '';
  }

  if (res.status === 429) {
    // The server distinguishes "slow down" from a daily allowance / school fuse.
    // Always keep its exact wording instead of guessing.
    return new AiUnavailableError(
      'rate_limited',
      detail || 'Too many requests right now. Pause a moment, then try again.'
    );
  }
  if (res.status === 503) {
    return new AiUnavailableError('not_configured', detail || NOT_CONFIGURED_MESSAGE);
  }
  if (res.status === 401) {
    return new AiUnavailableError('not_configured', detail || 'Sign in to use Adom AI.');
  }

  return new AiUnavailableError(
    'provider',
    detail
      ? `Adom AI could not answer that request. ${detail}`
      : 'Adom AI could not answer that request. Please try again.'
  );
}

function offlineError(): AiUnavailableError {
  return new AiUnavailableError(
    'offline',
    'You are offline, so Adom AI cannot answer. Reconnect to ask again — your saved notes and flashcards still work.'
  );
}

function timeoutError(): AiUnavailableError {
  return new AiUnavailableError(
    'timeout',
    'Adom AI took too long to respond. Check your connection and try again.'
  );
}

/**
 * POST JSON to an AI endpoint with a hard timeout. Throws AiUnavailableError on any failure.
 * Returns the parsed body only when the server confirmed success.
 */
async function postAi<T>(path: string, body: unknown, timeoutMs: number, externalSignal?: AbortSignal): Promise<T> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw offlineError();
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  // A user "Stop" aborts the same request the timeout would.
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', onExternalAbort);
  }

  try {
    let res: Response;
    try {
      res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        if (externalSignal?.aborted) {
          throw new AiUnavailableError('timeout', 'You stopped this answer.');
        }
        throw timeoutError();
      }
      throw offlineError();
    }

    if (!res.ok) throw await toAiError(res);

    try {
      return (await res.json()) as T;
    } catch {
      throw new AiUnavailableError('invalid_response', 'Adom AI returned a response that could not be read.');
    }
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * Check server connection and DeepSeek configuration. Never throws.
 */
export async function checkServerHealth(): Promise<HealthCheckResult> {
  const unknown: HealthCheckResult = {
    isServerReachable: false,
    hasDeepSeekKey: false,
    model: 'unknown',
    modelValid: false,
  };

  if (typeof navigator !== 'undefined' && !navigator.onLine) return unknown;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const res = await fetch('/api/health', { signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        return {
          isServerReachable: true,
          hasDeepSeekKey: Boolean(data.hasDeepSeekKey),
          model: typeof data.model === 'string' ? data.model : 'unknown',
          modelValid: Boolean(data.modelValid),
        };
      }
    } finally {
      clearTimeout(timeoutId);
    }
  } catch {
    // Server or network unavailable
  }

  return unknown;
}

/**
 * Send a study question to Adom AI (live DeepSeek only).
 */
export async function generateStudyResponse(
  message: string,
  options?: {
    contextSubject?: string;
    fileContext?: { name: string; content: string };
    history?: ChatMessage[];
    deep?: boolean;
    memory?: string;
    wantTitle?: boolean;
    wantImage?: boolean;
    wantChart?: boolean;
    teacherMode?: boolean;
    signal?: AbortSignal;
  }
): Promise<ChatResponseResult> {
  const data = await postAi<{ success?: boolean; text?: string; mode?: ChatResponseResult['mode']; nudge?: string; images?: ImageResult[]; chart?: any; teacherMode?: boolean }>(
    '/api/ai/chat',
    {
      message,
      contextSubject: options?.contextSubject,
      fileContext: options?.fileContext,
      deep: options?.deep === true,
      memory: options?.memory,
      wantTitle: options?.wantTitle === true,
      wantImage: options?.wantImage === true,
      wantChart: options?.wantChart === true,
      teacherMode: options?.teacherMode === true,
      history: options?.history?.slice(-6).map((m) => ({
        sender: m.sender,
        content: m.content,
      })),
    },
    45000,
    options?.signal
  );

  if (!data.success || typeof data.text !== 'string' || !data.text.trim()) {
    throw new AiUnavailableError('invalid_response', 'Adom AI returned an empty answer. Please try again.');
  }

  return {
    text: data.text,
    mode: data.mode || 'chat',
    engine: 'deepseek',
    title: typeof data.nudge === 'string' ? data.nudge : undefined,
    images: data.images,
    chart: data.chart,
    teacherMode: data.teacherMode,
  };
}

/**
 * Send a study question to Adom AI with streaming output.
 *
 * Every fragment of the answer is passed to `onDelta` the moment it arrives, so the
 * student reads while the model writes instead of waiting for the whole reply.
 * Resolves with the authoritative final text and drops the auto TITLE line.
 */
export async function streamStudyResponse(
  message: string,
  options: {
    contextSubject?: string;
    fileContext?: { name: string; content: string };
    history?: ChatMessage[];
    deep?: boolean;
    memory?: string;
    wantTitle?: boolean;
    wantImage?: boolean;
    wantChart?: boolean;
    teacherMode?: boolean;
    signal?: AbortSignal;
    onDelta: (text: string) => void;
  }
): Promise<ChatResponseResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw offlineError();
  }

  const controller = new AbortController();
  // Longer than the server's own 150s ceiling, so the client never aborts a stream
  // the server still considers healthy.
  const timeoutId = setTimeout(() => controller.abort(), 180000);
  const externalSignal = options.signal;
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', onExternalAbort);
  }

  try {
    let res: Response;
    try {
      res = await fetch('/api/ai/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          contextSubject: options.contextSubject,
          fileContext: options.fileContext,
          deep: options.deep === true,
          memory: options.memory,
          wantTitle: options.wantTitle === true,
          wantImage: options.wantImage === true,
          wantChart: options.wantChart === true,
          teacherMode: options.teacherMode === true,
          history: options.history?.slice(-6).map((m) => ({
            sender: m.sender,
            content: m.content,
          })),
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        if (externalSignal?.aborted) {
          throw new AiUnavailableError('timeout', 'You stopped this answer.');
        }
        throw timeoutError();
      }
      throw offlineError();
    }

    if (!res.ok) throw await toAiError(res);

    if (!res.body) {
      // Do not fall back to the non-stream endpoint: the server has already charged this
      // streaming request, and the fallback would charge a second time for the same question.
      throw new AiUnavailableError(
        'invalid_response',
        'Adom AI could not start the answer stream. Please try again.'
      );
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let partial = '';
    // A holder object (not a bare `let`): the value is assigned inside a closure, and
    // TypeScript would otherwise narrow the variable to its initial `null` forever.
    const outcome: { done: (ChatResponseResult & { success?: boolean }) | null } = { done: null };
    let streamError: string | null = null;

    const handleEvent = (rawEvent: string) => {
      const eventLine = rawEvent.split('\n').find((l) => l.startsWith('event:'));
      const dataLines = rawEvent
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim());
      if (dataLines.length === 0) return;
      const eventName = eventLine ? eventLine.slice(6).trim() : 'message';
      let parsed: any;
      try {
        parsed = JSON.parse(dataLines.join('\n'));
      } catch {
        return;
      }
      if (eventName === 'delta') {
        const text = typeof parsed?.text === 'string' ? parsed.text : '';
        if (text) {
          partial += text;
          options.onDelta(text);
        }
      } else if (eventName === 'done') {
        outcome.done = parsed;
      } else if (eventName === 'error') {
        streamError = typeof parsed?.error === 'string' ? parsed.error : 'Adom AI could not finish that answer.';
      }
    };

    while (true) {
      const { done: streamDone, value } = await reader.read();
      if (streamDone) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE events are separated by a blank line.
      let sep = buffer.indexOf('\n\n');
      while (sep !== -1) {
        const rawEvent = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        if (rawEvent.trim()) handleEvent(rawEvent);
        sep = buffer.indexOf('\n\n');
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) handleEvent(buffer);

    if (streamError) {
      throw new AiUnavailableError(
        'provider',
        partial
          ? `${streamError} The part already shown above is genuine Adom AI output.`
          : streamError
      );
    }

    const final = outcome.done;
    if (!final || typeof final.text !== 'string' || !final.text.trim()) {
      // Some proxies buffer the response: use whatever genuinely arrived.
      if (partial.trim()) {
        return { text: partial.trim(), mode: 'chat', engine: 'deepseek', partial: true };
      }
      throw new AiUnavailableError('invalid_response', 'Adom AI returned an empty answer. Please try again.');
    }

    return {
      text: final.text,
      mode: final.mode || 'chat',
      engine: 'deepseek',
      title: final.title ?? final.nudge,
      interactiveData: final.interactiveData,
      images: final.images,
      chart: final.chart,
      teacherMode: final.teacherMode,
    };
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * Generate quiz questions via DeepSeek. Throws rather than serving sample questions.
 *
 * A Full set (25 questions) is several provider calls on the server, so it gets a much
 * longer ceiling than a Quick one: a 40s timeout would abort a set that is working fine.
 */
export async function generateQuizQuestions(
  topic: string,
  options?: {
    subjectCode?: string;
    fileContext?: string;
    count?: number;
    /** Official strand to stay inside, when the caller picked one. */
    strand?: string;
    /** Increments for "a fresh set"; keeps the server's shared cache honest. */
    variant?: number;
    formLevel?: number | null;
  }
): Promise<QuizGenerationResult> {
  const size = clampStudyCount('quiz', options?.count);
  const timeoutMs = batchesFor('quiz', size) > 1 ? 180000 : 60000;
  const data = await postAi<{
    success?: boolean;
    questions?: QuizQuestion[];
    quizTitle?: string;
    count?: number;
    requested?: number;
  }>(
    '/api/ai/quiz',
    {
      topic,
      subjectCode: options?.subjectCode,
      fileContext: options?.fileContext,
      count: size,
      strand: options?.strand,
      variant: options?.variant,
      formLevel: options?.formLevel,
    },
    timeoutMs
  );

  if (!data.success || !Array.isArray(data.questions) || data.questions.length === 0) {
    throw new AiUnavailableError('invalid_response', 'Adom AI could not produce a valid quiz. Please try again.');
  }

  // Validate the schema before it reaches the quiz runner. Dropping malformed questions is
  // better than rendering an unanswerable card.
  const questions = data.questions.filter(
    (q) =>
      q &&
      typeof q.question === 'string' &&
      Array.isArray(q.options) &&
      q.options.length >= 2 &&
      Number.isInteger(q.correctAnswerIndex) &&
      q.correctAnswerIndex >= 0 &&
      q.correctAnswerIndex < q.options.length
  );

  if (questions.length === 0) {
    throw new AiUnavailableError('invalid_response', 'Adom AI returned a quiz that failed validation. Please try again.');
  }

  return {
    questions,
    quizTitle: data.quizTitle || `${topic} Practice`,
    engine: 'deepseek',
    requested: typeof data.requested === 'number' ? data.requested : size,
  };
}

/**
 * Generate a flashcard deck via DeepSeek. Throws rather than serving sample cards.
 */
export async function generateFlashcardDeck(
  topic: string,
  options?: {
    subjectCode?: string;
    fileContext?: string;
    count?: number;
    strand?: string;
    variant?: number;
    formLevel?: number | null;
  }
): Promise<FlashcardsGenerationResult> {
  const size = clampStudyCount('flashcards', options?.count);
  const timeoutMs = batchesFor('flashcards', size) > 1 ? 180000 : 60000;
  const data = await postAi<{
    success?: boolean;
    flashcards?: Flashcard[];
    topic?: string;
    count?: number;
    requested?: number;
  }>(
    '/api/ai/flashcards',
    {
      topic,
      subjectCode: options?.subjectCode,
      fileContext: options?.fileContext,
      count: size,
      strand: options?.strand,
      variant: options?.variant,
      formLevel: options?.formLevel,
    },
    timeoutMs
  );

  if (!data.success || !Array.isArray(data.flashcards) || data.flashcards.length === 0) {
    throw new AiUnavailableError('invalid_response', 'Adom AI could not produce a valid flashcard deck. Please try again.');
  }

  const flashcards = data.flashcards.filter(
    (c) => c && typeof c.prompt === 'string' && c.prompt.trim() && typeof c.answer === 'string' && c.answer.trim()
  );

  if (flashcards.length === 0) {
    throw new AiUnavailableError('invalid_response', 'Adom AI returned flashcards that failed validation. Please try again.');
  }

  return {
    flashcards,
    topic: data.topic || topic,
    engine: 'deepseek',
    requested: typeof data.requested === 'number' ? data.requested : size,
  };
}

/**
 * Synthesize revision notes from a document via DeepSeek. Throws rather than echoing the file.
 */
export async function summarizeDocument(
  documentName: string,
  documentContent: string,
  subjectCode?: string
): Promise<SummaryGenerationResult> {
  const data = await postAi<{ success?: boolean; summary?: string }>(
    '/api/ai/summarize',
    {
      documentName,
      documentContent,
      subjectCode,
    },
    30000
  );

  if (!data.success || typeof data.summary !== 'string' || !data.summary.trim()) {
    throw new AiUnavailableError('invalid_response', 'Adom AI could not summarise that document. Please try again.');
  }

  return { summary: data.summary, engine: 'deepseek' };
}
