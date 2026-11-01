import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { UserSubject } from '../shared/subjects';

export type Role = 'student' | 'prefect' | 'admin';

export interface AuthUser {
  id: number;
  studentId: string;
  displayName: string;
  className: string;
  role: Role;
  isVerified: boolean;
  prefectOfClass: string | null;
  storageUsedBytes: number;
  /** Core, elective and internal subjects. Empty until the student picks them. */
  subjects: UserSubject[];
}

interface AuthContextValue {
  user: AuthUser | null;
  classes: string[];
  isLoading: boolean;
  isServerConfigured: boolean;
  signup: (input: {
    studentId: string;
    displayName: string;
    className: string;
    password: string;
    subjects: string[];
  }) => Promise<void>;
  login: (studentId: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Replace the elective list; core and internal subjects are recalculated. */
  updateSubjects: (subjects: string[]) => Promise<void>;
  /** Admin only: appoint a prefect for one class. */
  appointPrefect: (studentId: string, className: string) => Promise<void>;
  removePrefect: (studentId: string) => Promise<void>;
  /** Admin or class prefect: verify or unverify a student in their scope. */
  setVerified: (studentId: string, verified: boolean) => Promise<void>;
  /** Admin or class prefect: issue a one-time reset code for a student. */
  issueResetCode: (studentId: string) => Promise<{ code: string; expiresAt: string }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.error === 'string') return body.error;
  } catch {
    // Non-JSON error body; fall through.
  }
  return fallback;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [classes, setClasses] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isServerConfigured, setIsServerConfigured] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.status === 503) {
        // Accounts are not set up on this server yet.
        setIsServerConfigured(false);
        setUser(null);
        return;
      }
      setIsServerConfigured(true);
      if (res.ok) {
        const data = await res.json();
        setUser(data.user ?? null);
      }
    } catch {
      // Network failure: leave the user signed out rather than guessing.
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await refresh();
      try {
        const res = await fetch('/api/auth/classes');
        if (res.ok) {
          const data = await res.json();
          if (mounted && Array.isArray(data.classes)) setClasses(data.classes);
        }
      } catch {
        // Class list is static fallback-free: the form simply shows no options.
      }
      if (mounted) setIsLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [refresh]);

  /** POST helper that preserves the server's error message. */
  const post = useCallback(async (path: string, body: unknown, fallback: string) => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await readError(res, fallback));
    return res.json().catch(() => ({}));
  }, []);

  const signup = useCallback(
    async (input: {
      studentId: string;
      displayName: string;
      className: string;
      password: string;
      subjects: string[];
    }) => {
      const data = await post('/api/auth/signup', input, 'Could not create the account.');
      setUser(data.user ?? null);
    },
    [post]
  );

  const updateSubjects = useCallback(
    async (subjects: string[]) => {
      const data = await post('/api/auth/subjects', { subjects }, 'Could not save your subjects.');
      setUser(data.user ?? null);
    },
    [post]
  );

  const login = useCallback(
    async (studentId: string, password: string) => {
      const data = await post('/api/auth/login', { studentId, password }, 'Could not sign in.');
      setUser(data.user ?? null);
    },
    [post]
  );

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
    }
  }, []);

  const appointPrefect = useCallback(
    async (studentId: string, className: string) => {
      await post('/api/auth/prefect/appoint', { studentId, className }, 'Could not appoint prefect.');
    },
    [post]
  );

  const removePrefect = useCallback(
    async (studentId: string) => {
      await post('/api/auth/prefect/remove', { studentId }, 'Could not remove prefect.');
    },
    [post]
  );

  const setVerified = useCallback(
    async (studentId: string, verified: boolean) => {
      await post('/api/auth/verify', { studentId, verified }, 'Could not update verification.');
    },
    [post]
  );

  const issueResetCode = useCallback(
    async (studentId: string) => post('/api/auth/reset/issue', { studentId }, 'Could not issue a reset code.'),
    [post]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        classes,
        isLoading,
        isServerConfigured,
        signup,
        login,
        logout,
        refresh,
        updateSubjects,
        appointPrefect,
        removePrefect,
        setVerified,
        issueResetCode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
