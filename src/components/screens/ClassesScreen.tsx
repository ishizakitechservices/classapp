import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { SubjectPicker } from '../SubjectPicker';
import { ClassroomClassView } from './ClassroomClassView';
import { ClassroomLinkModal } from './ClassroomLinkModal';
import { groupUserSubjects, type UserSubject } from '../../shared/subjects';
import type { ClassroomCourse, ClassroomLink } from '../../types';
import {
  BookOpen,
  FolderArchive,
  ChevronRight,
  Sparkles,
  Pencil,
  Check,
  X,
  Plus,
  Upload,
  Trash2,
  DownloadCloud,
  ArrowLeft,
  FileText,
  School,
  RefreshCw,
  Link,
  Loader2,
} from 'lucide-react';
interface ClassFile {
  id: string;
  displayName: string;
  mimeType: string;
  sizeBytes: number;
  subjectCode: string | null;
  description: string | null;
  folder: string;
  createdAt: string;
}

const normalise = (value: string | null | undefined) => (value || '').trim().toLowerCase();

/**
 * Classes: the student's real class and the subjects they chose at signup.
 * Clicking a subject opens that subject's own class view — its files, notes,
 * and quick actions — instead of jumping straight to the vault tab.
 */
export const ClassesScreen: React.FC = () => {
  const { user, updateSubjects } = useAuth();
  const {
    setCurrentTab,
    classroomCourses,
    classroomLinks,
    classroomAutosyncEnabled,
    classroomAutosyncCourseId,
    toggleClassroomAutosync,
    refreshClassroomCourse,
    linkClassroomCourse,
    unlinkClassroomCourse,
    getLinkedClassroomCourse,
    connectedServices,
    connectGoogleClassroom,
    disconnectGoogleWorkspace,
    syncGoogleClassroom,
    isLoadingWorkspace,
    workspaceError,
  } = useApp();

  const [files, setFiles] = useState<ClassFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSubject, setActiveSubject] = useState<string | null>(null);
  const [linkingSubject, setLinkingSubject] = useState<{ code: string; name: string } | null>(null);
  const [openClassroom, setOpenClassroom] = useState<{ course: ClassroomCourse; label?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/vault/files');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setFiles(data.files || []);
      } catch {
        // Quietly show the empty state; Vault has the full error handling.
      } finally {
        if (!cancelled) setLoadingFiles(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const subjects = user?.subjects ?? [];
  const grouped = useMemo(() => groupUserSubjects(subjects), [subjects]);
  const electiveCodes = grouped.electives.map((s) => s.code);

  /** A vault file belongs to a subject by code or by full name. */
  const filesFor = (subject: UserSubject): ClassFile[] => {
    const code = normalise(subject.code);
    const name = normalise(subject.name);
    return files.filter((f) => {
      const value = normalise(f.subjectCode);
      if (!value) return false;
      return value === code || value === name || value.startsWith(`${code} `);
    });
  };

  const matchedIds = new Set(subjects.flatMap((s) => filesFor(s).map((f) => f.id)));
  const unmatchedCount = files.filter((f) => !matchedIds.has(f.id)).length;

  const openEditor = () => {
    setDraft(electiveCodes);
    setError(null);
    setEditing(true);
  };

  const saveSubjects = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateSubjects(draft);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your subjects.');
    } finally {
      setSaving(false);
    }
  };

  const googleAccount = connectedServices.find((s) => s.id === 'google_classroom');
  const googleConnected = Boolean(googleAccount?.isConnected) || classroomCourses.length > 0;

  // No awaited work before the popup: connectGoogleClassroom opens it while the
  // click is still active, which is what keeps the browser from blocking it.
  const handleConnectGoogle = async () => {
    await connectGoogleClassroom();
  };

  /** Connect, then immediately open the picker for this subject if Google worked. */
  const handleConnectSubject = async (subject: UserSubject) => {
    const ok = await connectGoogleClassroom();
    if (ok) setLinkingSubject({ code: subject.code, name: subject.name });
  };

  const handleDisconnectGoogle = async () => {
    if (!window.confirm('Disconnect Google Classroom from this account?')) return;
    await disconnectGoogleWorkspace();
  };

  /** Create a text note for the active subject. */
  const [noteName, setNoteName] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [busy, setBusy] = useState(false);

  const createNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSubject) return;
    if (!noteName.trim() || !noteContent.trim()) return;
    setBusy(true);
    try {
      const base = noteName.trim();
      const name = base.endsWith('.md') || base.endsWith('.txt') ? base : `${base}.md`;
      const params = new URLSearchParams({ name, type: 'text/markdown', folder: 'notes', subject: activeSubject });
      const res = await fetch(`/api/vault/files?${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: noteContent.trim(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Could not save note.');
      }
      const data = await res.json();
      setFiles((prev) => [data.file, ...prev]);
      setNoteName('');
      setNoteContent('');
      setActiveSubject(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save note.');
    } finally {
      setBusy(false);
    }
  };

  const SubjectRow: React.FC<{ subject: UserSubject }> = ({ subject }) => {
    const count = filesFor(subject).length;
    const linked = getLinkedClassroomCourse(subject.code);
    return (
      <div className="w-full p-3 glass rounded-xl flex items-center justify-between gap-3 hover:border-indigo-400/60 dark:hover:border-indigo-300/40 transition-colors min-h-[56px] border border-transparent hover:border-neutral-200 dark:hover:border-neutral-700">
        <button
          onClick={(e) => { e.stopPropagation(); setActiveSubject(subject.code); }}
          className="flex-1 text-left flex items-center justify-between gap-3 min-w-0"
        >
          <div className="min-w-0">
            <div className="text-sm font-semibold text-neutral-900 dark:text-white truncate flex items-center gap-1.5">
              {subject.name}
              {linked && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/30">
                  Merged
                </span>
              )}
            </div>
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400 font-mono">
              {subject.code} · {count === 0 ? 'no files' : `${count} ${count === 1 ? 'file' : 'files'}`}
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-neutral-400 shrink-0" />
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          {linked ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const course = classroomCourses.find((c) => c.id === linked.courseId);
                if (course) {
                  setOpenClassroom({ course, label: subject.name });
                  void toggleClassroomAutosync(course.id, true);
                }
              }}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-indigo-400 dark:hover:text-indigo-300"
              title="Open in Google Classroom view"
            >
              <School className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLinkingSubject({ code: subject.code, name: subject.name });
              }}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-indigo-400 dark:hover:text-indigo-300"
              title="Link a Google Classroom class"
            >
              <Link className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (linked) {
                setLinkingSubject({ code: subject.code, name: subject.name });
              } else {
                setLinkingSubject({ code: subject.code, name: subject.name });
              }
            }}
            className="p-1 text-neutral-400 hover:text-neutral-900 dark:hover:text-white shrink-0 opacity-0 group-hover:opacity-100"
            aria-label={linked ? 'Change linked class' : 'Link a class'}
          >
            {linked ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
          </button>
        </div>
      </div>
    );
  };

  const GroupHeading: React.FC<{ children: React.ReactNode; right?: string }> = ({ children, right }) => (
    <div className="flex items-base justify-between pt-1">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">{children}</h3>
      {right && <span className="text-[11px] text-neutral-400">{right}</span>}
    </div>
  );

  /** The active subject's own class view. */
  const subjectView = () => {
    const subject = subjects.find((s) => s.code === activeSubject);
    if (!subject) return null;
    const subjectFiles = filesFor(subject);
    const linkedSubject = () => getLinkedClassroomCourse(subject.code);
    const linkedLink = linkedSubject();
    const linkedCourse = linkedLink
      ? classroomCourses.find((c) => c.id === linkedLink.courseId) || null
      : null;
    const linkedSourceName = linkedCourse?.name || linkedLink?.courseName || linkedLink?.courseId;
    return (
      <div className="space-y-5 pb-20 md:pb-8">
        <div className="p-4 sm:p-5 glass rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <button
              onClick={() => setActiveSubject(null)}
              className="text-[11px] font-semibold flex items-center gap-1 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white"
            >
              <ArrowLeft className="w-3 h-3" /> <span>Back to class</span>
            </button>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-white mt-0.5 break-words">
              {subject.name}
            </h1>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 font-mono">
              {subject.code} · {subjectFiles.length} file{subjectFiles.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setCurrentTab('vault')}
              className="min-h-[40px] px-3.5 rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-xs font-semibold flex items-center gap-1.5 shrink-0 hover:opacity-90 transition-opacity"
            >
              <FolderArchive className="w-3.5 h-3.5" /> <span>All files</span>
            </button>
          </div>
        </div>

        {/* Google Classroom, merged into this ClassApp subject */}
        <div className="p-4 glass rounded-xl space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
              <School className="w-3.5 h-3.5" /> Google Classroom
            </h3>
            {linkedLink && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/30">
                Merged
              </span>
            )}
          </div>

          {linkedLink ? (
            <>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-neutral-900 dark:text-white truncate">
                  {subject.name}
                </p>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                  Google source: {linkedSourceName}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {linkedCourse ? (
                  <button
                    onClick={() => {
                      setOpenClassroom({ course: linkedCourse, label: subject.name });
                      void toggleClassroomAutosync(linkedCourse.id, true);
                    }}
                    className="min-h-[40px] px-3.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold flex items-center gap-1.5 hover:opacity-90 transition-opacity"
                  >
                    <School className="w-3.5 h-3.5" /> Open in {subject.name}
                  </button>
                ) : (
                  <button
                    onClick={() => void syncGoogleClassroom()}
                    disabled={isLoadingWorkspace}
                    className="min-h-[40px] px-3.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    {isLoadingWorkspace ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    Reload Google classes
                  </button>
                )}
                <button
                  onClick={() => setLinkingSubject({ code: subject.code, name: subject.name })}
                  className="min-h-[40px] px-3.5 rounded-xl border border-neutral-500/25 dark:border-white/20 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-500/10 transition-colors"
                >
                  Change source
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                {!googleConnected
                  ? `Connect Google Classroom to bring its work into ${subject.name}. It appears here under this ClassApp class name, not the Google course name.`
                  : classroomCourses.length === 0
                    ? 'Google is connected, but no active Classroom classes were found for this account.'
                    : `Choose the Google Classroom class to merge into ${subject.name}. Once merged, this page uses the ClassApp class name.`}
              </p>
              <button
                onClick={() => {
                  if (!googleConnected) {
                    void handleConnectSubject(subject);
                  } else if (classroomCourses.length === 0) {
                    void syncGoogleClassroom();
                  } else {
                    setLinkingSubject({ code: subject.code, name: subject.name });
                  }
                }}
                disabled={isLoadingWorkspace}
                className="w-full min-h-[44px] rounded-xl bg-indigo-600 text-white text-xs font-semibold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
              >
                {isLoadingWorkspace && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isLoadingWorkspace
                  ? 'Working…'
                  : !googleConnected
                    ? 'Connect Google Classroom'
                    : classroomCourses.length === 0
                      ? 'Check again'
                      : 'Choose Google Classroom class'}
              </button>
            </>
          )}

          {workspaceError && (
            <p role="alert" className="text-[11px] text-rose-600 dark:text-rose-400">
              {workspaceError}
            </p>
          )}
        </div>

        {/* Quick actions: create a note or upload a file for this subject. */}
        <div className="p-4 glass rounded-xl space-y-3">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
            Add to {subject.name}
          </h3>
          <form onSubmit={createNote} className="space-y-2">
            <input
              autoFocus
              value={noteName}
              onChange={(e) => setNoteName(e.target.value)}
              placeholder="Revision note name…"
              className="w-full pl-10 pr-4 py-2.5 glass-input rounded-xl text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
            />
            <textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="Paste your notes here…"
              rows={3}
              className="w-full pl-4 pr-4 py-2.5 glass-input rounded-xl text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
            />
            <button
              type="submit"
              disabled={busy || !noteName.trim() || !noteContent.trim()}
              className="min-h-[38px] rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-xs font-semibold disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save note'}
            </button>
            {error && (
              <div role="alert" className="rounded-xl bg-neutral-900/[0.07] dark:bg-white/10 px-3 py-2 text-xs text-neutral-700 dark:text-neutral-300">
                {error}
              </div>
            )}
          </form>
        </div>

        {/* Files for this subject. */}
        <div className="space-y-2">
          {subjectFiles.length === 0 ? (
            <div className="p-12 text-center glass rounded-xl space-y-4">
              <FileText className="w-10 h-10 text-neutral-400 mx-auto" />
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">No files yet</h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 max-w-md mx-auto leading-relaxed">
                Create a revision note above, or upload files in the Vault and label them{' '}
                <span className="font-mono">{subject.code}</span>.
              </p>
            </div>
          ) : (
            <div>
              {subjectFiles.map((file) => (
                <div
                  key={file.id}
                  className="p-4 glass rounded-xl hover:border-indigo-400/60 dark:hover:border-indigo-300/40 cursor-pointer transition-colors flex items-center justify-between gap-3 group"
                  onClick={() => {
                    setCurrentTab('vault');
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-neutral-900 dark:text-white truncate group-hover:underline">
                        {file.displayName}
                      </span>
                    </div>
                    <div className="text-[11px] text-neutral-500 dark:text-neutral-400 flex flex-wrap items-center gap-1.5 mt-1">
                      <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                        {file.subjectCode || '—'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{Math.round(file.sizeBytes / 1024) / 1024} MB</span>
                      <span aria-hidden="true">·</span>
                      <span>{new Date(file.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
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
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!window.confirm('Delete this file?')) return;
                        setBusy(true);
                        fetch(`/api/vault/files/${file.id}`, { method: 'DELETE' })
                          .then((res) => res.json())
                          .then((data) => {
                            setFiles((prev) => prev.filter((f) => f.id !== file.id));
                            setActiveSubject(null);
                          })
                          .catch(() => {})
                          .finally(() => setBusy(false));
                      }}
                      className="p-1.5 text-neutral-400 hover:text-rose-500 rounded transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete file"
                      aria-label="Delete file"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const openDownloadLink = (fileId: string, displayName: string) => {
    const a = document.createElement('a');
    a.href = `/api/vault/files/${fileId}/stream?download=1`;
    a.download = displayName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const subjectViewContent = subjectView();

  if (activeSubject && subjectViewContent) {
    return subjectViewContent;
  }

  return (
    <div className="space-y-5 pb-20 md:pb-8">
      {/* Class header */}
      <div className="p-4 sm:p-5 glass rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-mono uppercase tracking-wider text-neutral-500">Your class</p>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-white mt-0.5">
              {user?.className || 'No class'}
            </h1>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              OLAG SHS · {user?.studentId?.toUpperCase()} ·{' '}
              {user?.role === 'admin' ? 'Admin' : user?.role === 'prefect' ? 'Class Prefect' : 'Student'}
            </p>
          </div>
          <button
            onClick={() => setCurrentTab('vault')}
            className="min-h-[40px] px-3.5 rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-xs font-semibold flex items-center gap-1.5 shrink-0 hover:opacity-90 transition-opacity"
          >
            <FolderArchive className="w-3.5 h-3.5" />
            <span>Vault</span>
          </button>
        </div>
      </div>

      {/* Your subjects */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Your subjects</h2>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-neutral-400">{subjects.length} subjects</span>
            {!editing && subjects.length > 0 && (
              <button
                onClick={openEditor}
                className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 flex items-center gap-1 min-h-[32px] px-1"
              >
                <Pencil className="w-3 h-3" />
                Edit
              </button>
            )}
          </div>
        </div>

        {editing ? (
          <div className="p-4 glass rounded-xl space-y-4">
            <SubjectPicker
              className={user?.className || ''}
              selected={draft}
              onChange={(codes) => { setDraft(codes); setError(null); }}
              compact
            />

            {error && (
              <div role="alert" className="rounded-xl bg-neutral-900/[0.07] dark:bg-white/10 px-3 py-2 text-xs text-neutral-700 dark:text-neutral-300">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={saveSubjects}
                disabled={saving}
                className="flex-1 min-h-[40px] rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                {saving ? 'Saving…' : 'Save subjects'}
              </button>
              <button
                onClick={() => { setEditing(false); setError(null); }}
                disabled={saving}
                className="min-h-[40px] px-4 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-semibold text-neutral-600 dark:text-neutral-300 disabled:opacity-50 flex items-center gap-1.5"
              >
                <X className="w-3 h-3" />
                Cancel
              </button>
            </div>
          </div>
        ) : subjects.length === 0 ? (
          <div className="p-8 text-center glass rounded-xl space-y-3">
            <BookOpen className="w-8 h-8 text-neutral-400 mx-auto" />
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">No subjects yet</h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto">
              Choose the subjects you study and they will appear here, with your files under each one.
            </p>
            <button
              onClick={openEditor}
              className="min-h-[38px] px-4 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-xs font-semibold"
            >
              Choose subjects
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <GroupHeading right={loadingFiles ? 'Loading…' : undefined}>Core</GroupHeading>
              {grouped.core.map((s) => <SubjectRow key={s.code} subject={s} />)}
            </div>

            {grouped.electives.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <GroupHeading right={`${grouped.electives.length} chosen`}>Electives</GroupHeading>
                {grouped.electives.map((s) => <SubjectRow key={s.code} subject={s} />)}
              </div>
            )}

            {grouped.internal.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <GroupHeading right="Form 1–2">School subjects</GroupHeading>
                {grouped.internal.map((s) => <SubjectRow key={s.code} subject={s} />)}
              </div>
            )}

            {unmatchedCount > 0 && (
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 pt-1">
                {unmatchedCount} {unmatchedCount === 1 ? 'file has' : 'files have'} no matching subject code
                {' '}— open the Vault to label them.
              </p>
            )}
          </div>
        )}
      </section>

      {/* Google Classroom */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Google Classroom</h2>
          <div className="flex items-center gap-2">
            {classroomCourses.length > 0 && (
              <button
                onClick={() => refreshClassroomCourse(classroomCourses[0].id)}
                disabled={isLoadingWorkspace}
                className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 flex items-center gap-1 min-h-[32px] px-1 disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingWorkspace ? 'animate-spin' : ''}`} /> Sync
              </button>
            )}
            {googleConnected && (
              <button
                onClick={handleDisconnectGoogle}
                disabled={isLoadingWorkspace}
                className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 min-h-[32px] px-1 disabled:opacity-50"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>

        {classroomCourses.length > 0 ? (
          <>
            <div className="space-y-1.5">
              {classroomCourses.map((course) => (
                <button
                  key={course.id}
                  onClick={() => {
                    setOpenClassroom({ course });
                    toggleClassroomAutosync(course.id, true);
                  }}
                  className="w-full text-left p-3 glass rounded-xl flex items-center justify-between gap-3 hover:border-indigo-400/60 dark:hover:border-indigo-300/40 transition-colors min-h-[56px]"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-neutral-900 dark:text-white truncate flex items-center gap-1.5">
                      <School className="w-3 h-3 shrink-0" /> {course.name}
                    </div>
                    <div className="text-[11px] text-neutral-500 dark:text-neutral-400 font-mono truncate">
                      {course.section || course.room || course.id}
                    </div>
                  </div>
                  <Link className="w-4 h-4 text-neutral-400 shrink-0" />
                </button>
              ))}
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 pt-1">
              {googleAccount?.accountEmail ? `Connected as ${googleAccount.accountEmail}. ` : ''}
              Tap a class to see its posts, assignments, and files. Autosync keeps it fresh.
            </p>
          </>
        ) : (
          <div className="p-4 glass rounded-xl space-y-3">
            <div className="flex items-start gap-2">
              <School className="w-4 h-4 mt-0.5 text-neutral-400 shrink-0" />
              <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                {isLoadingWorkspace
                  ? 'Opening Google sign-in and loading your classes…'
                  : googleConnected
                    ? 'Google is connected, but no active Classroom classes were found for this account. If your school uses Classroom, ask your teacher to add you.'
                    : 'Connect the Google account your school uses to see Classroom assignments, posts and files here.'}
              </p>
            </div>
            {googleConnected ? (
              <button
                onClick={() => syncGoogleClassroom()}
                disabled={isLoadingWorkspace}
                className="w-full min-h-[44px] rounded-xl border border-neutral-500/25 dark:border-white/20 text-xs font-semibold text-neutral-700 dark:text-neutral-300 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoadingWorkspace && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isLoadingWorkspace ? 'Checking…' : 'Check again'}
              </button>
            ) : (
              <button
                onClick={handleConnectGoogle}
                disabled={isLoadingWorkspace}
                className="w-full min-h-[44px] rounded-xl bg-indigo-600 text-white text-xs font-semibold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
              >
                {isLoadingWorkspace && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isLoadingWorkspace ? 'Connecting…' : 'Connect Google Classroom'}
              </button>
            )}
          </div>
        )}

        {workspaceError && (
          <p role="alert" className="text-[11px] text-rose-600 dark:text-rose-400 pt-1">
            {workspaceError}
          </p>
        )}
      </section>

      {/* Ask Adom AI about this class */}
      <section className="p-4 glass rounded-2xl flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-1.5">
            <Sparkles className="w-4 h-4" />
            Study with Adom AI
          </h3>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
            Ask about any topic in {user?.className || 'your class'}.
          </p>
        </div>
        <button
          onClick={() => setCurrentTab('adom-ai')}
          className="min-h-[38px] px-3.5 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-xs font-semibold shrink-0"
        >
          Ask
        </button>
      </section>

      {openClassroom && (
        <ClassroomClassView
          course={openClassroom.course}
          displayName={openClassroom.label}
          onClose={() => {
            setOpenClassroom(null);
            toggleClassroomAutosync(null, false);
          }}
        />
      )}

      {linkingSubject && (
        <ClassroomLinkModal
          subjectCode={linkingSubject.code}
          subjectName={linkingSubject.name}
          onClose={() => setLinkingSubject(null)}
        />
      )}
    </div>
  );
};

export default ClassesScreen;
