import React from 'react';

/**
 * The ambient canvas the glass surfaces blur. Sits behind everything and never
 * intercepts pointer events, so it is safe to mount once at the app root.
 */
export const AmbientBackground: React.FC = () => (
  <div className="ambient" aria-hidden="true">
    <div className="ambient-blob ambient-blob-1" />
    <div className="ambient-blob ambient-blob-2" />
    <div className="ambient-blob ambient-blob-3" />
    <div className="ambient-blob ambient-blob-4" />
  </div>
);
