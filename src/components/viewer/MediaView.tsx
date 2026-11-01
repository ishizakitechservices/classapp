/**
 * Video and audio viewer.
 *
 * Video plays on a black stage with the platform's own transport controls —
 * the browser's player is the one people know — and audio gets a proper media
 * card instead of a bare browser strip.
 */
import React, { useState } from 'react';
import { Music } from 'lucide-react';
import { ViewerError, type ViewerFileProps } from './viewerUi';
import { fileExtension, formatBytes } from './fileKind';

const streamUrl = (id: string) => `/api/vault/files/${id}/stream`;
const downloadUrl = (id: string) => `/api/vault/files/${id}/stream?download=1`;

interface Props extends ViewerFileProps {
  kind: 'video' | 'audio';
  sizeBytes?: number;
}

const MediaView: React.FC<Props> = ({ fileId, displayName, kind, sizeBytes }) => {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <ViewerError
        title={kind === 'video' ? 'Cannot play this video' : 'Cannot play this audio'}
        message="The browser could not decode this file's format."
        downloadHref={downloadUrl(fileId)}
        downloadName={displayName}
        hint="MP4 (video) and MP3/M4A (audio) play on almost every device."
      />
    );
  }

  if (kind === 'video') {
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-black p-0 sm:p-4">
        <video
          src={streamUrl(fileId)}
          controls
          playsInline
          preload="metadata"
          onError={() => setError(true)}
          className="max-h-full w-full max-w-5xl bg-black object-contain"
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 items-center justify-center bg-neutral-200/70 p-5 dark:bg-[#0c0c0f]">
      <div className="glass w-full max-w-md rounded-2xl p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-500/12 text-amber-500">
            <Music className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">{displayName}</p>
            <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
              {[fileExtension(displayName) || 'Audio', formatBytes(sizeBytes)].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>

        <audio
          src={streamUrl(fileId)}
          controls
          preload="metadata"
          onError={() => setError(true)}
          className="mt-5 w-full"
        />

        <p className="mt-3 text-[11px] text-neutral-500 dark:text-neutral-400">
          Plays on this device — nothing is uploaded anywhere.
        </p>
      </div>
    </div>
  );
};

export default MediaView;
