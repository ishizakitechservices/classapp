export type TabType = 'home' | 'classes' | 'vault' | 'adom-ai' | 'notices';

/** One saved Adom AI conversation. */
export interface ChatThread {
  id: string;
  title: string;
  /** True once Adom AI has named the chat (its name then outranks the fallback). */
  titleIsAi?: boolean;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export type UserRole = 'student' | 'prefect' | 'admin';

export type ThemeMode = 'system' | 'light' | 'dark';

export interface UserProfile {
  name: string;
  idNumber: string;
  email: string;
  role: UserRole;
  program: string;
  semester: string;
  avatarInitials: string;
  assignedClassIds?: string[]; // Classes this manager/admin is authorized to manage
}

export interface SyllabusItem {
  id: string;
  title: string;
  week: number;
  status: 'completed' | 'in_progress' | 'upcoming';
  date: string;
}

export interface ClassActivity {
  id: string;
  type: 'assignment' | 'lecture' | 'announcement';
  title: string;
  description: string;
  dueDate?: string;
  date: string;
  author: string;
  role: string;
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  instructor: string;
  instructorEmail: string;
  room: string;
  schedule: string;
  progressPercent: number;
  totalLectures: number;
  attendedLectures: number;
  description: string;
  nextSession: string;
  syllabus: SyllabusItem[];
  activities: ClassActivity[];
}

/**
 * Retired: the vault itself lives on the server (B2 + Postgres) and is handled by
 * `src/services/vaultApi.ts` / `VaultScreen`. This local shape is kept only for the
 * IndexedDB store that older installs still have, so a returning student's stale rows
 * are recognised and cleared instead of lingering invisibly.
 */
export interface LocalVaultFile {
  id: string;  name: string;
  folder: 'slides' | 'worksheets' | 'past_papers' | 'readings' | 'notes' | 'materials';
  subjectId: string;
  subjectCode: string;
  fileSize: string;
  fileFormat: 'PDF' | 'DOCX' | 'PPTX' | 'ZIP' | 'TXT' | 'IMAGE' | 'SHEET' | 'LINK';
  updatedAt: string;
  isOffline: boolean;
  downloadsCount: number;
  description: string;
  keyConcepts: string[];
  content?: string; // Stored readable content for offline document viewer
  previewUrl?: string; // External or embed preview URL (Drive or image)
  webViewLink?: string; // External Google Drive / Docs link
  mimeType?: string;
  notes?: string; // Personal annotations / scratchpad notes
  lastCachedAt?: string;
  syncStatus?: 'synced' | 'local_only' | 'pending';
}

export interface Notice {
  id: string;
  title: string;
  department: string;
  author: string;
  date: string;
  timeAgo: string;
  isPinned: boolean;
  isUnread: boolean;
  priority: 'urgent' | 'academic' | 'general';
  content: string;
  relatedSubject?: string;
  attachmentName?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string;
  mode?: 'chat' | 'quiz' | 'flashcards' | 'notes' | 'explain';
  engine?: 'deepseek' | 'local_fallback';
  /** True while the answer is still arriving word by word from the stream. */
  streaming?: boolean;
  /** Set when the AI could not answer. The message is an honest unavailable notice, not AI output. */
  error?: string;
  /** False for errors where repeating the same request cannot help (daily quota, no key). */
  retryable?: boolean;
  interactiveData?: {
    quizTitle?: string;
    questions?: QuizQuestion[];
    flashcards?: Flashcard[];
    summaryBullets?: string[];
  };
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

export interface QuizAttempt {
  id: string;
  quizTitle: string;
  subjectCode?: string;
  score: number;
  totalQuestions: number;
  percentage: number;
  timestamp: string;
  dateFormatted: string;
}

export interface Flashcard {
  id: string;
  topic: string;
  prompt: string;
  answer: string;
}

export interface ConnectedService {
  id: 'google_classroom' | 'google_drive';
  name: string;
  isConnected: boolean;
  accountEmail?: string;
  lastSyncedAt?: string;
  scopes: string[];
  autoSync: boolean;
}

export interface ClassroomMaterialItem {
  driveFile?: {
    driveFile: {
      id: string;
      title: string;
      alternateLink?: string;
      thumbnailUrl?: string;
    };
    shareMode?: string;
  };
  youtubeVideo?: {
    id: string;
    title: string;
    alternateLink?: string;
    thumbnailUrl?: string;
  };
  link?: {
    url: string;
    title?: string;
    thumbnailUrl?: string;
  };
  form?: {
    formUrl: string;
    title?: string;
    thumbnailUrl?: string;
    responseUrl?: string;
  };
}

export interface StudentSubmission {
  id: string;
  courseId: string;
  courseWorkId: string;
  userId: string;
  state: 'NEW' | 'CREATED' | 'TURNED_IN' | 'RETURNED' | 'RECLAIMED_BY_STUDENT';
  assignedGrade?: number;
  draftGrade?: number;
  alternateLink?: string;
  updateTime?: string;
}

export interface ClassroomCourse {
  id: string;
  name: string;
  section?: string;
  descriptionHeading?: string;
  description?: string;
  room?: string;
  alternateLink?: string;
  courseState?: string;
  calendarId?: string;
}

export interface ClassroomCourseWork {
  id: string;
  courseId: string;
  title: string;
  description?: string;
  state?: string;
  alternateLink?: string;
  dueDate?: { year: number; month: number; day: number };
  dueTime?: { hours: number; minutes: number };
  maxPoints?: number;
  workType?: 'ASSIGNMENT' | 'SHORT_ANSWER_QUESTION' | 'MULTIPLE_CHOICE_QUESTION';
  materials?: ClassroomMaterialItem[];
  topicId?: string;
  creationTime?: string;
  updateTime?: string;
  submission?: StudentSubmission;
}

export interface ClassroomCourseWorkMaterial {
  id: string;
  courseId: string;
  title: string;
  description?: string;
  state?: string;
  alternateLink?: string;
  materials?: ClassroomMaterialItem[];
  topicId?: string;
  creationTime?: string;
  updateTime?: string;
}

export interface ClassroomAnnouncement {
  id: string;
  courseId: string;
  text: string;
  alternateLink?: string;
  materials?: ClassroomMaterialItem[];
  state?: string;
  creationTime?: string;
  updateTime?: string;
  creatorUserId?: string;
}

export interface ClassroomLink {
  subjectCode: string;
  courseId: string;
  courseName?: string;
}

export interface ClassroomTeacher {
  courseId: string;
  userId: string;
  profile: {
    id: string;
    name?: {
      givenName?: string;
      familyName?: string;
      fullName?: string;
    };
    emailAddress?: string;
    photoUrl?: string;
  };
}

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
  iconLink?: string;
  thumbnailLink?: string;
}

export interface AppSettings {
  theme: ThemeMode;
  fontSize: 'small' | 'default' | 'large';
  reducedMotion: boolean;
  highContrast: boolean;
  offlineCacheEnabled: boolean;
  pushNotifications: boolean;
  quietHours: boolean;
}

/**
 * Role-Based Permission Checkers (scoped to the real signed-in account)
 */
export function canManageClass(role: UserRole, classId: string, assignedClassIds: string[] = []): boolean {
  if (role === 'admin') return true;
  if (role === 'prefect') return assignedClassIds.includes(classId);
  return false;
}

/** Admin posts school-wide; a prefect posts to their own class only. */
export function canPublishSchoolNotices(role: UserRole): boolean {
  return role === 'admin' || role === 'prefect';
}

export function canManageUsers(role: UserRole): boolean {
  return role === 'admin';
}
