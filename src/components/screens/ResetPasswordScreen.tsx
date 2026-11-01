import React, { useState } from 'react';

/**
 * Two ways in:
 * - A student holding a one-time code can set a new password.
 * - A prefect or admin issues a code for a student in their scope, and reads it out.
 *
 * Prefects never learn the new password, so this cannot be used to take over an account.
 */
export const ResetPasswordScreen: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [studentId, setStudentId] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const inputClass =
    'w-full px-3 py-2.5 rounded-xl glass-input text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-neutral-500 dark:focus:border-neutral-400 min-h-[44px]';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setMessage(null);
    setBusy(true);

    try {
      const res = await fetch('/api/auth/reset/consume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, code, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not reset the password.');

      setMessage('Password changed. You can sign in now.');
      setCode('');
      setNewPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset the password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            Reset password
          </h1>
          <p className="text-sm text-neutral-500">
            Enter the one-time code your class prefect gave you.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="resetId" className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Student ID
            </label>
            <input
              id="resetId"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              autoCapitalize="none"
              spellCheck={false}
              required
              className={inputClass}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="resetCode" className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Reset code
            </label>
            <input
              id="resetCode"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              placeholder="6 digits"
              required
              className={inputClass}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="newPassword" className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              New password
            </label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              required
              className={inputClass}
            />
          </div>

          {error && (
            <div role="alert" className="rounded-xl bg-neutral-900/[0.07] dark:bg-white/10 px-3 py-2 text-xs text-neutral-700 dark:text-neutral-300">
              {error}
            </div>
          )}
          {message && (
            <div role="status" className="rounded-xl bg-neutral-900/[0.07] dark:bg-white/10 px-3 py-2 text-xs text-neutral-700 dark:text-neutral-300">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full min-h-[44px] rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm font-semibold disabled:opacity-50"
          >
            {busy ? 'Please wait…' : 'Set new password'}
          </button>
        </form>

        <button
          type="button"
          onClick={onDone}
          className="w-full text-center text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          Back to sign in
        </button>
      </div>
    </div>
  );
};
