/**
 * ClassroomClassView — one Google Classroom course opened as its own class view.
 *
 * Stream (posts) + Classwork (assignments) + People (teachers), with per-class autosync,
 * file viewing, add-to-vault, answering/commenting on assignments, and an inline
 * "draft with Adom AI → turn in to class" flow.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  ArrowLeft,
  RefreshCw,
  Clock,
  Check,
  X,
  Download,
  ExternalLink,
  FileText,
  Play,
  Link,
  MessageCircle,
  Send,
  Sparkles,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  Users,
  School,
} from 'lucide-react';
import type {
  ClassroomCourse,
  ClassroomCourseWork,
  ClassroomAnnouncement,
  ClassroomMaterialItem,
  ClassroomTeacher,
  StudentSubmission,
} from '../../types';

function stripHtml(html?: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\b[^>]*>/gi, '\n')
    .replace(/<\/div\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .trim();
}

function dueLabel(due: ClassroomCourseWork['dueDate']): string {
  if (!due) return 'No due date';
  const d = new Date(due.year, (due.month || 1) - 1, due.day || 1);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function isDueSoon(work: ClassroomCourseWork): boolean {
  if (!work.dueDate) return false;
  const d = new Date(work.dueDate.year, (work.dueDate.month || 1) - 1, work.dueDate.day || 1);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = (d.getTime() - now.getTime()) / 86400000;
  return diff >= 0 && diff <= 7;
}

function materialIcon(m: ClassroomMaterialItem) {
  if (m.driveFile?.driveFile) return <FileText className="w-3 h-3" />;
  if (m.youtubeVideo) return <Play className="w-3 h-3" />;
  if (m.link) return <Link className="w-3 h-3" />;
  if (m.form) return <FileText className="w-3 h-3" />;
  return <Link className="w-3 h-3" />;
}

function materialLabel(m: ClassroomMaterialItem) {
  if (m.driveFile?.driveFile) return m.driveFile.driveFile.title || 'Drive file';
  if (m.youtubeVideo) return m.youtubeVideo.title || 'YouTube video';
  if (m.link) return m.link.title || 'Link';
  if (m.form) return m.form.title || 'Form';
  return 'Material';
}

function materialUrl(m: ClassroomMaterialItem) {
  if (m.driveFile?.driveFile) return m.driveFile.driveFile.alternateLink;
  if (m.youtubeVideo) return m.youtubeVideo.alternateLink || `https://youtu.be/${m.youtubeVideo.id}`;
  if (m.link) return m.link.url;
  if (m.form) return m.form.formUrl;
  return null;
}

type Tab = 'stream' | 'classwork' | 'people';

interface Props {
  course: ClassroomCourse;
  /** ClassApp class name to show instead of the Google course name. */
  displayName?: string;
  onClose: () => void;
}

export const ClassroomClassView: React.FC<Props> = ({ course, displayName, onClose }) => {
  const {
    classroomCourseWork,
    classroomAnnouncements,
    classroomMaterials,
    classroomTeachers,
    classroomSubmissions,
    classroomAutosyncEnabled,
    classroomAutosyncCourseId,
    classroomAutosyncIntervalMs,
    classroomLastSyncedAt,
    toggleClassroomAutosync,
    setClassroomAutosyncInterval,
    refreshClassroomCourse,
    createClassroomSubmission,
    turnInClassroomSubmission,
    addClassroomComment,
    importClassroomMaterialToVault,
    importDriveFileToVault,
    sendMessage,
    isAiThinking,
    setAdomDraftContext,
    clearAdomDraftContext,
  } = useApp() as any;

  const works = classroomCourseWork[course.id] ?? [];
  const announcements = classroomAnnouncements[course.id] ?? [];
  const teachers = classroomTeachers[course.id] ?? [];
  const subs = classroomSubmissions[course.id] ?? [];

  const submissionFor = (courseWorkId: string) =>
    subs.find((s: StudentSubmission) => s.courseWorkId === courseWorkId);

  const [tab, setTab] = useState<Tab>('classwork');
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerKind, setViewerKind] = useState<'drive' | 'youtube' | 'link' | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerExternalUrl, setViewerExternalUrl] = useState<string | null>(null);
  const [viewerTitle, setViewerTitle] = useState<string | null>(null);

  const [answerOpen, setAnswerOpen] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [submitting, setSubmitting] = useState<Set<string>>(new Set());

  const [commentOpen, setCommentOpen] = useState<string | null>(null);
  const [commentText, setCommentText] = useState<Record<string, string>>({});

  const [adomDraftOpen, setAdomDraftOpen] = useState(false);
  const [adomDraft, setAdomDraft] = useState('');

  const [vaulted, setVaulted] = useState<Set<string>>(new Set());

  const openMaterial = (m: ClassroomMaterialItem) => {
    if (m.driveFile?.driveFile) {
      setViewerKind('drive');
      setViewerUrl(`/api/workspace/drive/files/${m.driveFile.driveFile.id}/content`);
      setViewerExternalUrl(m.driveFile.driveFile.alternateLink || null);
      setViewerTitle(m.driveFile.driveFile.title || 'Drive file');
      setViewerOpen(true);
      return;
    }
    if (m.youtubeVideo) {
      setViewerKind('youtube');
      setViewerUrl(`https://www.youtube-nocookie.com/embed/${m.youtubeVideo.id}`);
      setViewerExternalUrl(m.youtubeVideo.alternateLink || `https://www.youtube.com/watch?v=${m.youtubeVideo.id}`);
      setViewerTitle(m.youtubeVideo.title || 'YouTube video');
      setViewerOpen(true);
      return;
    }
    if (m.link || m.form) {
      setViewerKind('link');
      const url = materialUrl(m);
      setViewerUrl(url ?? null);
      setViewerExternalUrl(url ?? null);
      setViewerTitle(materialLabel(m));
      setViewerOpen(true);
      return;
    }
  };

  const addMaterialToVault = async (m: ClassroomMaterialItem) => {
    const url = materialUrl(m);
    if (!url) return;
    const label = materialLabel(m);
    setVaulted((prev) => new Set([...prev, label]));
    try {
      await importClassroomMaterialToVault({
        title: label,
        description: `Classroom material from ${course.name}.`,
        courseName: course.name,
        courseId: course.id,
        material: m as any,
      });
      setTimeout(() => {
        setVaulted((prev) => { const n = new Set(prev); n.delete(label); return n; });
      }, 1500);
    } catch (err: any) {
      alert(err?.message || 'Could not add to vault.');
    }
  };

  const submitAnswer = async (work: ClassroomCourseWork) => {
    if (!answerText.trim()) return;
    setSubmitting((prev) => new Set([...prev, work.id]));
    try {
      await createClassroomSubmission(course.id, work.id, answerText);
      setAnswerOpen(null);
      setAnswerText('');
    } catch (err: any) {
      alert(err?.message || 'Could not send your answer.');
    } finally {
      setSubmitting((prev) => { const n = new Set(prev); n.delete(work.id); return n; });
    }
  };

  const turnIn = async (work: ClassroomCourseWork, submission: StudentSubmission) => {
    setSubmitting((prev) => new Set([...prev, `turnin-${work.id}`]));
    try {
      await turnInClassroomSubmission(course.id, work.id, submission.id);
    } catch (err: any) {
      alert(err?.message || 'Could not turn that in.');
    } finally {
      setSubmitting((prev) => { const n = new Set(prev); n.delete(`turnin-${work.id}`); return n; });
    }
  };

  const postComment = async (submission: StudentSubmission, work: ClassroomCourseWork) => {
    const text = commentText[submission.id]?.trim();
    if (!text) return;
    setSubmitting((prev) => new Set([...prev, `comment-${submission.id}`]));
    try {
      await addClassroomComment(course.id, work.id, submission.id, text);
      setCommentOpen(null);
      setCommentText({ ...commentText, [submission.id]: '' });
    } catch (err: any) {
      alert(err?.message || 'Could not post your comment.');
    } finally {
      setSubmitting((prev) => { const n = new Set(prev); n.delete(`comment-${submission.id}`); return n; });
    }
  };

  const draftWithAdomAI = async (work: ClassroomCourseWork) => {
    setAdomDraftContext({
      courseId: course.id,
      courseWorkId: work.id,
      title: work.title,
      description: stripHtml(work.description),
    });
    setAdomDraftOpen(true);
    const prompt = [
      `Draft an answer to this Google Classroom assignment:`,
      `Course: ${course.name}`,
      `Assignment: ${work.title}`,
      work.description ? `\nDescription:\n${stripHtml(work.description)}` : '',
      `\nWrite just the answer, ready to submit. Keep it clear and show your work where it helps.`,
    ].join('\n');
    try {
      await sendMessage(prompt);
    } catch {
      // Adom AI shows its own error state.
    }
  };

  const insertAdomDraft = () => {
    setAnswerText((prev) => (prev ? `${prev}\n\n---\n\n${adomDraft}` : adomDraft));
    setAdomDraftOpen(false);
    clearAdomDraftContext();
  };

  const groups = useMemo(() => {
    const turnedIn: ClassroomCourseWork[] = [];
    const returned: ClassroomCourseWork[] = [];
    const dueSoon: ClassroomCourseWork[] = [];
    const noDate: ClassroomCourseWork[] = [];
    const missing: ClassroomCourseWork[] = [];

    works.forEach((w: ClassroomCourseWork) => {
      const sub = submissionFor(w.id);
      if (sub && sub.state === 'TURNED_IN') { turnedIn.push(w); return; }
      if (sub && sub.state === 'RETURNED') { returned.push(w); return; }
      if (!w.dueDate) { noDate.push(w); return; }
      if (isDueSoon(w)) { dueSoon.push(w); return; }
      missing.push(w);
    });
    return { turnedIn, returned, dueSoon, noDate, missing };
  }, [works, subs]);

  const statusBadge = (sub: StudentSubmission | undefined) => {
    if (!sub) return <span className="text-[10px] font-semibold text-neutral-500">Not submitted</span>;
    const conf: Record<string, { label: string; color: string }> = {
      TURNED_IN: { label: 'Turned in', color: 'text-emerald-600 dark:text-emerald-400' },
      RETURNED: { label: 'Returned', color: 'text-indigo-600 dark:text-indigo-400' },
      CREATED: { label: 'Draft', color: 'text-amber-500' },
      NEW: { label: 'New', color: 'text-neutral-500' },
      RECLAIMED_BY_STUDENT: { label: 'Reclaimed', color: 'text-neutral-500' },
    };
    const c = conf[sub.state] || conf.NEW;
    return <span className={`text-[10px] font-semibold ${c.color}`}>{c.label}</span>;
  };

  const materialChips = (mats: ClassroomMaterialItem[]) => (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {mats.map((m, i) => {
        const url = materialUrl(m);
        return (
          <button
            key={i}
            onClick={(e) => { e.stopPropagation(); openMaterial(m); }}
            className="flex items-center gap-1.5 rounded-xl border border-neutral-200 dark:border-neutral-600 bg-neutral-100 dark:bg-neutral-800 px-2 py-1 text-xs text-neutral-600 dark:text-neutral-200 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
          >
            {materialIcon(m)} <span className="truncate max-w-[140px]">{materialLabel(m)}</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </button>
        );
      })}
    </div>
  );

  const workCard = (work: ClassroomCourseWork) => {
    const sub = submissionFor(work.id);
    const isTurnedIn = sub?.state === 'TURNED_IN';
    const answering = answerOpen === work.id;
    const submittingNow = submitting.has(work.id) || submitting.has(`turnin-${work.id}`);

    return (
      <div
        key={work.id}
        className="p-4 glass rounded-xl hover:border-indigo-400/60 dark:hover:border-indigo-300/40 border cursor-pointer transition-colors group"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button, a, textarea, select')) return;
          if (answering) setAnswerOpen(null);
          else setAnswerOpen(work.id);
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                work.workType === 'SHORT_ANSWER_QUESTION'
                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                  : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
              }`}>
                {work.workType === 'SHORT_ANSWER_QUESTION' ? 'Short answer' : 'Assignment'}
              </span>
              {work.maxPoints && <span className="text-[10px] font-mono text-neutral-400">{work.maxPoints} pts</span>}
            </div>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white leading-snug">{work.title}</h3>
            {work.description && (
              <p className="text-[12px] text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-2 leading-relaxed">
                {stripHtml(work.description)}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {work.dueDate && (
                <span className="text-[11px] flex items-center gap-1 text-neutral-500 dark:text-neutral-400">
                  <Clock className="w-3 h-3" /> {dueLabel(work.dueDate!)}
                </span>
              )}
            </div>
            {work.materials?.length && materialChips(work.materials)}
          </div>
          <div className="flex items-start gap-2 shrink-0">
            <div className="text-right min-w-[56px]">{statusBadge(sub)}</div>
            <div className="flex items-start gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); setAnswerOpen(work.id); }}
                disabled={isTurnedIn || submittingNow}
                className="min-h-[34px] px-2.5 rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-xs font-semibold disabled:opacity-50 shrink-0"
                title={isTurnedIn ? 'Already turned in' : 'Answer this assignment'}
              >
                {submittingNow ? <Loader2 className="w-3 h-3 animate-spin" /> : isTurnedIn ? <Check className="w-3 h-3" /> : <Send className="w-3 h-3" />}
              </button>
            </div>
          </div>
        </div>

        {answering && (
          <div className="mt-3 p-4 glass rounded-xl border border-neutral-200 dark:border-neutral-600 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-xs font-semibold text-neutral-900 dark:text-white">Your answer</h4>
              <button onClick={() => setAnswerOpen(null)} className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <textarea
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value)}
              placeholder="Write your answer here…"
              rows={4}
              className="w-full p-2.5 glass-input rounded-xl text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
              disabled={submittingNow}
            />
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => draftWithAdomAI(work)}
                disabled={isAiThinking}
                className="flex-1 min-h-[34px] rounded-xl border border-neutral-200 dark:border-neutral-600 text-xs font-semibold text-neutral-600 dark:text-neutral-300 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {isAiThinking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                <span>Draft with Adom AI</span>
              </button>
              <div className="flex gap-1">
                <button
                  onClick={() => submitAnswer(work)}
                  disabled={!answerText.trim() || submittingNow}
                  className="min-h-[34px] px-3 rounded-xl bg-indigo-600 text-white text-xs font-semibold disabled:opacity-50 shrink-0"
                >
                  {submittingNow ? 'Sending…' : isTurnedIn ? 'Resubmit' : 'Send answer'}
                </button>
                {sub && (sub.state === 'CREATED' || sub.state === 'NEW') && (
                  <button
                    onClick={() => turnIn(work, sub)}
                    disabled={submittingNow}
                    className="min-h-[34px] px-3 rounded-xl bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50 shrink-0"
                  >
                    Turn in
                  </button>
                )}
                <button
                  onClick={() => setCommentOpen(sub?.id || null)}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-emerald-600 dark:hover:text-emerald-400 shrink-0"
                  title="Add a comment"
                >
                  <MessageCircle className="w-4 h-4" />
                </button>
              </div>
            </div>
            {sub && (sub.state === 'TURNED_IN' || sub.state === 'RETURNED') && (
              <div className="pt-2 border-t border-neutral-200 dark:border-neutral-600">
                <button
                  onClick={() => setCommentOpen(sub.id)}
                  className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  {sub.state === 'TURNED_IN' ? 'Add a comment' : 'View / add comments'}
                </button>
              </div>
            )}
          </div>
        )}

        {commentOpen === sub?.id && (
          <div className="mt-3 p-4 glass rounded-xl border border-neutral-200 dark:border-neutral-600 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <h4 className="text-xs font-semibold text-neutral-900 dark:text-white">Comment</h4>
            <textarea
              value={commentText[sub!.id] || ''}
              onChange={(e) => setCommentText({ ...commentText, [sub!.id]: e.target.value })}
              placeholder="Write a comment…"
              rows={2}
              className="w-full p-2.5 glass-input rounded-xl text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => postComment(sub!, work)}
                disabled={submitting.has(`comment-${sub!.id}`)}
                className="flex-1 min-h-[34px] rounded-xl bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50"
              >
                {submitting.has(`comment-${sub!.id}`) ? 'Posting…' : 'Post comment'}
              </button>
              <button
                onClick={() => setCommentOpen(null)}
                className="px-2 text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const announcementCard = (a: ClassroomAnnouncement) => (
    <div key={a.id} className="p-4 glass rounded-xl border hover:border-indigo-400/60 dark:hover:border-indigo-300/40 transition-colors">
      <div className="text-[12px] text-neutral-500 dark:text-neutral-400 mb-1 flex items-center gap-1">
        <School className="w-3 h-3 shrink-0" /> <span>Post</span>
        {a.creationTime && <span className="ml-1 font-mono text-[10px]">{new Date(a.creationTime).toLocaleDateString()}</span>}
      </div>
      <div className="text-sm text-neutral-800 dark:text-neutral-200 leading-relaxed mb-3">{stripHtml(a.text)}</div>
      {a.materials?.length && materialChips(a.materials)}
      {a.materials?.length && (
        <div className="mt-2">
          <button
            onClick={(e) => {
            e.stopPropagation();
            const m = a.materials?.[0];
            if (m) addMaterialToVault(m);
          }}
            className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
          >
            <Download className="w-3 h-3" /> Add to vault
          </button>
        </div>
      )}
      {a.alternateLink && (
        <a
          href={a.alternateLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
        >
          Open in Classroom <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );

  const autosyncRow = (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-800/50">
      <button
        onClick={() => toggleClassroomAutosync(course.id, !classroomAutosyncEnabled)}
        className="relative flex h-5 w-9 items-center shrink-0 rounded-full border border-neutral-400/60 p-0.5 transition-colors"
        aria-pressed={classroomAutosyncEnabled}
        title={classroomAutosyncEnabled ? 'Turn off autosync' : 'Turn on autosync'}
      >
        <span
          className={`block h-4 w-4 rounded-full bg-white shadow transition-transform ${classroomAutosyncEnabled ? 'translate-x-5 bg-indigo-500' : 'translate-x-0 bg-neutral-300'}`}
        />
      </button>
      <div className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400 shrink-0">
        {classroomAutosyncEnabled ? 'autosync on' : 'autosync off'}
      </div>
      <select
        value={classroomAutosyncIntervalMs}
        onChange={(e) => setClassroomAutosyncInterval(Number(e.target.value))}
        className="text-[10px] bg-transparent text-neutral-400 border-none focus:ring-0 p-0 shrink-0"
      >
        <option value={5000}>5s</option>
        <option value={30000}>30s</option>
        <option value={60000}>60s</option>
      </select>
      {classroomLastSyncedAt && (
        <span className="text-[10px] text-neutral-500 dark:text-neutral-400 ml-1">· synced {classroomLastSyncedAt}</span>
      )}
      <button
        onClick={() => refreshClassroomCourse(course.id)}
        className="text-neutral-400 hover:text-indigo-400 shrink-0"
        title="Refresh now"
      >
        <RefreshCw className="w-3 h-3" />
      </button>
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm md:hidden" onClick={onClose} />

      <div className="fixed left-0 top-0 h-full z-50 md:w-[420px] bg-white dark:bg-neutral-900 shadow-2xl border-r border-neutral-200 dark:border-neutral-700 flex flex-col transition-transform duration-300 md:translate-x-0">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-200 dark:border-neutral-700 flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={onClose} className="p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-neutral-500 mb-0.5">
                <School className="w-3 h-3" /> {course.courseState === 'ACTIVE' ? 'Active class' : 'Class'}
              </div>
              <h1 className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white leading-none">
                {displayName || course.name}
              </h1>
              {displayName && displayName !== course.name && (
                <p className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 mt-1 truncate">
                  Google Classroom · {course.name}
                </p>
              )}
              {(course.section || course.room) && (
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 font-mono">
                  {course.section}{course.section && course.room ? ' · ' : ''}{course.room}
                </p>
              )}
              {course.description && (
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-2">{course.description}</p>
              )}
            </div>
          </div>
          {course.alternateLink && (
            <a href={course.alternateLink} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg text-neutral-400 hover:text-indigo-400 dark:hover:text-indigo-300" title="Open in Google Classroom">
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>

        {/* Teachers */}
        {teachers.length > 0 && (
          <div className="px-4 sm:p-5 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-800/30">
            <div className="flex items-center gap-2 px-2 mb-2">
              <Users className="w-3 h-3 text-neutral-500 shrink-0" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Teacher{teachers.length > 1 ? 's' : ''}</span>
            </div>
            <div className="flex gap-2 px-4 sm:px-5 pb-2">
              {teachers.map((t: ClassroomTeacher) => (
                <div key={t.userId || t.profile?.emailAddress || t.profile.id} className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-xs font-bold">
                    {(t.profile?.emailAddress?.charAt(0) || 'T').toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-neutral-900 dark:text-white truncate">{t.profile?.name?.givenName || 'Teacher'}</div>
                    <div className="text-[10px] text-neutral-400 truncate">{t.profile?.emailAddress}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Autosync controls */}
        <div className="px-4 sm:p-5 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50/60 dark:bg-neutral-800/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Auto-sync</span>
            <span className={`text-[10px] font-mono ${classroomAutosyncEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-neutral-500'}`}>
              {classroomAutosyncEnabled ? 'ON' : 'OFF'}
            </span>
          </div>
          {autosyncRow}
          <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1">
            Refreshes this class's assignments &amp; posts automatically. Pauses when you leave the tab.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex px-4 sm:px-5 border-b border-neutral-200 dark:border-neutral-700 shrink-0">
          {[
            ['stream', 'Stream'],
            ['classwork', 'Classwork'],
            ['people', 'People'],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key as Tab)}
              className={`flex-1 py-3 text-xs font-semibold border-b-2 ${tab === key ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Stream (posts) */}
        {tab === 'stream' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            {announcements.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center text-neutral-500 dark:text-neutral-400">
                <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No posts yet.</p>
              </div>
            )}
            {announcements.map(announcementCard)}
          </div>
        )}

        {/* Classwork (assignments) */}
        {tab === 'classwork' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {works.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center text-neutral-500 dark:text-neutral-400">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No assignments yet.</p>
              </div>
            )}
            {groups.missing.length > 0 && (
              <section>
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-2 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Due soon / not turned in
                </h3>
                <div className="space-y-2">{groups.missing.map(workCard)}</div>
              </section>
            )}
            {groups.dueSoon.length > 0 && (
              <section>
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-2 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Due this week
                </h3>
                <div className="space-y-2">{groups.dueSoon.map(workCard)}</div>
              </section>
            )}
            {groups.noDate.length > 0 && (
              <section>
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-2 flex items-center gap-1">
                  <Link className="w-3 h-3" /> No due date
                </h3>
                <div className="space-y-2">{groups.noDate.map(workCard)}</div>
              </section>
            )}
            {groups.turnedIn.length > 0 && (
              <section>
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-2 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Turned in
                </h3>
                <div className="space-y-2">{groups.turnedIn.map(workCard)}</div>
              </section>
            )}
            {groups.returned.length > 0 && (
              <section>
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-2 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Returned
                </h3>
                <div className="space-y-2">{groups.returned.map(workCard)}</div>
              </section>
            )}
          </div>
        )}

        {/* People (teachers) */}
        {tab === 'people' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            {teachers.length === 0 ? (
              <p className="text-neutral-500 dark:text-neutral-400 text-center mt-10">No teachers listed.</p>
            ) : (
              <div className="space-y-2">
                {teachers.map((t: ClassroomTeacher) => (
                  <div key={t.userId || t.profile?.emailAddress || t.profile.id} className="p-3 glass rounded-xl border flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-xs font-bold shrink-0">
                      {(t.profile?.emailAddress?.charAt(0) || 'T').toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-neutral-900 dark:text-white truncate">{t.profile?.name?.givenName || 'Teacher'}</div>
                      <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">{t.profile?.emailAddress}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* File viewer for classroom materials. Drive files are served through our own
         origin proxy (/api/workspace/drive/files/:id/content) so they embed in a
         same-origin iframe without Google's X-Frame-Options block. YouTube uses the
         nocookie embed. Plain links fall back to "open externally". */}
      {viewerOpen && viewerUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-neutral-200 dark:border-neutral-700 max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white truncate flex-1 mr-2">
                {viewerTitle || 'Material'}
              </h3>
              <button onClick={() => setViewerOpen(false)} className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
              {viewerKind === 'link' && (
                <div className="flex-1 p-6 flex flex-col items-center justify-center text-center text-neutral-500 dark:text-neutral-400">
                  <ExternalLink className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>This link can't be embedded inside the app.</p>
                  {viewerExternalUrl && (
                    <button
                      onClick={() => window.open(viewerExternalUrl, '_blank')}
                      className="mt-4 min-h-[36px] px-4 rounded-xl bg-indigo-600 text-white text-xs font-semibold"
                    >
                      Open link
                    </button>
                  )}
                </div>
              )}
              {viewerKind !== 'link' && (
                <div className="flex-1 w-full min-h-0 bg-neutral-50 dark:bg-neutral-900/50">
                  <iframe
                    className="w-full h-full block"
                    src={viewerUrl}
                    title={viewerTitle || 'Material'}
                    sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                  />
                </div>
              )}
            </div>
            <div className="p-3 border-t border-neutral-200 dark:border-neutral-700 flex items-center justify-between gap-2 shrink-0">
              {viewerExternalUrl && (
                <button
                  onClick={() => window.open(viewerExternalUrl, '_blank')}
                  className="min-h-[34px] px-3 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
                >
                  Open externally
                </button>
              )}
              <button onClick={() => setViewerOpen(false)} className="text-neutral-500 hover:text-neutral-900 dark:hover:text-white text-xs shrink-0">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Adom AI draft drawer */}
      {adomDraftOpen && (
        <div className="fixed inset-x-0 bottom-0 z-50 md:inset-0 md:right-0 md:bottom-auto md:w-[420px] bg-white dark:bg-neutral-900 shadow-xl border-t dark:border-neutral-700 md:border-l flex flex-col h-[55vh] md:h-full animate-in slide-in-from-bottom-2 duration-200 md:slide-in-from-right-2">
          <div className="p-4 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between shrink-0">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> Draft with Adom AI
            </h3>
            <button onClick={() => setAdomDraftOpen(false)} className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <p className="text-[12px] text-neutral-500 dark:text-neutral-400">
              Ask Adom AI to draft your answer, then insert it below.
            </p>
            {adomDraft && (
              <div className="p-3 glass rounded-xl border border-neutral-200 dark:border-neutral-600 text-sm text-neutral-800 dark:text-neutral-200 leading-relaxed whitespace-pre-wrap">
                {adomDraft}
              </div>
            )}
            <div className="text-[10px] text-neutral-400 font-mono">
              Drafting for: {course.name}
            </div>
          </div>
          <div className="p-4 border-t border-neutral-200 dark:border-neutral-700 flex gap-2 shrink-0">
            <button
              onClick={insertAdomDraft}
              disabled={!adomDraft}
              className="flex-1 min-h-[36px] rounded-xl bg-indigo-600 text-white text-xs font-semibold disabled:opacity-50"
            >
              Insert into answer
            </button>
            <button
              onClick={() => { setAdomDraftOpen(false); clearAdomDraftContext(); }}
              className="min-h-[36px] px-3 rounded-xl border border-neutral-200 dark:border-neutral-600 text-xs font-semibold text-neutral-600 dark:text-neutral-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Vaulted toast */}
      {vaulted.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-900 text-white text-xs shadow-xl">
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          <span>Added to vault</span>
        </div>
      )}
    </>
  );
};

export default ClassroomClassView;
