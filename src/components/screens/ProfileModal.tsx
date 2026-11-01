import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { AccountPanel } from './AccountPanel';
import { ThemeMode } from '../../types';
import { X, Moon, Sun, Monitor } from 'lucide-react';

export const ProfileModal: React.FC = () => {
  const {
    isProfileOpen,
    setIsProfileOpen,
    settings,
    updateSettings,
    setTheme,
    totalOfflineStorageMB,
    clearOfflineStorage,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'account' | 'appearance'>('account');

  if (!isProfileOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="glass-strong rounded-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl transition-colors">
        {/* Top Header */}
        <div className="p-4 border-b border-neutral-500/10 dark:border-white/10 flex items-center justify-between shrink-0">
          <h2 id="modal-title" className="text-base font-bold text-neutral-900 dark:text-white">
            Account & Settings
          </h2>
          <button
            onClick={() => setIsProfileOpen(false)}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center text-neutral-400 hover:text-neutral-900 dark:hover:text-white rounded-lg"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Nav Tabs */}
        <div className="flex border-b border-neutral-500/10 dark:border-white/10 px-4 text-xs shrink-0">
          <button
            onClick={() => setActiveTab('account')}
            className={`min-h-[40px] px-3 font-semibold border-b-2 transition-colors ${
              activeTab === 'account'
                ? 'border-neutral-900 dark:border-white text-neutral-900 dark:text-white'
                : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            Account
          </button>
          <button
            onClick={() => setActiveTab('appearance')}
            className={`min-h-[40px] px-3 font-semibold border-b-2 transition-colors ${
              activeTab === 'appearance'
                ? 'border-neutral-900 dark:border-white text-neutral-900 dark:text-white'
                : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            Appearance
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Tab 1: Account */}
          {activeTab === 'account' && (
            <div className="space-y-6">
              <AccountPanel />

              {/* Offline study data (plain wording) */}
              <div className="pt-2 border-t border-neutral-500/10 dark:border-white/10 space-y-3">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                  Offline Study Data
                </label>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-700 dark:text-neutral-300">
                    Saved on this device for offline study
                  </span>
                  <span className="font-semibold text-neutral-900 dark:text-white">
                    {totalOfflineStorageMB.toFixed(1)} MB
                  </span>
                </div>
                <button
                  onClick={clearOfflineStorage}
                  disabled={totalOfflineStorageMB === 0}
                  className="w-full min-h-[38px] px-3 rounded-lg border border-neutral-500/25 dark:border-white/20 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-500/10 disabled:opacity-40 transition-colors"
                >
                  Clear Offline Data
                </button>
              </div>
            </div>
          )}

          {/* Tab 2: Appearance */}
          {activeTab === 'appearance' && (
            <div className="space-y-6">
              {/* Theme */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-2">
                  Theme
                </label>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {(['light', 'dark', 'system'] as ThemeMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setTheme(mode)}
                      className={`min-h-[44px] px-2 py-2 rounded-xl border flex flex-col items-center justify-center gap-1 transition-colors ${
                        settings.theme === mode
                          ? 'border-neutral-900 dark:border-white bg-neutral-900/[0.07] dark:bg-white/10 font-semibold text-neutral-900 dark:text-white'
                          : 'border-neutral-500/15 dark:border-white/10 text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                      }`}
                    >
                      {mode === 'light' && <Sun className="w-4 h-4" />}
                      {mode === 'dark' && <Moon className="w-4 h-4" />}
                      {mode === 'system' && <Monitor className="w-4 h-4" />}
                      <span className="capitalize text-[11px]">{mode}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Display options */}
              <div className="space-y-3">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                  Display
                </label>

                {/* Text size */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-700 dark:text-neutral-300">Text Size</span>
                  <div className="flex gap-1">
                    {(['small', 'default', 'large'] as const).map((sz) => (
                      <button
                        key={sz}
                        onClick={() => updateSettings({ fontSize: sz })}
                        className={`px-2.5 py-1 text-xs rounded border capitalize transition-colors ${
                          settings.fontSize === sz
                            ? 'border-neutral-900 dark:border-white bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-bold'
                            : 'border-neutral-500/15 dark:border-white/10 text-neutral-500'
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reduced motion */}
                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-neutral-700 dark:text-neutral-300">Less Motion</span>
                  <button
                    onClick={() => updateSettings({ reducedMotion: !settings.reducedMotion })}
                    className={`min-h-[32px] px-3 rounded-full text-[11px] font-medium border transition-colors ${
                      settings.reducedMotion
                        ? 'border-neutral-900 dark:border-white bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                        : 'border-neutral-500/15 dark:border-white/10 text-neutral-500'
                    }`}
                  >
                    {settings.reducedMotion ? 'On' : 'Off'}
                  </button>
                </div>

                {/* High contrast */}
                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-neutral-700 dark:text-neutral-300">High Contrast</span>
                  <button
                    onClick={() => updateSettings({ highContrast: !settings.highContrast })}
                    className={`min-h-[32px] px-3 rounded-full text-[11px] font-medium border transition-colors ${
                      settings.highContrast
                        ? 'border-neutral-900 dark:border-white bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                        : 'border-neutral-500/15 dark:border-white/10 text-neutral-500'
                    }`}
                  >
                    {settings.highContrast ? 'On' : 'Off'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-neutral-500/10 dark:border-white/10 flex items-center justify-between shrink-0 bg-neutral-50/50 dark:bg-neutral-900/50">
          <div className="text-[11px] text-neutral-400">ClassApp</div>
          <button
            onClick={() => setIsProfileOpen(false)}
            className="min-h-[38px] px-4 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 rounded-lg text-xs font-semibold"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
