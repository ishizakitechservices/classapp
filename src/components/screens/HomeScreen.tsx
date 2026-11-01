import React from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import {
  BookOpen,
  FolderArchive,
  Sparkles,
  Bell,
  ArrowRight,
  Clock,
  MapPin,
  CheckCircle2,
  Cloud,
  GraduationCap,
  Calendar,
  AlertCircle,
} from 'lucide-react';

export const HomeScreen: React.FC = () => {
  const { user } = useAuth();
  const {
    vaultFiles,
    notices,
    setCurrentTab,
    setActiveFileId,
    setActiveNoticeId,
    setActiveQuizOpen,
  } = useApp();

  if (!user) {
    return (
      <div className="h-full flex flex-col items-center justify-center px-4">
        <p className="text-sm text-neutral-500 mb-3">No account yet.</p>
        <button
          className="min-h-[42px] px-4 py-2 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 rounded-xl text-sm font-semibold"
          onClick={() => setCurrentTab('home')}
        >
          Sign in
        </button>
      </div>
    );
  }

  const usedMB = (user.storageUsedBytes / (1024 * 1024)).toFixed(1);
  const quotaMB = 200;

  const recentFiles = vaultFiles.slice(0, 3);
  const topNotices = notices.slice(0, 2);

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      {/* Welcome & Student Context Banner */}
      <section className="glass rounded-2xl p-5 sm:p-6 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">
              Welcome back, {user.displayName.split(' ')[0]}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
              {user.className}
            </h1>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              {user.studentId.toUpperCase()} ·
              {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
              {user.isVerified ? ' · Verified' : ''}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => setCurrentTab('classes')}
              className="min-h-[42px] px-4 py-2 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity flex items-center gap-2"
            >
              <span>Open Classes</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Account info sub-bar */}
        <div className="mt-4 pt-4 border-t border-neutral-500/10 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-300">
            <BookOpen className="w-4 h-4 text-neutral-400" />
            <span className="font-semibold text-neutral-900 dark:text-white">
              {user.displayName}
            </span>
          </div>
          <div className="flex items-center gap-4 text-neutral-500 dark:text-neutral-400">
            <span className="flex items-center gap-1">
              <Cloud className="w-3.5 h-3.5" />
              {usedMB} MB / {quotaMB} MB
            </span>
            {!user.isVerified && (
              <span className="text-rose-600 dark:text-rose-400 font-medium">
                AI limited until verified
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Recent Notices */}
      <section className="glass rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900 dark:text-white">
              Recent Notices
            </h2>
          </div>
          <button
            onClick={() => setCurrentTab('notices')}
            className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors"
          >
            View all
          </button>
        </div>

        {topNotices.length === 0 ? (
          <div className="py-8 px-4 text-center text-xs text-neutral-500 dark:text-neutral-400 border border-dashed border-neutral-500/15 dark:border-white/10 rounded-xl">
            No notices for {user.className} yet.
          </div>
        ) : (
          <div className="space-y-2">
            {topNotices.map((notice) => (
              <div
                key={notice.id}
                className="p-3 rounded-lg border border-neutral-500/10 dark:border-white/10 hover:bg-neutral-500/10 transition-colors"
              >
                <div className="text-xs font-semibold text-neutral-900 dark:text-white truncate">
                  {notice.title}
                </div>
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                  {notice.content.length > 90 ? notice.content.slice(0, 90) + '…' : notice.content}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-mono text-neutral-400 shrink-0">
                    {notice.author || 'School'}
                  </span>
                  <span className="text-[10px] font-mono text-neutral-400">
                    {notice.isPinned ? 'Pinned ·' : ''} {notice.isUnread ? 'New' : 'Read'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

        {/* Quick Launchpad Strip */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            onClick={() => setCurrentTab('classes')}
            className="min-h-[44px] p-4 glass rounded-xl text-left hover:border-indigo-400/60 dark:hover:border-indigo-300/40 transition-colors group"
          >
            <BookOpen className="w-5 h-5 text-neutral-900 dark:text-white mb-2" />
            <div className="text-xs font-semibold text-neutral-900 dark:text-white">Classes</div>
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
              {user.className}
            </div>
          </button>

          <button
            onClick={() => setCurrentTab('vault')}
            className="min-h-[44px] p-4 glass rounded-xl text-left hover:border-indigo-400/60 dark:hover:border-indigo-300/40 transition-colors group"
          >
            <FolderArchive className="w-5 h-5 text-neutral-900 dark:text-white mb-2" />
            <div className="text-xs font-semibold text-neutral-900 dark:text-white">Vault</div>
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
              {vaultFiles.length} files · {usedMB} MB / {quotaMB} MB
            </div>
          </button>

          <button
            onClick={() => {
              setCurrentTab('adom-ai');
              setActiveQuizOpen(true);
            }}
            className="min-h-[44px] p-4 glass rounded-xl text-left hover:border-indigo-400/60 dark:hover:border-indigo-300/40 transition-colors group"
          >
            <Sparkles className="w-5 h-5 text-neutral-900 dark:text-white mb-2" />
            <div className="text-xs font-semibold text-neutral-900 dark:text-white">Adom AI</div>
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
              Your study tutor
            </div>
          </button>

          <button
            onClick={() => setCurrentTab('notices')}
            className="min-h-[44px] p-4 glass rounded-xl text-left hover:border-indigo-400/60 dark:hover:border-indigo-300/40 transition-colors group"
          >
            <Bell className="w-5 h-5 text-neutral-900 dark:text-white mb-2" />
            <div className="text-xs font-semibold text-neutral-900 dark:text-white">Notices</div>
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
              {notices.filter((n) => n.isUnread).length} unread
            </div>
          </button>
        </section>
      </div>
    );
  };
