/**
 * Firestore Persistence Service for Student App
 * Encapsulates all Firestore read/write operations with strict ABAC error handling.
 */

import {
  doc,
  getDoc,
  setDoc,
  getDocs,
  collection,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { QuizAttempt } from '../types';

export interface FirestoreUserProfile {
  uid: string;
  email: string;
  name: string;
  schoolLevel?: string;
  targetExam?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface FirestoreStudyDeck {
  id: string;
  userId: string;
  topic: string;
  subjectCode?: string;
  cardCount: number;
  cards: Array<{ id: string; topic: string; prompt: string; answer: string }>;
  createdAt: string;
}

export interface FirestoreStudyNote {
  id: string;
  userId: string;
  title: string;
  subjectCode?: string;
  content: string;
  source?: string;
  createdAt: string;
}

export async function syncUserProfileToFirestore(profile: FirestoreUserProfile): Promise<void> {
  const path = `users/${profile.uid}`;
  try {
    await setDoc(
      doc(db, 'users', profile.uid),
      {
        ...profile,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchUserProfileFromFirestore(uid: string): Promise<FirestoreUserProfile | null> {
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      return snap.data() as FirestoreUserProfile;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function syncQuizAttemptToFirestore(uid: string, attempt: QuizAttempt): Promise<void> {
  const path = `users/${uid}/quizAttempts/${attempt.id}`;
  try {
    await setDoc(doc(db, 'users', uid, 'quizAttempts', attempt.id), {
      id: attempt.id,
      userId: uid,
      quizTitle: attempt.quizTitle,
      subjectCode: attempt.subjectCode || 'GEN-SCI',
      score: attempt.score,
      totalQuestions: attempt.totalQuestions,
      percentage: attempt.percentage,
      timestamp: attempt.timestamp,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function fetchQuizAttemptsFromFirestore(uid: string): Promise<QuizAttempt[]> {
  const path = `users/${uid}/quizAttempts`;
  try {
    const q = query(collection(db, 'users', uid, 'quizAttempts'), limit(50));
    const snap = await getDocs(q);
    const results: QuizAttempt[] = [];
    snap.forEach((d) => {
      const data = d.data();
      results.push({
        id: data.id || d.id,
        quizTitle: data.quizTitle,
        subjectCode: data.subjectCode,
        score: data.score,
        totalQuestions: data.totalQuestions,
        percentage: data.percentage,
        timestamp: data.timestamp,
        dateFormatted: new Date(data.timestamp).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      });
    });
    return results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function syncStudyDeckToFirestore(uid: string, deck: FirestoreStudyDeck): Promise<void> {
  const path = `users/${uid}/studyDecks/${deck.id}`;
  try {
    await setDoc(doc(db, 'users', uid, 'studyDecks', deck.id), {
      ...deck,
      userId: uid,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchStudyDecksFromFirestore(uid: string): Promise<FirestoreStudyDeck[]> {
  const path = `users/${uid}/studyDecks`;
  try {
    const q = query(collection(db, 'users', uid, 'studyDecks'), limit(50));
    const snap = await getDocs(q);
    const decks: FirestoreStudyDeck[] = [];
    snap.forEach((d) => decks.push(d.data() as FirestoreStudyDeck));
    return decks;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function syncStudyNoteToFirestore(uid: string, note: FirestoreStudyNote): Promise<void> {
  const path = `users/${uid}/studyNotes/${note.id}`;
  try {
    await setDoc(doc(db, 'users', uid, 'studyNotes', note.id), {
      ...note,
      userId: uid,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchStudyNotesFromFirestore(uid: string): Promise<FirestoreStudyNote[]> {
  const path = `users/${uid}/studyNotes`;
  try {
    const q = query(collection(db, 'users', uid, 'studyNotes'), limit(50));
    const snap = await getDocs(q);
    const notes: FirestoreStudyNote[] = [];
    snap.forEach((d) => notes.push(d.data() as FirestoreStudyNote));
    return notes;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}
