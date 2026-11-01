import React, { useState, useEffect } from 'react';
import { Flashcard } from '../types';
import { FormattedContent } from './FormattedContent';
import {
  X,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  Sparkles,
  Layers,
  Award,
  ArrowRight,
  Check,
} from 'lucide-react';

export interface FlashcardDeckTemplate {
  id: string;
  topic: string;
  subjectCode: string;
  description: string;
  cards: Flashcard[];
}

export const PREBUILT_FLASHCARD_DECKS: FlashcardDeckTemplate[] = [
  {
    id: 'deck-emath',
    topic: 'Calculus & Coordinate Geometry Formulas',
    subjectCode: 'EMATH 301',
    description: 'First principles, chain rule, circle equations, and trigonometric identities.',
    cards: [
      {
        id: 'fce-1',
        topic: 'First Principles Definition',
        prompt: 'State the formal definition of the derivative $f\'(x)$ as a limit from first principles.',
        answer: '$$f\'(x) = \\lim_{h \\to 0} \\frac{f(x + h) - f(x)}{h}$$\n*Geometric meaning:* The limit of the gradient of the secant line between $(x, f(x))$ and $(x+h, f(x+h))$ as $h \\to 0$.',
      },
      {
        id: 'fce-2',
        topic: 'Product & Quotient Rules',
        prompt: 'Write the formulas for differentiating products $u \\cdot v$ and quotients $u / v$.',
        answer: '$$\\frac{d}{dx}[u \\cdot v] = u \\frac{dv}{dx} + v \\frac{du}{dx}$$\n$$\\frac{d}{dx}\\left[\\frac{u}{v}\\right] = \\frac{v \\frac{du}{dx} - u \\frac{dv}{dx}}{v^2}$$',
      },
      {
        id: 'fce-3',
        topic: 'Circle Equation & Center',
        prompt: 'What are the center and radius of a circle given in general form: $x^2 + y^2 + 2gx + 2fy + c = 0$?',
        answer: '- **Center:** $(-g, -f)$\n- **Radius:** $r = \\sqrt{g^2 + f^2 - c}$\n*Condition:* $g^2 + f^2 - c > 0$ for a real circle.',
      },
      {
        id: 'fce-4',
        topic: 'Double Angle Cosine Formulas',
        prompt: 'State the three equivalent expressions for $\\cos 2A$.',
        answer: '$$\\cos 2A = \\cos^2 A - \\sin^2 A$$\n$$\\cos 2A = 2\\cos^2 A - 1$$\n$$\\cos 2A = 1 - 2\\sin^2 A$$',
      },
    ],
  },
  {
    id: 'deck-physics',
    topic: 'Mechanics & Newton’s Laws Invariants',
    subjectCode: 'PHY 301',
    description: 'Equations of motion, impulse, momentum conservation, and projectile trajectory.',
    cards: [
      {
        id: 'fcp-1',
        topic: 'Equations of Uniform Acceleration',
        prompt: 'State the three primary equations of uniformly accelerated linear motion.',
        answer: '$$v = u + at$$\n$$s = ut + \\frac{1}{2}at^2$$\n$$v^2 = u^2 + 2as$$',
      },
      {
        id: 'fcp-2',
        topic: 'Conservation of Linear Momentum',
        prompt: 'State the Law of Conservation of Linear Momentum and its mathematical formulation.',
        answer: 'In an isolated system with no external resultant forces, total momentum remains constant:\n$$m_1 u_1 + m_2 u_2 = m_1 v_1 + m_2 v_2$$\nFor inelastic collisions: $m_1 u_1 + m_2 u_2 = (m_1 + m_2)V$',
      },
      {
        id: 'fcp-3',
        topic: 'Projectile Maximum Range',
        prompt: 'What is the formula for the horizontal range of a projectile, and at what angle is it maximum?',
        answer: '$$R = \\frac{u^2 \\sin 2\\theta}{g}$$\nMaximum range occurs when $\\theta = 45^\\circ$, giving:\n$$R_{\\max} = \\frac{u^2}{g}$$',
      },
    ],
  },
  {
    id: 'deck-chem',
    topic: 'Stoichiometry & Chemical Energetics',
    subjectCode: 'CHEM 301',
    description: 'The mole concept, volumetric titration, gas laws, and enthalpy changes.',
    cards: [
      {
        id: 'fcc-1',
        topic: 'Mole & Concentration Relations',
        prompt: 'State the equations linking moles $n$, mass $m$, molar mass $M$, and concentration $c$.',
        answer: '$$n = \\frac{m}{M} = \\frac{N}{N_A}$$\n$$c = \\frac{n}{V} = \\frac{m}{M \\cdot V}$$\nwhere $V$ is volume in $\\text{dm}^3$ and $N_A = 6.022 \\times 10^{23} \\text{ mol}^{-1}$.',
      },
      {
        id: 'fcc-2',
        topic: 'Volumetric Titration Equation',
        prompt: 'State the standard titration formula for reaction between an acid and a base.',
        answer: '$$\\frac{c_a V_a}{c_b V_b} = \\frac{n_a}{n_b}$$\nwhere $c_a, c_b$ are concentrations, $V_a, V_b$ are volumes, and $n_a, n_b$ are stoichiometric coefficients.',
      },
      {
        id: 'fcc-3',
        topic: 'Molar Gas Volumes',
        prompt: 'What are the molar volumes of an ideal gas at STP and at RTP?',
        answer: '- **STP ($0^\\circ\\text{C}, 1\\text{ atm}$):** $22.4\\text{ dm}^3/\\text{mol}$\n- **RTP ($25^\\circ\\text{C}, 1\\text{ atm}$):** $24.0\\text{ dm}^3/\\text{mol}$',
      },
    ],
  },
  {
    id: 'deck-bio',
    topic: 'Genetics, Cell Biology & Ecology',
    subjectCode: 'BIO 301',
    description: 'Mendelian inheritance, alleles, codominance, and sex linkage.',
    cards: [
      {
        id: 'fcb-1',
        topic: 'Mendel’s First Law',
        prompt: 'State Mendel’s First Law (Law of Segregation).',
        answer: 'During gamete formation, the two alleles of each gene separate from each other so that each gamete carries only one allele for each gene.',
      },
      {
        id: 'fcb-2',
        topic: 'Sickle-Cell Haemoglobin Alleles',
        prompt: 'Explain the phenotypes associated with genotypes $Hb^A Hb^A$, $Hb^A Hb^S$, and $Hb^S Hb^S$.',
        answer: '- **$Hb^A Hb^A$:** Normal haemoglobin, susceptible to severe malaria.\n- **$Hb^A Hb^S$:** Sickle-cell trait carrier, healthy with malaria resistance.\n- **$Hb^S Hb^S$:** Sickle-cell anaemia disease with sickling of red blood cells.',
      },
      {
        id: 'fcb-3',
        topic: 'Sex-Linked Inheritance',
        prompt: 'Why are sex-linked recessive conditions like haemophilia more common in males than females?',
        answer: 'Males have only one $X$ chromosome ($XY$). A single recessive allele on the $X$ chromosome is directly expressed with no normal counterpart on the $Y$ to mask it.',
      },
    ],
  },
];

interface FlashcardsTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeData: { topic: string; flashcards: Flashcard[] } | null;
  /** Why the AI could not build this deck; shown instead of inventing cards. */
  loadError?: string | null;
  /** Honest note when the generated deck is shorter than requested. */
  notice?: string | null;
  onAskAdomAI: (prompt: string) => void;
}

export const FlashcardsTemplateModal: React.FC<FlashcardsTemplateModalProps> = ({
  isOpen,
  onClose,
  activeData,
  loadError,
  notice,
  onAskAdomAI,
}) => {
  const [selectedDeck, setSelectedDeck] = useState<FlashcardDeckTemplate | null>(null);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [topic, setTopic] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [ratings, setRatings] = useState<Record<number, 'again' | 'hard' | 'good' | 'easy'>>({});
  const [isDeckComplete, setIsDeckComplete] = useState(false);

  useEffect(() => {
    if (activeData && activeData.flashcards.length > 0) {
      setCards(activeData.flashcards);
      setTopic(activeData.topic);
      setSelectedDeck(null);
      resetState();
    } else {
      // No sample deck, ever: the cards are Adom AI output or the deck stays empty.
      setCards([]);
      setTopic('');
      setSelectedDeck(null);
      resetState();
    }
  }, [activeData, isOpen]);

  const resetState = () => {
    setCurrentIndex(0);
    setIsFlipped(false);
    setRatings({});
    setIsDeckComplete(false);
  };

  const loadDeck = (deck: FlashcardDeckTemplate) => {
    setSelectedDeck(deck);
    setCards(deck.cards);
    setTopic(deck.topic);
    resetState();
  };

  // Keyboard navigation: Space = flip, Left = prev, Right = next
  useEffect(() => {
    if (!isOpen || isDeckComplete) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setIsFlipped((prev) => !prev);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        if (currentIndex > 0) {
          setCurrentIndex((prev) => prev - 1);
          setIsFlipped(false);
        }
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (currentIndex < cards.length - 1) {
          setCurrentIndex((prev) => prev + 1);
          setIsFlipped(false);
        } else if (currentIndex === cards.length - 1) {
          setIsDeckComplete(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDeckComplete, currentIndex, cards.length]);

  if (!isOpen) return null;

  const currentCard = cards[currentIndex];

  const handleRate = (rating: 'again' | 'hard' | 'good' | 'easy') => {
    setRatings((prev) => ({ ...prev, [currentIndex]: rating }));
    if (currentIndex < cards.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setIsFlipped(false);
    } else {
      setIsDeckComplete(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="glass-strong rounded-2xl max-w-xl w-full flex flex-col max-h-[92dvh] shadow-2xl overflow-hidden transition-colors">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-neutral-500/10 dark:border-white/10 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <span className="text-[11px] font-mono text-neutral-500 block">
              Active Recall Flashcards
            </span>
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white truncate">
              {topic || 'Course Revision Deck'}
            </h3>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-900 dark:hover:text-white rounded-lg transition-colors"
            aria-label="Close flashcards"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {notice ? (
          <div className="px-5 py-2 text-[11px] text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-300 border-b border-amber-200/60 dark:border-amber-900/40">
            {notice}
          </div>
        ) : null}

        {/* Deck Template Bar: removed with the sample-deck fallback. The deck is now always
            Adom AI output, so there is nothing to switch between. */}

        {/* Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          {/* Honest empty state: being written, or the generation failed. */}
          {!isDeckComplete && !currentCard ? (
            <div className="py-10 text-center space-y-2">
              {loadError ? (
                <>
                  <p className="text-xs font-semibold text-neutral-900 dark:text-white">
                    Adom AI couldn't build this deck
                  </p>
                  <p className="text-[11px] text-neutral-600 dark:text-neutral-300">{loadError}</p>
                  <p className="text-[11px] text-neutral-500">Close and tap Flashcards again to retry.</p>
                </>
              ) : (
                <>
                  <RotateCw className="w-5 h-5 mx-auto animate-spin text-neutral-400" />
                  <p className="text-xs text-neutral-600 dark:text-neutral-300">Adom AI is writing your cards…</p>
                  <p className="text-[11px] text-neutral-500">They appear here the moment they are ready.</p>
                </>
              )}
            </div>
          ) : null}
          {!isDeckComplete && currentCard ? (
            <div className="space-y-4">
              {/* Card Counter & Progress */}
              <div className="flex items-center justify-between text-xs text-neutral-500 font-mono">
                <span>
                  Card {currentIndex + 1} of {cards.length}
                </span>
                <span>{currentCard.topic}</span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-neutral-900/[0.07] dark:bg-white/10 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-neutral-900 dark:bg-white h-full transition-all duration-300"
                  style={{ width: `${((currentIndex + 1) / cards.length) * 100}%` }}
                />
              </div>

              {/* 3D-like tactile Flashcard Container */}
              <div
                onClick={() => setIsFlipped((prev) => !prev)}
                className="min-h-[220px] sm:min-h-[240px] border border-neutral-500/15 dark:border-white/10 rounded-2xl p-6 flex flex-col justify-between cursor-pointer bg-white/60 dark:bg-white/5 hover:bg-neutral-500/10 transition-all select-none shadow-xs group"
              >
                <div className="flex items-center justify-between text-[11px] font-mono text-neutral-500">
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                    {currentCard.topic}
                  </span>
                  <span className="text-[10px] uppercase font-bold text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-white transition-colors">
                    {isFlipped ? 'Answer & Explanation' : 'Prompt / Recall'}
                  </span>
                </div>

                <div className="my-auto py-3">
                  <FormattedContent
                    content={isFlipped ? currentCard.answer : currentCard.prompt}
                    className="text-sm font-medium text-neutral-900 dark:text-white leading-relaxed"
                  />
                </div>

                <div className="text-center text-[10px] font-mono text-neutral-400">
                  Tap or press Spacebar to {isFlipped ? 'show prompt' : 'reveal answer'}
                </div>
              </div>

              {/* Spaced Repetition Rating Buttons (visible when flipped) */}
              {isFlipped && (
                <div className="pt-1 space-y-1.5 animate-fade-in">
                  <div className="text-[11px] font-mono text-neutral-500 text-center">
                    Rate recall difficulty:
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRate('again');
                      }}
                      className="py-2 px-1 text-center rounded-lg glass-inner hover:border-indigo-400/60 dark:hover:border-indigo-300/40 transition-colors"
                    >
                      <div className="text-[11px] font-semibold text-neutral-900 dark:text-white">Again</div>
                      <div className="text-[9px] font-mono text-neutral-400">Review</div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRate('hard');
                      }}
                      className="py-2 px-1 text-center rounded-lg glass-inner hover:border-indigo-400/60 dark:hover:border-indigo-300/40 transition-colors"
                    >
                      <div className="text-[11px] font-semibold text-neutral-900 dark:text-white">Hard</div>
                      <div className="text-[9px] font-mono text-neutral-400">&lt; 1 day</div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRate('good');
                      }}
                      className="py-2 px-1 text-center rounded-lg glass-inner hover:border-indigo-400/60 dark:hover:border-indigo-300/40 transition-colors"
                    >
                      <div className="text-[11px] font-semibold text-neutral-900 dark:text-white">Good</div>
                      <div className="text-[9px] font-mono text-neutral-400">3 days</div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRate('easy');
                      }}
                      className="py-2 px-1 text-center rounded-lg glass-inner hover:border-indigo-400/60 dark:hover:border-indigo-300/40 transition-colors"
                    >
                      <div className="text-[11px] font-semibold text-neutral-900 dark:text-white">Easy</div>
                      <div className="text-[9px] font-mono text-neutral-400">7 days</div>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : isDeckComplete && cards.length > 0 ? (
            /* Deck Completion Screen. Guarded on cards.length too: with no cards yet the
               screen claimed completion and offered a prompt with an empty topic. */
            <div className="py-6 space-y-5 text-center">
              <div className="w-12 h-12 bg-neutral-900/[0.07] dark:bg-white/10 text-neutral-900 dark:text-white rounded-full flex items-center justify-center mx-auto">
                <Award className="w-6 h-6" />
              </div>

              <div>
                <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                  Deck Review Completed
                </h3>
                <p className="text-xs text-neutral-500 mt-1">
                  Mastered {cards.length} concepts in {topic}
                </p>
              </div>

              {/* Breakdown */}
              <div className="p-4 bg-white/60 dark:bg-white/5 rounded-xl border border-neutral-500/10 dark:border-white/10 max-w-sm mx-auto text-xs space-y-2">
                <div className="flex justify-between items-center text-neutral-600 dark:text-neutral-400">
                  <span>Reviewed:</span>
                  <span className="font-mono font-bold text-neutral-900 dark:text-white">
                    {cards.length} cards
                  </span>
                </div>
                <div className="flex justify-between items-center text-neutral-600 dark:text-neutral-400">
                  <span>Retained:</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {Object.values(ratings).filter((r) => r === 'good' || r === 'easy').length} cards
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-3 border-t border-neutral-500/10 dark:border-white/10">
                <button
                  onClick={() => {
                    onClose();
                    onAskAdomAI(
                      `Can you generate follow-up practice questions for the flashcards on "${topic}"?`
                    );
                  }}
                  className="w-full sm:w-auto px-4 py-2 border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs font-semibold text-neutral-800 dark:text-neutral-200 flex items-center justify-center gap-1.5 hover:bg-neutral-500/10 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Ask Adom AI for Practice</span>
                </button>
                <button
                  onClick={resetState}
                  className="w-full sm:w-auto px-4 py-2 border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs font-semibold text-neutral-800 dark:text-neutral-200 hover:bg-neutral-500/10 transition-colors"
                >
                  Restart Deck
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

        {/* Footer Navigation */}
        {!isDeckComplete && (
          <div className="px-5 py-3 border-t border-neutral-500/10 dark:border-white/10 flex items-center justify-between gap-3 shrink-0 glass-inner">
            <button
              disabled={currentIndex === 0}
              onClick={() => {
                setCurrentIndex((prev) => prev - 1);
                setIsFlipped(false);
              }}
              className="px-3 py-1.5 border border-neutral-500/15 dark:border-white/10 rounded-lg text-xs flex items-center gap-1 disabled:opacity-30 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous</span>
            </button>

            <button
              onClick={() => setIsFlipped((prev) => !prev)}
              className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white"
            >
              {isFlipped ? 'Show Prompt' : 'Reveal Answer'}
            </button>

            <button
              onClick={() => {
                if (currentIndex < cards.length - 1) {
                  setCurrentIndex((prev) => prev + 1);
                  setIsFlipped(false);
                } else {
                  setIsDeckComplete(true);
                }
              }}
              className="px-3.5 py-1.5 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 rounded-lg text-xs font-semibold flex items-center gap-1 hover:opacity-90 transition-opacity"
            >
              <span>{currentIndex < cards.length - 1 ? 'Next' : 'Finish'}</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
