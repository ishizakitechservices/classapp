/**
 * Google Workspace Service (Classroom & Drive Integration)
 * Client-side integration using Google Identity Services (GIS) & REST APIs.
 * Fully conforms to client-side OAuth security (no client secrets, token stored in memory).
 */

import firebaseConfig from '../../firebase-applet-config.json';
import { auth, googleAuthProvider, signInWithPopup, GoogleAuthProvider } from '../lib/firebase';
import type {
  ClassroomCourse,
  ClassroomCourseWork,
  ClassroomCourseWorkMaterial,
  ClassroomAnnouncement,
  ClassroomTeacher,
  StudentSubmission,
  DriveFileItem,
} from '../types';

export type {
  ClassroomCourse,
  ClassroomCourseWork,
  ClassroomCourseWorkMaterial,
  ClassroomAnnouncement,
  ClassroomTeacher,
  StudentSubmission,
  DriveFileItem,
};

let cachedAccessToken: string | null = null;
let tokenExpiresAt: number = 0;

export function getCachedToken(): string | null {
  if (cachedAccessToken && Date.now() < tokenExpiresAt) {
    return cachedAccessToken;
  }
  return null;
}

export function setCachedToken(token: string, expiresInSeconds: number = 3600): void {
  cachedAccessToken = token;
  tokenExpiresAt = Date.now() + (expiresInSeconds - 60) * 1000;
}

export function clearCachedToken(): void {
  cachedAccessToken = null;
  tokenExpiresAt = 0;
}

/** Restore the Google access token stored server-side for this account (cross-device login). */
export async function restoreGoogleTokenFromServer(): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/google/token');
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    if (data?.token) {
      // expiresInSeconds is unknown from the stored timestamp; recompute from expiresAt.
      let expiresInSeconds = 3600;
      if (data.expiresAt) {
        const remaining = Math.max(0, Date.now() - new Date(data.expiresAt).getTime()) / 1000;
        // only trust it if it has not already expired on the server side
        if (new Date(data.expiresAt) > new Date()) {
          expiresInSeconds = Math.max(60, (new Date(data.expiresAt).getTime() - Date.now()) / 1000);
        } else {
          return null;
        }
      }
      setCachedToken(data.token, expiresInSeconds);
      return data.token;
    }
  } catch {
    // Silently fail: the caller will fall back to interactive sign-in.
  }
  return null;
}

/** Persist the Google access token server-side so the next device does not need a popup. */
export async function storeGoogleTokenOnServer(token: string, expiresInSeconds: number): Promise<void> {
  try {
    await fetch('/api/auth/google/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: token, expiresInSeconds }),
    });
  } catch (err) {
    console.warn('Could not persist Google token server-side:', err);
  }
}

/** Clear the stored Google token server-side (sign out / disconnect). */
export async function clearGoogleTokenOnServer(): Promise<void> {
  try {
    await fetch('/api/auth/google/token', { method: 'DELETE' });
  } catch {
    // Non-fatal.
  }
}

/**
 * Request a Google OAuth access token.
 *
 * Order: in-memory cache → silent re-consent (no popup if the user already authorised)
 * → Firebase popup → interactive consent popup. Once a student has authorised Google
 * Classroom once, later logins on other devices need no popup at all while the token
 * is valid, and only a silent refresh after it expires.
 */
export async function requestGoogleAccessToken(): Promise<string> {
  const existing = getCachedToken();
  if (existing) return existing;

  // 1. Silent: try to refresh without any UI (works after the user consented once).
  try {
    const clientId = firebaseConfig.oAuthClientId;
    if (clientId) {
      await loadGisScript();
      const google = (window as any).google;
      if (google?.accounts?.oauth2) {
        const token = await new Promise<string | null>((resolve) => {
          const tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: [
              'https://www.googleapis.com/auth/classroom.courses.readonly',
              'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
              'https://www.googleapis.com/auth/classroom.announcements.readonly',
              'https://www.googleapis.com/auth/drive.readonly',
              'https://www.googleapis.com/auth/drive.file',
            ].join(' '),
            callback: (response: any) => {
              if (response.error || !response.access_token) {
                resolve(null);
                return;
              }
              setCachedToken(response.access_token, Number(response.expires_in) || 3600);
              resolve(response.access_token);
            },
          });
          tokenClient.requestAccessToken({ prompt: 'none' });
        });
        if (token) return token;
      }
    }
  } catch {
    // Fall through to interactive sign-in.
  }

  // 2. Firebase popup sign-in.
  try {
    const result = await signInWithPopup(auth, googleAuthProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      setCachedToken(credential.accessToken);
      void storeGoogleTokenOnServer(credential.accessToken, 3600);
      return credential.accessToken;
    }
  } catch (firebaseErr: any) {
    if (firebaseErr?.code === 'auth/popup-closed-by-user') {
      throw new Error('Google sign-in was cancelled. Please authorize Google Classroom to access your courses.');
    }
    console.warn('Firebase popup sign-in fallback to GIS:', firebaseErr);
  }

  // 3. Interactive consent (first time, or after a hard expiry / revoked consent).
  const clientId = firebaseConfig.oAuthClientId;
  if (!clientId) {
    throw new Error('Google OAuth Client ID is missing in configuration.');
  }
  await loadGisScript();

  return new Promise((resolve, reject) => {
    try {
      const google = (window as any).google;
      if (!google?.accounts?.oauth2) {
        throw new Error('Google Identity Services library failed to initialize.');
      }

      const scopes = [
        'https://www.googleapis.com/auth/classroom.courses.readonly',
        'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
        'https://www.googleapis.com/auth/classroom.announcements.readonly',
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/drive.file',
      ].join(' ');

      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: scopes,
        callback: (response: any) => {
          if (response.error) {
            console.error('Google OAuth token error:', response);
            reject(new Error(response.error_description || response.error));
            return;
          }
          if (response.access_token) {
            setCachedToken(response.access_token, Number(response.expires_in) || 3600);
            void storeGoogleTokenOnServer(response.access_token, Number(response.expires_in) || 3600);
            resolve(response.access_token);
          } else {
            reject(new Error('No access token received from Google OAuth.'));
          }
        },
      });

      tokenClient.requestAccessToken({ prompt: 'consent' });
    } catch (err) {
      reject(err);
    }
  });
}

function loadGisScript(): Promise<void> {
  if ((window as any).google?.accounts?.oauth2) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const existingScript = document.getElementById('google-gis-script');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve());
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Google GIS script')));
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-gis-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google GIS client library'));
    document.head.appendChild(script);
  });
}

/**
 * Fetch Google Classroom active courses for the student via backend proxy (avoids browser CORS)
 */
export async function fetchClassroomCourses(token?: string): Promise<ClassroomCourse[]> {
  const accessToken = token || (await requestGoogleAccessToken());
  const response = await fetch('/api/workspace/classroom/courses', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const msg = errorData?.error?.message || errorData?.error || `Google Classroom error (${response.status})`;
    throw new Error(msg);
  }

  const data = await response.json();
  return data.courses || [];
}

/**
 * Fetch coursework / assignments for a specific course via backend proxy
 */
export async function fetchCourseWork(courseId: string, token?: string): Promise<ClassroomCourseWork[]> {
  const accessToken = token || (await requestGoogleAccessToken());
  const response = await fetch(`/api/workspace/classroom/courses/${encodeURIComponent(courseId)}/courseWork`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const msg = errorData?.error?.message || errorData?.error || `Google Classroom CourseWork error (${response.status})`;
    throw new Error(msg);
  }

  const data = await response.json();
  return data.courseWork || [];
}

/**
 * Fetch course announcements via backend proxy
 */
export async function fetchCourseAnnouncements(courseId: string, token?: string): Promise<ClassroomAnnouncement[]> {
  const accessToken = token || (await requestGoogleAccessToken());
  const response = await fetch(`/api/workspace/classroom/courses/${encodeURIComponent(courseId)}/announcements`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  return data.announcements || [];
}

/**
 * Fetch course materials (lecture slides, reading handouts, syllabus items)
 */
export async function fetchClassroomMaterials(courseId: string, token?: string): Promise<ClassroomCourseWorkMaterial[]> {
  const accessToken = token || (await requestGoogleAccessToken());
  const response = await fetch(`/api/workspace/classroom/courses/${encodeURIComponent(courseId)}/courseWorkMaterials`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  return data.courseWorkMaterial || [];
}

/**
 * Fetch teachers/instructors for a course
 */
export async function fetchClassroomTeachers(courseId: string, token?: string): Promise<ClassroomTeacher[]> {
  const accessToken = token || (await requestGoogleAccessToken());
  const response = await fetch(`/api/workspace/classroom/courses/${encodeURIComponent(courseId)}/teachers`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  return data.teachers || [];
}

/**
 * Fetch student submissions for assignments in a course
 */
export async function fetchStudentSubmissions(courseId: string, token?: string): Promise<StudentSubmission[]> {
  const accessToken = token || (await requestGoogleAccessToken());
  const response = await fetch(`/api/workspace/classroom/courses/${encodeURIComponent(courseId)}/submissions`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  return data.studentSubmissions || [];
}

/**
 * Fetch files from Google Drive (PDFs, Docs, Slides, Sheets) via backend proxy
 */
export async function fetchDriveFiles(params?: { query?: string; token?: string }): Promise<DriveFileItem[]> {
  const accessToken = params?.token || (await requestGoogleAccessToken());
  let q = "trashed = false and (mimeType = 'application/pdf' or mimeType = 'application/vnd.google-apps.document' or mimeType = 'application/vnd.google-apps.presentation' or mimeType = 'application/vnd.google-apps.spreadsheet')";

  if (params?.query && params.query.trim()) {
    const sanitized = params.query.replace(/'/g, "\\'");
    q += ` and name contains '${sanitized}'`;
  }

  const searchParams = new URLSearchParams({
    pageSize: '30',
    q,
  });

  const response = await fetch(`/api/workspace/drive/files?${searchParams.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const msg = errorData?.error?.message || errorData?.error || `Google Drive error (${response.status})`;
    throw new Error(msg);
  }

  const data = await response.json();
  return data.files || [];
}
