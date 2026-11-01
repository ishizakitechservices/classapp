import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Smartphone, X } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-xs font-semibold flex items-center gap-1.5 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors"
        title="Install ClassApp to home screen for offline access"
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSModal(true)}
          className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-neutral-500/25 dark:border-white/20 text-neutral-700 dark:text-neutral-300 text-xs font-medium hover:bg-neutral-500/10 transition-colors flex items-center gap-1.5"
          title="Add ClassApp to iOS Home Screen"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Add to Home</span>
        </button>

        {showIOSModal && (
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="glass-strong rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                  Install on iPhone / iPad
                </h3>
                <button
                  onClick={() => setShowIOSModal(false)}
                  className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="text-xs text-neutral-600 dark:text-neutral-300 space-y-2 leading-relaxed">
                <p>To use ClassApp offline and install it to your home screen:</p>
                <ol className="list-decimal list-inside space-y-1.5 pl-1 font-medium">
                  <li>Tap the <strong>Share</strong> icon in the Safari toolbar.</li>
                  <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
                  <li>Confirm by tapping <strong>Add</strong> in the top-right corner.</li>
                </ol>
              </div>

              <button
                onClick={() => setShowIOSModal(false)}
                className="w-full min-h-[40px] bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 rounded-lg text-xs font-semibold"
              >
                Understood
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
