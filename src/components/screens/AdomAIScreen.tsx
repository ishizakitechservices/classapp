import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { FormattedContent } from '../FormattedContent';
import { QuizTemplateModal } from '../QuizTemplateModal';
import { FlashcardsTemplateModal } from '../FlashcardsTemplateModal';
import MathChart from '../charts/MathChart';
import InequalityGraph from '../charts/InequalityGraph';
import { type ChartSpec } from '../../shared/mathCharts';
import { STUDY_SIZES, STUDY_CAPS, studySizeLabel, type StudySize } from '../../shared/studyLimits';
import { strandsFor, loadCurriculum } from '../../shared/curriculum/index';
import {
  Sparkles,
  Send,
  HelpCircle,
  Layers,
  RotateCw,
  History,
  Trash2,
  X,
  ArrowUpRight,
  PanelLeft,
  Plus,
  Copy,
  Check,
  MessageSquare,
  Paperclip,
  Brain,
  Mic,
  MicOff,
  Speaker,
  Image as ImageIcon,
  BarChart3,
  ScatterChart,
  PieChart,
} from 'lucide-react';

interface VaultNote {
  id: string;
  displayName: string;
  subjectCode: string | null;
}

const ANSWER_STYLES: Array<{ label: string; prompt: string }> = [
  { label: 'Simpler', prompt: 'Explain that again more simply, as if I am new to the topic.' },
  { label: 'More detail', prompt: 'Add more depth and detail to that explanation.' },
  { label: 'Exam style', prompt: 'Show how that would be answered in a WASSCE exam, with marks.' },
  { label: 'Give an example', prompt: 'Give me one worked example of that.' },
];

export const AdomAIScreen: React.FC = () => {
  const {
    chatMessages,
    setChatMessages,
    sendMessage,
    stopAiResponse,
    retryLastMessage,
    isAiThinking,
    isChatThinking,
    threadLoadingId,
    threadError,
    aiEngineStatus,
    activeQuizOpen,
    setActiveQuizOpen,
    activeFlashcardsOpen,
    setActiveFlashcardsOpen,
    activeQuizData,
    setActiveQuizData,
    activeFlashcardsData,
    setActiveFlashcardsData,
    generateCustomQuiz,
    openAiQuiz,
    openAiFlashcards,
    generateFlashcards: _unusedFlashcards,
    quizAttempts,
    recordQuizAttempt,
    chatThreads,
    newChat,
    openThread,
    deleteThread,
    teacherMode,
    setTeacherMode,
    activeChart,
    setActiveChart,
    activeImages,
    setActiveImages,
    isListening,
    startListening,
    stopListening,
    readAloud,
    stopReadAloud,
    isSpeechToTextAvailable,
    isReadAloudAvailable,
    ocrImage: ocrImageFn,
  } = useApp() as any;

  const { user: authUser } = useAuth();
  // The subject chips and quiz dropdown belong to the real signed-in account, not the
  // retired local Subject[] state that always stayed empty.
  const subjects = authUser?.subjects ?? [];
  const displayName = authUser?.displayName || 'Student';
  const classLabel = authUser?.className || 'Student';

  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
  );

  const [inputVal, setInputVal] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [deepThink, setDeepThink] = useState(false);
  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  /** Blocks a second send from the same Enter press (keydown + form submit). */
  const sendLockRef = useRef(false);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savedNoteId, setSavedNoteId] = useState<string | null>(null);
  const [budget, setBudget] = useState<{ used: number; limit: number; remaining: number } | null>(null);

  const [showQuizModal, setShowQuizModal] = useState(false);
  const showQuizModalRef = useRef(false);
  useEffect(() => {
    showQuizModalRef.current = showQuizModal;
  }, [showQuizModal]);
  const [showFlashcardsModal, setShowFlashcardsModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [customTopic, setCustomTopic] = useState('');
  const [selectedSubjectCode, setSelectedSubjectCode] = useState('');
  const [quizSize, setQuizSize] = useState<StudySize>('standard');
  const [quizStrand, setQuizStrand] = useState('');
  const [generatorLoading, setGeneratorLoading] = useState(false);
  const [generatorError, setGeneratorError] = useState<string | null>(null);

  // Attach a Vault note (answered from the student's own material)
  const [notes, setNotes] = useState<VaultNote[]>([]);
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachedNote, setAttachedNote] = useState<{ name: string; content: string } | null>(null);

  // Refresh the remaining-requests figure after every answer.
  const refreshBudget = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/budget');
      if (res.ok) setBudget(await res.json());
    } catch {
      // Indicator is optional; failing to read it never blocks chatting.
    }
  }, []);

  useEffect(() => {
    refreshBudget();
  }, [refreshBudget, isAiThinking]);

  /**
   * Auto-scroll only while the student is already at the bottom.
   *
   * Streaming fires dozens of updates a second; scrolling unconditionally yanked anyone
   * who scrolled up to re-read an earlier part of the answer back down to the bottom.
   */
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  /** While a stream is live, scroll without animation: smooth scroll cannot keep up. */
  const isStreamingView = chatMessages.some((m: any) => m.streaming);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottomRef.current = distance < 80;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    messagesEndRef.current?.scrollIntoView({
      behavior: isStreamingView ? 'auto' : 'smooth',
      block: 'end',
    });
  }, [chatMessages, isAiThinking, isStreamingView]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
    }
  }, [inputVal]);

  const handleSend = async (e?: React.FormEvent, presetText?: string) => {
    if (e) e.preventDefault();
    const text = (presetText ?? inputVal).trim();
    if (!text || isAiThinking) return;

    // Synchronous re-entry guard. State updates are not visible until the next render, so
    // Enter firing both handleKeyDown AND the form's onSubmit used to send the same
    // question twice before `isAiThinking` turned true.
    if (sendLockRef.current) return;
    sendLockRef.current = true;

    // Only clear the composer when the student sent what they typed. A preset from an
    // answer-style chip must not wipe a half-written question.
    if (!presetText) setInputVal('');
    if (textareaRef.current && !presetText) textareaRef.current.style.height = 'auto';
    // Auto teacher mode: explanatory questions trigger Socratic tutoring automatically.
    const autoTeacher = /^(explain|how|why|what is|what are|teach me|show me|solve|step by step|walk me through|break down)/i.test(text);

    try {
      await sendMessage(text, selectedSubject || undefined, attachedNote || undefined, deepThink, {
        // wantImage and wantChart are NOT set here — DeepSeek auto-decides based on the question.
        teacherMode: autoTeacher,
      });
    } finally {
      sendLockRef.current = false;
    }
    setDeepThink(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      // preventDefault stops the implicit form submission, so the question is sent once.
      e.preventDefault();
      handleSend();
    }
  };

  /**
   * Practice quizzes / Flashcards open immediately.
   *
   * They used to fall back to hardcoded sample questions and decks when nothing was
   * generated yet. Now an already-saved set opens with zero network cost; otherwise the
   * modal opens right away (empty, with a loading line) and Adom AI fills it.
   */
  /** Failure message for a study tool that could not be generated (never faked). */
  const [toolError, setToolError] = useState<string | null>(null);
  /** Honest notice when a set came back shorter than requested. */
  const [studyNotice, setStudyNotice] = useState<string | null>(null);

  const openQuizTool = async () => {
    setToolError(null);
    setStudyNotice(null);
    setActiveQuizData(null);
    setActiveQuizOpen(true);
    const outcome = await openAiQuiz({ count: STUDY_SIZES.quiz.quick });
    if (!outcome.ok) {
      setToolError(outcome.error || 'Adom AI could not build that quiz.');
    } else if (outcome.count < outcome.requested) {
      setStudyNotice(
        `Adom AI wrote ${outcome.count} of ${outcome.requested} questions. Everything written is complete.`
      );
    }
  };

  const openFlashcardsTool = async () => {
    setToolError(null);
    setStudyNotice(null);
    setActiveFlashcardsData(null);
    setActiveFlashcardsOpen(true);
    const outcome = await openAiFlashcards({ count: STUDY_SIZES.flashcards.quick });
    if (!outcome.ok) {
      setToolError(outcome.error || 'Adom AI could not build that deck.');
    } else if (outcome.count < outcome.requested) {
      setStudyNotice(
        `Adom AI wrote ${outcome.count} of ${outcome.requested} cards. Everything written is complete.`
      );
    }
  };

  const openAttach = async () => {
    setAttachOpen(true);
    try {
      const res = await fetch('/api/vault/files');
      if (res.ok) {
        const data = await res.json();
        // Only text notes can feed the AI, so only offer those.
        const notesOnly = (data.files || []).filter(
          (f: any) => f.mimeType?.startsWith('text/') || /\.(md|txt)$/i.test(f.displayName)
        );
        setNotes(notesOnly);
      }
    } catch {
      // Ignore: the empty state explains itself.
    }
  };

  const pickNote = async (note: VaultNote) => {
    try {
      const res = await fetch(`/api/vault/files/${note.id}/content`);
      if (!res.ok) throw new Error('That note needs to be a text note (.md or .txt).');
      const data = await res.json();
      setAttachedNote({ name: note.displayName, content: String(data.text).slice(0, 4000) });
      setAttachOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not attach that note.');
    }
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // Clipboard blocked: no crash.
    }
  };

  const handleSaveToVault = async (id: string, text: string) => {
    try {
      const params = new URLSearchParams({
        name: `Adom AI answer ${new Date().toLocaleDateString()}.md`,
        type: 'text/markdown',
        folder: 'notes',
      });
      const res = await fetch(`/api/vault/files?${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: text,
      });
      if (!res.ok) throw new Error('Could not save to Vault.');
      setSavedNoteId(id);
      setTimeout(() => setSavedNoteId(null), 2200);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not save to Vault.');
    }
  };

  const handleCreateQuiz = async () => {
    if (!customTopic.trim()) return;
    setGeneratorLoading(true);
    setGeneratorError(null);
    try {
      // The chips carry the student's OWN subjects, whose objects expose `code`.
      const outcome = await generateCustomQuiz(customTopic.trim(), {
        subjectCode: selectedSubjectCode || undefined,
        count: STUDY_SIZES.quiz[quizSize],
        strand: quizStrand || undefined,
        fresh: true,
        openOnSuccess: false,
      });
      if (!outcome.ok) {
        setGeneratorError(outcome.error || 'Adom AI could not generate this quiz. Check your connection and try again.');
        return;
      }
      // Keep the shortfall notice visible on the quiz itself; the generator modal closes.
      setStudyNotice(
        outcome.count < outcome.requested
          ? `Adom AI wrote ${outcome.count} of ${outcome.requested} questions. Everything written is complete — try again for the rest.`
          : null
      );
      // Only open the runner if the student did not close the generator while it worked.
      if (showQuizModalRef.current) setActiveQuizOpen(true);
      setShowQuizModal(false);
      setCustomTopic('');
    } finally {
      setGeneratorLoading(false);
    }
  };

  // Official strands for the chosen subject. The subject's data is loaded on demand,
  // so this fills in a moment after the picker changes.
  const [strandOptions, setStrandOptions] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    setStrandOptions([]);
    if (!selectedSubjectCode) return;
    loadCurriculum(selectedSubjectCode)
      .then(() => {
        if (!cancelled) setStrandOptions(strandsFor(selectedSubjectCode));
      })
      .catch(() => {
        if (!cancelled) setStrandOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSubjectCode]);

  const inputClass =
    'w-full text-xs px-3 py-2 rounded-lg glass-input text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-400';
  // Only the newest failed answer can be retried; older error bubbles would retry the
  // wrong question once a later message exists.
  const lastAssistantId = [...chatMessages]
    .reverse()
    .find((m: any) => m.sender === 'assistant')?.id;

  return (
    /* Full-screen chat on phones; framed panel on desktop. */
    <div className="fixed inset-x-0 top-[57px] bottom-[60px] md:static md:inset-auto md:h-[calc(100vh-95px)] flex w-full overflow-hidden glass-strong md:rounded-2xl md:border">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 md:hidden bg-black/40"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar: slide-in drawer on phones, static column on desktop */}
      <aside
        className={`${sidebarOpen ? 'w-64 sm:w-72' : 'w-0'} fixed md:relative inset-y-0 left-0 z-40 md:z-20 transition-all duration-200 ease-in-out overflow-hidden glass-strong border-r border-neutral-500/15 dark:border-white/10 flex flex-col shrink-0 ${sidebarOpen ? '' : 'border-r-0'}`}
      >
        <div className="p-3 border-b border-neutral-500/15 dark:border-white/10 flex items-center justify-between gap-2">
          <button
            onClick={() => {
              newChat();
              setSidebarOpen(false);
            }}
            className="flex-1 min-h-[40px] px-3 rounded-xl glass text-neutral-900 dark:text-white text-xs font-semibold flex items-center gap-2"
          >
            <Plus className="w-4 h-4 text-neutral-500" />
            <span>New chat</span>
          </button>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-2 rounded-xl text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
            aria-label="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2.5 space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 px-2 py-1 font-semibold">
            Chats
          </div>

          {(chatThreads as any[]).length === 0 && (
            <p className="px-2 py-1 text-[11px] text-neutral-500 leading-relaxed">
              Your chats are saved here automatically once you ask a question.
            </p>
          )}

          {(chatThreads as any[]).map((t: any) => (
            <div
              key={t.id}
              className="group min-h-[38px] px-2.5 py-2 rounded-xl text-xs flex items-center justify-between text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900 cursor-pointer"
              onClick={() => {
                openThread(t.id);
                setSidebarOpen(false);
              }}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <MessageSquare className="w-3.5 h-3.5 opacity-60 shrink-0" />
                <span className="truncate">{t.title}</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteThread(t.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-500"
                aria-label="Delete chat"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          <div className="pt-4 mt-4 border-t border-neutral-500/15 dark:border-white/10 space-y-1">
            <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 px-2 py-1 font-semibold">
              Study tools
            </div>
            {/*
              All three open instantly and are Adom AI generated:
              last-used set on this device opens with no network call, otherwise the modal
              opens immediately and fills as the AI writes. No spinner, no sample content.
            */}
            <button
              onClick={() => openQuizTool()}
              disabled={aiEngineStatus !== 'deepseek'}
              className="w-full text-left min-h-[36px] px-2.5 rounded-xl text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900 flex items-center gap-2 disabled:opacity-40"
            >
              <HelpCircle className="w-3.5 h-3.5 text-neutral-500" />
              <span className="flex-1">Practice quizzes</span>
              <span className="text-[9px] font-mono text-neutral-400">AI</span>
            </button>
            <button
              onClick={() => openFlashcardsTool()}
              disabled={aiEngineStatus !== 'deepseek'}
              className="w-full text-left min-h-[36px] px-2.5 rounded-xl text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900 flex items-center gap-2 disabled:opacity-40"
            >
              <Layers className="w-3.5 h-3.5 text-neutral-500" />
              <span className="flex-1">Flashcards</span>
              <span className="text-[9px] font-mono text-neutral-400">AI</span>
            </button>
            <button
              onClick={() => setShowQuizModal(true)}
              disabled={aiEngineStatus !== 'deepseek'}
              className="w-full text-left min-h-[36px] px-2.5 rounded-xl text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900 flex items-center gap-2 disabled:opacity-40"
            >
              <Sparkles className="w-3.5 h-3.5 text-neutral-500" />
              <span className="flex-1">Custom quiz</span>
              <span className="text-[9px] font-mono text-neutral-400">AI</span>
            </button>
            {quizAttempts.length > 0 && (
              <button
                onClick={() => setShowHistoryModal(true)}
                className="w-full text-left min-h-[36px] px-2.5 rounded-xl text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900 flex items-center justify-between"
              >
                <span className="flex items-center gap-2">
                  <History className="w-3.5 h-3.5 text-neutral-500" />
                  Attempts
                </span>
                <span className="font-mono text-[10px] bg-neutral-200 dark:bg-neutral-800 px-1.5 rounded-full">
                  {quizAttempts.length}
                </span>
              </button>
            )}
          </div>
        </div>

        <div className="p-3 border-t border-neutral-500/15 dark:border-white/10 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 flex items-center justify-center font-bold text-xs shrink-0">
            {(displayName || 'S').charAt(0)}
          </div>
          <div className="min-w-0 truncate">
            <div className="text-xs font-semibold text-neutral-900 dark:text-white truncate">
              {displayName}
            </div>
            <div className="text-[10px] text-neutral-400 truncate">{classLabel}</div>
          </div>
        </div>
      </aside>

      {/* Conversation */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative min-w-0">
        <header className="px-3 py-2 border-b border-neutral-500/15 dark:border-white/10 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                aria-label="Open chats"
              >
                <PanelLeft className="w-4 h-4" />
              </button>
            )}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-neutral-900/[0.07] dark:bg-white/10 text-xs font-semibold text-neutral-900 dark:text-white">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Adom AI</span>
              {aiEngineStatus !== 'deepseek' && aiEngineStatus !== 'checking' && (
                <span className="text-[10px] text-amber-500 font-semibold">Offline</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {budget && (
              <span
                className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400 px-2"
                title="Adom AI requests left today"
              >
                {budget.remaining}/{budget.limit}
              </span>
            )}
            {chatMessages.length > 0 && (
              <button
                onClick={() => newChat()}
                className="p-1.5 text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                aria-label="New chat"
                title="New chat"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>
        </header>

        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-3 sm:px-4 py-4">
          <div className="max-w-3xl mx-auto w-full space-y-5">
            {chatMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center min-h-full text-center gap-3 py-10">
                <div className="w-12 h-12 rounded-2xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 flex items-center justify-center">
                  {threadLoadingId ? (
                    <RotateCw className="w-6 h-6 animate-spin" />
                  ) : (
                    <Sparkles className="w-6 h-6" />
                  )}
                </div>
                <h1 className="text-lg sm:text-xl font-bold text-neutral-900 dark:text-white">
                  {threadLoadingId ? 'Loading chat…' : threadError ? 'Could not load that chat' : 'Ask Adom AI'}
                </h1>
                <p className="text-xs text-neutral-500 max-w-sm">
                  {threadLoadingId
                    ? 'Fetching your saved conversation from the server.'
                    : threadError || 'Your SHS tutor for the OLAG NaCCA curriculum. Type a question below to begin.'}
                </p>
                {threadError && !threadLoadingId ? (
                  <button
                    onClick={() => newChat()}
                    className="min-h-[36px] px-3 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-[11px] font-semibold"
                  >
                    Start a new chat
                  </button>
                ) : null}
                {attachedNote && (
                  <p className="text-[11px] text-neutral-500 flex items-center gap-1">
                    <Paperclip className="w-3 h-3" /> Using your note: {attachedNote.name}
                  </p>
                )}
              </div>
            )}

            {chatMessages.map((msg: any) => {
              const isUser = msg.sender === 'user';
              return (
                <div key={msg.id} className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
                  {!isUser && (
                    <div className="w-7 h-7 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 flex items-center justify-center shrink-0 mt-1">
                      <Sparkles className="w-3.5 h-3.5" />
                    </div>
                  )}

                  <div
                    className={`group relative max-w-[85%] ${
                      isUser
                        ? 'bg-neutral-900/[0.07] dark:bg-white/10 px-3.5 py-2 rounded-3xl rounded-tr-sm text-xs leading-relaxed'
                        : 'text-neutral-900 dark:text-neutral-100 text-xs sm:text-sm leading-relaxed space-y-2 pt-1'
                    }`}
                  >
                    {isUser ? (
                      <div className="whitespace-pre-line">{msg.content}</div>
                    ) : msg.error ? (
                      <div className="space-y-2">
                        {/* Genuine text that already arrived stays readable above the failure note. */}
                        {msg.content ? <FormattedContent content={msg.content} /> : null}
                        <div className="bg-neutral-900/[0.07] dark:bg-white/10/70 rounded-xl p-3 space-y-2">
                          <div className="text-[10px] font-mono font-semibold text-neutral-500 uppercase">
                            Adom AI couldn't answer
                          </div>
                          <p className="text-xs text-neutral-700 dark:text-neutral-300">{msg.error}</p>
                          {msg.id === lastAssistantId && msg.retryable !== false ? (
                            <button
                              onClick={() => retryLastMessage()}
                              className="min-h-[32px] px-3 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-[11px] font-semibold flex items-center gap-1.5"
                            >
                              <RotateCw className="w-3 h-3" />
                              Try again
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <>
                        {msg.content ? (
                          <FormattedContent content={msg.content} streaming={!!msg.streaming} />
                        ) : (
                          <div className="flex items-center gap-1 pt-1 text-neutral-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse [animation-delay:150ms]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse [animation-delay:300ms]" />
                          </div>
                        )}
                        {msg.streaming && msg.content ? (
                          <span className="inline-block w-[2px] h-[1em] align-text-bottom bg-current animate-pulse" aria-label="Adom AI is still writing" />
                        ) : null}

                        {msg.mode === 'quiz' && msg.interactiveData?.questions?.length ? (
                          <button
                            onClick={() => {
                              setActiveQuizData({
                                title: msg.interactiveData?.quizTitle || 'Practice quiz',
                                questions: msg.interactiveData?.questions || [],
                              });
                              setActiveQuizOpen(true);
                            }}
                            className="px-3 py-1.5 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 rounded-lg text-[11px] font-semibold flex items-center gap-1.5"
                          >
                            <HelpCircle className="w-3 h-3" />
                            Start quiz
                          </button>
                        ) : null}

                        {msg.interactiveData?.flashcards?.length ? (
                          <button
                            onClick={() => {
                              if (msg.interactiveData?.flashcards?.length) {
                                setActiveFlashcardsData({
                                  topic: 'Revision deck',
                                  flashcards: msg.interactiveData.flashcards,
                                });
                              }
                              setActiveFlashcardsOpen(true);
                            }}
                            className="px-3 py-1.5 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 rounded-lg text-[11px] font-semibold flex items-center gap-1.5"
                          >
                            <Layers className="w-3 h-3" />
                            Open flashcards
                          </button>
                        ) : null}

                        {/* Rich output: chart or graph (rendered client-side, zero AI tokens) */}
                        {!msg.streaming && (msg.chartData || activeChart) && (
                          <div className="mt-3 pt-2 border-t border-neutral-500/15 dark:border-white/10">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <span className="text-[10px] font-mono text-neutral-500 uppercase">Chart</span>
                              <button
                                onClick={() => setActiveChart(null)}
                                className="p-1 text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                                title="Remove chart"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                            {msg.kind === 'inequalities' || (msg.chartData as ChartSpec)?.kind === 'inequalities' ? (
                              <InequalityGraph
                                inequalities={(msg.chartData as ChartSpec)?.inequalities || []}
                                width={340}
                                height={260}
                                className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900"
                              />
                            ) : (
                              <MathChart
                                spec={(msg.chartData as ChartSpec) || activeChart!}
                                width={340}
                                height={260}
                                className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900"
                              />
                            )}
                          </div>
                        )}

                        {/* Rich output: web images fetched server-side */}
                        {!msg.streaming && msg.images?.length && (
                          <div className="mt-3 pt-2 border-t border-neutral-500/15 dark:border-white/10">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <span className="text-[10px] font-mono text-neutral-500 uppercase">Images from the web</span>
                              <button
                                onClick={() => {
                                  setActiveImages([]);
                                  // Also clear from the message
                                  setChatMessages((prev: any[]) =>
                                    prev.map((m: any) =>
                                      m.id === msg.id ? { ...m, images: [] } : m
                                    )
                                  );
                                }}
                                className="p-1 text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                                title="Remove images"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {msg.images.map((img: any, i: number) => (
                                <div key={i} className="relative group">
                                  <img
                                    src={img.thumbnail || img.image_url}
                                    alt={img.title || 'Image'}
                                    className="w-full h-24 object-cover rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22150%22><text x=%2250%22 y=%2250%22 font-size=%2212%22 text-anchor=%22middle%22 fill=%22%236b7280%22>Image unavailable</text></svg>';
                                    }}
                                  />
                                  <a
                                    href={img.source_url || img.image_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-lg"
                                  >
                                    <span className="text-white text-xs font-medium bg-black/60 px-2 py-0.5 rounded">Open source</span>
                                  </a>
                                  <p className="text-[10px] text-neutral-500 mt-1 line-clamp-1">{img.title}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Answer actions: only once the answer is finished. Acting on half
                            an answer would copy/save/quote an incomplete reply. */}
                        {!msg.streaming && msg.content ? (
                          <div className="flex items-center flex-wrap gap-1.5 pt-1 text-neutral-400">
                            <button
                              onClick={() => handleCopy(msg.id, msg.content)}
                              className="p-1.5 rounded hover:text-neutral-900 dark:hover:text-white"
                              title="Copy"
                              aria-label="Copy answer"
                            >
                              {copiedId === msg.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={() => handleSaveToVault(msg.id, msg.content)}
                              className="p-1.5 rounded hover:text-neutral-900 dark:hover:text-white"
                              title="Save to Vault"
                              aria-label="Save answer to Vault"
                            >
                              {savedNoteId === msg.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Paperclip className="w-3.5 h-3.5" />}
                            </button>
                            {ANSWER_STYLES.map((style) => (
                              <button
                                key={style.label}
                                onClick={() => handleSend(undefined, `${style.prompt}\n\n(Previous answer: ${msg.content.slice(0, 300)})`)}
                                className="px-2 py-1 rounded-full border border-neutral-200 dark:border-neutral-700 text-[10px] font-medium hover:bg-neutral-500/10"
                              >
                                {style.label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            {/* The streaming bubble already shows its own dots and caret, so this row only
                appears before the first token arrives (it would otherwise be a second,
                contradictory "Thinking…" under an answer that is visibly being written). */}
            {isAiThinking && !isStreamingView && (
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 flex items-center justify-center shrink-0">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div className="flex items-center gap-2 pt-1.5 text-xs text-neutral-500">
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Thinking…</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Composer pinned above the bottom nav */}
        <div className="shrink-0 px-3 pb-2 pt-2 border-t border-neutral-500/15 dark:border-white/10 glass-nav">
          <div className="max-w-3xl mx-auto w-full space-y-2">
            {attachedNote && (
              <div className="flex items-center justify-between gap-2 text-[11px] bg-neutral-900/[0.07] dark:bg-white/10 rounded-lg px-2.5 py-1.5">
                <span className="flex items-center gap-1.5 min-w-0">
                  <Paperclip className="w-3 h-3 shrink-0" />
                  <span className="truncate">{attachedNote.name}</span>
                </span>
                <button onClick={() => setAttachedNote(null)} aria-label="Remove attachment" className="shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {(subjects.length > 0 || budget) && (
              <div className="flex items-center gap-1.5 overflow-x-auto text-[11px]">
                {subjects.slice(0, 8).map((s: any) => (
                  <button
                    key={s.code}
                    onClick={() => setSelectedSubject(selectedSubject === s.name ? '' : s.name)}
                    className={`px-2 py-0.5 rounded-full whitespace-nowrap ${
                      selectedSubject === s.name
                        ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-semibold'
                        : 'bg-neutral-900/[0.07] dark:bg-white/10 text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    {s.code}
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={handleSend} className="flex items-end gap-1.5 bg-neutral-900/[0.07] dark:bg-white/10 rounded-3xl p-1.5">
              <button
                type="button"
                onClick={openAttach}
                className="p-2 rounded-full text-neutral-500 hover:text-neutral-900 dark:hover:text-white shrink-0"
                aria-label="Attach a Vault note"
                title="Attach a Vault note"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              <textarea
                ref={textareaRef}
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                disabled={isAiThinking}
                placeholder="Ask Adom AI…"
                className="flex-1 bg-transparent py-2 px-1 text-xs sm:text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none resize-none max-h-36"
              />

              <button
                type="button"
                onClick={() => setDeepThink((v) => !v)}
                aria-pressed={deepThink}
                className={`p-2 rounded-full shrink-0 ${
                  deepThink
                    ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                    : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                }`}
                title="Think deeper (costs 2 requests)"
                aria-label="Think deeper, costs two requests"
              >
                <Brain className="w-4 h-4" />
              </button>

              {/* AI auto-decides images, charts, and teacher mode based on your question.
                   Manual tools: voice input, read-aloud, OCR. */}
              <div className="flex items-center gap-1 shrink-0">
                {isSpeechToTextAvailable() && (
                  <button
                    type="button"
                    onClick={() => {
                      if (isListening) {
                        stopListening();
                      } else {
                        startListening((text: string, isFinal: boolean) => {
                          if (isFinal) setInputVal(text);
                        });
                      }
                    }}
                    aria-pressed={isListening}
                    title={isListening ? 'Stop voice input' : 'Speak instead of typing'}
                    className={`p-1.5 rounded-full shrink-0 ${
                      isListening
                        ? 'bg-rose-500 text-white'
                        : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                    }`}
                  >
                    {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                  </button>
                )}
                {isReadAloudAvailable() && (
                  <button
                    type="button"
                    onClick={() => {
                      // Read aloud the last assistant answer
                      const last = [...chatMessages]
                        .reverse()
                        .find((m: any) => m.sender === 'assistant' && m.content && !m.error);
                      if (last) readAloud(last.content);
                    }}
                    title="Read the last answer aloud"
                    className="p-1.5 rounded-full shrink-0 text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                  >
                    <Speaker className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0] ?? null;
                      if (file) {
                        setOcrFile(file);
                        ocrImageFn(file).then((text: string) => {
                          setInputVal((prev: string) => (prev ? prev + '\n\n' : '') + 'Extract this text and explain it:\n\n' + text);
                          setOcrFile(null);
                        }).catch((err: any) => {
                          alert('OCR failed: ' + err);
                          setOcrFile(null);
                        });
                      }
                    };
                    input.click();
                  }}
                  title="Extract text from an image (OCR)"
                  className="p-1.5 rounded-full shrink-0 text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                </button>
              </div>

              {isChatThinking ? (
                <button
                  type="button"
                  onClick={() => stopAiResponse()}
                  className="min-h-[36px] px-3 rounded-full text-[11px] font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shrink-0"
                >
                  Stop
                </button>
              ) : isAiThinking ? (
                <button
                  type="button"
                  disabled
                  aria-label="Building your study set"
                  className="w-9 h-9 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 disabled:opacity-60 flex items-center justify-center shrink-0"
                >
                  <RotateCw className="w-4 h-4 animate-spin" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!inputVal.trim()}
                  className="w-9 h-9 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 disabled:opacity-30 flex items-center justify-center shrink-0"
                  aria-label="Send"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </form>

            <p className="text-[10px] text-center text-neutral-400">
              {deepThink ? 'Think deeper · uses 2 requests' : 'Adom AI can make mistakes — check WASSCE facts.'}
            </p>
          </div>
        </div>
      </main>

      {/* Attach note picker */}
      {attachOpen && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="glass-inner rounded-2xl max-w-md w-full p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Attach a Vault note</h3>
              <button onClick={() => setAttachOpen(false)} aria-label="Close" className="text-neutral-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-neutral-500">Adom AI will answer from your own note (.md or .txt).</p>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {notes.length === 0 ? (
                <p className="text-xs text-neutral-500 py-4 text-center">
                  No text notes in your Vault yet. Create one in the Vault to attach it here.
                </p>
              ) : (
                notes.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => pickNote(n)}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs text-neutral-700 dark:text-neutral-300 hover:bg-neutral-500/10 truncate"
                  >
                    {n.displayName}
                    {n.subjectCode ? <span className="text-neutral-400"> · {n.subjectCode}</span> : null}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <QuizTemplateModal
        isOpen={activeQuizOpen}
        onClose={() => {
          setActiveQuizOpen(false);
          setToolError(null);
          setStudyNotice(null);
        }}
        activeData={activeQuizData}
        loadError={toolError}
        notice={studyNotice}
        onRecordAttempt={recordQuizAttempt}
        onAskAdomAI={(prompt) => sendMessage(prompt)}
      />

      <FlashcardsTemplateModal
        isOpen={activeFlashcardsOpen}
        onClose={() => {
          setActiveFlashcardsOpen(false);
          setToolError(null);
          setStudyNotice(null);
        }}
        activeData={activeFlashcardsData}
        loadError={toolError}
        notice={studyNotice}
        onAskAdomAI={(prompt) => sendMessage(prompt)}
      />

      {/* Custom quiz maker */}
      {showQuizModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="glass-inner rounded-2xl max-w-md w-full p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Generate a quiz</h3>
              <button onClick={() => setShowQuizModal(false)} aria-label="Close" className="text-neutral-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              placeholder="Topic, e.g. Vectors"
              className={inputClass}
            />
            <select
              value={selectedSubjectCode}
              onChange={(e) => {
                setSelectedSubjectCode(e.target.value);
                setQuizStrand('');
              }}
              className={inputClass}
            >
              <option value="">General</option>
              {/* The student's own subjects: value is the CODE the curriculum uses. */}
              {(subjects as any[]).map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>

            {strandOptions.length > 0 && (
              <select value={quizStrand} onChange={(e) => setQuizStrand(e.target.value)} className={inputClass}>
                <option value="">Whole subject</option>
                {strandOptions.map((strand) => (
                  <option key={strand} value={strand}>
                    {strand}
                  </option>
                ))}
              </select>
            )}

            {/* Only three choices, so the cost of each is obvious up front. */}
            <div className="flex items-center gap-1.5 text-[11px]">
              {(['quick', 'standard', 'full'] as StudySize[]).map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setQuizSize(size)}
                  aria-pressed={quizSize === size}
                  className={`flex-1 min-h-[32px] rounded-lg whitespace-nowrap ${
                    quizSize === size
                      ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-semibold'
                      : 'bg-neutral-900/[0.07] dark:bg-white/10 text-neutral-600 dark:text-neutral-400'
                  }`}
                >
                  {studySizeLabel('quiz', size)}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-neutral-400">
              {quizSize === 'full'
                ? 'A full set uses 2 of your daily requests and takes longer to write.'
                : `Up to ${STUDY_CAPS.quiz} questions in a set.`}
            </p>

            {generatorError && <p className="text-[11px] text-neutral-600 dark:text-neutral-300">{generatorError}</p>}
            <button
              onClick={handleCreateQuiz}
              disabled={!customTopic.trim() || generatorLoading}
              className="w-full min-h-[40px] rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {generatorLoading && <RotateCw className="w-3.5 h-3.5 animate-spin" />}
              {generatorLoading ? 'Generating…' : 'Generate with Adom AI'}
            </button>
          </div>
        </div>
      )}

      {/* Attempts */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="glass-inner rounded-2xl max-w-md w-full p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Quiz attempts</h3>
              <button onClick={() => setShowHistoryModal(false)} aria-label="Close" className="text-neutral-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto space-y-2">
              {quizAttempts.map((qa: any) => (
                <div key={qa.id} className="p-2.5 rounded-lg border border-neutral-500/10 dark:border-white/10 flex justify-between text-xs">
                  <div className="min-w-0">
                    <div className="font-semibold text-neutral-900 dark:text-white truncate">{qa.quizTitle}</div>
                    <div className="text-[10px] font-mono text-neutral-400">
                      {qa.dateFormatted} · {qa.subjectCode || 'General'}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono font-bold">
                      {qa.score}/{qa.totalQuestions}
                    </div>
                    <div className="text-[10px] text-neutral-500">{qa.percentage}%</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
