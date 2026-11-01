/**
 * Presentation viewer.
 *
 * A PPTX is read slide by slide and shown in a 16:9 stage with the deck's own
 * text hierarchy, plus a thumbnail grid for jumping around — the reading view
 * PowerPoint and Keynote both offer, sized to fit a phone.
 */
import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, LayoutGrid } from 'lucide-react';
import { extractOfficeDoc, type OfficeSlide } from '../../services/officeReader';
import {
  ToolButton,
  ToolDivider,
  ToolGroup,
  ViewerError,
  ViewerSpinner,
  ViewerToolbar,
  type ViewerFileProps,
} from './viewerUi';

const downloadUrl = (id: string) => `/api/vault/files/${id}/stream?download=1`;
const streamUrl = (id: string) => `/api/vault/files/${id}/stream`;

const SlideStage: React.FC<{ slide: OfficeSlide; total: number; compact?: boolean }> = ({
  slide,
  total,
  compact = false,
}) => {
  const [title, ...body] = slide.paragraphs;

  return (
    <div
      className={`relative flex h-full w-full flex-col overflow-hidden bg-white text-neutral-900 ${
        compact ? '' : 'shadow-[0_2px_6px_rgba(0,0,0,0.16),0_24px_60px_-30px_rgba(0,0,0,0.65)] ring-1 ring-black/10'
      }`}
      style={{ containerType: 'inline-size' }}
    >
      <div
        className="flex flex-1 flex-col justify-center overflow-hidden"
        style={{ padding: compact ? '6%' : 'clamp(14px, 6%, 64px)' }}
      >
        {title ? (
          <h3
            className="font-semibold leading-[1.15] tracking-tight text-neutral-900"
            style={{
              fontSize: compact ? 'clamp(4px, 5.6cqw, 14px)' : 'clamp(14px, 5.4cqw, 44px)',
            }}
          >
            {title}
          </h3>
        ) : null}
        {body.length > 0 && (
          <ul
            className="space-y-[1.2%] leading-snug text-neutral-700"
            style={{
              fontSize: compact ? 'clamp(2px, 2.4cqw, 8px)' : 'clamp(10px, 2.35cqw, 18px)',
              marginTop: title ? '4%' : 0,
            }}
          >
            {body.map((line, index) => (
              <li key={index} className="flex gap-[2%]">
                <span aria-hidden className="shrink-0 text-neutral-400">
                  •
                </span>
                <span className="min-w-0">{line}</span>
              </li>
            ))}
          </ul>
        )}
        {slide.paragraphs.length === 0 && (
          <p className="text-[clamp(10px,2.2cqw,14px)] italic text-neutral-400">
            This slide has no text — it may be image-only.
          </p>
        )}
      </div>

      <div
        className="absolute bottom-[3%] right-[4%] font-mono tabular-nums text-neutral-400"
        style={{ fontSize: compact ? '0.7em' : 'clamp(8px, 1.6cqw, 12px)' }}
      >
        {slide.number} / {total}
      </div>
    </div>
  );
};

const SlidesView: React.FC<ViewerFileProps> = ({ fileId, displayName }) => {
  const [slides, setSlides] = useState<OfficeSlide[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [grid, setGrid] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSlides(null);
    setError(null);

    (async () => {
      try {
        const response = await fetch(streamUrl(fileId));
        if (!response.ok) throw new Error('Could not open this presentation.');
        const blob = await response.blob();
        const parsed = await extractOfficeDoc(blob, displayName);
        if (cancelled) return;
        if (!parsed.slides || parsed.slides.length === 0) throw new Error('empty');
        setSlides(parsed.slides);
      } catch {
        if (!cancelled) setError('This presentation could not be read in the viewer.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fileId, displayName]);

  const total = slides?.length ?? 0;
  const slide = slides?.[Math.min(index, Math.max(0, total - 1))];

  useEffect(() => {
    if (grid) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault();
        setIndex((value) => Math.min(total - 1, value + 1));
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        setIndex((value) => Math.max(0, value - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [grid, total]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewerToolbar>
        <ToolGroup label="Slides">
          <ToolButton label="Previous slide" onClick={() => setIndex((value) => Math.max(0, value - 1))} disabled={index <= 0}>
            <ChevronLeft className="h-4 w-4" />
          </ToolButton>
          <span className="min-w-[58px] px-1 text-center font-mono text-[11px] tabular-nums text-neutral-600 dark:text-neutral-300">
            {total ? `${index + 1} / ${total}` : '– / –'}
          </span>
          <ToolButton
            label="Next slide"
            onClick={() => setIndex((value) => Math.min(total - 1, value + 1))}
            disabled={index >= total - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </ToolButton>
        </ToolGroup>

        <ToolDivider />

        <ToolButton label={grid ? 'Show slide' : 'All slides'} active={grid} onClick={() => setGrid((value) => !value)}>
          <LayoutGrid className="h-4 w-4" />
          <span className="hidden sm:inline">{grid ? 'Single slide' : 'All slides'}</span>
        </ToolButton>

        <span className="ml-auto hidden shrink-0 pl-3 text-[11px] text-neutral-500 dark:text-neutral-400 sm:block">
          Text-only preview · download for the designed deck
        </span>
      </ViewerToolbar>

      {error ? (
        <ViewerError
          title="Cannot display this presentation"
          message={error}
          downloadHref={downloadUrl(fileId)}
          downloadName={displayName}
          hint="Layouts, images and animations stay intact in the downloaded file."
        />
      ) : !slides ? (
        <ViewerSpinner label="Opening presentation…" />
      ) : grid ? (
        <div className="no-scrollbar min-h-0 flex-1 overflow-auto bg-neutral-300/60 p-3 dark:bg-[#0c0c0f] sm:p-5">
          <div className="mx-auto grid max-w-5xl grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            {slides.map((item, itemIndex) => (
              <button
                key={item.number}
                type="button"
                onClick={() => {
                  setIndex(itemIndex);
                  setGrid(false);
                }}
                className="group text-left"
                aria-label={`Slide ${item.number}`}
              >
                <div
                  className={`overflow-hidden rounded-md ring-1 transition-shadow ${
                    itemIndex === index
                      ? 'ring-2 ring-indigo-500'
                      : 'ring-black/10 group-hover:ring-black/30 dark:ring-white/15'
                  }`}
                >
                  <div className="aspect-[16/9]">
                    <SlideStage slide={item} total={slides.length} compact />
                  </div>
                </div>
                <span
                  className={`mt-1 block font-mono text-[10px] tabular-nums ${
                    itemIndex === index ? 'font-bold text-indigo-600 dark:text-indigo-400' : 'text-neutral-500'
                  }`}
                >
                  {item.number}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-neutral-300/70 p-3 dark:bg-[#0c0c0f] sm:p-8">
          <div
            className="aspect-[16/9] w-full"
            style={{ maxWidth: 'min(100%, calc((100dvh - 210px) * 16 / 9))' }}
          >
            {slide && <SlideStage slide={slide} total={slides.length} />}
          </div>
        </div>
      )}
    </div>
  );
};

export default SlidesView;
