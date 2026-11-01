import React, { useState, useEffect } from 'react';
import { QuizQuestion } from '../types';
import { FormattedContent } from './FormattedContent';
import {
  X,
  ChevronRight,
  RotateCw,
  Award,
  Sparkles,
  BookOpen,
  ArrowRight,
  CheckCircle2,
  XCircle,
  MessageSquare,
} from 'lucide-react';

export interface QuizTemplate {
  id: string;
  title: string;
  subjectCode: string;
  topic: string;
  description: string;
  questions: QuizQuestion[];
}

export const PREBUILT_QUIZ_TEMPLATES: QuizTemplate[] = [
  {
    id: 'tpl-emath',
    title: 'Calculus: Differentiation & Tangents',
    subjectCode: 'EMATH 301',
    topic: 'First Principles, Chain Rule & Turning Points',
    description: 'Derivatives from limits, tangents and normals, and local turning points for WASSCE.',
    questions: [
      {
        id: 'eq-1',
        question: 'If $y = (2x + 3)^4$, what is $\\frac{dy}{dx}$ evaluated using the Chain Rule?',
        options: [
          '$8(2x + 3)^3$',
          '$4(2x + 3)^3$',
          '$2(2x + 3)^3$',
          '$8(2x + 3)^4$',
        ],
        correctAnswerIndex: 0,
        explanation: 'By the Chain Rule, $\\frac{dy}{dx} = 4(2x + 3)^3 \\cdot \\frac{d}{dx}[2x + 3] = 4(2x + 3)^3 \\cdot 2 = 8(2x + 3)^3$.',
      },
      {
        id: 'eq-2',
        question: 'What is the gradient of the normal to the curve $y = x^2 - 3x + 2$ at the point where $x = 2$?',
        options: ['$-1$', '$1$', '$2$', '$-\\frac{1}{2}$'],
        correctAnswerIndex: 0,
        explanation: '$\\frac{dy}{dx} = 2x - 3$. At $x = 2$, tangent gradient $m_t = 2(2) - 3 = 1$. The normal is perpendicular: $m_n = -\\frac{1}{m_t} = -1$.',
      },
      {
        id: 'eq-3',
        question: 'Find the turning point for the curve $y = 2x^2 - 8x + 5$ and determine its nature.',
        options: [
          '$(2, -3)$, Local Minimum',
          '$(2, -3)$, Local Maximum',
          '$(-2, 29)$, Local Minimum',
          '$(4, 5)$, Local Maximum',
        ],
        correctAnswerIndex: 0,
        explanation: '$\\frac{dy}{dx} = 4x - 8 = 0 \\implies x = 2$. Then $y = 2(2)^2 - 8(2) + 5 = -3$. Since $\\frac{d^2y}{dx^2} = 4 > 0$, the curve is concave up, giving a local minimum at $(2, -3)$.',
      },
    ],
  },
  {
    id: 'tpl-physics',
    title: 'Mechanics: Newton’s Laws & Momentum',
    subjectCode: 'PHY 301',
    topic: 'Equations of Motion, Momentum & Projectiles',
    description: 'Uniform acceleration, linear momentum conservation, and projectile trajectory for WASSCE.',
    questions: [
      {
        id: 'pq-1',
        question: 'A ball thrown vertically upward with initial speed $u = 29.4\\text{ m/s}$ reaches maximum height. What is the time taken? (Take $g = 9.8\\text{ m/s}^2$)',
        options: ['$3.0\\text{ s}$', '$2.5\\text{ s}$', '$4.0\\text{ s}$', '$6.0\\text{ s}$'],
        correctAnswerIndex: 0,
        explanation: 'At maximum height, vertical velocity $v = 0$. Using $v = u - gt$: $0 = 29.4 - 9.8t \\implies t = \\frac{29.4}{9.8} = 3.0\\text{ s}$.',
      },
      {
        id: 'pq-2',
        question: 'A resultant force of $20\\text{ N}$ acts on a body of mass $4\\text{ kg}$ for $3\\text{ seconds}$. What is the change in linear momentum (impulse) produced?',
        options: ['$60\\text{ N}\\cdot\\text{s}$', '$15\\text{ N}\\cdot\\text{s}$', '$80\\text{ N}\\cdot\\text{s}$', '$240\\text{ N}\\cdot\\text{s}$'],
        correctAnswerIndex: 0,
        explanation: 'Impulse equals change in momentum: $\\Delta p = F \\times \\Delta t = 20\\text{ N} \\times 3\\text{ s} = 60\\text{ N}\\cdot\\text{s}$.',
      },
      {
        id: 'pq-3',
        question: 'At what angle of elevation $\\theta$ is the horizontal range of a projectile maximized over flat ground?',
        options: ['$45^\\circ$', '$30^\\circ$', '$60^\\circ$', '$90^\\circ$'],
        correctAnswerIndex: 0,
        explanation: 'Range $R = \\frac{u^2 \\sin 2\\theta}{g}$. The factor $\\sin 2\\theta$ reaches its maximum value of $1$ when $2\\theta = 90^\\circ \\implies \\theta = 45^\\circ$.',
      },
    ],
  },
  {
    id: 'tpl-chem',
    title: 'Stoichiometry & Chemical Bonding',
    subjectCode: 'CHEM 301',
    topic: 'Mole Concept, Titration & Periodic Trends',
    description: 'Calculations from chemical equations, molarity, and periodic trends for WASSCE.',
    questions: [
      {
        id: 'chq-1',
        question: 'What mass of anhydrous sodium hydroxide ($\\text{NaOH}$, molar mass $40\\text{ g/mol}$) is required to prepare $500\\text{ cm}^3$ of a $0.20\\text{ M}$ solution?',
        options: ['$4.0\\text{ g}$', '$8.0\\text{ g}$', '$2.0\\text{ g}$', '$20.0\\text{ g}$'],
        correctAnswerIndex: 0,
        explanation: 'Volume $V = 500/1000 = 0.50\\text{ dm}^3$. Moles $n = c \\times V = 0.20 \\times 0.50 = 0.10\\text{ mol}$. Mass $m = n \\times M = 0.10 \\times 40 = 4.0\\text{ g}$.',
      },
      {
        id: 'chq-2',
        question: 'Which of the following elements exhibits the highest first ionization energy across the periodic table?',
        options: [
          'Helium ($\\text{He}$)',
          'Fluorine ($\\text{F}$)',
          'Sodium ($\\text{Na}$)',
          'Chlorine ($\\text{Cl}$)',
        ],
        correctAnswerIndex: 0,
        explanation: 'Helium possesses a full 1s valence shell closest to the nucleus with zero inner electron shielding, resulting in the highest first ionization energy ($2372\\text{ kJ/mol}$).',
      },
    ],
  },
  {
    id: 'tpl-bio',
    title: 'Genetics & Cellular Inheritance',
    subjectCode: 'BIO 301',
    topic: 'Mendelian Crosses, Meiosis & DNA',
    description: 'Phenotypic ratios, sex linkage, and chromosome segregation for WASSCE.',
    questions: [
      {
        id: 'bq-1',
        question: 'In humans, normal blood clotting ($X^H$) is dominant to haemophilia ($X^h$). What proportion of male offspring from a carrier mother ($X^H X^h$) and normal father ($X^H Y$) will have haemophilia?',
        options: ['$50\\%$', '$25\\%$', '$0\\%$', '$100\\%$'],
        correctAnswerIndex: 0,
        explanation: 'Sons inherit the $Y$ chromosome from the father and either $X^H$ or $X^h$ from the mother with $50\\%$ probability each. Sons receiving $X^h$ will have haemophilia, meaning $50\\%$ of male offspring are affected.',
      },
      {
        id: 'bq-2',
        question: 'During which phase of meiosis does crossing over (genetic recombination) occur between homologous chromosomes?',
        options: ['Prophase I', 'Metaphase I', 'Anaphase II', 'Telophase I'],
        correctAnswerIndex: 0,
        explanation: 'Crossing over occurs during Prophase I of meiosis when homologous chromosomes pair as bivalents and exchange genetic segments at chiasmata.',
      },
    ],
  },
];

interface QuizTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** When null, the modal runs the curated offline practice templates instead of AI output. */
  activeData: { title: string; subjectCode?: string; questions: QuizQuestion[] } | null;
  /** Why the AI could not build this quiz; shown instead of inventing questions. */
  loadError?: string | null;
  /** Honest note when the generated set is shorter than requested. */
  notice?: string | null;
  onRecordAttempt: (attempt: {
    quizTitle: string;
    subjectCode?: string;
    score: number;
    totalQuestions: number;
    percentage: number;
  }) => Promise<void>;
  onAskAdomAI: (prompt: string) => void;
}

export const QuizTemplateModal: React.FC<QuizTemplateModalProps> = ({
  isOpen,
  onClose,
  activeData,
  loadError,
  notice,
  onRecordAttempt,
  onAskAdomAI,
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState<QuizTemplate | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [title, setTitle] = useState('');
  const [subjectCode, setSubjectCode] = useState<string | undefined>(undefined);
  /** True when running a curated template rather than Adom AI output. */
  const [isCurated, setIsCurated] = useState(false);

  // Runner state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [recordedAttempts, setRecordedAttempts] = useState<Record<number, number>>({});

  useEffect(() => {
    if (activeData && activeData.questions.length > 0) {
      setQuestions(activeData.questions);
      setTitle(activeData.title);
      setSubjectCode(activeData.subjectCode);
      setSelectedTemplate(null);
      setIsCurated(false);
      resetState();
    } else if (isOpen) {
      // No sample questions, ever. The set is Adom AI output or nothing, so a missing or
      // failed generation shows an honest empty state instead of fake practice material.
      setQuestions([]);
      setTitle('');
      setSubjectCode(undefined);
      setSelectedTemplate(null);
      setIsCurated(false);
      resetState();
    }
  }, [activeData, isOpen]);

  // Keyboard navigation for options A, B, C, D
  useEffect(() => {
    if (!isOpen || isComplete) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isAnswerSubmitted) {
        if (e.key === 'Enter' || e.key === 'ArrowRight') {
          handleNext();
        }
        return;
      }

      const key = e.key.toUpperCase();
      if (['A', 'B', 'C', 'D'].includes(key)) {
        const idx = key.charCodeAt(0) - 65;
        if (idx < (questions[currentIndex]?.options.length || 0)) {
          setSelectedAnswer(idx);
        }
      } else if (e.key === 'Enter' && selectedAnswer !== null) {
        handleSubmit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isComplete, isAnswerSubmitted, selectedAnswer, currentIndex, questions]);

  const resetState = () => {
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setIsAnswerSubmitted(false);
    setScore(0);
    setIsComplete(false);
    setRecordedAttempts({});
  };

  const loadTemplate = (tpl: QuizTemplate) => {
    setSelectedTemplate(tpl);
    setQuestions(tpl.questions);
    setTitle(tpl.title);
    setSubjectCode(tpl.subjectCode);
    setIsCurated(true);
    resetState();
  };

  const handleSubmit = () => {
    if (selectedAnswer === null) return;
    setIsAnswerSubmitted(true);
    setRecordedAttempts((prev) => ({ ...prev, [currentIndex]: selectedAnswer }));
    if (selectedAnswer === questions[currentIndex].correctAnswerIndex) {
      setScore((prev) => prev + 1);
    }
  };

  const handleNext = async () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedAnswer(null);
      setIsAnswerSubmitted(false);
    } else {
      setIsComplete(true);
      const isLastCorrect = selectedAnswer === questions[currentIndex].correctAnswerIndex;
      const finalScore = isAnswerSubmitted ? score : score + (isLastCorrect ? 1 : 0);
      await onRecordAttempt({
        quizTitle: title,
        subjectCode: subjectCode || 'General',
        score: finalScore,
        totalQuestions: questions.length,
        percentage: Math.round((finalScore / questions.length) * 100),
      });
    }
  };

  if (!isOpen) return null;

  const currentQ = questions[currentIndex];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="glass-strong rounded-2xl max-w-xl w-full flex flex-col max-h-[92dvh] shadow-2xl overflow-hidden transition-colors">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-neutral-500/10 dark:border-white/10 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-mono text-neutral-500">
              {subjectCode && <span>{subjectCode}</span>}
              {subjectCode && <span aria-hidden="true">·</span>}
              <span>AI-generated practice</span>
            </div>
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white truncate">
              {title || 'Practice Knowledge Check'}
            </h3>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-900 dark:hover:text-white rounded-lg transition-colors"
            aria-label="Close quiz"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {notice ? (
          <div className="px-5 py-2 text-[11px] text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-300 border-b border-amber-200/60 dark:border-amber-900/40">
            {notice}
          </div>
        ) : null}

        {/* Template Selector Bar: removed with the sample-template fallback. A quiz is
            now always Adom AI output, so there is nothing to switch between. */}

        {/* Quiz Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          {/* Honest empty state: the quiz is being written, or the generation failed.
              Nothing is substituted in its place. */}
          {!isComplete && !currentQ ? (
            <div className="py-10 text-center space-y-2">
              {loadError ? (
                <>
                  <p className="text-xs font-semibold text-neutral-900 dark:text-white">
                    Adom AI couldn't build this quiz
                  </p>
                  <p className="text-[11px] text-neutral-600 dark:text-neutral-300">{loadError}</p>
                  <p className="text-[11px] text-neutral-500">Close and tap Practice quizzes again to retry.</p>
                </>
              ) : (
                <>
                  <RotateCw className="w-5 h-5 mx-auto animate-spin text-neutral-400" />
                  <p className="text-xs text-neutral-600 dark:text-neutral-300">Adom AI is writing your questions…</p>
                  <p className="text-[11px] text-neutral-500">They appear here the moment they are ready.</p>
                </>
              )}
            </div>
          ) : null}
          {!isComplete && currentQ ? (
            <div className="space-y-4">
              {/* Progress and Question Counter */}
              <div className="flex items-center justify-between text-xs text-neutral-500 font-mono">
                <span>
                  Question {currentIndex + 1} of {questions.length}
                </span>
                <span>{Math.round(((currentIndex) / questions.length) * 100)}% Complete</span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-neutral-900/[0.07] dark:bg-white/10 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-neutral-900 dark:bg-white h-full transition-all duration-300"
                  style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
                />
              </div>

              {/* Question Stem with Science & Math Formatting */}
              <div className="pt-1">
                <FormattedContent
                  content={currentQ.question}
                  className="text-sm font-semibold text-neutral-900 dark:text-white leading-snug"
                />
              </div>

              {/* Options */}
              <div className="space-y-2 pt-1">
                {currentQ.options.map((opt, idx) => {
                  const letter = String.fromCharCode(65 + idx);
                  const isSelected = selectedAnswer === idx;
                  const isCorrect = idx === currentQ.correctAnswerIndex;

                  let style =
                    'border-neutral-500/15 dark:border-white/10 hover:border-indigo-400/60 dark:hover:border-indigo-300/40 glass-inner text-neutral-800 dark:text-neutral-200';

                  if (isSelected) {
                    style =
                      'border-neutral-900 dark:border-white bg-neutral-900/[0.07] dark:bg-white/10 text-neutral-900 dark:text-white font-medium';
                  }

                  if (isAnswerSubmitted) {
                    if (isCorrect) {
                      style =
                        'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100 font-bold';
                    } else if (isSelected) {
                      style =
                        'border-rose-400 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 line-through';
                    } else {
                      style = 'opacity-40 border-neutral-500/15 dark:border-white/10';
                    }
                  }

                  return (
                    <button
                      key={idx}
                      disabled={isAnswerSubmitted}
                      onClick={() => setSelectedAnswer(idx)}
                      className={`w-full text-left p-3 rounded-xl border text-xs transition-colors flex items-center justify-between gap-3 ${style}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-5 h-5 rounded-md border border-current text-[10px] font-mono flex items-center justify-center shrink-0">
                          {letter}
                        </span>
                        <div className="min-w-0">
                          <FormattedContent content={opt} />
                        </div>
                      </div>

                      {isAnswerSubmitted && isCorrect && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      )}
                      {isAnswerSubmitted && isSelected && !isCorrect && (
                        <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Pedagogical Explanation Callout with Math Rendering */}
              {isAnswerSubmitted && (
                <div className="p-3.5 glass-inner rounded-xl border border-neutral-200 dark:border-neutral-700/60 text-xs space-y-1.5 animate-fade-in">
                  <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold">
                    {selectedAnswer === currentQ.correctAnswerIndex ? (
                      <span className="text-emerald-600 dark:text-emerald-400">✓ Correct Solution Invariant</span>
                    ) : (
                      <span className="text-rose-600 dark:text-rose-400">✗ Solution Analysis</span>
                    )}
                  </div>
                  <FormattedContent content={currentQ.explanation} className="text-xs text-neutral-700 dark:text-neutral-300" />
                </div>
              )}
            </div>
          ) : isComplete && questions.length > 0 ? (
            /* Results Screen. Guarded on questions.length too: without it, an empty or
               still-loading quiz showed "Assessment Completed" with 0 / 0 and NaN%. */
            <div className="py-4 space-y-5 text-center">
              <div className="w-12 h-12 bg-neutral-900/[0.07] dark:bg-white/10 text-neutral-900 dark:text-white rounded-full flex items-center justify-center mx-auto">
                <Award className="w-6 h-6" />
              </div>

              <div>
                <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                  Assessment Completed
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Performance recorded to IndexedDB analytics
                </p>
              </div>

              <div className="p-4 bg-white/60 dark:bg-white/5 rounded-xl border border-neutral-500/10 dark:border-white/10 max-w-xs mx-auto">
                <div className="text-3xl font-black font-mono text-neutral-900 dark:text-white">
                  {score} / {questions.length}
                </div>
                <div className="text-xs font-mono text-neutral-500 mt-1">
                  {Math.round((score / questions.length) * 100)}% Accuracy
                </div>
              </div>

              {/* Review Accordion */}
              <div className="text-left space-y-2 pt-2 border-t border-neutral-500/10 dark:border-white/10">
                <span className="text-xs font-bold text-neutral-900 dark:text-white block mb-2">
                  Question Breakdown & Review:
                </span>
                {questions.map((q, idx) => {
                  const wasCorrect = recordedAttempts[idx] === q.correctAnswerIndex;
                  return (
                    <div
                      key={q.id}
                      className="p-3 rounded-lg border border-neutral-500/10 dark:border-white/10 bg-neutral-50/50 dark:bg-neutral-800/30 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] text-neutral-500">
                          Q{idx + 1}
                        </span>
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                            wasCorrect
                              ? 'text-emerald-700 bg-emerald-100/60 dark:text-emerald-300 dark:bg-emerald-950/40'
                              : 'text-rose-700 bg-rose-100/60 dark:text-rose-300 dark:bg-rose-950/40'
                          }`}
                        >
                          {wasCorrect ? 'Correct' : 'Needs Review'}
                        </span>
                      </div>
                      <FormattedContent content={q.question} className="font-medium text-neutral-900 dark:text-white" />
                      <div className="text-neutral-500 text-[11px]">
                        Correct Answer: <strong className="text-neutral-800 dark:text-neutral-200">{q.options[q.correctAnswerIndex]}</strong>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-3 border-t border-neutral-500/10 dark:border-white/10">
                <button
                  onClick={() => {
                    onClose();
                    onAskAdomAI(
                      `Can you explain the key concepts and common pitfalls from the quiz on "${title}"?`
                    );
                  }}
                  className="w-full sm:w-auto px-4 py-2 border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs font-semibold text-neutral-800 dark:text-neutral-200 flex items-center justify-center gap-1.5 hover:bg-neutral-500/10 transition-colors"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Ask Adom AI to Explain</span>
                </button>
                <button
                  onClick={resetState}
                  className="w-full sm:w-auto px-4 py-2 border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs font-semibold text-neutral-800 dark:text-neutral-200 hover:bg-neutral-500/10 transition-colors"
                >
                  Retake Quiz
                </button>
                <button
                  onClick={onClose}
                  className="w-full sm:w-auto px-5 py-2 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity"
                >
                  Done
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer Navigation Bar */}
        {!isComplete && (
          <div className="px-5 py-3 border-t border-neutral-500/10 dark:border-white/10 flex items-center justify-between gap-3 shrink-0 glass-inner">
            <span className="text-[11px] font-mono text-neutral-400 hidden sm:inline">
              Press A, B, C, D on keyboard to select
            </span>

            <div className="flex items-center gap-2 ml-auto">
              {!isAnswerSubmitted ? (
                <button
                  disabled={selectedAnswer === null}
                  onClick={handleSubmit}
                  className="min-h-[38px] px-4 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 rounded-lg text-xs font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
                >
                  Submit Answer
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  className="min-h-[38px] px-4 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:opacity-90 transition-opacity"
                >
                  <span>{currentIndex < questions.length - 1 ? 'Next Question' : 'Complete & View Score'}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
