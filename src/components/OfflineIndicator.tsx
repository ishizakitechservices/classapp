import React from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { WifiOff, Database } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 md:bottom-6 right-4 z-40 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 px-3.5 py-2 rounded-xl shadow-xl border border-neutral-700 dark:border-neutral-200 text-xs flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      <WifiOff className="w-4 h-4 text-neutral-300 dark:text-neutral-600 shrink-0" />
      <div>
        <span className="font-bold block leading-none">Offline Mode</span>
        <span className="text-[10px] text-neutral-400 dark:text-neutral-600 mt-0.5 block">
          Showing your saved data
        </span>
      </div>
    </div>
  );
};
