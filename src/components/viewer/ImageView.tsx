/**
 * Image viewer.
 *
 * Fitted to the window like Preview or the Photos viewer, with wheel zoom,
 * drag-to-pan, rotation, true 1:1 scaling and a dotted backdrop so transparent
 * PNGs stay readable. Natural pixel dimensions are shown in the toolbar.
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Maximize2, Minus, Plus, RotateCw } from 'lucide-react';
import { ToolButton, ToolDivider, ToolGroup, ViewerError, ViewerToolbar, type ViewerFileProps } from './viewerUi';

const streamUrl = (id: string) => `/api/vault/files/${id}/stream`;
const downloadUrl = (id: string) => `/api/vault/files/${id}/stream?download=1`;

const MIN_DISPLAY = 0.05;
const MAX_DISPLAY = 10;

const ImageView: React.FC<ViewerFileProps> = ({ fileId, displayName }) => {
  // `zoom` is relative to the fitted size, which is what the user perceives as 100%.
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [dragging, setDragging] = useState(false);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStage({ w: el.clientWidth - 24, h: el.clientHeight - 24 });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fitScale = natural && stage.w > 0 ? Math.min(stage.w / natural.w, stage.h / natural.h) : 1;
  const displayScale = fitScale * zoom;
  const percent = Math.round(displayScale * 100);

  const reset = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setRotation(0);
  }, []);

  // Wheel zoom, the gesture every image viewer has. Plain wheel pans nowhere,
  // so it only takes over when already zoomed in or with Ctrl/Cmd held.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey && zoom === 1) return;
      event.preventDefault();
      setZoom((value) => {
        const next = value * (event.deltaY < 0 ? 1.12 : 1 / 1.12);
        return Math.min(MAX_DISPLAY / fitScale, Math.max(MIN_DISPLAY / fitScale, next));
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [fitScale, zoom]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      setOffset({ x: drag.originX + (event.clientX - drag.startX), y: drag.originY + (event.clientY - drag.startY) });
    };
    const onUp = () => {
      dragRef.current = null;
      setDragging(false);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging]);

  if (error) {
    return (
      <ViewerError
        title="Cannot display this image"
        message="The browser could not decode this file."
        downloadHref={downloadUrl(fileId)}
        downloadName={displayName}
        hint="Try downloading it and opening it in your photos app."
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewerToolbar>
        <ToolGroup label="Zoom">
          <ToolButton
            label="Zoom out"
            onClick={() => setZoom((value) => Math.max(MIN_DISPLAY / fitScale, value / 1.25))}
            disabled={percent <= Math.round(MIN_DISPLAY * 100)}
          >
            <Minus className="h-4 w-4" />
          </ToolButton>
          <button
            type="button"
            onClick={reset}
            title="Fit to window"
            className="min-w-[48px] rounded-md px-1 py-1 font-mono text-[11px] tabular-nums text-neutral-600 hover:bg-neutral-900/[0.06] hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white"
          >
            {percent}%
          </button>
          <ToolButton
            label="Zoom in"
            onClick={() => setZoom((value) => Math.min(MAX_DISPLAY / fitScale, value * 1.25))}
            disabled={percent >= Math.round(MAX_DISPLAY * 100)}
          >
            <Plus className="h-4 w-4" />
          </ToolButton>
        </ToolGroup>

        <ToolDivider />

        <ToolButton label="Fit to window" onClick={reset}>
          <Maximize2 className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          label="Actual size (1:1)"
          onClick={() => {
            setZoom(1 / fitScale);
            setOffset({ x: 0, y: 0 });
          }}
          active={Math.abs(zoom - 1 / fitScale) < 0.01}
        >
          <span className="font-mono text-[11px]">1:1</span>
        </ToolButton>
        <ToolButton label="Rotate image" onClick={() => setRotation((value) => (value + 90) % 360)}>
          <RotateCw className="h-4 w-4" />
        </ToolButton>

        <div className="ml-auto flex shrink-0 items-center gap-2 pl-3">
          {(offset.x !== 0 || offset.y !== 0) && (
            <button
              type="button"
              onClick={() => setOffset({ x: 0, y: 0 })}
              className="hidden rounded-md px-2 py-1 text-[11px] font-medium text-neutral-500 hover:bg-neutral-900/5 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white sm:block"
            >
              Re-centre
            </button>
          )}
          {natural && (
            <span className="font-mono text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400">
              {natural.w} × {natural.h}
            </span>
          )}
        </div>
      </ViewerToolbar>

      <div
        ref={stageRef}
        onPointerDown={(event) => {
          dragRef.current = { startX: event.clientX, startY: event.clientY, originX: offset.x, originY: offset.y };
          setDragging(true);
        }}
        onDoubleClick={() => {
          if (zoom > 1.05) reset();
          else setZoom(2.5);
        }}
        className={`relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-neutral-800 bg-[radial-gradient(circle_at_center,#52525b_1px,transparent_1px)] [background-size:18px_18px] p-3 select-none ${
          dragging ? 'cursor-grabbing' : percent > 100 ? 'cursor-grab' : 'cursor-zoom-in'
        }`}
      >
        {!loaded && (
          <div className="absolute inset-6 animate-pulse rounded-lg bg-white/5" aria-hidden />
        )}
        <img
          src={streamUrl(fileId)}
          alt={displayName}
          draggable={false}
          onLoad={(event) => {
            setLoaded(true);
            setNatural({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight });
          }}
          onError={() => setError(true)}
          style={{
            width: natural ? Math.max(1, Math.round(natural.w * displayScale)) : undefined,
            height: natural ? Math.max(1, Math.round(natural.h * displayScale)) : undefined,
            transform: `translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg)`,
            transition: dragging ? 'none' : 'width 120ms ease-out, height 120ms ease-out, transform 120ms ease-out',
            visibility: loaded ? 'visible' : 'hidden',
          }}
          className="max-w-none object-contain shadow-[0_14px_44px_-16px_rgba(0,0,0,0.75)]"
        />
      </div>
    </div>
  );
};

export default ImageView;
