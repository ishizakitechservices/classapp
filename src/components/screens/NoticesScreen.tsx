import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Search, Bell, Pin, PlusCircle, X, Trash2, RotateCw } from 'lucide-react';

interface ServerNotice {
  id: string;
  title: string;
  body: string;
  className: string | null;
  isPinned: boolean;
  authorName: string;
  createdAt: string;
}

export const NoticesScreen: React.FC = () => {
  const { user } = useAuth();
  const canPost = user?.role === 'admin' || user?.role === 'prefect';

  const [notices, setNotices] = useState<ServerNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'pinned'>('all');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [postToSchool, setPostToSchool] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const loadNotices = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/notices');
      if (!res.ok) throw new Error('Could not load notices.');
      const data = await res.json();
      setNotices(data.notices || []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load notices.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotices();
  }, [loadNotices]);

  const filtered = notices.filter((n) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q) || n.authorName.toLowerCase().includes(q);
    if (!matchesSearch) return false;
    if (filterType === 'pinned') return n.isPinned;
    return true;
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;
    setPosting(true);
    setPostError(null);
    try {
      const res = await fetch('/api/notices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          body: newContent.trim(),
          className: postToSchool ? undefined : user?.className,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Could not post the notice.');
      }
      setNewTitle('');
      setNewContent('');
      setPostToSchool(false);
      setShowCreateModal(false);
      await loadNotices();
    } catch (err) {
      setPostError(err instanceof Error ? err.message : 'Could not post the notice.');
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Remove this notice?')) return;
    try {
      const res = await fetch(`/api/notices/${id}`, { method: 'DELETE' });
      if (res.ok) setNotices((prev) => prev.filter((n) => n.id !== id));
    } catch {
      // Reload will resync the list.
    }
  };

  const inputClass =
    'w-full p-2.5 glass-input rounded-lg text-neutral-900 dark:text-white text-xs';

  return (
    <div className="space-y-5 pb-20 md:pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Notices
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            School and class announcements.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {canPost && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="min-h-[38px] px-3.5 py-1.5 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity flex items-center gap-1.5"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Post Notice</span>
            </button>
          )}
          <button
            onClick={loadNotices}
            disabled={loading}
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-neutral-900 dark:hover:text-white disabled:opacity-50"
            aria-label="Refresh notices"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Search + filter */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notices..."
            className="w-full pl-10 pr-4 py-2.5 glass-input rounded-xl text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
          />
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          {(['all', 'pinned'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilterType(f)}
              className={`min-h-[34px] px-3 rounded-lg capitalize transition-colors ${
                filterType === f
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-semibold'
                  : 'bg-neutral-900/[0.07] dark:bg-white/10 text-neutral-600 dark:text-neutral-400'
              }`}
            >
              {f === 'all' ? 'All' : 'Pinned'}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading && notices.length === 0 ? (
        <div className="p-8 text-center text-xs text-neutral-500">Loading notices…</div>
      ) : loadError ? (
        <div className="p-6 text-center glass rounded-xl space-y-3">
          <p className="text-xs text-neutral-700 dark:text-neutral-300">{loadError}</p>
          <button
            onClick={loadNotices}
            className="min-h-[38px] px-3.5 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-xs font-semibold"
          >
            Try again
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-10 text-center glass rounded-xl space-y-2">
          <Bell className="w-8 h-8 text-neutral-400 mx-auto" />
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
            {notices.length === 0 ? 'No notices yet' : 'Nothing matches your search'}
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {notices.length === 0
              ? 'Notices posted by the admin or your class prefect will appear here.'
              : 'Try a different search term.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((n) => (
            <article
              key={n.id}
              className="p-4 glass rounded-xl space-y-1.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {n.isPinned && <Pin className="w-3 h-3 text-neutral-500 shrink-0" />}
                    <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">{n.title}</h3>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-neutral-900/[0.07] dark:bg-white/10 text-neutral-600 dark:text-neutral-400">
                      {n.className || 'School-wide'}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                    {n.authorName} · {new Date(n.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {canPost && (
                  <button
                    onClick={() => handleDelete(n.id)}
                    className="p-1.5 text-neutral-400 hover:text-rose-500 rounded transition-colors shrink-0"
                    aria-label="Delete notice"
                    title="Delete notice"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <p className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed whitespace-pre-line">
                {n.body}
              </p>
            </article>
          ))}
        </div>
      )}

      {/* Post modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="glass-strong rounded-2xl max-w-lg w-full p-5 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-500/10 dark:border-white/10 pb-2.5">
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Post a Notice</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white p-1"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div>
                <label className="block text-neutral-700 dark:text-neutral-300 mb-1 font-medium">Title *</label>
                <input
                  type="text"
                  required
                  maxLength={140}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Mid-term exams start Monday"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-neutral-700 dark:text-neutral-300 mb-1 font-medium">Message *</label>
                <textarea
                  rows={5}
                  required
                  maxLength={4000}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Write the full notice…"
                  className={`${inputClass} resize-none`}
                />
              </div>

              {user?.role === 'admin' ? (
                <label className="flex items-center gap-2 text-neutral-700 dark:text-neutral-300">
                  <input
                    type="checkbox"
                    checked={postToSchool}
                    onChange={(e) => setPostToSchool(e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  <span>Send to the whole school (unchecked = {user.className} only)</span>
                </label>
              ) : (
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  This will be sent to {user?.className} only.
                </p>
              )}

              {postError && (
                <div role="alert" className="rounded-lg bg-neutral-900/[0.07] dark:bg-white/10 p-2.5 text-neutral-700 dark:text-neutral-300">
                  {postError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-neutral-500/10 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-2 rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-500/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={posting || !newTitle.trim() || !newContent.trim()}
                  className="px-4 py-2 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 rounded-lg font-semibold disabled:opacity-50"
                >
                  {posting ? 'Posting…' : 'Post Notice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
