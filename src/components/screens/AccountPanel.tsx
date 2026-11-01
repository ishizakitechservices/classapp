import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { STORAGE_QUOTA_BYTES } from '../../shared/constants';

/**
 * Everyone uses the same app after signing in; what they see is decided by their account.
 * - student: their own account status and storage
 * - prefect: plus the students in the class they are prefect of
 * - admin:   plus appointing prefects and any account
 *
 * These controls are conveniences. The server re-checks every action, so hiding a
 * button is not what protects anything.
 */
export const AccountPanel: React.FC = () => {
  const { user, logout, setVerified, appointPrefect, removePrefect, issueResetCode } = useAuth();

  const [targetId, setTargetId] = useState('');
  const [targetClass, setTargetClass] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  const isManager = user.role === 'admin' || user.role === 'prefect';
  const usedMB = (user.storageUsedBytes / (1024 * 1024)).toFixed(1);
  const quotaMB = Math.round(STORAGE_QUOTA_BYTES / (1024 * 1024));

  const run = async (action: () => Promise<unknown>, success: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(success);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2 rounded-lg glass-input text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-neutral-500 min-h-[38px]';

  return (
    <div className="space-y-6">
      <section className="glass-inner rounded-2xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
              {user.displayName}
            </h2>
            <p className="text-xs text-neutral-500 font-mono uppercase">{user.studentId}</p>
          </div>
          <button
            onClick={() => logout()}
            className="shrink-0 px-3 py-1.5 rounded-lg border border-neutral-500/25 dark:border-white/20 text-xs font-medium min-h-[38px]"
          >
            Sign out
          </button>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <dt className="text-neutral-500">Class</dt>
            <dd className="font-medium text-neutral-900 dark:text-neutral-100">{user.className}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Role</dt>
            <dd className="font-medium text-neutral-900 dark:text-neutral-100 capitalize">
              {user.role}{user.prefectOfClass ? ` · ${user.prefectOfClass}` : ''}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">Status</dt>
            <dd className="font-medium text-neutral-900 dark:text-neutral-100">
              {user.isVerified ? 'Verified' : 'Not verified yet'}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">Storage</dt>
            <dd className="font-medium text-neutral-900 dark:text-neutral-100">{usedMB} MB / {quotaMB} MB</dd>
          </div>
        </dl>

        {!user.isVerified && (
          <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
            Until a class prefect verifies you, Adom AI is limited to fewer requests a day.
          </p>
        )}
      </section>

      {isManager && (
        <section className="glass-inner rounded-2xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {user.role === 'admin' ? 'Manage accounts' : `Manage ${user.prefectOfClass}`}
          </h3>

          <div className="space-y-2">
            <input
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              placeholder="Student ID, e.g. n64"
              autoCapitalize="none"
              spellCheck={false}
              className={inputClass}
            />

            {user.role === 'admin' && (
              <input
                value={targetClass}
                onChange={(e) => setTargetClass(e.target.value)}
                placeholder="Class to make them prefect of"
                className={inputClass}
              />
            )}

            <div className="flex flex-wrap gap-2">
              <button
                disabled={busy || !targetId.trim()}
                onClick={() => run(() => setVerified(targetId.trim(), true), 'Student verified.')}
                className="px-3 py-2 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-xs font-semibold disabled:opacity-40 min-h-[38px]"
              >
                Verify
              </button>
              <button
                disabled={busy || !targetId.trim()}
                onClick={() => run(() => setVerified(targetId.trim(), false), 'Verification removed.')}
                className="px-3 py-2 rounded-lg border border-neutral-500/25 dark:border-white/20 text-xs font-medium disabled:opacity-40 min-h-[38px]"
              >
                Unverify
              </button>
              <button
                disabled={busy || !targetId.trim()}
                onClick={() =>
                  run(async () => {
                    const result = await issueResetCode(targetId.trim());
                    setNotice(`Reset code for ${targetId.trim()}: ${result.code} — expires ${new Date(result.expiresAt).toLocaleTimeString()}. Give it to the student; do not share it publicly.`);
                  }, '')
                }
                className="px-3 py-2 rounded-lg border border-neutral-500/25 dark:border-white/20 text-xs font-medium disabled:opacity-40 min-h-[38px]"
              >
                Issue reset code
              </button>

              {user.role === 'admin' && (
                <>
                  <button
                    disabled={busy || !targetId.trim() || !targetClass.trim()}
                    onClick={() => run(() => appointPrefect(targetId.trim(), targetClass.trim()), 'Prefect appointed.')}
                    className="px-3 py-2 rounded-lg border border-neutral-500/25 dark:border-white/20 text-xs font-medium disabled:opacity-40 min-h-[38px]"
                  >
                    Make prefect
                  </button>
                  <button
                    disabled={busy || !targetId.trim()}
                    onClick={() => run(() => removePrefect(targetId.trim()), 'Prefect removed.')}
                    className="px-3 py-2 rounded-lg border border-neutral-500/25 dark:border-white/20 text-xs font-medium disabled:opacity-40 min-h-[38px]"
                  >
                    Remove prefect
                  </button>
                </>
              )}
            </div>
          </div>

          {notice && (
            <div role="status" className="rounded-lg bg-neutral-900/[0.07] dark:bg-white/10 px-3 py-2 text-xs text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">
              {notice}
            </div>
          )}
          {error && (
            <div role="alert" className="rounded-lg bg-neutral-900/[0.07] dark:bg-white/10 px-3 py-2 text-xs text-neutral-700 dark:text-neutral-300">
              {error}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
