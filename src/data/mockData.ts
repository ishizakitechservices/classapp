import { Subject, type LocalVaultFile, Notice, ChatMessage, UserProfile, QuizQuestion, Flashcard, ConnectedService } from '../types';

export const PROFILES: Record<string, UserProfile> = {
  student: {
    name: 'Student',
    idNumber: '',
    email: '',
    role: 'student',
    program: 'Senior High School (SHS)',
    semester: '2025/2026',
    avatarInitials: 'ST',
    assignedClassIds: [],
  },
  prefect: {
    name: 'Prefect',
    idNumber: '',
    email: '',
    role: 'prefect',
    program: 'Senior High School (SHS) · Class Prefect',
    semester: '2025/2026',
    avatarInitials: 'PF',
    assignedClassIds: [],
  },
  admin: {
    name: 'Admin',
    idNumber: '',
    email: '',
    role: 'admin',
    program: 'Senior High School (SHS) · Admin',
    semester: '2025/2026',
    avatarInitials: 'AD',
    assignedClassIds: [],
  },
};

export const INITIAL_CONNECTED_SERVICES: ConnectedService[] = [
  {
    id: 'google_classroom',
    name: 'Google Classroom',
    isConnected: false,
    scopes: ['https://www.googleapis.com/auth/classroom.courses.readonly', 'https://www.googleapis.com/auth/classroom.coursework.me.readonly'],
    autoSync: true,
  },
  {
    id: 'google_drive',
    name: 'Google Drive',
    isConnected: false,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    autoSync: false,
  },
];

export const INITIAL_SUBJECTS: Subject[] = [];

export const INITIAL_VAULT_FILES: LocalVaultFile[] = [];

export const INITIAL_NOTICES: Notice[] = [];

export const SAMPLE_CHAT_HISTORY: ChatMessage[] = [];

// SAMPLE_QUIZ_QUESTIONS and SAMPLE_FLASHCARDS were removed on purpose.
// They were served to students as if they were AI output whenever DeepSeek was unreachable,
// which violated the "Honest AI" / "No fake implementation" principles in the Master Plan.
// Offline quiz and flashcard content now comes only from the curated practice templates in
// src/components/QuizTemplateModal.tsx and src/components/FlashcardsTemplateModal.tsx,
// which are explicitly labelled as curated, not generated.

