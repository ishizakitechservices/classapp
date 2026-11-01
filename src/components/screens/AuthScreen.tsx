import React, { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { SubjectPicker } from '../SubjectPicker';
import { CORE_SUBJECTS } from '../../shared/subjects';

/**
 * One identical entry point for everybody. What a person can do after signing in
 * depends on their account, not on which screen they used to register.
 *
 * Signing up is two steps: the account details, then the subjects studied. The
 * subjects become part of the student's class tab.
 */
export const AuthScreen: React.FC = () => {
  const { signup, login, classes, isServerConfigured } = useAuth();

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [step, setStep] = useState<1 | 2>(1);
  const [studentId, setStudentId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [className, setClassName] = useState('');
  const [password, setPassword] = useState('');

  // Start from the standard core set; the student can deselect any they do not study.
  const [subjects, setSubjects] = useState<string[]>(() => CORE_SUBJECTS.map((s) => s.code));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setError(null);
  };

  /** Step 1: the browser validates the required fields before we advance. */
  const handleDetails = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStep(2);
  };

  /** Step 2: create the account with the chosen electives. */
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);

    try {
      await signup({ studentId, displayName, className, password, subjects });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);

    try {
      await login(studentId, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'signup' : 'login');
    setStep(1);
    setError(null);
  };

  if (!isServerConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-sm text-center space-y-2">
          <h1 className="text-lg font-semibold">Accounts are not set up</h1>
          <p className="text-sm text-neutral-500">
            This server has no database configured yet, so nobody can sign in.
          </p>
        </div>
      </div>
    );
  }

  const inputClass =
    'w-full px-3 py-2.5 rounded-xl glass-input text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-neutral-500 dark:focus:border-neutral-400 min-h-[44px]';

  const errorBlock = error ? (
    <div role="alert" className="rounded-xl bg-neutral-900/[0.07] dark:bg-white/10 px-3 py-2 text-xs text-neutral-700 dark:text-neutral-300">
      {error}
    </div>
  ) : null;

  const heading =
    mode === 'login' ? 'Sign in to continue.' : step === 1 ? 'Create your account.' : 'What do you study?';

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            ClassApp
          </h1>
          <p className="text-sm text-neutral-500">{heading}</p>
        </div>

        {/* ------------------------------------------------------------- sign in */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="studentId" className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                Student ID
              </label>
              <input
                id="studentId"
                value={studentId}
                onChange={(e) => { setStudentId(e.target.value); reset(); }}
                placeholder="e.g. n64"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                className={inputClass}
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="password" className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); reset(); }}
                placeholder="Your password"
                autoComplete="current-password"
                required
                className={inputClass}
              />
            </div>

            {errorBlock}

            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-[44px] rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm font-semibold disabled:opacity-50"
            >
              {busy ? 'Please wait…' : 'Sign in'}
            </button>
          </form>
        )}

        {/* ------------------------------------------------------ sign up, step 1 */}
        {mode === 'signup' && step === 1 && (
          <form onSubmit={handleDetails} className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="studentId" className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                Student ID
              </label>
              <input
                id="studentId"
                value={studentId}
                onChange={(e) => { setStudentId(e.target.value); reset(); }}
                placeholder="e.g. n64"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                className={inputClass}
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="displayName" className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                Full name
              </label>
              <input
                id="displayName"
                value={displayName}
                onChange={(e) => { setDisplayName(e.target.value); reset(); }}
                placeholder="Your name"
                autoComplete="name"
                required
                className={inputClass}
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="className" className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                Class
              </label>
              <select
                id="className"
                value={className}
                onChange={(e) => { setClassName(e.target.value); reset(); }}
                required
                className={inputClass}
              >
                <option value="">Select your class</option>
                {classes.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="password" className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); reset(); }}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                required
                minLength={8}
                className={inputClass}
              />
            </div>

            {errorBlock}

            <button
              type="submit"
              className="w-full min-h-[44px] rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm font-semibold"
            >
              Continue
            </button>
          </form>
        )}

        {/* ------------------------------------------------------ sign up, step 2 */}
        {mode === 'signup' && step === 2 && (
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="flex items-center justify-between gap-2 rounded-xl bg-neutral-900/[0.07] dark:bg-white/10 px-3 py-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">{displayName}</p>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">{className}</p>
              </div>
              <button
                type="button"
                onClick={() => { setStep(1); setError(null); }}
                className="shrink-0 min-h-[32px] px-2.5 rounded-lg text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Edit
              </button>
            </div>

            <SubjectPicker className={className} selected={subjects} onChange={(codes) => { setSubjects(codes); reset(); }} />

            {errorBlock}

            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-[44px] rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm font-semibold disabled:opacity-50"
            >
              {busy ? 'Creating your account…' : 'Create account'}
            </button>
          </form>
        )}

        <button
          type="button"
          onClick={switchMode}
          className="w-full text-center text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </button>

        {mode === 'login' && (
          <p className="text-center text-[11px] text-neutral-400 leading-relaxed">
            Forgotten your password? Ask your class prefect for a reset code.
          </p>
        )}
      </div>
    </div>
  );
};
