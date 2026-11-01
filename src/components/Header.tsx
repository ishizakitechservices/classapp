import React from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft, Moon, Sun, Monitor, WifiOff } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

export const Header: React.FC = () => {
  const {
    activeSubjectId,
    setActiveSubjectId,
    subjects,
    setIsProfileOpen,
    settings,
    setTheme,
    currentTab,
    isOnline,
  } = useApp();
  const { user } = useAuth();

  const activeSubject = subjects.find((s) => s.id === activeSubjectId);

  const cycleTheme = () => {
    if (settings.theme === 'system') setTheme('light');
    else if (settings.theme === 'light') setTheme('dark');
    else setTheme('system');
  };

  return (
    <header className="sticky top-0 z-30 glass-nav border-b border-neutral-500/15 dark:border-white/10 transition-colors">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        {/* Left: Back affordance or Brand Wordmark */}
        <div className="flex items-center gap-3 min-w-0">
          {activeSubjectId && currentTab === 'classes' ? (
            <button
              onClick={() => setActiveSubjectId(null)}
              className="min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center rounded-lg text-neutral-700 dark:text-neutral-300 hover:bg-neutral-500/10 transition-colors"
              aria-label="Back to Classes list"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          ) : null}

          <div className="flex items-baseline gap-2 truncate">
            {activeSubjectId && currentTab === 'classes' && activeSubject ? (
              <div className="flex items-baseline gap-2 truncate">
                <span className="font-semibold text-sm tracking-tight text-neutral-900 dark:text-neutral-100">
                  {activeSubject.code}
                </span>
                <span className="text-xs text-neutral-500 dark:text-neutral-400 truncate hidden sm:inline">
                  {activeSubject.name}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight text-neutral-900 dark:text-white">
                  ClassApp
                </span>
                <span className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400 hidden md:inline">
                  SHS Study Companion
                </span>
                {!isOnline && (
                  <span className="flex items-center gap-1 text-[10px] font-mono font-medium text-neutral-500 border border-neutral-500/25 dark:border-white/20 px-1.5 py-0.5 rounded">
                    <WifiOff className="w-2.5 h-2.5" />
                    Offline
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Zone: PWA Install + Theme + Profile */}
        <div className="flex items-center gap-2 shrink-0">
          {/* In-App PWA Install Action */}
          <PWAInstallButton />

          {/* Theme Switcher */}
          <button
            onClick={cycleTheme}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-500/10 transition-colors"
            aria-label={`Toggle theme (currently ${settings.theme})`}
            title={`Theme: ${settings.theme}`}
          >
            {settings.theme === 'light' ? (
              <Sun className="w-4 h-4" />
            ) : settings.theme === 'dark' ? (
              <Moon className="w-4 h-4" />
            ) : (
              <Monitor className="w-4 h-4" />
            )}
          </button>

          {/* Profile Trigger — avatar chip opens Account & Settings (sign-out lives inside) */}
          <button
            onClick={() => setIsProfileOpen(true)}
            className="min-h-[36px] min-w-[36px] h-9 w-9 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 flex items-center justify-center text-xs font-bold hover:opacity-90 transition-opacity shrink-0"
            aria-label="Open account and settings"
            title="Account & Settings"
          >
            {(user?.displayName || 'S').charAt(0).toUpperCase()}
          </button>
        </div>
      </div>
    </header>
  );
};
