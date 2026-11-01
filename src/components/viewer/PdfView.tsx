/**
 * PDF viewer.
 *
 * A long document is rendered as one continuous column of pages, the way Acrobat
 * and browser PDF viewers do it: every page is painted lazily as it approaches
 * the viewport, the text layer sits on top so text can be selected and copied,
 * and the toolbar carries page navigation, fit modes, zoom and rotation.
 *
 * Everything happens on the device — pages are drawn into canvases from the
 * streamed file, so a student's notes never leave their browser.
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minus,
  MoveHorizontal,
  PanelLeft,
  Plus,
  RotateCw,
} from 'lucide-react';
import {
  ToolButton,
  ToolDivider,
  ToolGroup,
  ViewerError,
  ViewerSpinner,
  ViewerToolbar,
  type ViewerFileProps,
} from './viewerUi';
import { useInView } from './useInView';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const ZOOM_MIN = 0.2;
const ZOOM_MAX = 5;
const downloadUrl = (id: string) => `/api/vault/files/${id}/stream?download=1`;
const streamUrl = (id: string) => `/api/vault/files/${id}/stream`;

type ZoomMode = { kind: 'width' } | { kind: 'page' } | { kind: 'custom'; value: number };

interface PageProps {
  doc: any;
  pageNumber: number;
  scale: number;
  rotation: number;
  registerEl: (el: HTMLDivElement | null) => void;
}

/** One page: canvas, selectable text layer, and a placeholder with the right aspect ratio. */
const PdfPage: React.FC<PageProps> = ({ doc, pageNumber, scale, rotation, registerEl }) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef<any>(null);
  const textLayerRef = useRef<any>(null);
  const inView = useInView(wrapRef, '900px');
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    registerEl(wrapRef.current);
    return () => registerEl(null);
  }, [registerEl]);

  useEffect(() => {
    if (!inView) return;
    let cancelled = false;

    (async () => {
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;

      const viewport = page.getViewport({ scale, rotation });
      setDims({ w: viewport.width, h: viewport.height });

      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return;

      // Paint at the screen's pixel density, capped so huge zoom levels cannot
      // exhaust memory on a phone.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
      canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      context.save();
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.restore();

      const task = page.render({
        canvasContext: context,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      });
      renderTaskRef.current = task;

      try {
        await task.promise;
      } catch {
        // Cancelled because the user zoomed or left the viewer: not an error.
        return;
      }      if (cancelled) return;

      const layer = textRef.current;
      if (!layer) return;
      try {
        layer.replaceChildren();
        const textLayer = new pdfjsLib.TextLayer({
          textContentSource: page.streamTextContent(),
          container: layer,
          viewport,
        });
        textLayerRef.current = textLayer;
        await textLayer.render();
      } catch {
        // Selection is a bonus on top of the painted page; ignore a layer failure.
      }
    })().catch(() => {});

    return () => {
      cancelled = true;
      try {
        renderTaskRef.current?.cancel?.();
      } catch {
        /* already finished */
      }
      try {
        textLayerRef.current?.cancel?.();
      } catch {
        /* already finished */
      }
    };
  }, [doc, pageNumber, scale, rotation, inView]);

  return (
    <div
      ref={wrapRef}
      style={{
        width: dims ? dims.w : undefined,
        height: dims ? dims.h : undefined,
        // pdf.js sizes the selectable text from this variable.
        ['--scale-factor' as any]: scale,
      }}
      className={`relative shrink-0 overflow-hidden bg-white shadow-[0_1px_2px_rgba(0,0,0,0.16),0_18px_40px_-24px_rgba(0,0,0,0.55)] ring-1 ring-black/10 ${
        dims ? '' : 'min-h-[320px] w-full animate-pulse bg-neutral-300/60 dark:bg-neutral-800/60'
      }`}
    >
      <canvas ref={canvasRef} className="block" aria-label={`Page ${pageNumber}`} />
      <div ref={textRef} className="pdf-text-layer" />
    </div>
  );
};

interface ThumbProps {
  doc: any;
  pageNumber: number;
  scale: number;
  active: boolean;
  onSelect: () => void;
}

const PdfThumb: React.FC<ThumbProps> = ({ doc, pageNumber, scale, active, onSelect }) => {
  const wrapRef = useRef<HTMLButtonElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inView = useInView(wrapRef, '320px');

  useEffect(() => {
    if (!inView) return;
    let cancelled = false;
    let task: any = null;

    (async () => {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context || cancelled) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      task = page.render({
        canvasContext: context,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      });
      await task.promise;
    })().catch(() => {});

    return () => {
      cancelled = true;
      try {
        task?.cancel?.();
      } catch {
        /* already finished */
      }
    };
  }, [doc, pageNumber, scale, inView]);

  return (
    <button
      ref={wrapRef}
      type="button"
      onClick={onSelect}
      aria-label={`Go to page ${pageNumber}`}
      aria-current={active ? 'page' : undefined}
      className={`group relative flex w-full flex-col items-center gap-1 rounded-lg p-1 transition-colors ${
        active ? 'bg-indigo-500/10' : 'hover:bg-neutral-900/5 dark:hover:bg-white/5'
      }`}
    >
      <span
        className={`block w-full overflow-hidden rounded-[3px] bg-white ring-1 ${
          active ? 'ring-2 ring-indigo-500' : 'ring-black/10 group-hover:ring-black/25 dark:ring-white/15'
        }`}
      >
        <canvas ref={canvasRef} className="block h-auto w-full" />
      </span>
      <span
        className={`font-mono text-[10px] tabular-nums ${
          active ? 'font-bold text-indigo-600 dark:text-indigo-400' : 'text-neutral-500 dark:text-neutral-400'
        }`}
      >
        {pageNumber}
      </span>
    </button>
  );
};

const PdfView: React.FC<ViewerFileProps> = ({ fileId, displayName }) => {
  const [doc, setDoc] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [base, setBase] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState<ZoomMode>({ kind: 'width' });
  const [rotation, setRotation] = useState(0);
  const [current, setCurrent] = useState(1);
  const [showThumbs, setShowThumbs] = useState(false);
  const [avail, setAvail] = useState({ w: 0, h: 0 });
  const [pageInput, setPageInput] = useState('1');

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const pageEls = useRef<(HTMLDivElement | null)[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rafRef = useRef(0);

  // ---- Load the document -------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    setDoc(null);
    setError(null);
    setCurrent(1);
    setPageInput('1');

    const task = pdfjsLib.getDocument({ url: streamUrl(fileId), withCredentials: true });
    task.promise
      .then(async (loaded) => {
        if (cancelled) return;
        const first = await loaded.getPage(1);
        const viewport = first.getViewport({ scale: 1, rotation: 0 });
        if (cancelled) return;
        setBase({ w: viewport.width, h: viewport.height });
        setNumPages(loaded.numPages);
        setDoc(loaded);
      })
      .catch(() => {
        if (!cancelled) setError('This PDF could not be opened in the viewer.');
      });

    return () => {
      cancelled = true;
      try {
        task.destroy();
      } catch {
        /* already destroyed */
      }
    };
  }, [fileId]);

  // ---- Measure the stage -------------------------------------------------
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const measure = () => setAvail({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [doc, showThumbs]);

  const scale = useMemo(() => {
    if (!base) return 1;
    const rotated = rotation % 180 !== 0;
    const pageW = rotated ? base.h : base.w;
    const pageH = rotated ? base.w : base.h;
    const boxW = Math.max(160, avail.w - 28);
    const boxH = Math.max(160, avail.h - 48);
    const next =
      zoom.kind === 'width' ? boxW / pageW : zoom.kind === 'page' ? Math.min(boxW / pageW, boxH / pageH) : zoom.value;
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
  }, [base, rotation, avail, zoom]);

  const percent = Math.round(scale * 100);

  const applyZoom = useCallback((next: number) => {
    setZoom({ kind: 'custom', value: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next)) });
  }, []);

  // ---- Page tracking -----------------------------------------------------
  const trackPage = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const marker = el.scrollTop + el.clientHeight * 0.4;
    let best = 1;
    let bestDistance = Infinity;
    pageEls.current.forEach((node, index) => {
      if (!node) return;
      const distance = Math.abs(node.offsetTop + node.offsetHeight / 2 - marker);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index + 1;
      }
    });
    setCurrent((prev) => (prev === best ? prev : best));
  }, []);

  const handleScroll = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      trackPage();
    });
  }, [trackPage]);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setPageInput(String(current));
  }, [current]);

  const goTo = useCallback(
    (target: number) => {
      const el = scrollerRef.current;
      const node = pageEls.current[Math.min(Math.max(1, target), numPages) - 1];
      if (!el || !node) return;
      el.scrollTo({ top: Math.max(0, node.offsetTop - 12), behavior: 'smooth' });
    },
    [numPages]
  );

  // ---- Keyboard, like a desktop PDF viewer -------------------------------
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault();
        goTo(current + 1);
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        goTo(current - 1);
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        applyZoom(scale * 1.15);
      } else if (event.key === '-') {
        event.preventDefault();
        applyZoom(scale / 1.15);
      } else if (event.key === '0') {
        event.preventDefault();
        setZoom({ kind: 'width' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [applyZoom, current, goTo, scale]);

  // Ctrl/Cmd + wheel zoom, the gesture every desktop viewer has.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      applyZoom(scale * (event.deltaY < 0 ? 1.1 : 1 / 1.1));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyZoom, scale]);

  const commitPageInput = () => {
    const parsed = Number.parseInt(pageInput, 10);
    if (Number.isFinite(parsed)) {
      const target = Math.min(Math.max(1, parsed), numPages || 1);
      setPageInput(String(target));
      goTo(target);
    } else {
      setPageInput(String(current));
    }
  };

  if (error) {
    return (
      <ViewerError
        title="Cannot display this PDF"
        message={error}
        downloadHref={downloadUrl(fileId)}
        downloadName={displayName}
        hint="The file is safe to download and open on your device."
      />
    );
  }

  if (!doc) {
    return <ViewerSpinner label="Opening document…" />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewerToolbar>
        <ToolGroup label="Page navigation">
          <ToolButton label="Previous page" onClick={() => goTo(current - 1)} disabled={current <= 1}>
            <ChevronLeft className="h-4 w-4" />
          </ToolButton>
          <span className="flex items-center gap-1 px-0.5">
            <input
              ref={inputRef}
              value={pageInput}
              onChange={(event) => setPageInput(event.target.value.replace(/[^\d]/g, ''))}
              onBlur={commitPageInput}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitPageInput();
                  inputRef.current?.blur();
                }
              }}
              inputMode="numeric"
              aria-label="Page number"
              className="h-8 w-11 rounded-md border border-neutral-500/20 bg-white text-center font-mono text-[11px] tabular-nums text-neutral-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-white/15 dark:bg-white/5 dark:text-white"
            />
            <span className="shrink-0 whitespace-nowrap font-mono text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400">
              / {numPages}
            </span>
          </span>
          <ToolButton label="Next page" onClick={() => goTo(current + 1)} disabled={current >= numPages}>
            <ChevronRight className="h-4 w-4" />
          </ToolButton>
        </ToolGroup>

        <ToolDivider />

        <ToolGroup label="Fit">
          <ToolButton label="Fit width" active={zoom.kind === 'width'} onClick={() => setZoom({ kind: 'width' })}>
            <MoveHorizontal className="h-4 w-4" />
          </ToolButton>
          <ToolButton label="Fit page" active={zoom.kind === 'page'} onClick={() => setZoom({ kind: 'page' })}>
            <Maximize2 className="h-4 w-4" />
          </ToolButton>
        </ToolGroup>

        <ToolDivider />

        <ToolGroup label="Zoom">
          <ToolButton label="Zoom out" onClick={() => applyZoom(scale / 1.2)} disabled={scale <= ZOOM_MIN + 0.001}>
            <Minus className="h-4 w-4" />
          </ToolButton>
          <button
            type="button"
            onClick={() => setZoom({ kind: 'custom', value: 1 })}
            title="Reset zoom to 100%"
            className="min-w-[48px] rounded-md px-1 py-1 font-mono text-[11px] tabular-nums text-neutral-600 hover:bg-neutral-900/[0.06] hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white"
          >
            {percent}%
          </button>
          <ToolButton label="Zoom in" onClick={() => applyZoom(scale * 1.2)} disabled={scale >= ZOOM_MAX - 0.001}>
            <Plus className="h-4 w-4" />
          </ToolButton>
        </ToolGroup>

        <ToolDivider />

        <ToolButton label="Rotate page" onClick={() => setRotation((value) => (value + 90) % 360)}>
          <RotateCw className="h-4 w-4" />
          <span className="hidden sm:inline">Rotate</span>
        </ToolButton>

        <div className="ml-auto flex items-center gap-1 pl-2">
          <ToolButton
            label="Page thumbnails"
            active={showThumbs}
            onClick={() => setShowThumbs((value) => !value)}
            className="hidden md:inline-flex"
          >
            <PanelLeft className="h-4 w-4" />
          </ToolButton>
        </div>
      </ViewerToolbar>

      <div className="flex min-h-0 flex-1">
        {showThumbs && (
          <aside className="no-scrollbar hidden w-[144px] shrink-0 overflow-y-auto border-r border-neutral-500/15 bg-neutral-100/70 p-2 dark:border-white/10 dark:bg-white/[0.02] md:block">
            <p className="px-1 pb-1.5 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Pages
            </p>
            <div className="space-y-1.5">
              {Array.from({ length: numPages }, (_, index) => (
                <PdfThumb
                  key={index + 1}
                  doc={doc}
                  pageNumber={index + 1}
                  scale={104 / base!.w}
                  active={current === index + 1}
                  onSelect={() => goTo(index + 1)}
                />
              ))}
            </div>
          </aside>
        )}

        <div
          ref={scrollerRef}
          onScroll={handleScroll}
          className="relative flex-1 overflow-auto overscroll-contain bg-neutral-200/70 dark:bg-[#0c0c0f]"
        >
          <div ref={contentRef} className="relative flex flex-col items-center gap-3 px-3 py-3 sm:gap-4 sm:py-5">
            {Array.from({ length: numPages }, (_, index) => (
              <PdfPage
                key={index + 1}
                doc={doc}
                pageNumber={index + 1}
                scale={scale}
                rotation={rotation}
                registerEl={(el) => {
                  pageEls.current[index] = el;
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PdfView;
