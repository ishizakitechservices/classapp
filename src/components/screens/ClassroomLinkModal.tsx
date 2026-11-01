/**
 * ClassroomLinkModal — link one Classapp subject to one Google Classroom course.
 *
 * The student picks the match manually (teachers often name their Google
 * Classrooms differently from Classapp). Also offers "join by class code" to
 * join an existing course they aren't already in.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  ArrowLeft,
  ChevronRight,
  Check,
  ExternalLink,
  Link,
  School,
  ShieldCheck,
  Trash2,
  X,
  Loader2,
} from 'lucide-react';
import type { ClassroomCourse } from '../../types';

interface Props {
  subjectCode: string;
  subjectName: string;
  onClose: () => void;
}

export const ClassroomLinkModal: React.FC<Props> = ({ subjectCode, subjectName, onClose }) => {
  const {
    classroomCourses,
    classroomLinks,
    getLinkedClassroomCourse,
    linkClassroomCourse,
    unlinkClassroomCourse,
    toggleClassroomAutosync,
    connectGoogleClassroom,
    isLoadingWorkspace,
    workspaceError,
  } = useApp() as any;

  const linked = getLinkedClassroomCourse(subjectCode);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const courses = classroomCourses ?? [];

  const handleLink = async (course: (typeof courses)[number]) => {
    setMessage(null);
    setLinking(true);
    try {
      const link = await linkClassroomCourse(subjectCode, course.id, course.name);
      if (!link) {
        setMessage('Could not merge that class. Try again.');
        return;
      }
      // Start autosync for the linked course so assignments/posts load.
      await toggleClassroomAutosync(course.id, true);
      onClose();
    } catch {
      setMessage('Could not merge that class. Try again.');
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async () => {
    if (!linked) return;
    setMessage(null);
    setUnlinking(true);
    try {
      await unlinkClassroomCourse(subjectCode);
      await toggleClassroomAutosync(null, false);
      setMessage('Unlinked.');
    } catch {
      setMessage('Unlink failed.');
    } finally {
      setUnlinking(false);
    }
  };

  const handleJoinByCode = async () => {
    const code = joinCode.trim();
    if (!code) return;
    // Google Classroom has no public "join by code" API for students; open the
    // join URL so the student joins in Classroom, then link the course here.
    setMessage(null);
    setJoining(true);
    try {
      window.open(`https://classroom.google.com/c/${encodeURIComponent(code)}`, '_blank');
      setMessage(
        'Opened Google Classroom to join. Once you join, pick the course above to link it.'
      );
    } catch {
      setMessage('Could not open Classroom.');
    } finally {
      setJoining(false);
    }
  };

  const handleConnect = async () => {
    setMessage(null);
    await connectGoogleClassroom();
  };

  const isLinked = (courseId: string) => linked?.courseId === courseId;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm md:hidden" onClick={onClose} />

      <div className="fixed left-0 top-0 h-full z-50 md:w-[420px] bg-white dark:bg-neutral-900 shadow-2xl border-r border-neutral-200 dark:border-neutral-700 flex flex-col transition-transform duration-300 md:translate-x-0">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-200 dark:border-neutral-700 flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 mb-0.5">
                <School className="w-3 h-3" /> Merge Classroom
              </div>
              <h1 className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white leading-none">
                {subjectName}
              </h1>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                Choose the Google Classroom class to merge into {subjectName}.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Already merged state */}
        {linked && (
          <div className="px-4 sm:p-5 border-b border-neutral-200 dark:border-neutral-700 bg-emerald-50 dark:bg-emerald-900/10">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                Merged into {subjectName}
              </span>
            </div>
            <p className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80 mb-2">
              Google source: {linked.courseName || linked.courseId}
            </p>
            <button
              onClick={handleUnlink}
              disabled={unlinking}
              className="w-full min-h-[36px] px-3 rounded-xl border border-neutral-200 dark:border-neutral-600 text-xs font-semibold text-neutral-600 dark:text-neutral-300 disabled:opacity-50"
            >
              {unlinking ? 'Removing…' : <><Trash2 className="w-3 h-3 mr-1.5" /> Unlink Google Classroom</>}
            </button>
          </div>
        )}

        {/* Join by class code */}
        <div className="px-4 sm:p-5 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50/60 dark:bg-neutral-800/20">
          <div className="flex items-center gap-2 mb-3">
            <Link className="w-4 h-4 text-neutral-400 shrink-0" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Join by class code</h3>
          </div>
          <div className="space-y-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Class code (e.g. abc1234)"
              className="w-full pl-3 pr-9 py-2.5 glass-input rounded-xl text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
            />
            <button
              onClick={handleJoinByCode}
              disabled={!joinCode.trim() || joining}
              className="absolute inset-y-0 right-1.5 flex items-center px-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 disabled:opacity-50"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
            <button
              onClick={handleJoinByCode}
              disabled={!joinCode.trim() || joining}
              className="w-full min-h-[36px] rounded-xl bg-indigo-600 text-white text-xs font-semibold disabled:opacity-50"
            >
              {joining ? 'Opening…' : 'Open Classroom to join'}
            </button>
            {message && (
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">{message}</p>
            )}
          </div>
          <p className="text-[10px] text-neutral-400 mt-1">
            Joining opens Google Classroom in a new tab. After joining, pick the class below to link it to{' '}
            <span className="font-mono text-neutral-900 dark:text-white">{subjectName}</span>.
          </p>
        </div>

        {/* Your connected classes */}
        <div className="px-4 sm:p-5 border-b border-neutral-200 dark:border-neutral-700">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Your Google Classroom classes
            </h3>
            <span className="text-[10px] text-neutral-400">{courses.length}</span>
          </div>
          <p className="text-[10px] text-neutral-400 -mt-2 mb-3">
            The Google name is only the source. ClassApp shows it as {subjectName}.
          </p>
          {courses.length === 0 ? (
            <div className="min-h-24 py-2 flex flex-col items-center justify-center text-center text-neutral-500 dark:text-neutral-400">
              <School className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No Google Classroom account connected yet.</p>
              <button
                onClick={handleConnect}
                disabled={isLoadingWorkspace}
                className="mt-2 min-h-[36px] px-3 rounded-lg bg-indigo-600 text-white text-[11px] font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isLoadingWorkspace && <Loader2 className="w-3 h-3 animate-spin" />}
                {isLoadingWorkspace ? 'Connecting…' : 'Connect Google Classroom'}
              </button>
              {workspaceError && (
                <p role="alert" className="mt-2 text-[11px] text-rose-600 dark:text-rose-400">
                  {workspaceError}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              {courses.map((course: ClassroomCourse) => (
                <button
                  key={course.id}
                  onClick={() => handleLink(course)}
                  disabled={linking || isLinked(course.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-colors ${
                    isLinked(course.id)
                      ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-500/30'
                      : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-neutral-900 dark:text-white truncate flex items-center gap-1.5">
                        <School className="w-3 h-3 shrink-0 text-neutral-400" /> {course.name}
                      </div>
                      <div className="text-[11px] text-neutral-500 dark:text-neutral-400 font-mono truncate">
                        {course.section || course.room || course.id}
                      </div>
                    </div>
                    {isLinked(course.id) ? (
                      <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-neutral-400 shrink-0" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
