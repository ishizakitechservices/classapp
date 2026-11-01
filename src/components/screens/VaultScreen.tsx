import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { STORAGE_QUOTA_BYTES } from '../../shared/constants';
import {
  VAULT_FOLDERS,
  folderLabel,
  formatBytes,
  parseSort,
  type VaultSort,
} from '../../shared/vaultQuery';
import {
  listVaultFiles,
  updateVaultFile,
  deleteVaultFile,
  restoreVaultFile,
  bulkVaultAction,
  emptyVaultTrash,
  downloadUrl,
  VaultError,
  type VaultEntry,
  type VaultUsage,
} from '../../services/vaultApi';
import { FileViewer, kindForFile } from '../FileViewer';
import {
  Search,
  FolderArchive,
  HardDrive,
  Eye,
  BookOpen,
  DownloadCloud,
  Plus,
  Trash2,
  X,
  Upload,
  Play,
  Star,
  StarOff,
  Pencil,
  RotateCcw,
  CheckSquare,
  Square,
  ArrowUpDown,
  ChevronDown,
} from 'lucide-react';

const SORT_OPTIONS: Array<{ id: VaultSort; label: string }> = [
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'name', label: 'Name' },
  { id: 'size', label: 'Size' },
  { id: 'subject', label: 'Subject' },
];

const EMPTY_USAGE: VaultUsage = {
  liveBytes: 0,
  trashBytes: 0,
  usedBytes: 0,
  quotaBytes: STORAGE_QUOTA_BYTES,
  liveCount: 0,
  trashCount: 0,
};

export const VaultScreen: React.FC = () => {
  const { user, logout } = useAuth();

  const [files, setFiles] = useState<VaultEntry[]>([]);
  const [usage, setUsage] = useState<VaultUsage>(EMPTY_USAGE);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [starredOnly, setStarredOnly] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [sort, setSort] = useState<VaultSort>('newest');
  const [sortOpen, setSortOpen] = useState(false);

  const [activeFileId, setActiveFileId] = useState<number | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // Selection mode for bulk actions.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Edit modal
  const [editing, setEditing] = useState<VaultEntry | null>(null);
  const [editName, setEditName] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editFolder, setEditFolder] = useState('other');

  // Create note modal state
  const [noteName, setNoteName] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteSubject, setNoteSubject] = useState('');
  const [noteDescription, setNoteDescription] = useState('');

  // Upload modal state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadSubject, setUploadSubject] = useState('');
  const [uploadFolder, setUploadFolder] = useState('other');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const [viewerOpen, setViewerOpen] = useState(false);

  /** Debounce the search so typing does not fire a request per keystroke on a slow link. */
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(id);
  }, [searchQuery]);

  const fetchFiles = useCallback(async () => {
    try {
      const result = await listVaultFiles({
        q: debouncedSearch,
        folder: selectedFolder === 'all' ? null : selectedFolder,
        starred: starredOnly,
        trash: showTrash,
        sort,
      });
      setFiles(result.files);
      setUsage(result.usage);
      setListError(null);
    } catch (err) {
      setListError(err instanceof VaultError ? err.message : 'Could not load your vault.');
    }
  }, [debouncedSearch, selectedFolder, starredOnly, showTrash, sort]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Leaving the trash or select mode clears a selection that no longer applies.
  useEffect(() => {
    setSelectedIds(new Set());
    setSelectMode(false);
  }, [showTrash]);

  const activeFile = files.find((f) => f.id === activeFileId) ?? null;
  const activeKind = activeFile ? kindForFile(activeFile.displayName, activeFile.mimeType) : 'text';

  useEffect(() => {
    if (!activeFile) setViewerOpen(false);
  }, [activeFile]);

  const openDownloadLink = (fileId: number, displayName: string) => {
    const a = document.createElement('a');
    a.href = downloadUrl(fileId);
    a.download = displayName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const usedMB = (usage.usedBytes / (1024 * 1024)).toFixed(1);
  const quotaMB = Math.round(usage.quotaBytes / (1024 * 1024));
  const trashMB = formatBytes(usage.trashBytes);

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(files.map((f) => f.id)));
  };

  // ---- actions -------------------------------------------------------------

  const handleStar = async (file: VaultEntry) => {
    // Optimistic: the star should respond instantly even on a slow link.
    setFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, starred: !f.starred } : f)));
    try {
      await updateVaultFile(file.id, { starred: !file.starred });
    } catch {
      setFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, starred: file.starred } : f)));
    }
  };

  const handleOpenEdit = (file: VaultEntry) => {
    setEditing(file);
    setEditName(file.displayName);
    setEditSubject(file.subjectCode ?? '');
    setEditDescription(file.description ?? '');
    setEditFolder(file.folder);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      const updated = await updateVaultFile(editing.id, {
        name: editName,
        subject: editSubject,
        description: editDescription,
        folder: editFolder,
      });
      setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setEditing(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not save your changes.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Move this file to the trash? You can restore it for 30 days.')) return;
    setBusy(true);
    try {
      await deleteVaultFile(id);
      await fetchFiles();
      setActiveFileId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not move the file to the trash.');
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async (id: number) => {
    setBusy(true);
    try {
      await restoreVaultFile(id);
      await fetchFiles();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not restore that file.');
    } finally {
      setBusy(false);
    }
  };

  const handleEmptyTrash = async () => {
    if (!window.confirm(`Permanently delete ${usage.trashCount} file(s)? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const result = await emptyVaultTrash();
      await fetchFiles();
      if (result.removed > 0) {
        alert(`Removed ${result.removed} file(s). ${formatBytes(result.usage?.usedBytes ?? 0)} now in use.`);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not empty the trash.');
    } finally {
      setBusy(false);
    }
  };

  const handleBulk = async (action: 'delete' | 'restore' | 'star' | 'unstar' | 'move', folder?: string) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (action === 'delete' && !window.confirm(`Move ${ids.length} file(s) to the trash?`)) return;
    setBusy(true);
    try {
      await bulkVaultAction(ids, action, folder);
      setSelectedIds(new Set());
      await fetchFiles();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'That action could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteName.trim() || !noteContent.trim()) return;
    setBusy(true);
    try {
      const base = noteName.trim();
      const name = base.endsWith('.md') || base.endsWith('.txt') ? base : `${base}.md`;
      const params = new URLSearchParams({ name, type: 'text/markdown', folder: 'notes' });
      const subject = noteSubject.trim();
      const description = noteDescription.trim();
      if (subject) params.set('subject', subject);
      if (description) params.set('description', description);

      const res = await fetch(`/api/vault/files?${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: noteContent.trim(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Could not save note.');
      }
      setNoteName('');
      setNoteContent('');
      setNoteSubject('');
      setNoteDescription('');
      setShowAddModal(false);
      await fetchFiles();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not save note.');
    } finally {
      setBusy(false);
    }
  };

  const handleUploadFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;
    setBusy(true);
    setUploadProgress(0);
    try {
      const subject = uploadSubject.trim();
      const mimeType = uploadFile.type || 'application/octet-stream';

      const tokenParams = new URLSearchParams({
        name: uploadFile.name,
        type: mimeType,
        size: String(uploadFile.size),
      });
      const tokenRes = await fetch(`/api/vault/files/stream-token?${tokenParams}`, { method: 'POST' });
      const token = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok) throw new Error(token.error || 'Could not start the upload.');

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', token.uploadUrl);
        xhr.setRequestHeader('Content-Type', mimeType);
        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) setUploadProgress(Math.round((evt.loaded / evt.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Storage rejected the upload (${xhr.status}).`));
        };
        xhr.onerror = () => reject(new Error('Upload failed. Check your connection.'));
        xhr.onabort = () => reject(new Error('Upload cancelled.'));
        xhr.send(uploadFile);
      });

      const commitRes = await fetch('/api/vault/files/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: token.key,
          name: uploadFile.name,
          type: mimeType,
          folder: uploadFolder,
          subject: subject || undefined,
        }),
      });
      const data = await commitRes.json().catch(() => ({}));
      if (!commitRes.ok) throw new Error(data.error || 'Could not save the file to your vault.');

      setUploadFile(null);
      setUploadSubject('');
      setUploadFolder('other');
      setShowUploadModal(false);
      await fetchFiles();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not upload file.');
    } finally {
      setBusy(false);
      setUploadProgress(null);
    }
  };

  const inputClass = 'w-full p-2.5 glass-input rounded-lg text-neutral-900 dark:text-white text-xs';

  const folderChips = useMemo(
    () => [{ id: 'all', label: 'All Files' }, ...VAULT_FOLDERS.map((f) => ({ id: f, label: folderLabel(f) }))],
    []
  );

  if (!user) {
    return (
      <div className="h-full flex flex-col items-center justify-center px-4">
        <p className="text-sm text-neutral-500 mb-3">No account yet.</p>
        <button
          className="min-h-[42px] px-4 py-2 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 rounded-xl text-sm font-semibold"
          onClick={() => logout()}
        >
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-20 md:pb-8">
      <datalist id="vault-subject-options">
        {(user.subjects ?? []).map((s) => (
          <option key={s.code} value={s.code}>
            {s.name}
          </option>
        ))}
      </datalist>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Study Vault
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            {showTrash
              ? 'Files here can still be restored. Empty the trash to free the space.'
              : 'Your personal file library. Upload PDFs, slides, worksheets, or create revision notes.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto shrink-0">
          {!showTrash && (
            <>
              <button
                onClick={() => setShowUploadModal(true)}
                className="min-h-[36px] px-3 rounded-lg text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition-colors flex items-center gap-1.5 shadow-xs"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload</span>
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="min-h-[36px] px-3 rounded-lg text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition-colors flex items-center gap-1.5 shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Note</span>
              </button>
            </>
          )}
          <button
            onClick={() => {
              setShowTrash((v) => !v);
              setStarredOnly(false);
            }}
            className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              showTrash
                ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                : 'border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-500/10'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{showTrash ? 'Back to files' : `Trash${usage.trashCount ? ` (${usage.trashCount})` : ''}`}</span>
          </button>
        </div>
      </div>

      {/* Storage card */}
      <div className="glass p-3.5 rounded-xl text-xs space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <HardDrive className="w-4 h-4 text-neutral-400 shrink-0" />
            <div>
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400 block">Storage used</span>
              <span className="font-semibold text-neutral-900 dark:text-white font-mono tabular-nums">
                {usedMB} MB / {quotaMB} MB
              </span>
            </div>
          </div>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
              usage.usedBytes >= usage.quotaBytes
                ? 'bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                : 'bg-neutral-900/[0.07] dark:bg-white/10 text-neutral-600 dark:text-neutral-400'
            }`}
          >
            {usage.quotaBytes > 0 ? Math.round((usage.usedBytes / usage.quotaBytes) * 100) : 0}% used
          </span>
        </div>

        {/* A single thin bar: live space, then trash inside the same quota. */}
        <div className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden flex">
          <div
            className="h-full bg-neutral-900 dark:bg-white"
            style={{ width: `${Math.min(100, (usage.liveBytes / usage.quotaBytes) * 100)}%` }}
          />
          <div
            className="h-full bg-amber-400/80"
            style={{ width: `${Math.min(100, (usage.trashBytes / usage.quotaBytes) * 100)}%` }}
            title={`Trash: ${trashMB}`}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
          <span>
            {usage.liveCount} file{usage.liveCount === 1 ? '' : 's'}
            {usage.trashBytes > 0 && (
              <>
                {' · '}
                <span className="text-amber-600 dark:text-amber-400">{trashMB} in trash</span>
              </>
            )}
          </span>
          {usage.trashBytes > 0 && (
            <button
              onClick={handleEmptyTrash}
              disabled={busy}
              className="underline underline-offset-2 hover:text-neutral-900 dark:hover:text-white disabled:opacity-50"
            >
              Empty trash to free {trashMB}
            </button>
          )}
        </div>
      </div>

      {/* Search + sort */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, subject, or description..."
              className="w-full pl-10 pr-4 py-2.5 glass-input rounded-xl text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
            />
          </div>

          {/* Sort */}
          <div className="relative shrink-0">
            <button
              onClick={() => setSortOpen((v) => !v)}
              className="min-h-[40px] px-3 rounded-xl glass-input text-xs font-medium text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5"
              aria-haspopup="listbox"
              aria-expanded={sortOpen}
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{SORT_OPTIONS.find((o) => o.id === sort)?.label}</span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>
            {sortOpen && (
              <div
                className="absolute right-0 mt-1 w-40 glass-strong rounded-lg shadow-lg z-20 py-1 text-xs"
                role="listbox"
              >
                {SORT_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    role="option"
                    aria-selected={sort === option.id}
                    onClick={() => {
                      setSort(option.id);
                      setSortOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 ${
                      sort === option.id
                        ? 'font-semibold text-neutral-900 dark:text-white'
                        : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-500/10'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {!showTrash && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <button
              onClick={() => {
                setStarredOnly((v) => !v);
                setSelectedFolder('all');
              }}
              className={`min-h-[36px] px-3 py-1.5 rounded-lg whitespace-nowrap flex items-center gap-1.5 transition-colors ${
                starredOnly
                  ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-semibold'
                  : 'bg-neutral-900/[0.07] dark:bg-white/10 text-neutral-600 dark:text-neutral-400'
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${starredOnly ? 'fill-current' : ''}`} />
              <span>Starred</span>
            </button>
            {folderChips.map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  setSelectedFolder(f.id);
                  if (f.id !== 'all') setStarredOnly(false);
                }}
                className={`min-h-[36px] px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
                  selectedFolder === f.id && !starredOnly
                    ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-semibold'
                    : 'bg-neutral-900/[0.07] dark:bg-white/10 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {/* Selection bar */}
        {files.length > 0 && (
          <div className="flex items-center justify-between gap-2 text-xs">
            <button
              onClick={() => {
                if (selectMode) {
                  setSelectMode(false);
                  setSelectedIds(new Set());
                } else {
                  setSelectMode(true);
                }
              }}
              className="min-h-[32px] px-2.5 rounded-lg text-[11px] font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-500/10 flex items-center gap-1.5"
            >
              {selectMode ? <X className="w-3 h-3" /> : <CheckSquare className="w-3.5 h-3.5" />}
              <span>{selectMode ? 'Cancel' : 'Select'}</span>
            </button>

            {selectMode && (
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                <span className="text-[11px] text-neutral-500">{selectedIds.size} selected</span>
                <button
                  onClick={selectedIds.size === files.length ? () => setSelectedIds(new Set()) : selectAll}
                  className="min-h-[32px] px-2 rounded-lg text-[11px] hover:bg-neutral-500/10"
                >
                  {selectedIds.size === files.length ? 'Clear' : 'All'}
                </button>
                {showTrash ? (
                  <button
                    onClick={() => handleBulk('restore')}
                    disabled={selectedIds.size === 0 || busy}
                    className="min-h-[32px] px-2.5 rounded-lg text-[11px] font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 disabled:opacity-40 flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" /> Restore
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => handleBulk('star')}
                      disabled={selectedIds.size === 0 || busy}
                      className="min-h-[32px] px-2 rounded-lg text-[11px] hover:bg-neutral-500/10 disabled:opacity-40"
                    >
                      Star
                    </button>
                    <button
                      onClick={() => handleBulk('unstar')}
                      disabled={selectedIds.size === 0 || busy}
                      className="min-h-[32px] px-2 rounded-lg text-[11px] hover:bg-neutral-500/10 disabled:opacity-40"
                    >
                      Unstar
                    </button>
                    <select
                      onChange={(e) => {
                        if (e.target.value) handleBulk('move', e.target.value);
                        e.target.value = '';
                      }}
                      disabled={selectedIds.size === 0 || busy}
                      defaultValue=""
                      className="min-h-[32px] px-2 rounded-lg text-[11px] glass-input disabled:opacity-40"
                      aria-label="Move selected files to folder"
                    >
                      <option value="">Move to…</option>
                      {VAULT_FOLDERS.map((f) => (
                        <option key={f} value={f}>
                          {folderLabel(f)}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleBulk('delete')}
                      disabled={selectedIds.size === 0 || busy}
                      className="min-h-[32px] px-2.5 rounded-lg text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 disabled:opacity-40 flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {listError && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between gap-2">
          <span>{listError}</span>
          <button onClick={() => fetchFiles()} className="font-semibold underline underline-offset-2">
            Retry
          </button>
        </div>
      )}

      {/* Files */}
      {files.length === 0 ? (
        <div className="p-12 text-center glass rounded-xl space-y-4">
          <FolderArchive className="w-10 h-10 text-neutral-400 mx-auto" />
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
              {showTrash
                ? 'Trash is empty'
                : debouncedSearch || starredOnly || selectedFolder !== 'all'
                  ? 'No files match those filters'
                  : 'Vault is empty'}
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 max-w-md mx-auto leading-relaxed">
              {showTrash
                ? 'Deleted files stay here for 30 days, then are removed for good.'
                : 'Upload your first revision note, worksheet, or past paper. Everything is stored privately in your vault.'}
            </p>
          </div>
          {!showTrash && !debouncedSearch && (
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setShowUploadModal(true)}
                className="min-h-[40px] px-4 py-2 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 rounded-lg text-xs font-semibold flex items-center gap-1.5"
              >
                <Upload className="w-4 h-4" />
                <span>Upload File</span>
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="min-h-[40px] px-4 py-2 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 rounded-lg text-xs font-semibold flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Create Revision Note</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {files.map((file) => {
            const selected = selectedIds.has(file.id);
            return (
              <div
                key={file.id}
                onClick={() => {
                  if (selectMode) toggleSelected(file.id);
                  else setActiveFileId(file.id);
                }}
                className={`p-4 glass rounded-xl cursor-pointer transition-colors flex items-center justify-between gap-3 group ${
                  selected ? 'ring-1 ring-neutral-900 dark:ring-white' : 'hover:border-indigo-400/60 dark:hover:border-indigo-300/40'
                }`}
              >
                {selectMode && (
                  <div className="shrink-0 text-neutral-500">
                    {selected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {file.starred && !showTrash && (
                      <Star className="w-3 h-3 text-amber-500 fill-current shrink-0" aria-label="Starred" />
                    )}
                    <span className="text-xs font-semibold text-neutral-900 dark:text-white truncate group-hover:underline">
                      {file.displayName}
                    </span>
                  </div>
                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400 flex flex-wrap items-center gap-1.5 mt-1">
                    <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                      {file.subjectCode || '—'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">{formatBytes(file.sizeBytes)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{new Date(file.createdAt).toLocaleDateString()}</span>
                    <span aria-hidden="true">·</span>
                    <span>{folderLabel(file.folder)}</span>
                  </div>
                </div>

                {!selectMode && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {showTrash ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRestore(file.id);
                        }}
                        className="min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-medium border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-500/10 flex items-center gap-1"
                        title="Restore this file"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Restore</span>
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStar(file);
                          }}
                          className="p-1.5 rounded-lg text-neutral-400 hover:text-amber-500 transition-colors"
                          title={file.starred ? 'Remove star' : 'Star for revision'}
                          aria-label={file.starred ? 'Remove star' : 'Star for revision'}
                        >
                          {file.starred ? (
                            <Star className="w-3.5 h-3.5 fill-current text-amber-500" />
                          ) : (
                            <StarOff className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEdit(file);
                          }}
                          className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
                          title="Edit details"
                          aria-label="Edit details"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveFileId(file.id);
                      }}
                      className="min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-medium border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-500/10 flex items-center gap-1"
                      title="Open file details"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Read</span>
                    </button>

                    {!showTrash && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(file.id);
                        }}
                        className="p-1.5 text-neutral-400 hover:text-rose-500 rounded transition-colors"
                        title="Move to trash"
                        aria-label="Move to trash"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openDownloadLink(file.id, file.displayName);
                      }}
                      className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                      title="Download file"
                    >
                      <DownloadCloud className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* File detail modal */}
      {activeFile && !viewerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="glass-strong rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">
                  {activeFile.subjectCode || 'General'}
                </span>
                <h3 className="text-base font-bold text-neutral-900 dark:text-white mt-1 break-words">
                  {activeFile.displayName}
                </h3>
              </div>
              <button
                onClick={() => setActiveFileId(null)}
                className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white p-1 shrink-0"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {activeFile.description && (
              <div className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                {activeFile.description}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg text-xs font-mono">
              <div>
                <span className="text-neutral-400 text-[10px] block">Size</span>
                <span className="font-semibold text-neutral-900 dark:text-white">
                  {formatBytes(activeFile.sizeBytes)}
                </span>
              </div>
              <div>
                <span className="text-neutral-400 text-[10px] block">Format</span>
                <span className="font-semibold text-neutral-900 dark:text-white">
                  {(activeFile.mimeType || '').split('/').pop() || 'File'}
                </span>
              </div>
              <div>
                <span className="text-neutral-400 text-[10px] block">Folder</span>
                <span className="font-semibold text-neutral-900 dark:text-white">
                  {folderLabel(activeFile.folder)}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                onClick={() => setViewerOpen(true)}
                className="flex-1 min-h-[44px] px-4 py-2 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
              >
                {activeKind === 'audio' || activeKind === 'video' ? (
                  <Play className="w-4 h-4" />
                ) : (
                  <BookOpen className="w-4 h-4" />
                )}
                <span>
                  {activeKind === 'audio' || activeKind === 'video'
                    ? 'Play'
                    : activeKind === 'download-only'
                      ? 'Download only'
                      : 'Open'}
                </span>
              </button>

              <button
                onClick={() => openDownloadLink(activeFile.id, activeFile.displayName)}
                className="flex-1 min-h-[44px] px-3.5 py-2 border border-neutral-500/25 dark:border-white/20 text-neutral-900 dark:text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-neutral-500/10 transition-colors"
              >
                <DownloadCloud className="w-4 h-4" />
                <span>Download</span>
              </button>
            </div>

            {!activeFile.deletedAt && (
              <div className="flex gap-2 pt-1 border-t border-neutral-500/10 dark:border-white/10">
                <button
                  onClick={() => {
                    setActiveFileId(null);
                    handleOpenEdit(activeFile);
                  }}
                  className="flex-1 min-h-[38px] rounded-lg text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-500/10 flex items-center justify-center gap-1.5"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit details
                </button>
                <button
                  onClick={() => {
                    setActiveFileId(null);
                    handleDelete(activeFile.id);
                  }}
                  className="flex-1 min-h-[38px] rounded-lg text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Move to trash
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Full-screen file viewer */}
      {activeFile && viewerOpen && (
        <FileViewer
          fileId={String(activeFile.id)}
          displayName={activeFile.displayName}
          mimeType={activeFile.mimeType}
          subjectCode={activeFile.subjectCode ?? undefined}
          sizeBytes={activeFile.sizeBytes}
          notes={activeFile.notes}
          onClose={() => setViewerOpen(false)}
        />
      )}

      {/* Edit details modal */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="glass-strong rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-500/10 dark:border-white/10 pb-3">
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Edit file details</h3>
              <button onClick={() => setEditing(null)} aria-label="Close" className="text-neutral-400 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3 text-xs">
              <div>
                <label className="block text-neutral-700 dark:text-neutral-300 mb-1 font-medium">File name</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} className={inputClass} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-neutral-700 dark:text-neutral-300 mb-1 font-medium">Subject</label>
                  <input
                    list="vault-subject-options"
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                    placeholder="e.g. MATH"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-neutral-700 dark:text-neutral-300 mb-1 font-medium">Folder</label>
                  <select value={editFolder} onChange={(e) => setEditFolder(e.target.value)} className={inputClass}>
                    {VAULT_FOLDERS.map((f) => (
                      <option key={f} value={f}>
                        {folderLabel(f)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-neutral-700 dark:text-neutral-300 mb-1 font-medium">Summary</label>
                <input
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="e.g. Key formulas and worked steps"
                  className={inputClass}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-neutral-500/10 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="px-3 py-2 rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-500/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create revision note modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="glass-strong rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-500/10 dark:border-white/10 pb-3">
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Create Revision Note</h3>
              <button onClick={() => setShowAddModal(false)} className="text-neutral-400 p-1" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateNote} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-neutral-700 dark:text-neutral-300 mb-1 font-medium">
                    Document Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Calculus Derivatives Summary"
                    value={noteName}
                    onChange={(e) => setNoteName(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-neutral-700 dark:text-neutral-300 mb-1 font-medium">Subject Code</label>
                  <input
                    type="text"
                    list="vault-subject-options"
                    placeholder="e.g. MATH or PHY"
                    value={noteSubject}
                    onChange={(e) => setNoteSubject(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className="block text-neutral-700 dark:text-neutral-300 mb-1 font-medium">Brief Summary</label>
                <input
                  type="text"
                  placeholder="e.g. Key formulas and worked steps"
                  value={noteDescription}
                  onChange={(e) => setNoteDescription(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-neutral-700 dark:text-neutral-300 mb-1 font-medium">
                  Document Content (Markdown & LaTeX formulas supported) *
                </label>
                <textarea
                  rows={6}
                  required
                  placeholder={"# Write your notes here...\nFormulas like $$f'(x) = 6x - 4$$ are rendered automatically."}
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  className="w-full p-2.5 glass-input rounded-lg text-neutral-900 dark:text-white font-mono text-xs resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-neutral-500/10 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-2 rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-500/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? 'Saving…' : 'Save to Vault'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="glass-strong rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-500/10 dark:border-white/10 pb-3">
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Upload File</h3>
              <button onClick={() => setShowUploadModal(false)} className="text-neutral-400 p-1" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUploadFile} className="space-y-4 text-xs">
              <div>
                <label className="block text-neutral-700 dark:text-neutral-300 mb-1 font-medium">File *</label>
                <input
                  type="file"
                  required
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                  className="w-full p-2.5 glass-input rounded-lg text-neutral-900 dark:text-white text-xs"
                />
                {uploadFile && (
                  <p className="text-[10px] text-neutral-500 mt-1">
                    {uploadFile.name} · {(uploadFile.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                )}

                {uploadProgress !== null && (
                  <div className="mt-2 space-y-1" role="status" aria-live="polite">
                    <div className="flex items-center justify-between text-[10px] font-medium text-neutral-600 dark:text-neutral-300">
                      <span>{uploadProgress >= 100 ? 'Finishing…' : 'Uploading…'}</span>
                      <span className="font-mono tabular-nums">{uploadProgress}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-neutral-900 dark:bg-white transition-[width] duration-150 ease-out"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-neutral-700 dark:text-neutral-300 mb-1 font-medium">Subject Code</label>
                <input
                  type="text"
                  list="vault-subject-options"
                  placeholder="e.g. MATH or PHY"
                  value={uploadSubject}
                  onChange={(e) => setUploadSubject(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-neutral-700 dark:text-neutral-300 mb-1 font-medium">Folder</label>
                <select
                  value={uploadFolder}
                  onChange={(e) => setUploadFolder(e.target.value)}
                  className={inputClass}
                >
                  {VAULT_FOLDERS.filter((f) => f !== 'notes').map((f) => (
                    <option key={f} value={f}>
                      {folderLabel(f)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-neutral-500/10 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-3 py-2 rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-500/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || !uploadFile}
                  className="px-4 py-2 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  {busy
                    ? uploadProgress !== null && uploadProgress < 100
                      ? `Uploading ${uploadProgress}%`
                      : 'Finishing…'
                    : 'Upload File'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
